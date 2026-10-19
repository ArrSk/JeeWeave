@echo off
cd /d "%~dp0.."
if not exist "node_modules\.bin\electron.cmd" (
  echo Electron runtime is not installed.
  pause
  exit /b 1
)
call node_modules\.bin\electron.cmd desktop\main.cjs
