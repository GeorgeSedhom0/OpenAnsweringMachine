# Bluetooth controller firmware

These are Realtek RTL8761B/BU controller firmware blobs, redistributed from
[linux-firmware](https://gitlab.com/kernel-firmware/linux-firmware) (`rtl_bt/`):

| File                 | Source (linux-firmware `rtl_bt/`) |
|----------------------|-----------------------------------|
| `rtl8761bu_fw`       | `rtl8761bu_fw.bin`                |
| `rtl8761bu_config`   | `rtl8761bu_config.bin`           |

> Note: files are stored **without** the `.bin` extension because that's the exact name the
> engine opens (`<firmware_dir>/rtl8761bu_fw`).

The engine downloads this firmware to the dongle at startup (RTL8761B/BU chips need it to
transmit). See `docs/SUPPORTED_DONGLES.md` for other chips and how to point at different
firmware via the `OAM_FIRMWARE_DIR` / `OAM_REALTEK_PRODUCT_ID` environment variables.

License: governed by `LICENCE.rtlwifi_firmware.txt` in linux-firmware.
