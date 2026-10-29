param([string]$DesktopRoundtrip, [switch]$WithDesktopRoundtrip)
$ErrorActionPreference='Stop'
$mobileRoot=[IO.Path]::GetFullPath($PSScriptRoot)
$javaBin=Join-Path ((Get-ChildItem "$mobileRoot/.cache/toolchain/jdk" -Directory | Select-Object -First 1).FullName) 'bin'
$jsonJar="$mobileRoot/.cache/toolchain/json-test.jar"
if(-not(Test-Path -LiteralPath $jsonJar)){
  $url='https://repo.maven.apache.org/maven2/org/json/json/20250517/json-20250517.jar';$proxyUri=[System.Net.WebRequest]::GetSystemWebProxy().GetProxy([uri]$url)
  $downloadArgs=@('--fail','--location','--max-time','60',$url,'-o',$jsonJar);if($proxyUri.AbsoluteUri -ne $url){$downloadArgs=@('--proxy',$proxyUri.AbsoluteUri)+$downloadArgs}
  & curl.exe @downloadArgs;if($LASTEXITCODE -ne 0){throw 'Test JSON library download failed'}
}
if((Get-FileHash $jsonJar -Algorithm SHA1).Hash.ToLowerInvariant() -ne 'd67181bbd819ccceb929b580a4e2fcb0c8b17cd8'){throw 'Test JSON dependency checksum mismatch'}
$runRoot=[IO.Path]::GetFullPath("$mobileRoot/.cache/test-runs/native-$([guid]::NewGuid().ToString('N'))")
$runBase=[IO.Path]::GetFullPath("$mobileRoot/.cache/test-runs")
if([IO.Path]::GetDirectoryName($runRoot) -ne $runBase){throw 'Unsafe native test target'}
$priorOutput=$env:JEEWEAVE_NATIVE_TEST_OUTPUT
try {
  $classes="$runRoot/classes";New-Item -ItemType Directory -Force $classes | Out-Null
  & "$javaBin/javac.exe" --release 8 -encoding UTF-8 -classpath $jsonJar -d $classes "$mobileRoot/android/src/cn/jeeweave/mobile/WorkspaceFiles.java" "$mobileRoot/native-files-test/WorkspaceFilesChecks.java"
  if($LASTEXITCODE -ne 0){throw 'Native check compilation failed'}
  $arguments=@('-classpath',"$classes;$jsonJar",'cn.jeeweave.mobile.WorkspaceFilesChecks',$runRoot)
  if($DesktopRoundtrip){$arguments+=[IO.Path]::GetFullPath($DesktopRoundtrip)}
  & "$javaBin/java.exe" @arguments
  if($LASTEXITCODE -ne 0){throw 'Native attachment checks failed'}
  if($WithDesktopRoundtrip){
    if($DesktopRoundtrip){throw 'Choose either DesktopRoundtrip or WithDesktopRoundtrip'}
    $env:JEEWEAVE_NATIVE_TEST_OUTPUT=$runRoot
    & node --test "$mobileRoot/transfer-compat.test.mjs"
    if($LASTEXITCODE -ne 0){throw 'Desktop compatibility check failed'}
    & "$javaBin/java.exe" -classpath "$classes;$jsonJar" cn.jeeweave.mobile.WorkspaceFilesChecks $runRoot "$runRoot/desktop-returned.jiwei"
    if($LASTEXITCODE -ne 0){throw 'Native return check failed'}
  }
} finally {
  $env:JEEWEAVE_NATIVE_TEST_OUTPUT=$priorOutput
  if([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($runRoot)) -ne $runBase){throw 'Unsafe native cleanup target'}
  if(Test-Path -LiteralPath $runRoot){Remove-Item -LiteralPath $runRoot -Recurse -Force}
  Write-Output 'Native test data removed.'
}
