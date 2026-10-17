param([Parameter(Mandatory = $true)][string]$PackageDirectory)
$ErrorActionPreference = 'Stop'
$packageRoot = (Resolve-Path -LiteralPath $PackageDirectory).Path
$appName = ([string][char]0x51E0) + [char]0x5FAE
$exePath = Join-Path $packageRoot ($appName + '.exe')
if (-not (Test-Path -LiteralPath $exePath)) { throw "Missing executable: $exePath" }
$logDirectory = Join-Path $PSScriptRoot '../.cache/verification'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

function Get-OwnedProcesses {
  @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $exePath })
}
if ((Get-OwnedProcesses).Count -gt 0) { throw 'Close this package before checking its native launch.' }

foreach ($attempt in 1..2) {
  $stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  # No debugging arguments, environment changes, or alternate executable copy.
  $probe = Start-Process -FilePath $exePath -WorkingDirectory $packageRoot -WindowStyle Normal -PassThru -RedirectStandardOutput (Join-Path $logDirectory "native-$stamp.stdout.log") -RedirectStandardError (Join-Path $logDirectory "native-$stamp.stderr.log")
  try {
    Start-Sleep -Seconds 3
    $probe.Refresh()
    if ($probe.HasExited) { throw "Native launch exited before showing a window: $($probe.ExitCode). Package: $packageRoot" }
    for ($i = 0; $i -lt 40 -and $probe.MainWindowHandle -eq 0; $i++) { Start-Sleep -Milliseconds 100; $probe.Refresh() }
    if ($probe.MainWindowHandle -eq 0 -or $probe.MainWindowTitle -notlike ('*' + $appName + '*')) { throw 'No visible main window.' }
    if (-not (Test-Path -LiteralPath (Join-Path $packageRoot 'data/profile/Local Storage/leveldb'))) { throw 'Main page did not create its local data.' }
    Write-Output "Visible native launch $attempt`: PID=$($probe.Id) title=$($probe.MainWindowTitle)"
    # Poll actual process existence: redirected Chromium handles can delay .NET WaitForExit.
    if (-not $probe.CloseMainWindow()) { throw 'Failed to send main window close.' }
    for ($i = 0; $i -lt 60; $i++) {
      if ((Get-OwnedProcesses).Count -eq 0) { break }
      Start-Sleep -Milliseconds 200
    }
    if ((Get-OwnedProcesses).Count -ne 0) { throw 'Processes remained after native window close.' }
    Write-Output "PASS: native launch $attempt and all owned processes closed."
  } catch {
    $probe.Refresh()
    if (-not $probe.HasExited) { [void]$probe.CloseMainWindow() }
    throw
  }
}
