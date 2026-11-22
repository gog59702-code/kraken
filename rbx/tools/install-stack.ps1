# install-stack.ps1 — Windows 11, PowerShell admin
# Installe : toolchain C++, RE, Python, Node, vcpkg, rokit (rojo/stylua/luau-lsp)

$ErrorActionPreference = "Continue"

function WI($id) {
    Write-Host ">> $id" -ForegroundColor Cyan
    winget install --id $id -e --accept-source-agreements --accept-package-agreements --silent
}

# --- toolchain ---
WI "Microsoft.VisualStudio.2022.Community"
WI "Microsoft.VisualStudio.2022.BuildTools"
WI "Kitware.CMake"
WI "Ninja-build.Ninja"
WI "Git.Git"
WI "Microsoft.WindowsSDK.10.0.26100"

# --- runtimes ---
WI "Python.Python.3.12"
WI "OpenJS.NodeJS.LTS"
WI "Microsoft.DotNet.SDK.8"
WI "Rustlang.Rustup"

# --- éditeurs ---
WI "Microsoft.VisualStudioCode"
WI "Notepad++.Notepad++"
WI "MHNexus.HxD"
WI "7zip.7zip"

# --- reverse engineering (Cheat Engine = installeur manuel) ---
WI "x64dbg.x64dbg"
WI "NSA.Ghidra"
WI "Microsoft.Sysinternals.SysinternalsSuite"

Write-Host "`n=== VS Code extensions ===" -ForegroundColor Cyan
$ext = @(
    "ms-vscode.cpptools",
    "ms-vscode.cmake-tools",
    "sumneko.lua",
    "JohnnyMorganz.luau-lsp",
    "JohnnyMorganz.stylua",
    "usernamehw.errorlens",
    "vadimcn.vscode-lldb"
)
foreach ($e in $ext) { code --install-extension $e --force }

Write-Host "`n=== vcpkg ===" -ForegroundColor Cyan
if (-not (Test-Path "$env:USERPROFILE\vcpkg")) {
    git clone --depth 1 https://github.com/microsoft/vcpkg.git "$env:USERPROFILE\vcpkg"
    & "$env:USERPROFILE\vcpkg\bootstrap-vcpkg.bat"
}
$env:VCPKG_ROOT = "$env:USERPROFILE\vcpkg"
[Environment]::SetEnvironmentVariable("VCPKG_ROOT", $env:VCPKG_ROOT, "User")
& "$env:VCPKG_ROOT\vcpkg.exe" install minhook detours capstone nlohmann-json spdlog fmt

Write-Host "`n=== Python ===" -ForegroundColor Cyan
py -3.12 -m pip install --upgrade pip
py -3.12 -m pip install frida-tools pefile capstone requests luaparser

Write-Host "`n=== Roblox toolchain (rokit) ===" -ForegroundColor Cyan
if (-not (Test-Path "$env:USERPROFILE\.rokit\bin\rokit.exe")) {
    iwr https://raw.githubusercontent.com/rojo-rbx/rokit/main/scripts/install.ps1 -UseB | iex
}
& rokit add rojo-rbx/rojo
& rokit add JohnnyMorganz/StyLua
& rokit add JohnnyMorganz/luau-lsp
& rokit add Kampfkarren/selene

Write-Host "`nDone. Relance le shell pour VCPKG_ROOT." -ForegroundColor Green
Write-Host "Reste manuel : Cheat Engine, System Informer, ReClass.NET" -ForegroundColor Yellow
