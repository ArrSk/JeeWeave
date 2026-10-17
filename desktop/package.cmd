@echo off
setlocal
cd /d "%~dp0.."

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Please install Node.js 22 or newer first.
  pause
  exit /b 1
)

node desktop\package-desktop.cjs
if errorlevel 1 (
  echo Desktop packaging failed. Read the message above.
  pause
  exit /b 1
)

echo Ready: desktop\release\ (see the complete path printed above).
pause
endlocal
