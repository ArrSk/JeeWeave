@echo off
rem ===========================================================================
rem  Jiwei - DEV server (hot reload)  ->  http://127.0.0.1:5273/
rem
rem  Double-click this file. Keep the window open while you work.
rem  Press Ctrl+C (or close the window) to stop.
rem
rem  WHY THIS FILE IS WRITTEN THE WAY IT IS  -- do not "simplify" it:
rem
rem  1. vite is started DIRECTLY, not through pnpm.
rem     pnpm can contact the npm registry before running a script. This repo
rem     deliberately raised pnpm's network timeouts for an unstable link
rem     (fetchRetries 8, fetchTimeout 600000 = 10 minutes), so with no proxy
rem     that failure looks like a window that hangs and never serves anything.
rem     Nothing about running the app needs the network once node_modules
rem     exists, so we skip pnpm entirely and call the installed vite binary.
rem  2. NO goto labels. This file may be saved with LF-only line endings.
rem     cmd.exe seeks batch labels by byte offset, which is off by one byte per
rem     line under LF, so "goto :failed" jumps to the wrong place. Everything
rem     below is a single-line "if errorlevel 1 ...".
rem  3. The browser opens ONLY after the port actually answers (polled from
rem     PowerShell), so it cannot land on a dead port and show "page not found".
rem  4. The URL is 127.0.0.1, not localhost: if vite binds IPv4 only,
rem     "localhost" may resolve to ::1 first on Windows and fail.
rem  5. ASCII only - non-ASCII in a .cmd shows as garbage on non-UTF-8
rem     consoles. Chinese lives in the FILE NAME.
rem ===========================================================================
chcp 65001 >nul
cd /d "%~dp0"
title Jiwei - DEV server (port 5273)
set "PORT=5273"

echo.
echo ============================================================
echo   Jiwei  -  DEV server  (edits reload the browser)
echo.
echo   PC     : http://127.0.0.1:5273/
echo   Phone  : the Network address printed below, same Wi-Fi required
echo            If the phone cannot open it, the PC and phone may be on
echo            different networks. Run ipconfig on the PC and use the IPv4
echo            address it shows, like http://10.136.173.217:5273/
echo.
echo   Keep this window OPEN.  Ctrl+C to stop.
echo   No internet needed while node_modules already exists.
echo ============================================================
echo.

rem --- are dependencies installed? -------------------------------------------
rem This is the only thing that needs the network, and only the first time.
if not exist "node_modules\.bin\vite.cmd" echo [ERROR] dependencies are not installed.
if not exist "node_modules\.bin\vite.cmd" echo         node_modules\.bin\vite.cmd is missing.
if not exist "node_modules\.bin\vite.cmd" echo.
if not exist "node_modules\.bin\vite.cmd" echo         Connect your proxy first, then open PowerShell in this folder and run:
if not exist "node_modules\.bin\vite.cmd" echo             pnpm install
if not exist "node_modules\.bin\vite.cmd" echo         or, if the network is unstable:
if not exist "node_modules\.bin\vite.cmd" echo             node ..\scripts\install-retry.mjs 12
if not exist "node_modules\.bin\vite.cmd" pause
if not exist "node_modules\.bin\vite.cmd" exit /b 1

rem --- open the browser once the server answers (max ~30s) -------------------
start "" powershell -NoProfile -WindowStyle Hidden -Command "for($i=0;$i -lt 40;$i++){ try{ $r=Invoke-WebRequest 'http://127.0.0.1:5273/' -UseBasicParsing -TimeoutSec 2; if($r.StatusCode -ge 200){ Start-Process 'http://127.0.0.1:5273/'; exit } }catch{} Start-Sleep -Milliseconds 750 }"

echo [i] Starting vite directly (no pnpm, no network)...
echo     The browser opens by itself as soon as the server answers.
echo.
cd /d "%~dp0"
call node_modules\.bin\vite.cmd

echo.
echo [server stopped]
echo If the browser never opened, the server did not start: read the error
echo above this line and send it along - that text says what went wrong.
pause
