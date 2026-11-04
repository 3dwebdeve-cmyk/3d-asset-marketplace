# Build PluginUploader.exe on a Windows PC. Run from the uploader folder:
#   powershell -ExecutionPolicy Bypass -File build_exe.ps1
# The exe holds no secrets: API key and R2 keys are read at run time (see README.md).

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

python -m venv .build-venv
& .\.build-venv\Scripts\python.exe -m pip install --upgrade pip
& .\.build-venv\Scripts\python.exe -m pip install -r requirements.txt

& .\.build-venv\Scripts\python.exe -m unittest tests.test_core
if ($LASTEXITCODE -ne 0) { throw "Tests failed; the exe was not built." }

& .\.build-venv\Scripts\python.exe -m PyInstaller `
    --noconfirm --onefile --windowed `
    --name PluginUploader `
    --paths . `
    plugin_uploader\app.py

Copy-Item settings.example.json dist\settings.example.json -Force
Write-Host "Built dist\PluginUploader.exe. Copy it with settings.json and the key file into one folder."
