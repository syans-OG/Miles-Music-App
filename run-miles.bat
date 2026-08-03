@echo off
setlocal
cd /d "%~dp0"
echo Starting Miles Music Player...
call npm.cmd run tauri dev
if errorlevel 1 (
  echo.
  echo Miles failed to start. Copy the error above and send it to Codex.
  pause
)
