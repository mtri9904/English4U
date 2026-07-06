# run_docker_ai.ps1
# Script to build and run English4U AI Service locally in Docker

Write-Host "Checking and starting LanguageTool Docker service..." -ForegroundColor Cyan
powershell -ExecutionPolicy Bypass -File ./AiScoringService/run_languagetool.ps1

$imageName = "english4u-ai-service"
$containerName = "english4u-ai"
$port = 8000

Write-Host "Stopping and removing existing container if running..." -ForegroundColor Cyan
docker stop $containerName 2>$null
docker rm $containerName 2>$null

Write-Host "Building Docker image '$imageName' (this may take a few minutes on first run)..." -ForegroundColor Cyan
docker build -t $imageName -f ./AiScoringService/Dockerfile ./AiScoringService

Write-Host "Starting container '$containerName' on port $port..." -ForegroundColor Cyan
docker run -d `
  -p "$($port):7860" `
  --name $containerName `
  --restart always `
  --add-host=host.docker.internal:host-gateway `
  -e WHISPER_MODEL_SIZE=base `
  -e SPEAKING_MFA_BINARY=mfa `
  -e SPEAKING_MFA_ROOT_DIR=/code/mfa_models `
  -e LANGUAGETOOL_URL=http://host.docker.internal:8081/v2/check `
  $imageName

Write-Host "AI Service is now starting inside Docker!" -ForegroundColor Green
Write-Host "You can verify the status by calling: curl http://localhost:8000/health" -ForegroundColor Yellow
