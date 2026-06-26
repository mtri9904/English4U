$source = "c:\Users\Hande\OneDrive\Documents\DoAnTotNghiep\English4U\AiScoringService"
$dest = "c:\Users\Hande\OneDrive\Documents\DoAnTotNghiep\English4U\.runtime\hf-deploy-ai-temp"

if (Test-Path $dest) {
    Remove-Item -Recurse -Force $dest
}
New-Item -ItemType Directory -Path $dest | Out-Null

Copy-Item -Path "$source\*" -Destination $dest -Recurse -Force

# Loại bỏ môi trường ảo venv và git cũ để tránh đẩy tệp nặng lên Space
if (Test-Path "$dest\venv") {
    Remove-Item -Recurse -Force "$dest\venv"
}
if (Test-Path "$dest\.git") {
    Remove-Item -Recurse -Force "$dest\.git"
}

cd $dest
git init
git config user.name "minhtri1"
git config user.email "minhtri1@users.noreply.huggingface.co"
git add .
git commit -m "deploy: deploy AiScoringService to Hugging Face"
git checkout -b main
git push https://minhtri1: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@huggingface.co/spaces/minhtri1/english4u-ai-service main:main --force

cd "c:\Users\Hande\OneDrive\Documents\DoAnTotNghiep\English4U"
Remove-Item -Recurse -Force $dest
