param([ValidateSet('Register','Cancel','Run','Probe')][string]$Mode,[string]$Root,[string]$Id)
$ErrorActionPreference='Stop'
if($Id -notmatch '^[a-f0-9-]{36}$'){throw 'Invalid reminder id'}
$Root=[IO.Path]::GetFullPath($Root)
$rowsFile=Join-Path $Root 'reminders.json'
# The persisted plugin switch also protects due tasks while the application is closed.
if($Mode -eq 'Run'){
  try{
    $workspacePath=Join-Path $Root 'workspace.json'
    if(Test-Path -LiteralPath $workspacePath){
      $workspace=ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($workspacePath,[Text.Encoding]::UTF8))
      if($workspace.data.preferences.modules.enabled.reminders -eq $false){exit}
    }
  }catch{exit}
}

$service=New-Object -ComObject Schedule.Service
$service.Connect()
$folder=$service.GetFolder('\')
if($Mode -eq 'Probe'){Write-Output 'available';exit}
$rows=ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($rowsFile,[Text.Encoding]::UTF8))
$row=$rows | Where-Object id -eq $Id | Select-Object -First 1
if(-not $row){if($Mode -eq 'Run'){exit};throw 'Reminder not found'}
if($row.taskName -notmatch '^JeeWeave-[a-f0-9]{12}-[a-f0-9-]{36}$'){throw 'Invalid reminder task'}
if($Mode -eq 'Cancel'){
  try{$null=$folder.GetTask($row.taskName)}catch{exit}
  $folder.DeleteTask($row.taskName,0);exit
}
if($Mode -eq 'Register'){
  $definition=$service.NewTask(0)
  $definition.RegistrationInfo.Description='JeeWeave local reminder'
  $definition.Principal.UserId=[Security.Principal.WindowsIdentity]::GetCurrent().Name
  $definition.Principal.LogonType=3
  $definition.Principal.RunLevel=0
  $definition.Settings.Enabled=$true
  $definition.Settings.StartWhenAvailable=$true
  $definition.Settings.DisallowStartIfOnBatteries=$false
  $definition.Settings.StopIfGoingOnBatteries=$false
  $definition.Settings.ExecutionTimeLimit='PT2M'
  $definition.Settings.MultipleInstances=2
  $trigger=$definition.Triggers.Create($(if($row.daily){2}else{1}))
  $trigger.StartBoundary=[DateTimeOffset]::FromUnixTimeMilliseconds([long]$row.at).LocalDateTime.ToString('yyyy-MM-ddTHH:mm:ss')
  if($row.daily){$trigger.DaysInterval=1}
  $trigger.Enabled=$true
  $action=$definition.Actions.Create(0)
  $action.Path="$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
  $worker=Join-Path $Root 'reminder-worker.ps1'
  $code="& '"+$worker.Replace("'","''")+"' -Mode Run -Root '"+$Root.Replace("'","''")+"' -Id '"+$Id+"'"
  $action.Arguments='-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -EncodedCommand '+[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($code))
  $null=$folder.RegisterTaskDefinition($row.taskName,$definition,6,$null,$null,3)
  Write-Output 'registered';exit
}
# A scheduled process runs only when due, never as a permanent resident.
$receiptDir=Join-Path $Root 'reminder-receipts'
$receipt=Join-Path $receiptDir ($Id+'.json')
if(Test-Path -LiteralPath $receipt){
  $old=Get-Content -LiteralPath $receipt -Raw -Encoding UTF8 | ConvertFrom-Json
  if((-not $row.daily -and [long]$old.fired -ge [long]$row.at) -or ($row.daily -and $old.day -eq (Get-Date -Format 'yyyy-MM-dd'))){exit}
}
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$form=New-Object Windows.Forms.Form
$form.Text='JeeWeave · 提醒'
$form.Size=New-Object Drawing.Size(420,230)
$form.StartPosition='CenterScreen'
$form.TopMost=$true
$form.FormBorderStyle='FixedDialog'
$form.MaximizeBox=$false
$label=New-Object Windows.Forms.Label
$label.Text=[string]$row.title
$label.Location=New-Object Drawing.Point(24,24)
$label.Size=New-Object Drawing.Size(356,100)
$label.Font=New-Object Drawing.Font('Microsoft YaHei',12)
$form.Controls.Add($label)
$close=New-Object Windows.Forms.Button
$close.Text='知道了'
$close.Location=New-Object Drawing.Point(280,135)
$close.Size=New-Object Drawing.Size(100,36)
$close.Add_Click({$form.Close()})
$form.Controls.Add($close)
$timer=New-Object Windows.Forms.Timer
$timer.Interval=30000
$timer.Add_Tick({$form.Close()})
$form.Add_Shown({[System.Media.SystemSounds]::Exclamation.Play();$timer.Start();$form.Activate()})
New-Item -ItemType Directory -Force $receiptDir | Out-Null
@{fired=[DateTimeOffset]::Now.ToUnixTimeMilliseconds();day=(Get-Date -Format 'yyyy-MM-dd')} | ConvertTo-Json | Set-Content -LiteralPath $receipt -Encoding UTF8
try{$null=$form.ShowDialog()}finally{$timer.Dispose();$form.Dispose()}
