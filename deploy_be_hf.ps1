$source = "c:\Users\Hande\OneDrive\Documents\DoAnTotNghiep\English4U\english4u-backend"
$dest = "c:\Users\Hande\OneDrive\Documents\DoAnTotNghiep\English4U\.runtime\hf-deploy-temp"

if (Test-Path $dest) {
    Remove-Item -Recurse -Force $dest
}
New-Item -ItemType Directory -Path $dest | Out-Null

Copy-Item -Path "$source\*" -Destination $dest -Recurse -Force

Get-ChildItem -Path $dest -Recurse -Directory -Filter "bin" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem -Path $dest -Recurse -Directory -Filter "obj" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
if (Test-Path "$dest\.git") {
    Remove-Item -Recurse -Force "$dest\.git"
}

cd $dest
git init
git config user.name "minhtri1"
git config user.email "minhtri1@users.noreply.huggingface.co"
git add .
git add -f EnglishExamApp.API/appsettings.json
git commit -m "deploy: clean deployment to Hugging Face with configuration"
git checkout -b main
git push https://minhtri1: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@huggingface.co/spaces/minhtri1/english4u-backend main:main --force

cd "c:\Users\Hande\OneDrive\Documents\DoAnTotNghiep\English4U"
Remove-Item -Recurse -Force $dest
