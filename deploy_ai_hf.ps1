$source = "c:\Users\Hande\OneDrive\Documents\DoAnTotNghiep\English4U\AiScoringService"
$dest = "c:\Users\Hande\OneDrive\Documents\DoAnTotNghiep\English4U\.runtime\hf-deploy-ai-temp"

if (Test-Path $dest) {
    Remove-Item -Recurse -Force $dest
}
New-Item -ItemType Directory -Path $dest | Out-Null

# Sao chép loại trừ các thư mục không cần thiết để tránh xung đột khóa tệp Windows
$excludeList = @('venv', '.git', '__pycache__', '.pytest_cache', '.env')
Get-ChildItem -Path $source | Where-Object { $_.Name -notin $excludeList } | Copy-Item -Destination $dest -Recurse -Force

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
