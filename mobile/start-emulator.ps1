param([switch]$CheckOnly,[ValidateSet('software','auto')][string]$Gpu='software')
$ErrorActionPreference='Stop'
$mobileRoot=[IO.Path]::GetFullPath($PSScriptRoot)
$sdk="$mobileRoot/.cache/toolchain/sdk"
$emulator="$sdk/emulator/emulator.exe"
$image="$mobileRoot/.cache/toolchain/image-unpacked/x86_64"
foreach($required in @($emulator,"$image/system.img")){
  if(-not(Test-Path -LiteralPath $required)){
    Write-Output '缺少模拟器或 Android 系统镜像。先在项目根目录运行：'
    Write-Output 'pwsh -NoProfile -File mobile/setup-tools.ps1 -AndroidTests'
    exit 2
  }
}
New-Item -ItemType Directory -Force "$mobileRoot/.cache/tmp","$mobileRoot/.cache/emulator-home" | Out-Null
$env:TEMP="$mobileRoot/.cache/tmp";$env:TMP=$env:TEMP
$env:ANDROID_SDK_ROOT=$sdk
$env:ANDROID_EMULATOR_HOME="$mobileRoot/.cache/emulator-home"
$env:ANDROID_AVD_HOME="$mobileRoot/.cache/avd"
$env:ANDROID_ADB_SERVER_PORT='5038'
$acceleration=& $emulator -accel-check 2>&1
$accelExit=$LASTEXITCODE
$acceleration | ForEach-Object { Write-Output $_ }
if($accelExit -ne 0){
  Write-Output ''
  Write-Output '硬件加速尚不可用，模拟器没有启动。请完成以下设置后重试：'
  Write-Output '1. 任务管理器 → 性能 → CPU，确认“虚拟化：已启用”。未启用时需在 BIOS 开启 Intel VT-x / AMD SVM。'
  Write-Output '2. Windows 搜索“启用或关闭 Windows 功能”，勾选 Windows Hypervisor Platform 对应项目。'
  Write-Output '3. 重启电脑，再双击本文件夹的“启动模拟器.cmd”。'
  Write-Output '无需重装 SDK。仅选择软件 GPU 不能代替 CPU 虚拟化加速。'
  Write-Output '详细步骤：mobile/guides/模拟器启动.md'
  exit 3
}
Write-Output '硬件加速检查通过。'
if($CheckOnly){exit 0}
$avdName='jeeweave-phone'
$avd="$env:ANDROID_AVD_HOME/$avdName.avd"
New-Item -ItemType Directory -Force $avd,"$mobileRoot/.cache/verification" | Out-Null
$config="$avd/config.ini"
if(-not(Test-Path -LiteralPath $config)){
  $settings=@('AvdId=jeeweave-phone','avd.ini.encoding=UTF-8','abi.type=x86_64','hw.cpu.arch=x86_64','hw.cpu.ncore=2','hw.ramSize=2048','hw.lcd.width=432','hw.lcd.height=936','hw.lcd.density=180','hw.keyboard=yes','hw.gpu.enabled=yes','hw.gpu.mode=auto','disk.dataPartition.size=4G','tag.id=default','tag.display=Default Android System Image','PlayStore.enabled=false','showDeviceFrame=no')
}else{$settings=@([IO.File]::ReadAllLines($config) | Where-Object {$_ -notmatch '^image\.sysdir\.1\s*='})}
$settings+="image.sysdir.1=$image/"
[IO.File]::WriteAllLines($config,$settings,[Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText("$env:ANDROID_AVD_HOME/$avdName.ini","avd.ini.encoding=UTF-8`npath=$avd`ntarget=android-35`n",[Text.UTF8Encoding]::new($false))
$log="$mobileRoot/.cache/verification/emulator-ui-"+[DateTimeOffset]::Now.ToUnixTimeMilliseconds()+'.log'
Write-Output ''
Write-Output '正在打开 Android 手机模拟器，首次启动请等待 Android 桌面出现。'
Write-Output '把下面的 APK 从文件管理器拖进模拟器窗口，等待安装后点击“几微验证”：'
Write-Output "$mobileRoot/.cache/verification/JeeWeave-native-testbed.apk"
Write-Output '关闭模拟器窗口即可退出。此启动器不会开启 Windows 功能、安装驱动或访问手机。'
Write-Output "启动日志：$log"
& $emulator -avd $avdName -port 5580 -accel on -gpu $Gpu -no-snapshot -no-boot-anim -no-metrics *> $log
$emulatorExit=$LASTEXITCODE
if($emulatorExit -ne 0){Write-Output "模拟器退出（$emulatorExit）。请保留以下错误：";Get-Content -LiteralPath $log -Tail 15}
exit $emulatorExit
