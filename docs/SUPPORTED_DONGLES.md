# Supported Bluetooth dongles

OpenAnsweringMachine drives a USB Bluetooth dongle **directly** (WinUSB + BTstack), bypassing the
Windows Bluetooth stack. That means the dongle's controller chipset must be one BTstack can
initialize — and for chips that need a firmware patch, the right firmware must be present.

## ✅ Recommended / tested

| Chipset | Examples | Notes |
|--------|----------|-------|
| **Realtek RTL8761B / RTL8761BU** | TP-Link **UB500**, and many generic "BT 5.0/5.1/5.3 nano" dongles | **Tested.** Firmware bundled (`engine/firmware/`). Default config targets this. The dongle used in development reports USB `VID 2357 / PID 0604`. |

Most inexpensive nano dongles sold today are RTL8761B/BU and should work with the defaults.

## ⚙️ Other Realtek chips (likely workable)

BTstack supports many Realtek controllers, but each needs its **matching firmware + config** and the
right USB **product id**. Provide them via environment variables (set before launching, or in a
wrapper around `run.ps1`):

```
OAM_CHIPSET=realtek                     (default)
OAM_FIRMWARE_DIR=C:\path\to\firmware    (folder containing the fw + config files)
OAM_REALTEK_PRODUCT_ID=0x8771           (selects the firmware entry; 0x8771 = RTL8761BU)
```

Get firmware from [linux-firmware `rtl_bt/`](https://gitlab.com/kernel-firmware/linux-firmware/-/tree/main/rtl_bt).
Save the `*_fw.bin` / `*_config.bin` files into your firmware dir **without** the `.bin` extension
(the engine opens e.g. `rtl8761bu_fw`). Common product ids:

| Chip | Product id | Firmware files |
|------|-----------|----------------|
| RTL8761BU | `0x8771` | `rtl8761bu_fw`, `rtl8761bu_config` |
| RTL8821CU | `0xc820` | `rtl8821cu_fw`, `rtl8821cu_config` |
| RTL8822CU | `0xc82c` | `rtl8822cu_fw`, `rtl8822cu_config` |
| RTL8852BU | `0x8852` | `rtl8852bu_fw`, `rtl8852bu_config` |

(See `chipset/realtek/btstack_chipset_realtek.c` in BTstack for the full product-id table.)

## ⚙️ CSR / Cambridge Silicon Radio (CSR8510 etc.)

These generally **don't need a firmware download**. Try:

```
OAM_CHIPSET=none
```

This skips the Realtek firmware step. Untested here, and beware: many "CSR8510" dongles on the
market are counterfeit and behave poorly.

## ❌ Not supported

- Dongles whose controller BTstack cannot initialize.
- Anything where Windows' WinUSB **isochronous** transfers (which carry SCO call audio) are
  unreliable on your machine — symptom is choppy/no call audio even though control works.

## Troubleshooting

| Symptom | Likely cause / fix |
|--------|--------------------|
| `Connection failed, status 0x04` (page timeout), phone can't see the PC in a scan | Firmware not loaded — wrong `OAM_REALTEK_PRODUCT_ID`/missing firmware, or `OAM_CHIPSET` wrong for your chip. |
| Engine prints `Realtek: Using firmware ...` but never `up and running` with working scan | Firmware/product-id mismatch for your exact chip revision. |
| Control works (rings, answers) but **call audio is choppy/silent** | WinUSB isochronous (SCO) instability — try a different USB port (ideally USB 2.0), fewer USB devices, or another dongle. |
| `oam_engine.exe` won't start | Run from `scripts\run.ps1` (it sets things up); ensure `libportaudio.dll` sits next to the exe (done by `setup.ps1`). |

If you get a new chipset working, please open a PR adding it to the tested table.
