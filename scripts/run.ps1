<#
  OpenAnsweringMachine — start the app (engine + web server) and open the UI.
#>
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$py = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $py) { $py = (Get-Command py -ErrorAction SilentlyContinue).Source }
if (-not $py) { throw "Python 3 not found on PATH. Install from https://www.python.org/ (check 'Add to PATH')." }

if (-not (Test-Path "$Root\engine\bin\oam_engine.exe")) {
    Write-Host "Engine not built yet. Run scripts\setup.ps1 first." -ForegroundColor Yellow
}

& $py "$Root\server\server.py"
