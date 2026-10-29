param([switch]$BuildOnly, [string]$Serial='emulator-5580', [switch]$Physical)
$ErrorActionPreference='Stop'
$mobileRoot=[IO.Path]::GetFullPath($PSScriptRoot)
$javaBin=Join-Path ((Get-ChildItem "$mobileRoot/.cache/toolchain/jdk" -Directory | Select-Object -First 1).FullName) 'bin'
$sdk="$mobileRoot/.cache/toolchain/sdk"; $tools="$sdk/build-tools/35.0.0"; $androidJar="$sdk/platforms/android-35/android.jar"
$target="$mobileRoot/.cache/android-test-"+[DateTimeOffset]::Now.ToUnixTimeMilliseconds()
New-Item -ItemType Directory -Force "$target/classes","$target/dex" | Out-Null
function Run([string]$exe,[string[]]$arguments){& $exe @arguments;if($LASTEXITCODE -ne 0){throw "Failed ($LASTEXITCODE): $exe"}}
$targetPackage=if($Physical){'cn.jeeweave.mobile.testbed'}else{'cn.jeeweave.mobile'}
$testManifest=[IO.File]::ReadAllText("$mobileRoot/android-test/AndroidManifest.xml").Replace('android:targetPackage="cn.jeeweave.mobile"',('android:targetPackage="'+$targetPackage+'"'))
[IO.File]::WriteAllText("$target/manifest.xml",$testManifest,[Text.UTF8Encoding]::new($false))
Run "$tools/aapt2.exe" @('link','-I',$androidJar,'--manifest',"$target/manifest.xml",'-o',"$target/test.apk")
$sources=@(Get-ChildItem "$mobileRoot/android-test/src" -Filter '*.java' -Recurse | ForEach-Object FullName)
Run "$javaBin/javac.exe" (@('--release','8','-encoding','UTF-8','-classpath',$androidJar,'-d',"$target/classes")+$sources)
Run "$javaBin/jar.exe" @('cf',"$target/test.jar",'-C',"$target/classes",'.')
Run "$javaBin/java.exe" @('-cp',"$tools/lib/d8.jar",'com.android.tools.r8.D8','--min-api','26','--lib',$androidJar,'--output',"$target/dex","$target/test.jar")
Push-Location "$target/dex"
try{Run "$javaBin/jar.exe" @('uf',"$target/test.apk",'classes.dex')}finally{Pop-Location}
Run "$tools/zipalign.exe" @('-f','4',"$target/test.apk","$target/aligned.apk")
Run "$javaBin/java.exe" @('-jar',"$tools/lib/apksigner.jar",'sign','--v4-signing-enabled','false','--ks',"$mobileRoot/.signing/jeeweave-beta.jks",'--ks-pass','pass:android','--key-pass','pass:android','--out',"$target/checks.apk","$target/aligned.apk")
if($BuildOnly){Write-Output "Test APK: $target/checks.apk";exit 0}
if(-not $Physical -and $Serial -notmatch '^(emulator-5580|127\.0\.0\.1:5581)$'){throw 'Only the project test emulator is allowed without Physical flag'}
$adb="$sdk/platform-tools/adb.exe";$env:TEMP="$mobileRoot/.cache/tmp";$env:TMP=$env:TEMP
$appApk=if($Physical){"$mobileRoot/.cache/verification/JeeWeave-native-testbed.apk"}else{"$mobileRoot/release/JeeWeave-0.3.0-mobile-beta.3.apk"}
Run $adb @('-P','5038','-s',$Serial,'install','-r',$appApk)
Run $adb @('-P','5038','-s',$Serial,'install','-r',"$target/checks.apk")
Run $adb @('-P','5038','-s',$Serial,'shell','pm','clear',$targetPackage)
if(-not $Physical){Run $adb @('-P','5038','-s',$Serial,'shell','settings','put','secure','show_ime_with_hard_keyboard','1')}
$instrument=@('-P','5038','-s',$Serial,'shell','am','instrument','-w','cn.jeeweave.mobile.checks/cn.jeeweave.mobile.checks.MobileChecks')
$output=& $adb @instrument; $output | Tee-Object -FilePath "$mobileRoot/.cache/verification/android-native.log"
if(($output -join "`n") -notmatch 'passed'){throw 'Android native checks failed'}
Run $adb @('-P','5038','-s',$Serial,'shell','input','keyevent','3')
Run $adb @('-P','5038','-s',$Serial,'shell','am','force-stop',$targetPackage)
$reopen=& $adb '-P' '5038' '-s' $Serial 'shell' 'am' 'instrument' '-w' '-e' 'mode' 'reopen' 'cn.jeeweave.mobile.checks/cn.jeeweave.mobile.checks.MobileChecks';$reopen | Tee-Object -FilePath "$mobileRoot/.cache/verification/android-reopen.log"
if(($reopen -join "`n") -notmatch 'persistence passed'){throw 'Native reopen checks failed'}
