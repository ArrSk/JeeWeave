param([switch]$AndroidTests)
$ErrorActionPreference = 'Stop'
$cacheRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '.cache/toolchain'))
New-Item -ItemType Directory -Force $cacheRoot | Out-Null
$packages = @(
  @{name='jdk'; url='https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.12.1%2B1/OpenJDK21U-jdk_x64_windows_hotspot_21.0.12.1_1.zip'; algorithm='SHA256'; hash='f9d6e191ab098c0d416e7d588a24420a8621cd2f4720dab2459b8b7b2d2d8b4e'; destination='jdk'},
  @{name='build-tools'; url='https://dl.google.com/android/repository/build-tools_r35_windows.zip'; algorithm='SHA1'; hash='af059bb67cf7786f45ee0db85e2d24985df1b4b6'; destination='tools-unpacked'},
  @{name='platform'; url='https://dl.google.com/android/repository/platform-35_r02.zip'; algorithm='SHA1'; hash='0bb560a90a7a2cbd0dd8348224d518b638fe7949'; destination='platform-unpacked'}
)
if($AndroidTests){$packages+=@(
  @{name='emulator';url='https://dl.google.com/android/repository/emulator-windows_x64-16632760.zip';algorithm='SHA1';hash='5ecdf654031e9791e20c336c8d87d2238cb69f3a';destination='emulator-unpacked'},
  @{name='platform-tools';url='https://dl.google.com/android/repository/platform-tools_r37.0.1-win.zip';algorithm='SHA1';hash='e03e78b1d80b396f1c3358e31251cb31740e1110';destination='platform-tools-unpacked'},
  @{name='system-image';url='https://dl.google.com/android/repository/sys-img/android/x86_64-35_r02.zip';algorithm='SHA1';hash='2d857d170c0d1b827149565da34b3383e5306f7f';destination='image-unpacked'}
)}
foreach ($package in $packages) {
  $archive = Join-Path $cacheRoot ($package.name + '.zip')
  if (-not (Test-Path -LiteralPath $archive)) {
    $proxyUri = [System.Net.WebRequest]::GetSystemWebProxy().GetProxy([uri]$package.url)
    $downloadArgs = @('--fail','--location','--retry','2','--connect-timeout','20','--max-time','600',$package.url,'-o',$archive)
    if ($proxyUri.AbsoluteUri -ne $package.url) { $downloadArgs = @('--proxy',$proxyUri.AbsoluteUri) + $downloadArgs }
    & curl.exe @downloadArgs
    if ($LASTEXITCODE -ne 0) { throw "Download failed: $($package.name)" }
  }
  if ((Get-FileHash -LiteralPath $archive -Algorithm $package.algorithm).Hash.ToLowerInvariant() -ne $package.hash) { throw "Checksum mismatch: $archive" }
  $destination = Join-Path $cacheRoot $package.destination
  if (-not (Test-Path -LiteralPath $destination)) { [IO.Compression.ZipFile]::ExtractToDirectory($archive, $destination) }
}
New-Item -ItemType Directory -Force "$cacheRoot/sdk/build-tools", "$cacheRoot/sdk/platforms" | Out-Null
if (-not (Test-Path -LiteralPath "$cacheRoot/sdk/build-tools/35.0.0")) { Move-Item -LiteralPath "$cacheRoot/tools-unpacked/android-15" -Destination "$cacheRoot/sdk/build-tools/35.0.0" }
if (-not (Test-Path -LiteralPath "$cacheRoot/sdk/platforms/android-35")) { Move-Item -LiteralPath "$cacheRoot/platform-unpacked/android-35" -Destination "$cacheRoot/sdk/platforms/android-35" }
if($AndroidTests){foreach($toolName in @('emulator','platform-tools')){if(-not(Test-Path -LiteralPath "$cacheRoot/sdk/$toolName")){Move-Item -LiteralPath "$cacheRoot/$toolName-unpacked/$toolName" -Destination "$cacheRoot/sdk/$toolName"}}}
Write-Output "Local-only toolchain ready: $cacheRoot"
