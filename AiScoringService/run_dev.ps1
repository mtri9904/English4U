$ErrorActionPreference = "Stop"

$serviceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = Join-Path $serviceRoot "venv\Scripts\python.exe"

if (-not (Test-Path $python)) {
    throw "AiScoringService venv was not found at $python"
}

Set-Location $serviceRoot
& $python -m uvicorn main:app --reload --port 8000
