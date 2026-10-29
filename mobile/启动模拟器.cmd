@echo off
setlocal
set "mobileRoot=%~dp0"
set "sdk=%mobileRoot%.cache\toolchain\sdk"
set "emulator=%sdk%\emulator\emulator.exe"
set "image=%mobileRoot%.cache\toolchain\image-unpacked\x86_64"
set "result=2"
if not exist "%emulator%" goto missing
if not exist "%image%\system.img" goto missing
if not exist "%mobileRoot%.cache\tmp" mkdir "%mobileRoot%.cache\tmp"
if not exist "%mobileRoot%.cache\emulator-home" mkdir "%mobileRoot%.cache\emulator-home"
set "TEMP=%mobileRoot%.cache\tmp"
set "TMP=%TEMP%"
set "ANDROID_SDK_ROOT=%sdk%"
set "ANDROID_EMULATOR_HOME=%mobileRoot%.cache\emulator-home"
set "ANDROID_AVD_HOME=%mobileRoot%.cache\avd"
set "ANDROID_ADB_SERVER_PORT=5038"
"%emulator%" -accel-check
if errorlevel 1 goto acceleration
set "result=0"
if /i "%~1"=="-CheckOnly" goto finish
set "gpu=software"
if /i "%~1"=="-Gpu" if /i "%~2"=="auto" set "gpu=auto"
set "avd=%ANDROID_AVD_HOME%\jeeweave-phone.avd"
if not exist "%avd%" mkdir "%avd%"
if not exist "%mobileRoot%.cache\verification" mkdir "%mobileRoot%.cache\verification"
if exist "%avd%\config.ini" goto configured
(
echo AvdId=jeeweave-phone
echo avd.ini.encoding=UTF-8
echo abi.type=x86_64
echo hw.cpu.arch=x86_64
echo hw.cpu.ncore=2
echo hw.ramSize=2048
echo hw.lcd.width=432
echo hw.lcd.height=936
echo hw.lcd.density=180
echo hw.keyboard=yes
echo hw.gpu.enabled=yes
echo hw.gpu.mode=auto
echo disk.dataPartition.size=4G
echo tag.id=default
echo PlayStore.enabled=false
echo showDeviceFrame=no
) > "%avd%\config.ini"
>> "%avd%\config.ini" echo image.sysdir.1=%image%\
:configured
> "%ANDROID_AVD_HOME%\jeeweave-phone.ini" echo avd.ini.encoding=UTF-8
>> "%ANDROID_AVD_HOME%\jeeweave-phone.ini" echo path=%avd%
>> "%ANDROID_AVD_HOME%\jeeweave-phone.ini" echo target=android-35
echo Starting Android. Wait for its home screen, then drag this APK into the emulator:
echo %mobileRoot%.cache\verification\JeeWeave-native-testbed.apk
echo Open the installed JeeWeave test app. Close the emulator window to exit.
set "log=%mobileRoot%.cache\verification\emulator-ui-%RANDOM%-%RANDOM%.log"
echo Log: %log%
"%emulator%" -avd jeeweave-phone -port 5580 -accel on -gpu %gpu% -no-snapshot -no-boot-anim -no-metrics > "%log%" 2>&1
set "result=%errorlevel%"
if not "%result%"=="0" type "%log%"
goto finish
:missing
echo Android emulator or system image is missing. See mobile/guides for setup instructions.
goto finish
:acceleration
set "result=3"
echo Hardware acceleration is not ready. The emulator was not started.
echo Enable CPU virtualization and Windows Hypervisor Platform, then restart Windows.
echo See mobile/guides for detailed instructions. No system settings were changed.
:finish
if /i not "%~1"=="-CheckOnly" pause
exit /b %result%
