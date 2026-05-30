# OpenAnsweringMachine

Turn a Windows PC into a **Bluetooth answering machine and speakerphone** for your phone.

Pair your phone to the PC over Bluetooth and OpenAnsweringMachine can:

- 📞 **Take calls on your PC** — answer/reject, talk through the PC mic + speakers, hang up, send DTMF
- 🤖 **Answering machine** — auto-answer after a configurable delay, play a greeting, then a beep, then **record the caller's message**
- 🔒 **Screen calls** — on auto-answer your mic stays *private*; tap **Join call** any time to jump in
- 🗣️ **Greetings** — record one with your mic, or generate one from text with the built-in Windows voice (TTS)
- 🎚️ **Dial out** from the PC with an on-screen keypad
- 📇 **Contacts** — pull your phone's phonebook over Bluetooth (PBAP) for caller-ID names + click-to-call
- 💾 **Recordings library** — play / download / delete recordings right in the browser
- 🕑 **Call history**

All local: a small native engine drives the Bluetooth dongle, a Python server bridges to a
dark, simple web UI in your browser. No cloud, no account.

> ⚠️ **Why it needs a dedicated dongle:** Windows does not let normal apps control Bluetooth calls
> or capture call audio. OpenAnsweringMachine bypasses the Windows Bluetooth stack and drives a USB
> dongle directly (via WinUSB + [BTstack](https://github.com/bluekitchen/btstack)). While the app
> owns the dongle, Windows can't use it for normal Bluetooth — so a cheap **dedicated** dongle is
> recommended. This is fully reversible (see [Reverting the dongle](#reverting-the-dongle)).

---

## Requirements

- **Windows 10 / 11** (x64)
- A **supported USB Bluetooth dongle** — see [docs/SUPPORTED_DONGLES.md](docs/SUPPORTED_DONGLES.md).
  Most cheap "BT 5.x nano" dongles using **Realtek RTL8761B/BU** (e.g. TP-Link UB500) work out of the box.
- **Python 3** on PATH — https://www.python.org/ (tick *Add to PATH* during install)
- **MSYS2** — the setup script installs it automatically via `winget` if missing
- **[Zadig](https://zadig.akeo.ie/)** — to bind the dongle to WinUSB (one-time, reversible)

## Install & build

```powershell
git clone https://github.com/GeorgeSedhom0/OpenAnsweringMachine.git
cd OpenAnsweringMachine
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
```

`setup.ps1` installs the toolchain, clones BTstack (pinned), builds the engine, and bundles it
into `engine\bin\`. First run downloads a fair bit (MSYS2 + BTstack); later runs are fast.

## One-time: bind the dongle to WinUSB (Zadig)

1. Plug in the dongle. Download and run **[Zadig](https://zadig.akeo.ie/)** (as admin).
2. **Options → List All Devices**.
3. Select your **Bluetooth dongle** in the dropdown. **Verify the USB ID is your dongle** — replacing
   the wrong device's driver will break that device.
4. Choose **WinUSB** as the target driver → **Replace Driver**.

Windows will no longer use this dongle for normal Bluetooth until you revert it (below).

## Run

```powershell
powershell -ExecutionPolicy Bypass -File scripts\run.ps1
```

This starts the engine + server and opens **http://127.0.0.1:8770/**.

## Using it

1. **Settings → Scan for phones** → put your phone on its Bluetooth pairing screen → pick it from the
   list. It's saved; pairing happens on first connect.
2. Click **Connect phone** (top bar). Approve the pairing prompt on the phone.
3. **Calls:** incoming calls show on the card with caller ID. Answer/reject, or let the answering
   machine pick up after your configured delay.
4. **Answering machine (Settings):** toggle auto-answer, set the delay, and choose a **greeting**
   (record with mic, or type text for the PC to speak). Callers hear the greeting → beep → and their
   message is recorded. Your mic stays private until you tap **Join call**.
5. **Dial out:** use the keypad and press **Call**.
6. **Contacts:** Contacts tab → **Sync from phone** (approve access on the phone).
7. **Recordings / History** tabs for playback and logs.

## Configuration

Copy `config.example.json` → `config.json` to change the web port, recording folder, or defaults.
The selected phone and answering-machine settings are also saved there by the UI. Chipset/firmware
can be overridden with environment variables — see [docs/SUPPORTED_DONGLES.md](docs/SUPPORTED_DONGLES.md).

## Reverting the dongle

To use the dongle for normal Bluetooth again: run **Zadig**, select the dongle, and replace the
driver back to the original Bluetooth driver — or in **Device Manager**, uninstall the device
(tick *delete driver*) and **Scan for hardware changes**. Worst case, Windows reinstalls its in-box
Bluetooth driver on the next reboot. (Using a second, dedicated dongle avoids this entirely.)

## Limitations

- **Windows only.** Calls are HFP Hands-Free; this is a *headset/answering machine*, not a media (A2DP)
  device — music streaming is out of scope.
- Recording captures the **caller's** audio (the voicemail). 
- The dongle is dedicated to this app while WinUSB is bound.
- SCO call audio over USB can be sensitive to USB load on some machines; see troubleshooting in
  [docs/SUPPORTED_DONGLES.md](docs/SUPPORTED_DONGLES.md).

## How it works

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## License & credits

Original code is MIT (see `LICENSE`). The engine is built on **BTstack** (BlueKitchen) and is free
for personal/non-commercial use — **commercial use requires a BTstack license**. Bundled firmware is
from linux-firmware. Full details in [NOTICE.md](NOTICE.md).
