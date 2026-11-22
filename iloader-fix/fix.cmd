@echo off
chcp 65001 >nul
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Fix-ILoader.ps1" %*
set CODE=%ERRORLEVEL%
echo.
echo code de sortie : %CODE%
pause
