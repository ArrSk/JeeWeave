// Run the actual desktop main process twice against isolated, portable data.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const output = path.resolve(__dirname, `../.cache/verification/workspace-flow-${Date.now()}`);
const first = path.join(output, 'original', 'data'), moved = path.join(output, 'new-version', 'data');
fs.mkdirSync(first, { recursive: true });
function run(root, stage) {
  const env = { ...process.env, JEEWEAVE_DATA_DIR: root, JEEWEAVE_WORKSPACE_TEST_STAGE: stage, JEEWEAVE_WORKSPACE_TEST_EVIDENCE: output };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(process.execPath, [path.resolve(__dirname, '../../node_modules/electron/cli.js'), path.join(__dirname, 'fixtures/workspace-main.cjs')], { env, encoding: 'utf8', timeout: 60000, windowsHide: true });
  process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '');
  assert.equal(result.status, 0, result.error?.message || `desktop stage ${stage} failed`);
}
let passed=false;
try {
if(process.env.JEEWEAVE_WORKSPACE_SCOPE==='transfer'){
  run(first,'transfer');passed=true;console.log('PASS: transfer-only real main/preload/UI.');return;
}
run(first, 'create');
fs.mkdirSync(path.join(first, 'captures', 'web-captures', 'fixture'), { recursive: true });
fs.writeFileSync(path.join(first, 'captures', 'web-captures', 'fixture', 'source.txt'), 'fictional original');
fs.cpSync(first, moved, { recursive: true });
const sourceHash = require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(first, 'workspace.json'))).digest('hex');
run(moved, 'reopen');
assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(first, 'workspace.json'))).digest('hex'), sourceHash, 'original data is never modified by the upgraded copy');
assert.equal(fs.readFileSync(path.join(moved, 'captures/web-captures/fixture/source.txt'), 'utf8'), 'fictional original');
passed=true;
console.log('PASS: real main/preload IPC, CRUD and phases, file-before-success persistence, cache reset/restart, moved data folder, explicit restore/cancel/backup and sender isolation.');
} finally {
  const boundary=path.resolve(__dirname,'../.cache/verification');
  if(path.dirname(output)!==boundary||!path.basename(output).startsWith('workspace-flow-')||fs.lstatSync(output).isSymbolicLink())throw Error('Unsafe workspace fixture cleanup');
  const cleanRoot=output.replaceAll("'","''")+'\\';
  const stopped=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop';$cleanupRoot='"+cleanRoot+"';Get-CimInstance Win32_Process | Where-Object {$_.Name -eq 'electron.exe' -and (($_.ExecutablePath -and $_.ExecutablePath.StartsWith($cleanupRoot,[StringComparison]::OrdinalIgnoreCase)) -or ($_.CommandLine -and $_.CommandLine.Contains($cleanupRoot)))} | ForEach-Object {Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue}"],{windowsHide:true,encoding:'utf8'});
  if(stopped.status!==0)throw Error(stopped.stderr||'Could not stop isolated workspace processes');
  fs.rmSync(output,{recursive:true,force:true,maxRetries:30,retryDelay:150});
  fs.writeFileSync(path.join(boundary,'workspace-flow-summary.json'),JSON.stringify({checkedAt:new Date().toISOString(),passed,testDataRemoved:true})+'\n');
  console.log('Workspace test data, profiles and screenshots removed.');
}
