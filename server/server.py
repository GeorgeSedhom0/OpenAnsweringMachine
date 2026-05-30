#!/usr/bin/env python3
"""
OpenAnsweringMachine — local bridge + web server (Windows).

Launches the BTstack-based engine (oam_engine.exe), relays its @EVT@ JSON events to the
browser via Server-Sent Events, forwards browser commands to the engine, and serves the
web UI. Pure Python standard library — no pip installs. All paths are resolved relative to
the repository, and runtime settings live in config.json. Nothing is hardcoded.
"""
import json
import os
import queue
import subprocess
import sys
import threading
import time
import urllib.parse
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# ---------------------------------------------------------------------------
# Paths (all relative to the repo root)
# ---------------------------------------------------------------------------
SERVER_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT       = os.path.dirname(SERVER_DIR)
WEB_DIR    = os.path.join(ROOT, "web")
ENGINE_BIN = os.path.join(ROOT, "engine", "bin")
ENGINE_EXE = os.path.join(ENGINE_BIN, "oam_engine.exe")
TTS_PS     = os.path.join(ROOT, "tools", "tts.ps1")
CONFIG_F   = os.path.join(ROOT, "config.json")
EXAMPLE_F  = os.path.join(ROOT, "config.example.json")
HISTORY_F  = os.path.join(ROOT, "history.json")
CONTACTS_F = os.path.join(ROOT, "contacts.json")
GREETING_F = os.path.join(ROOT, "greeting.wav")
GREETING_TXT = os.path.join(ROOT, "greeting.txt")

DEFAULTS = {"port": 8770, "autoanswer": True, "answerdelay": 5,
            "recordings_dir": "recordings", "device": None}


def load_json(path, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def save_json(path, data):
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        print("save error", path, e)


def load_config():
    cfg = dict(DEFAULTS)
    cfg.update(load_json(EXAMPLE_F, {}))   # example provides shipped defaults
    cfg.update(load_json(CONFIG_F, {}))    # user config overrides
    return cfg


# ---------------------------------------------------------------------------
# Shared state
# ---------------------------------------------------------------------------
class State:
    def __init__(self):
        self.lock = threading.Lock()
        self.subscribers = []
        self.engine = None
        self.config = load_config()
        self.history = load_json(HISTORY_F, [])
        self.contacts = load_json(CONTACTS_F, [])
        self.pending_contacts = []
        self.snapshot = {"engine": False, "slc": False, "call": "idle",
                         "number": "", "name": "", "audio": False}
        self.cur_call = None

    def rec_dir(self):
        rd = self.config.get("recordings_dir", "recordings")
        if not os.path.isabs(rd):
            rd = os.path.join(ROOT, rd)
        os.makedirs(rd, exist_ok=True)
        return rd


S = State()


def contact_name_for(number):
    if not number:
        return ""
    n = number.replace(" ", "")
    for c in S.contacts:
        if c.get("number", "").replace(" ", "") == n:
            return c.get("name", "")
    return ""


# ---------------------------------------------------------------------------
# Event broadcast (SSE)
# ---------------------------------------------------------------------------
def broadcast(obj):
    data = json.dumps(obj)
    with S.lock:
        subs = list(S.subscribers)
    for q in subs:
        try:
            q.put_nowait(data)
        except Exception:
            pass


def update_state(ev):
    t = ev.get("ev")
    snap = S.snapshot
    if t == "engine_up":
        snap["engine"] = True
        snap["addr"] = ev.get("addr", "")
    elif t == "slc":
        snap["slc"] = (ev.get("state") == "connected")
        if not snap["slc"]:
            snap.update({"call": "idle", "audio": False, "number": "", "name": ""})
    elif t == "call":
        st = ev.get("state")
        snap["call"] = st
        if st == "incoming":
            num = ev.get("number", "")
            nm = ev.get("name", "") or contact_name_for(num)
            snap["number"], snap["name"] = num, nm
            S.cur_call = {"dir": "in", "number": num, "name": nm,
                          "start": time.time(), "answered": False, "recording": None}
        elif st == "outgoing":
            S.cur_call = {"dir": "out", "number": snap.get("number", ""), "name": "",
                          "start": time.time(), "answered": True, "recording": None}
        elif st == "active":
            if S.cur_call:
                S.cur_call["answered"] = True
        elif st == "ended":
            if S.cur_call:
                S.cur_call["end"] = time.time()
                S.cur_call["duration"] = int(S.cur_call["end"] - S.cur_call["start"])
                S.history.insert(0, S.cur_call)
                S.history[:] = S.history[:200]
                save_json(HISTORY_F, S.history)
                S.cur_call = None
            snap.update({"call": "idle", "audio": False, "number": "", "name": ""})
    elif t == "callerid":
        num = ev.get("number", "")
        nm = ev.get("name", "") or contact_name_for(num)
        snap["number"], snap["name"] = num, nm
        if S.cur_call:
            S.cur_call["number"], S.cur_call["name"] = num, nm
    elif t == "audio":
        snap["audio"] = (ev.get("state") == "connected")
    elif t == "recording":
        if S.cur_call:
            S.cur_call["recording"] = os.path.basename(ev.get("file", ""))
    elif t == "contacts_sync":
        S.pending_contacts = []
    elif t == "contact":
        S.pending_contacts.append({"name": ev.get("name", ""), "number": ev.get("number", "")})
    elif t == "contacts_done":
        S.contacts = [c for c in S.pending_contacts if c.get("number")]
        save_json(CONTACTS_F, S.contacts)
        S.pending_contacts = []


# ---------------------------------------------------------------------------
# Engine subprocess
# ---------------------------------------------------------------------------
def engine_send(cmd):
    eng = S.engine
    if eng and eng.poll() is None:
        try:
            eng.stdin.write((cmd + "\n").encode("utf-8"))
            eng.stdin.flush()
        except Exception as e:
            print("engine_send error:", e)


def push_settings_to_engine():
    engine_send("autoanswer:" + ("on" if S.config.get("autoanswer", True) else "off"))
    engine_send("answerdelay:" + str(int(S.config.get("answerdelay", 5))))


def engine_reader(eng):
    for raw in iter(eng.stdout.readline, b""):
        line = raw.decode("utf-8", "replace").rstrip("\r\n")
        if not line:
            continue
        if line.startswith("@EVT@"):
            try:
                ev = json.loads(line[5:])
            except Exception:
                continue
            update_state(ev)
            broadcast(ev)
            if ev.get("ev") == "engine_up":
                push_settings_to_engine()
        else:
            print("[engine]", line)
    broadcast({"ev": "engine_down"})
    S.snapshot["engine"] = False
    print("[engine] process exited")


def start_engine():
    if not os.path.isfile(ENGINE_EXE):
        print("=" * 64)
        print(" Engine not built yet:", ENGINE_EXE)
        print(" Run:  powershell -ExecutionPolicy Bypass -File scripts\\setup.ps1")
        print("=" * 64)
        return
    eng = subprocess.Popen(
        [ENGINE_EXE, S.rec_dir(), GREETING_F],
        cwd=ENGINE_BIN,
        stdin=subprocess.PIPE, stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT, bufsize=0,
    )
    S.engine = eng
    threading.Thread(target=engine_reader, args=(eng,), daemon=True).start()
    print("engine started, pid", eng.pid)


# ---------------------------------------------------------------------------
# Recordings
# ---------------------------------------------------------------------------
def list_recordings():
    out = []
    rd = S.rec_dir()
    for fn in sorted(os.listdir(rd), reverse=True):
        if not fn.lower().endswith(".wav"):
            continue
        try:
            stt = os.stat(os.path.join(rd, fn))
        except Exception:
            continue
        number = ""
        parts = fn[:-4].split("_")
        if len(parts) >= 4:
            number = "_".join(parts[3:])
        out.append({"file": fn, "number": number, "name": contact_name_for(number),
                    "size": stt.st_size, "mtime": int(stt.st_mtime)})
    return out


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------
CTYPES = {".html": "text/html; charset=utf-8", ".css": "text/css",
          ".js": "application/javascript", ".wav": "audio/wav",
          ".json": "application/json", ".svg": "image/svg+xml", ".ico": "image/x-icon"}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def _send(self, code, body=b"", ctype="application/json", extra=None):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        if extra:
            for k, v in extra.items():
                self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path in ("/", "/index.html"):
            return self._serve(os.path.join(WEB_DIR, "index.html"))
        if path == "/events":
            return self._sse()
        if path == "/api/state":
            return self._send(200, json.dumps(S.snapshot))
        if path == "/api/settings":
            return self._send(200, json.dumps({k: S.config[k] for k in ("autoanswer", "answerdelay")}))
        if path == "/api/device":
            return self._send(200, json.dumps(S.config.get("device") or {}))
        if path == "/api/recordings":
            return self._send(200, json.dumps(list_recordings()))
        if path == "/api/history":
            return self._send(200, json.dumps(S.history))
        if path == "/api/contacts":
            return self._send(200, json.dumps(S.contacts))
        if path == "/api/greeting":
            return self._send(200, json.dumps({"exists": os.path.isfile(GREETING_F)}))
        if path == "/greeting.wav":
            return self._serve(GREETING_F, download=True)
        if path.startswith("/rec/"):
            fn = os.path.basename(urllib.parse.unquote(path[5:]))
            return self._serve(os.path.join(S.rec_dir(), fn), download=True)
        if path.startswith("/static/"):
            return self._serve(os.path.join(WEB_DIR, os.path.basename(path)))
        return self._send(404, '{"error":"not found"}')

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        length = int(self.headers.get("Content-Length", 0) or 0)
        body = self.rfile.read(length) if length else b""

        if path == "/cmd":
            try:
                cmd = json.loads(body).get("cmd", "")
            except Exception:
                cmd = body.decode("utf-8", "replace")
            if cmd:
                engine_send(cmd)
            return self._send(200, '{"ok":true}')

        if path == "/api/settings":
            data = load_or_empty(body)
            if "autoanswer" in data:
                S.config["autoanswer"] = bool(data["autoanswer"])
            if "answerdelay" in data:
                S.config["answerdelay"] = max(0, int(data["answerdelay"]))
            save_json(CONFIG_F, S.config)
            push_settings_to_engine()
            broadcast({"ev": "settings", "autoanswer": S.config["autoanswer"], "answerdelay": S.config["answerdelay"]})
            return self._send(200, '{"ok":true}')

        if path == "/api/device/select":
            data = load_or_empty(body)
            if data.get("addr"):
                S.config["device"] = {"addr": data["addr"], "name": data.get("name", "")}
                save_json(CONFIG_F, S.config)
            return self._send(200, '{"ok":true}')

        if path == "/api/recordings/delete":
            try:
                fn = os.path.basename(load_or_empty(body).get("file", ""))
                if fn:
                    os.remove(os.path.join(S.rec_dir(), fn))
            except Exception as e:
                return self._send(400, json.dumps({"error": str(e)}))
            return self._send(200, '{"ok":true}')

        if path == "/api/contacts":
            try:
                S.contacts = json.loads(body)
                save_json(CONTACTS_F, S.contacts)
            except Exception as e:
                return self._send(400, json.dumps({"error": str(e)}))
            return self._send(200, '{"ok":true}')

        if path == "/api/greeting":
            try:
                with open(GREETING_F, "wb") as f:
                    f.write(body)
                engine_send("greeting:reload")
            except Exception as e:
                return self._send(400, json.dumps({"error": str(e)}))
            return self._send(200, '{"ok":true}')

        if path == "/api/greeting/tts":
            try:
                text = load_or_empty(body).get("text", "").strip()
                if not text:
                    return self._send(400, '{"error":"empty text"}')
                with open(GREETING_TXT, "w", encoding="utf-8") as f:
                    f.write(text)
                r = subprocess.run(
                    ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", TTS_PS,
                     "-TextFile", GREETING_TXT, "-OutFile", GREETING_F],
                    capture_output=True, timeout=40)
                if not os.path.isfile(GREETING_F):
                    return self._send(500, json.dumps({"error": "tts failed",
                                        "detail": r.stderr.decode("utf-8", "replace")[:300]}))
                engine_send("greeting:reload")
            except Exception as e:
                return self._send(400, json.dumps({"error": str(e)}))
            return self._send(200, '{"ok":true}')

        if path == "/api/greeting/delete":
            try:
                if os.path.isfile(GREETING_F):
                    os.remove(GREETING_F)
                engine_send("greeting:reload")
            except Exception:
                pass
            return self._send(200, '{"ok":true}')

        return self._send(404, '{"error":"not found"}')

    def _serve(self, fpath, download=False):
        if not os.path.isfile(fpath):
            return self._send(404, '{"error":"not found"}')
        ext = os.path.splitext(fpath)[1].lower()
        with open(fpath, "rb") as f:
            data = f.read()
        extra = {}
        if download:
            extra["Content-Disposition"] = 'inline; filename="%s"' % os.path.basename(fpath)
            extra["Accept-Ranges"] = "bytes"
        self._send(200, data, CTYPES.get(ext, "application/octet-stream"), extra)

    def _sse(self):
        q = queue.Queue(maxsize=200)
        with S.lock:
            S.subscribers.append(q)
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        try:
            self.wfile.write(b"data: " + json.dumps({"ev": "snapshot", **S.snapshot}).encode() + b"\n\n")
            self.wfile.flush()
            while True:
                try:
                    data = q.get(timeout=15)
                    self.wfile.write(b"data: " + data.encode() + b"\n\n")
                except queue.Empty:
                    self.wfile.write(b": ping\n\n")
                self.wfile.flush()
        except Exception:
            pass
        finally:
            with S.lock:
                if q in S.subscribers:
                    S.subscribers.remove(q)


def load_or_empty(body):
    try:
        return json.loads(body)
    except Exception:
        return {}


# ---------------------------------------------------------------------------
def main():
    port = int(S.config.get("port", 8770))
    start_engine()
    httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    url = f"http://127.0.0.1:{port}/"
    print("OpenAnsweringMachine:", url)
    if "--no-browser" not in sys.argv:
        try:
            webbrowser.open(url)
        except Exception:
            pass
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        if S.engine and S.engine.poll() is None:
            S.engine.terminate()


if __name__ == "__main__":
    main()
