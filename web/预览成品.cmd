@echo off
rem ===========================================================================
rem  JeeWeave - PREVIEW of the built app  ->  http://127.0.0.1:4173/
rem
rem  Use THIS one (not the DEV one) to test "Add to Home Screen" on a phone:
rem  it serves web/dist, i.e. the real manifest and the real icons.
rem  It always rebuilds first, so what you see is the current code.
rem
rem  Keep the window open while you use it. Ctrl+C (or close) to stop.
rem
rem  WHY THIS FILE IS WRITTEN THE WAY IT IS  -- do not "simplify" it:
rem
rem  1. Both the build and the server skip pnpm.
rem     pnpm can contact the npm registry before running a script; this repo
rem     raised pnpm's network timeouts for an unstable link (fetchRetries 8,
rem     fetchTimeout 600000 = 10 minutes), so with no proxy that looks like a
rem     hang. Running the installed vite binary needs no network at all.
rem  2. NO goto labels: with LF-only line endings cmd.exe seeks labels by a
rem     byte offset that is off by one per line, so goto jumps to the wrong
rem     place. Everything is a single-line "if errorlevel 1 ...".
rem  3. The browser opens only after the port actually answers.
rem  4. The URL is 127.0.0.1, not localhost, to avoid IPv6 (::1) surprises.
rem  5. ASCII only (Chinese in a .cmd shows as garbage on non-UTF-8 consoles).
rem     Chinese lives in the FILE NAME.
rem ===========================================================================
chcp 65001 >nul
cd /d "%~dp0"
title JeeWeave - PREVIEW (port 4173)
set "PORT=4173"

echo.
echo ============================================================
echo   JeeWeave  -  PREVIEW of the built app
echo.
echo   PC     : http://127.0.0.1:4173/
echo   Phone  : the LAN / Network address printed below, same Wi-Fi required
echo            If the phone cannot open it, the PC and phone may be on
echo            different networks. Run ipconfig on the PC and use the IPv4
echo            address it shows, like http://10.136.173.217:4173/
echo.
echo   NOTE: over plain http the browser disables the Service Worker,
echo   so OFFLINE does not work here. That is expected. Offline works
echo   on the real https site.
echo.
echo   No internet needed while node_modules already exists.
echo ============================================================
echo.

rem --- are dependencies installed? -------------------------------------------
if not exist "node_modules\.bin\vite.cmd" echo [ERROR] dependencies are not installed.
if not exist "node_modules\.bin\vite.cmd" echo         node_modules\.bin\vite.cmd is missing.
if not exist "node_modules\.bin\vite.cmd" echo.
if not exist "node_modules\.bin\vite.cmd" echo         Connect your proxy first, then open PowerShell in this folder and run:
if not exist "node_modules\.bin\vite.cmd" echo             pnpm install
if not exist "node_modules\.bin\vite.cmd" echo         or, if the network is unstable:
if not exist "node_modules\.bin\vite.cmd" echo             node ..\scripts\install-retry.mjs 12
if not exist "node_modules\.bin\vite.cmd" pause
if not exist "node_modules\.bin\vite.cmd" exit /b 1

rem --- build (vite directly, no pnpm, no network) -----------------------------
echo [i] Building a fresh copy of the app...
echo.
cd /d "%~dp0"
call node_modules\.bin\vite.cmd build
if errorlevel 1 echo [ERROR] build failed - read the message above.
if errorlevel 1 pause
if errorlevel 1 exit /b 1
cd /d "%~dp0.."

rem --- serve dist and open the browser once it answers ----------------------
echo.
echo [i] Starting the static server...
echo     The browser opens by itself as soon as the server answers.
echo.
start "" powershell -NoProfile -WindowStyle Hidden -Command "for($i=0;$i -lt 40;$i++){ try{ $r=Invoke-WebRequest 'http://127.0.0.1:4173/' -UseBasicParsing -TimeoutSec 2; if($r.StatusCode -ge 200){ Start-Process 'http://127.0.0.1:4173/'; exit } }catch{} Start-Sleep -Milliseconds 750 }"
call node.exe scripts\serve-dist.mjs %PORT%
if errorlevel 1 echo [ERROR] the preview server exited with an error - read the message above.

echo.
echo [server stopped]
echo If the browser never opened, the server did not start: read the error
echo above this line and send it along - that text says what went wrong.
pause
