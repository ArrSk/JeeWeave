param([string]$JavaHome, [string]$SdkRoot, [switch]$TestBed)
$ErrorActionPreference = 'Stop'
$mobileRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$projectRoot = Split-Path -Parent $mobileRoot
if (-not $JavaHome) { $JavaHome = (Get-ChildItem "$mobileRoot/.cache/toolchain/jdk" -Directory | Select-Object -First 1).FullName }
if (-not $SdkRoot) { $SdkRoot = "$mobileRoot/.cache/toolchain/sdk" }
$javaBin = Join-Path $JavaHome 'bin'
$sdkTools = Join-Path $SdkRoot 'build-tools/35.0.0'
$androidJar = Join-Path $SdkRoot 'platforms/android-35/android.jar'
foreach ($tool in @("$javaBin/javac.exe", "$javaBin/jar.exe", "$sdkTools/aapt2.exe", "$sdkTools/lib/d8.jar", "$androidJar")) { if (-not (Test-Path -LiteralPath $tool)) { throw "Missing tool: $tool. See mobile/README.md." } }
function Run-Tool([string]$tool, [string[]]$toolArgs) {
  & $tool @toolArgs
  if ($LASTEXITCODE -ne 0) { throw "Command failed ($LASTEXITCODE): $tool" }
}
Run-Tool 'node' @("$mobileRoot/prepare.mjs")
$buildRoot = "$mobileRoot/.cache/build"
# Exact, checked generated path only; a rebuild cannot retain obsolete classes/assets.
if ([IO.Path]::GetFullPath($buildRoot) -ne "$mobileRoot\.cache\build") { throw 'Unsafe build target' }
if (Test-Path -LiteralPath $buildRoot) { Remove-Item -LiteralPath $buildRoot -Recurse -Force }
try {
New-Item -ItemType Directory -Force "$buildRoot/res/drawable", "$buildRoot/compiled", "$buildRoot/classes", "$buildRoot/dex", "$mobileRoot/release", "$mobileRoot/.signing" | Out-Null
Copy-Item -LiteralPath "$projectRoot/desktop/assets/app-icon.png" -Destination "$buildRoot/res/drawable/app_icon.png"
$manifestPath="$mobileRoot/android/AndroidManifest.xml"
if($TestBed){
  $manifestText=[IO.File]::ReadAllText($manifestPath).Replace('package="cn.jeeweave.mobile"','package="cn.jeeweave.mobile.testbed"').Replace('android:name=".MainActivity"','android:name="cn.jeeweave.mobile.MainActivity"').Replace('android:label="几微"','android:label="几微验证"')
  $manifestPath="$buildRoot/testbed-manifest.xml";[IO.File]::WriteAllText($manifestPath,$manifestText,[Text.UTF8Encoding]::new($false))
}
Run-Tool "$sdkTools/aapt2.exe" @('compile', '--dir', "$buildRoot/res", '-o', "$buildRoot/compiled")
$compiled = @(Get-ChildItem "$buildRoot/compiled" -File | ForEach-Object FullName)
Run-Tool "$sdkTools/aapt2.exe" (@('link', '-I', $androidJar, '--manifest', $manifestPath, '-A', "$mobileRoot/dist", '-o', "$buildRoot/unsigned.apk", '--auto-add-overlay') + $compiled)
# The Windows AAPT2 assets packer emits backslashes for nested asset names.
# Android AssetManager requires forward slashes. Normalize before signing.
$assetZip = [IO.Compression.ZipFile]::Open("$buildRoot/unsigned.apk", [IO.Compression.ZipArchiveMode]::Update)
try {
  foreach ($entry in @($assetZip.Entries | Where-Object { $_.FullName.Contains('\') })) {
    $name = $entry.FullName.Replace('\','/')
    if ($assetZip.GetEntry($name)) { throw "Duplicate normalized asset: $name" }
    $bytes = [IO.MemoryStream]::new(); $inputStream = $entry.Open()
    try { $inputStream.CopyTo($bytes) } finally { $inputStream.Dispose() }
    $replacement = $assetZip.CreateEntry($name); $outputStream = $replacement.Open()
    try { $bytes.Position = 0; $bytes.CopyTo($outputStream) } finally { $outputStream.Dispose(); $bytes.Dispose() }
    $entry.Delete()
  }
} finally { $assetZip.Dispose() }
$sources = @(Get-ChildItem "$mobileRoot/android/src" -Filter '*.java' -Recurse | ForEach-Object FullName)
Run-Tool "$javaBin/javac.exe" (@('-encoding', 'UTF-8', '--release', '8', '-classpath', $androidJar, '-d', "$buildRoot/classes") + $sources)
Run-Tool "$javaBin/jar.exe" @('cf', "$buildRoot/classes.jar", '-C', "$buildRoot/classes", '.')
Run-Tool "$javaBin/java.exe" @('-cp', "$sdkTools/lib/d8.jar", 'com.android.tools.r8.D8', '--min-api', '26', '--lib', $androidJar, '--output', "$buildRoot/dex", "$buildRoot/classes.jar")
Copy-Item -LiteralPath "$buildRoot/dex/classes.dex" -Destination "$buildRoot/classes.dex"
Push-Location $buildRoot
try { Run-Tool "$javaBin/jar.exe" @('uf', 'unsigned.apk', 'classes.dex') } finally { Pop-Location }
Run-Tool "$sdkTools/zipalign.exe" @('-f', '-P', '16', '4', "$buildRoot/unsigned.apk", "$buildRoot/aligned.apk")
$keyFile = "$mobileRoot/.signing/jeeweave-beta.jks"
if (-not (Test-Path -LiteralPath $keyFile)) {
  # Local Beta signing identity, stable across updates; never package or commit it.
  Run-Tool "$javaBin/keytool.exe" @('-genkeypair', '-keystore', $keyFile, '-storepass', 'android', '-keypass', 'android', '-alias', 'jeeweave-beta', '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000', '-dname', 'CN=JeeWeave Local Beta, O=JeeWeave, C=CN')
}
$apk = "$mobileRoot/release/JeeWeave-0.3.0-mobile-beta.3.apk"
if($TestBed){$apk="$mobileRoot/.cache/verification/JeeWeave-native-testbed.apk"}
Run-Tool "$javaBin/java.exe" @('-jar', "$sdkTools/lib/apksigner.jar", 'sign', '--v4-signing-enabled', 'false', '--ks', $keyFile, '--ks-key-alias', 'jeeweave-beta', '--ks-pass', 'pass:android', '--key-pass', 'pass:android', '--out', $apk, "$buildRoot/aligned.apk")
Run-Tool "$javaBin/java.exe" @('-jar', "$sdkTools/lib/apksigner.jar", 'verify', '--verbose', '--print-certs', $apk)
Run-Tool "$sdkTools/aapt2.exe" @('dump', 'badging', $apk)
$zip = [IO.Compression.ZipFile]::OpenRead($apk)
try {
  $staged = @(Get-ChildItem "$mobileRoot/dist" -Recurse -File)
  $assets = @($zip.Entries | Where-Object { $_.FullName.StartsWith('assets/') -and -not $_.FullName.EndsWith('/') })
  if ($staged.Count -ne $assets.Count) { throw 'Unexpected or missing APK assets' }
  foreach ($source in $staged) {
    $relative = [IO.Path]::GetRelativePath("$mobileRoot/dist", $source.FullName).Replace('\','/')
    $entry = $zip.GetEntry("assets/$relative")
    if (-not $entry) { throw "Missing APK asset: $relative" }
    $stream = $entry.Open()
    try { $algorithm = [Security.Cryptography.SHA256]::Create(); $inside = [Convert]::ToHexString($algorithm.ComputeHash($stream)); $algorithm.Dispose() }
    finally { $stream.Dispose() }
    if ($inside -ne (Get-FileHash -LiteralPath $source.FullName -Algorithm SHA256).Hash) { throw "Stale APK asset: $relative" }
    if ($relative -match '(^|/)(data|profile|\.cache|node_modules|backups)(/|$)') { throw "Private asset candidate: $relative" }
  }
  Write-Output "APK asset audit passed: $($staged.Count) source-matched files, no data/profile."
} finally { $zip.Dispose() }
$hash = (Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText("$apk.sha256", "$hash  $([IO.Path]::GetFileName($apk))`n", [Text.UTF8Encoding]::new($false))
Write-Output "APK: $apk"

} finally {
  if ([IO.Path]::GetFullPath($buildRoot) -ne "$mobileRoot\.cache\build") { throw "Unsafe build cleanup target" }
  if (Test-Path -LiteralPath $buildRoot) { Remove-Item -LiteralPath $buildRoot -Recurse -Force }
}
