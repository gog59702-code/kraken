# build.ps1 — build l'overlay + vérifie les scripts Luau
# Usage: .\tools\build.ps1 [-Run]

param([switch]$Run)

$root = Split-Path -Parent $PSScriptRoot
$cpp  = Join-Path $root "snippets\cpp"
$build = Join-Path $root "build"

Write-Host "== configure ==" -ForegroundColor Cyan
cmake -S $cpp -B $build -G "Visual Studio 17 2022" -A x64

Write-Host "== build ==" -ForegroundColor Cyan
cmake --build $build --config Release --parallel

Write-Host "== luau syntax ==" -ForegroundColor Cyan
$luau = Get-Command luau-analyze -ErrorAction SilentlyContinue
if ($luau) {
    Get-ChildItem (Join-Path $root "snippets\luau") -Filter *.luau | ForEach-Object {
        Write-Host "  $($_.Name)" -ForegroundColor DarkGray
        & $luau.Source $_.FullName
    }
} else {
    Write-Host "luau-analyze absent (rokit add luau-lang/luau)" -ForegroundColor Yellow
}

$exe = Join-Path $build "Release\rbx_ext.exe"
if ($Run) {
    if (Test-Path $exe) {
        Start-Process $exe -Verb RunAs
    } else {
        Write-Host "exe introuvable: $exe" -ForegroundColor Red
    }
} else {
    Write-Host "`n-> $exe" -ForegroundColor Green
}
