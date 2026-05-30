# Third-party components & licensing

OpenAnsweringMachine combines original code with third-party components. Please
review these before any commercial use.

## BTstack (BlueKitchen GmbH)
The Bluetooth engine is built on **BTstack** (https://github.com/bluekitchen/btstack).
`scripts/setup.ps1` clones BTstack at a pinned commit; it is **not** vendored in this repo.

The files under `engine/src/` and `engine/overlay/` are **derivative works** of BTstack
example/port code and retain BlueKitchen's copyright headers and license.

> BTstack is free for **non-commercial / personal** use. **Commercial use requires a
> commercial license** from BlueKitchen GmbH (contact@bluekitchen-gmbh.com).

If you intend to use this project commercially, obtain a BTstack commercial license.

## Realtek Bluetooth firmware
`engine/firmware/rtl8761bu_fw` and `rtl8761bu_config` are Realtek RTL8761B/BU controller
firmware, redistributed from the **linux-firmware** project
(https://gitlab.com/kernel-firmware/linux-firmware, `rtl_bt/`). They are governed by the
Realtek firmware redistribution license included in linux-firmware (`LICENCE.rtlwifi_firmware.txt`).
They are bundled only for convenience; you may instead point `OAM_FIRMWARE_DIR` at your own.

## PortAudio
The engine links **PortAudio** (https://www.portaudio.com/) for local audio I/O, provided by
the MSYS2 `mingw-w64-x86_64-portaudio` package (MIT-style license). `libportaudio.dll` is
bundled next to the engine binary by `setup.ps1`.

## Zadig / libwdi
Binding the USB dongle to WinUSB uses **Zadig** (https://zadig.akeo.ie/), which is not
distributed with this project — users download it themselves.
