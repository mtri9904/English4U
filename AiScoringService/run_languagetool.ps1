$ErrorActionPreference = "Stop"

$serviceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$composeFile = Join-Path $serviceRoot "docker-compose.languagetool.yml"
$healthUrl = "http://localhost:8081/v2/check"

try {
    $null = Invoke-WebRequest `
        -UseBasicParsing `
        -Method Post `
        -Uri $healthUrl `
        -Body @{ text = "LanguageTool readiness check."; language = "en-US" } `
        -TimeoutSec 5
    Write-Host "LanguageTool is already responding on $healthUrl"
    exit 0
} catch {
    Write-Host "LanguageTool is not responding yet; starting Docker service..."
}

docker compose -f $composeFile up -d
if ($LASTEXITCODE -ne 0) {
    throw "Docker Compose failed to start LanguageTool. Make sure Docker Desktop is running."
}

Write-Host "LanguageTool is starting on $healthUrl"
Write-Host "Verify with: .\venv\Scripts\python.exe -B evaluation\check_speaking_runtime_readiness.py"
