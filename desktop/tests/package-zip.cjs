// Verify the actual distribution archive in an owned fixture, never user data.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const base=path.resolve(__dirname,'../.cache/test-runs');
const releaseRoot=path.resolve(__dirname,'../release');
const summaries=path.resolve(__dirname,'../.cache/verification');
const latest=JSON.parse(fs.readFileSync(path.join(releaseRoot,'latest-build.json'),'utf8'));
const destination=path.resolve(latest.destination),archive=path.resolve(latest.archive);
assert.equal(path.dirname(destination),releaseRoot);
assert.equal(archive,destination+'.zip');
assert.equal(path.resolve(latest.checksum),archive+'.sha256');
assert.equal(latest.version,require('../../package.json').version);
const hash=crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
assert.equal(fs.readFileSync(latest.checksum,'utf8').trim().split(/\s+/)[0],hash);
fs.mkdirSync(base,{recursive:true});fs.mkdirSync(summaries,{recursive:true});
const root=fs.mkdtempSync(path.join(base,'zip-package-'));
const quote=value=>"'"+value.replaceAll("'","''")+"'";
let passed=false;
(async()=>{
  try{
    const extract=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`$ErrorActionPreference='Stop';Expand-Archive -LiteralPath ${quote(archive)} -DestinationPath ${quote(path.join(root,'extracted'))}`],{stdio:'inherit',windowsHide:true,timeout:120000});
    if(extract.error)throw extract.error;assert.equal(extract.status,0,'ZIP extraction failed');
    const input=path.join(root,'extracted',path.basename(destination));
    const env={...process.env,JEEWEAVE_PACKAGE_TEST_ROOT:root};
    for(const key of ['ELECTRON_RUN_AS_NODE','JEEWEAVE_DATA_DIR','JIWEI_DATA_DIR','JEEWEAVE_PACKAGE_NATIVE','JEEWEAVE_PACKAGE_LAUNCH','JEEWEAVE_NATIVE_TRACE'])delete env[key];
    const tested=spawnSync(process.execPath,[path.join(__dirname,'package-smoke.cjs'),input],{stdio:'inherit',env,windowsHide:true,timeout:240000});
    if(tested.error)throw tested.error;assert.equal(tested.status,0,'Extracted ZIP smoke failed');
    const result=JSON.parse(fs.readFileSync(path.join(summaries,'package-smoke-summary.json'),'utf8'));
    assert.ok(result.passed&&result.nativeReminder==='passed');
    passed=true;console.log('PASS: distribution ZIP hash, extracted executable, native reminders, four layouts and portable data.');
  }finally{
    if(path.dirname(root)!==base||!path.basename(root).startsWith('zip-package-')||fs.lstatSync(root).isSymbolicLink())throw Error('Unsafe ZIP fixture cleanup');
    const stop=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`$ErrorActionPreference='Stop';$ownedRoot=${quote(root+path.sep)};Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -and $_.ExecutablePath.StartsWith($ownedRoot,[StringComparison]::OrdinalIgnoreCase)} | ForEach-Object {Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue}`],{windowsHide:true,encoding:'utf8',timeout:30000});
    if(stop.status!==0)throw Error('ZIP test process cleanup failed');
    const {createReminderPlatform}=require('../reminder-platform.cjs');
    for(const name of fs.readdirSync(root)){
      if(!name.startsWith('package-smoke-'))continue;
      for(const copy of ['首次启动','移动后的 几微']){
        const data=path.join(root,name,copy,'data');
        if(!fs.existsSync(path.join(data,'reminders.json')))continue;
        const reminders=createReminderPlatform({root:data});
        for(const row of (await reminders.handle('reminders-list')).rows)await reminders.handle('reminder-cancel',{id:row.id});
      }
    }
    fs.rmSync(root,{recursive:true,force:true,maxRetries:30,retryDelay:150});
    fs.writeFileSync(path.join(summaries,'zip-release-summary.json'),JSON.stringify({version:latest.version,passed,sha256:hash,testDataRemoved:true,checkedAt:new Date().toISOString()},null,2)+'\n');
    console.log('ZIP test copies, profiles and temporary files removed.');
  }
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
