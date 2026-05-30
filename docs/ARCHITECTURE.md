# Architecture

```
  Phone ──Bluetooth──►  USB dongle  ──WinUSB──►  oam_engine.exe        (native, C / BTstack)
                                                    │  ▲
                              JSON events (stdout)   │  │  line commands (stdin)
                                                    ▼  │
                                              server.py                (Python stdlib)
                                                    │  ▲
                                   Server-Sent Events│  │  HTTP (fetch)
                                                    ▼  │
                                          Browser web UI                (web/, dark, vanilla JS)
```

## Why bypass the Windows Bluetooth stack?

Windows does not expose call control or call-audio capture to normal apps. The documented WinRT
path (`PhoneLineTransportDevice.RegisterApp`) has been broken since Windows 11 22H2 — it throws
`UnauthorizedAccessException` even for packaged apps with the right capabilities. So instead we
take the dongle away from Windows (bind it to **WinUSB** via Zadig) and run a full Bluetooth host
stack in user space using **[BTstack](https://github.com/bluekitchen/btstack)**. That gives us the
HFP control channel **and** the SCO audio stream — both of which Windows otherwise withholds.

## Components

### Engine — `engine/` (C, on BTstack, windows-winusb port)
- Drives the dongle over WinUSB; downloads Realtek firmware at startup (two-pass HCI init).
- **HFP Hands-Free**: connect, answer/reject/hang-up, dial, DTMF, caller ID, call state.
- **SCO audio** via PortAudio: phone↔PC voice. Outgoing audio is post-processed so the mic is
  muted by default on auto-answer (greeting → beep → silence) and only goes live on `join`.
- **Recording**: each call's received audio is written to a timestamped WAV.
- **PBAP**: pulls the phone's phonebook (`telecom/pb.vcf`) and parses vCards → contacts.
- **Protocol** (line-based, over stdio):
  - Commands in: `scan`, `connect:<addr>`, `connect`, `disconnect`, `answer`, `reject`, `hangup`,
    `join`, `dial:<number>`, `dtmf:<k>`, `autoanswer:on|off`, `answerdelay:<s>`,
    `greeting:reload`, `contacts:sync`, `status`
  - Events out (`@EVT@{json}`): `engine_up`, `device`, `scan`, `scan_done`, `slc`, `call`
    (incoming/outgoing/active/ended), `callerid`, `audio`, `autoanswer_fired`, `joined`,
    `recording`, `contact`, `contacts_done`, `settings`
- Built from `engine/src/` + `engine/overlay/` dropped onto a pinned BTstack checkout by
  `scripts/setup.ps1`. BTstack itself is **not** vendored.

### Server — `server/server.py` (Python standard library only)
- Launches the engine, parses its events, keeps live state + call history.
- Pushes events to the browser via **SSE** (`/events`); accepts commands via `POST /cmd`.
- REST: settings, device selection, recordings (list/serve/delete), contacts, greeting
  (upload / TTS via `tools/tts.ps1` using the built-in Windows voice).
- All paths relative to the repo; persistent state in `config.json` / `history.json` /
  `contacts.json`.

### Web UI — `web/` (dark, vanilla HTML/CSS/JS)
- Status bar, live call card (incoming/outgoing/active, Join), dialer, recordings, history,
  contacts, settings (device scan/pick, auto-answer, greeting).

## Build / overlay model

`setup.ps1` clones BTstack at a pinned commit, then copies our files over it:

| Overlay file | Replaces / adds in BTstack |
|--------------|----------------------------|
| `engine/src/oam_engine.c` | `example/oam_engine.c` (our engine; derived from `hfp_hf_demo.c`) |
| `engine/src/sco_demo_util.{c,h}` | `example/sco_demo_util.*` (TX gating, greeting/beep, recording) |
| `engine/overlay/port/windows-winusb/main.c` | port `main.c` (env-driven Realtek init + firmware dir) |
| `engine/overlay/port/windows-winusb/CMakeLists.txt` | builds just the `oam_engine` target |
| `engine/overlay/platform/windows/btstack_stdin_windows.c` | `getchar()` so stdin works over a pipe |

This keeps our repo small and licensing clean while remaining reproducible.
