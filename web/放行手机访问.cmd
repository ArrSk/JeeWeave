@echo off
rem ===========================================================================
rem  Jiwei - let the phone reach the servers on this PC
rem
rem  Double-click this file; it asks for administrator rights by itself.
rem  It adds inbound TCP allow rules for the dev server (5273) and the
rem  preview server (4173), so a phone on the same network can connect.
rem
rem  WHY THIS IS NEEDED: Windows blocks inbound connections by default.
rem  The symptom is exactly "it opens on the PC but not on the phone",
rem  because 127.0.0.1 traffic never leaves the machine.
rem
rem  WHY profile=any: Windows often marks a new/unfamiliar network as
rem  "Public", and the Public profile blocks inbound even when the app is
rem  allowed for Private networks. Using "any" avoids that trap.
rem
rem  ASCII only, and no goto / no ( ) blocks: this file may be saved with
rem  LF-only line endings, which breaks label seeking and multi-line blocks.
rem ===========================================================================
chcp 65001 >nul
cd /d "%~dp0.."
title Jiwei - allow phone access

rem --- administrator rights? ------------------------------------------------
net session >nul 2>nul
if errorlevel 1 echo This needs administrator rights - a Windows prompt will appear...
if errorlevel 1 powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
if errorlevel 1 exit /b

echo.
echo ============================================================
echo   Allow the phone to reach the Jiwei servers on this PC
echo   inbound TCP 5273 and 4173, all network profiles
echo ============================================================
echo.

rem delete first so re-running does not stack duplicate rules
netsh advfirewall firewall delete rule name="Jiwei LAN 5273" >nul 2>nul
netsh advfirewall firewall delete rule name="Jiwei LAN 4173" >nul 2>nul
netsh advfirewall firewall add rule name="Jiwei LAN 5273" dir=in action=allow protocol=TCP localport=5273 profile=any
netsh advfirewall firewall add rule name="Jiwei LAN 4173" dir=in action=allow protocol=TCP localport=4173 profile=any

echo.
echo --- This PC's IPv4 address - use this one on the phone ---
ipconfig | findstr /c:"IPv4"

echo.
echo Now on the phone open:  http://THE-ADDRESS-ABOVE:5273/
echo The phone must be on the SAME network as this PC.
echo.
echo To undo later, in an administrator PowerShell run:
echo   netsh advfirewall firewall delete rule name="Jiwei LAN 5273"
echo   netsh advfirewall firewall delete rule name="Jiwei LAN 4173"
echo.
pause
