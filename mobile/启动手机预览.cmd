@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0.."
where node >nul 2>nul
if errorlevel 1 goto missingnode
if not exist "node_modules\electron\dist\electron.exe" goto missingdeps
node "mobile\preview.mjs"
if errorlevel 1 pause
exit /b
:missingnode
echo 未找到 Node.js。请先安装项目要求的 Node.js 22 或更新版本。
pause
exit /b 1
:missingdeps
echo 缺少项目依赖。请在项目根目录运行 pnpm install 后重试。
pause
exit /b 1
