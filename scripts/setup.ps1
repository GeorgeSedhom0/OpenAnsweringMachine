<#
  OpenAnsweringMachine — build the Bluetooth engine.

  Steps:
    1. Ensure MSYS2 + mingw-w64 toolchain + PortAudio are installed.
    2. Clone BTstack (pinned commit) into engine\btstack.
    3. Apply our overlay (custom port CMakeLists/main.c, stdin patch) + engine sources.
    4. Build oam_engine.exe.
    5. Bundle the exe + libportaudio.dll + firmware into engine\bin\.

  Re-runnable. Does NOT touch your Bluetooth driver — see README for the one-time Zadig step.
#>
$ErrorActionPreference = "Stop"
$Root     = Split-Path -Parent $PSScriptRoot
$Msys     = if ($env:OAM_MSYS2) { $env:OAM_MSYS2 } else { "C:\msys64" }   # override with OAM_MSYS2
$Bash     = "$Msys\usr\bin\bash.exe"
$BtCommit = "5bc5cbdbeec33be1fdbd0d50e04c0f6deab99d2d"   # pinned BTstack
$BtDir    = "$Root\engine\btstack"
$BinDir   = "$Root\engine\bin"

function Say($m){ Write-Host "[setup] $m" -ForegroundColor Cyan }

# 1. MSYS2
if (-not (Test-Path $Bash)) {
    Say "MSYS2 not found - installing via winget..."
    winget install --id MSYS2.MSYS2 -e --accept-source-agreements --accept-package-agreements
}
if (-not (Test-Path $Bash)) { throw "MSYS2 not found at $Msys. Install from https://www.msys2.org/ and re-run." }

Say "Installing/Updating mingw-w64 toolchain + PortAudio (pacman)..."
& $Bash -lc "pacman -Sy --noconfirm" | Out-Null
& $Bash -lc "pacman -S --noconfirm --needed git make mingw-w64-x86_64-toolchain mingw-w64-x86_64-cmake mingw-w64-x86_64-portaudio"
if ($LASTEXITCODE -ne 0) { throw "pacman failed" }

# 2. BTstack (pinned)
$git = (Get-Command git -ErrorAction SilentlyContinue).Source
if (-not $git) { $git = "$Msys\usr\bin\git.exe" }
if (-not (Test-Path "$BtDir\.git")) {
    Say "Cloning BTstack..."
    & $git clone https://github.com/bluekitchen/btstack.git $BtDir
}
Say "Checking out pinned BTstack commit $BtCommit ..."
& $git -C $BtDir fetch origin
& $git -C $BtDir checkout --force $BtCommit

# 3. Overlay + engine sources
Say "Applying overlay + engine sources..."
Copy-Item "$Root\engine\overlay\port\windows-winusb\main.c"        "$BtDir\port\windows-winusb\main.c" -Force
Copy-Item "$Root\engine\overlay\port\windows-winusb\CMakeLists.txt" "$BtDir\port\windows-winusb\CMakeLists.txt" -Force
Copy-Item "$Root\engine\overlay\platform\windows\btstack_stdin_windows.c" "$BtDir\platform\windows\btstack_stdin_windows.c" -Force
Copy-Item "$Root\engine\src\oam_engine.c"    "$BtDir\example\oam_engine.c" -Force
Copy-Item "$Root\engine\src\sco_demo_util.c" "$BtDir\example\sco_demo_util.c" -Force
Copy-Item "$Root\engine\src\sco_demo_util.h" "$BtDir\example\sco_demo_util.h" -Force

# 4. Build (in MSYS2 MINGW64)
$portUnix = (& $Bash -lc "cygpath -u '$($BtDir -replace '\\','/')/port/windows-winusb'").Trim()
Say "Building engine..."
& $Bash -lc "export MSYSTEM=MINGW64; source /etc/profile; cd '$portUnix' && rm -rf build && mkdir build && cd build && cmake -G 'MSYS Makefiles' .. && make oam_engine -j4"
if ($LASTEXITCODE -ne 0) { throw "build failed" }

$exe = "$BtDir\port\windows-winusb\build\oam_engine.exe"
if (-not (Test-Path $exe)) { throw "oam_engine.exe was not produced" }

# 5. Bundle
Say "Bundling into engine\bin ..."
New-Item -ItemType Directory -Force "$BinDir" | Out-Null
New-Item -ItemType Directory -Force "$BinDir\firmware" | Out-Null
Copy-Item $exe "$BinDir\oam_engine.exe" -Force
Copy-Item "$Msys\mingw64\bin\libportaudio.dll" "$BinDir\libportaudio.dll" -Force
Copy-Item "$Root\engine\firmware\*" "$BinDir\firmware\" -Force

Write-Host ""
Write-Host "[setup] Done. Engine at: $BinDir\oam_engine.exe" -ForegroundColor Green
Write-Host "[setup] One-time: bind your Bluetooth dongle to WinUSB with Zadig (see README)." -ForegroundColor Yellow
Write-Host "[setup] Then run:  powershell -ExecutionPolicy Bypass -File scripts\run.ps1" -ForegroundColor Green
