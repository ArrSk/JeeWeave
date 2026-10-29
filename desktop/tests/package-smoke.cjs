// Exercise a COPY of the real packaged executable; the deliverable stays clean.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn, spawnSync } = require('node:child_process');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const input = path.resolve(process.argv[2]);
function dataSnapshot() {
  const root = path.join(input, 'data');
  return fs.readdirSync(root, { recursive: true, withFileTypes: true }).filter(item => item.isFile()).map(item => {
    const file = path.join(item.parentPath, item.name);
    const info = fs.statSync(file);
    return `${path.relative(root, file)}:${info.size}:${info.mtimeMs}`;
  }).sort();
}
const originalData = dataSnapshot();
const buildInfo = JSON.parse(fs.readFileSync(path.join(input, 'BUILD-INFO.json'), 'utf8'));
assert.equal(buildInfo.version, require('../../package.json').version);
assert.ok(buildInfo.files.some(file=>file.path==='desktop/calendar-ui.mjs'));
for (const row of fs.readFileSync(path.join(input, 'SHA256SUMS.txt'), 'utf8').trim().split(/\r?\n/)) { const [hash,file]=row.split('  '); assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(input,file))).digest('hex'),hash); }
assert.deepEqual(originalData, [], 'distribution data folder must be empty before the first real launch');
const verificationRoot=path.resolve(__dirname,'../.cache/verification');
const output = path.resolve(verificationRoot, `package-smoke-${Date.now()}`);
const first = path.join(output, '首次启动');
const relocated = path.join(output, '移动后的 几微');
fs.mkdirSync(output, { recursive: true });
fs.cpSync(input, first, { recursive: true });
let child;
let socket;
const server = http.createServer((_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end('<title>封装采集验证</title><main><p>请于 2026-10-25 前提交验证材料。</p></main>');
});

async function start(folder) {
  const reserve = http.createServer();
  await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const port = reserve.address().port;
  await new Promise(resolve => reserve.close(resolve));
  const log = fs.openSync(path.join(output, `launch-${Date.now()}.log`), 'a');
  const env = { ...process.env };
  for (const key of ['ELECTRON_RUN_AS_NODE', 'JEEWEAVE_DEBUG_CRAWLER', 'JEEWEAVE_DESKTOP_PROTOTYPE']) delete env[key];
  child = spawn(path.join(folder, '几微.exe'), [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'], {
    cwd: process.env.SystemRoot, env, stdio: ['ignore', log, log], windowsHide: false,
  });
  fs.closeSync(log);
  child.on('error', error => console.error(error));
  let target;
  for (let n = 0; n < 120; n++) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = pages.find(page => page.type === 'page' && page.url.includes('prototype.html'));
      if (target) break;
    } catch {}
    if (child.exitCode !== null) throw Error(`Packaged app exited ${child.exitCode}`);
    await delay(150);
  }
  assert.ok(target, 'real packaged window must load');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (pending.has(message.id)) {
      const { resolve, reject, timeout } = pending.get(message.id); pending.delete(message.id); clearTimeout(timeout);
      if (message.error) reject(Error(message.error.message)); else resolve(message.result);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const call = ++id;
    const timeout = setTimeout(() => { pending.delete(call); reject(Error(`CDP timeout: ${method}`)); }, 10000);
    pending.set(call, { resolve, reject, timeout }); socket.send(JSON.stringify({ id: call, method, params }));
  });
  const run = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const waitFor = async expression => {
    for (let n = 0; n < 100; n++) { if (await run(expression)) return; await delay(80); }
    throw Error(`UI did not become ready: ${expression}`);
  };
  await waitFor('!!document.querySelector("#desktop-load-all-examples")');
  await send('Page.bringToFront');
  return { run, waitFor, send };
}

async function close() {
  // WM_CLOSE is the same main-window close path as the titlebar X.
  await delay(700);
  const pid = child.pid;
  // Poll actual processes, as package-native.ps1 does. Redirected Chromium
  // handles can keep .NET WaitForExit waiting after the process has gone.
  const ownedRoot = output.replace(/'/g, "''") + '\\';
  // .NET MainWindowHandle may select Chromium's untitled utility window after
  // re-opening. Identify the visible titled window owned by this exact PID.
  const command = `$ErrorActionPreference='Stop'
Add-Type @'
using System; using System.Text; using System.Runtime.InteropServices;
public static class JeeWeaveCloseProbe {
  delegate bool Callback(IntPtr h,IntPtr p);
  [DllImport("user32.dll")] static extern bool EnumWindows(Callback c,IntPtr p);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowTextW(IntPtr h,StringBuilder s,int n);
  [DllImport("user32.dll")] public static extern bool PostMessageW(IntPtr h,uint m,IntPtr w,IntPtr l);
  public static IntPtr Find(uint pid,string title) {
    IntPtr found=IntPtr.Zero;
    EnumWindows((h,p)=>{uint owner;GetWindowThreadProcessId(h,out owner);if(owner!=pid||!IsWindowVisible(h))return true;
      var text=new StringBuilder(512);GetWindowTextW(h,text,text.Capacity);
      if(!text.ToString().Contains(title))return true;found=h;return false;},IntPtr.Zero);
    return found;
  }
}
'@
$name=([string][char]0x51e0)+[char]0x5fae
$handle=[IntPtr]::Zero
for($i=0;$i -lt 40 -and $handle -eq [IntPtr]::Zero;$i++){$handle=[JeeWeaveCloseProbe]::Find(${pid},$name);if($handle -eq [IntPtr]::Zero){Start-Sleep -Milliseconds 100}}
if($handle -eq [IntPtr]::Zero){throw 'Expected the application main window'}
Write-Output "Closing PID=${pid} visible titled handle=$handle"
if(-not [JeeWeaveCloseProbe]::PostMessageW($handle,0x10,[IntPtr]::Zero,[IntPtr]::Zero)){exit 2}
for($i=0;$i -lt 60;$i++){ $owned=@(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith('${ownedRoot}',[StringComparison]::OrdinalIgnoreCase) }); if($owned.Count -eq 0){exit 0}; Start-Sleep -Milliseconds 200 }
Write-Output "Remaining: $($owned.ProcessId -join ',')"; exit 3`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], { encoding: 'utf8', windowsHide: true });
  console.log(result.stdout.trim());
  assert.equal(result.status, 0, result.stderr || result.stdout);
  socket?.close(); socket = null;
  await delay(400);
  child = null;
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let { run, waitFor } = await start(first);
  assert.deepEqual(await run('JSON.parse(localStorage.getItem("jiwei-desktop-tasks"))'), [], 'no personal data bundled');
  await run('document.querySelector("[data-view=settings]").click();document.querySelector("#desktop-developer-mode").click();document.querySelector("#desktop-load-all-examples").click();true');
  assert.equal(await run('JSON.parse(localStorage.getItem("jiwei-desktop-timetables-v1")).tables.length'), 2);
  await run('document.querySelector("[data-view=objects]").click();true');
  assert.equal(await run('document.querySelectorAll("[data-object-select]").length'), 1);
  const objectState = await run('JSON.parse(localStorage.getItem("jiwei-desktop-objects-v1"))');
  assert.ok(objectState.links.length >= 2);
  await run('document.querySelector("[data-theme=forest]").click();true');
  await run('document.querySelector("[data-view=calendar]").click();true');
  assert.equal(await run('document.querySelector("[data-cal-view=month]").getAttribute("aria-pressed")'),'true');
  assert.equal(await run('document.querySelectorAll(".desktop-calendar-week").length'),6);
  assert.equal((await run('jeeWeaveDesktop.assistant("settings-get")')).textModel,'deepseek-flash');
  assert.ok(await run('Boolean(document.querySelector("#desktop-module-assistant")&&document.querySelector("#desktop-module-reminders"))'));
  await run('document.querySelector("[data-view=plugins]").click();document.querySelector("#desktop-module-assistant").click();true');
  assert.equal(await run('Boolean(document.querySelector("#desktop-assistant-open"))'),false);
  assert.equal((await run('jeeWeaveDesktop.assistant("settings-get")')).ok,false);
  const reminder=await run('jeeWeaveDesktop.assistant("reminder-add",{title:"成品隔离提醒",at:Date.now()+7200000})');
  assert.equal(reminder.ok,true,JSON.stringify(reminder));
  await run('document.querySelector("#desktop-module-assistant").click();document.querySelector("#desktop-module-reminders").click();true');
  assert.equal((await run('jeeWeaveDesktop.assistant("reminders-list")')).ok,false);
  assert.equal(await run('Boolean(document.querySelector("#desktop-today-reminders"))'),false);
  await run('document.querySelector("#desktop-module-reminders").click();true');
  assert.ok((await run('jeeWeaveDesktop.assistant("reminders-list")')).rows.some(row=>row.id===reminder.row.id));
  assert.equal((await run('jeeWeaveDesktop.assistant("reminder-cancel",'+JSON.stringify({id:reminder.row.id})+')')).ok,true);
  assert.equal(await run('document.querySelectorAll("#desktop-assistant-dialog").length'),1);
  assert.equal(await run('document.querySelector("[data-view=chat-monitor]")'),null);
  assert.equal((await run('window.jeeWeaveDesktop.chat("start",0)')).ok,false);
  await run('document.querySelector("[data-cal-view=week]").click();true');
  assert.equal(await run('document.querySelectorAll(".desktop-calendar-time-day").length'),7);
  const asar=fs.readFileSync(path.join(first,'resources/app.asar'));
  assert.equal(asar.includes(Buffer.from('calendar-ui.mjs')),true);
  assert.equal(asar.includes(Buffer.from('github-submit-index.json')),false);
  assert.equal(asar.includes(Buffer.from('workspace-main.cjs')),false);
  await run(`document.querySelector('[data-view="web-capture"]').click();document.querySelector('#collect-url').value='http://127.0.0.1:${server.address().port}/notice';document.querySelector('#desktop-web-form').requestSubmit();true`);
  await waitFor('document.querySelector("#collect-status").textContent.includes("已整理")');
  assert.equal(fs.readdirSync(path.join(first, 'data/captures/web-captures')).length, 1);
  await close();
  assert.ok(fs.existsSync(path.join(first, 'data/profile/Local Storage/leveldb')));
  for (let attempt = 0; ; attempt++) {
    try { fs.renameSync(first, relocated); break; }
    catch (error) { if (!['EPERM','EACCES','EBUSY'].includes(error.code) || attempt >= 29) throw error; await delay(100); }
  }
  ({ run, waitFor } = await start(relocated));
  assert.equal(await run('localStorage.getItem("jiwei-theme")'), 'forest');
  await run('document.querySelector("[data-view=calendar]").click();true');
  assert.equal(await run('document.querySelector("[data-cal-view=week]").getAttribute("aria-pressed")'),'true');
  assert.equal(await run('JSON.parse(localStorage.getItem("jiwei-desktop-timetables-v1")).tables.length'), 2);
  assert.deepEqual(await run('JSON.parse(localStorage.getItem("jiwei-desktop-objects-v1"))'), objectState);
  await run('document.querySelector("[data-view=courses]").click();true');
  await waitFor('!!document.querySelector("#desktop-open-course-settings")');
  await close();
  assert.deepEqual(dataSnapshot(), originalData, 'interaction tests must not change the original package data');
  console.log(`PASS: standalone exe, examples, real IPC/file capture, persistence after folder move, independent assistant/reminder plugins, and X-close process cleanup.`);
})().catch(error => {
  console.error(error.stack);
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ id: 99999, method: 'Browser.close' }));
  process.exitCode = 1;
}).finally(async()=>{
  socket?.close();server.close();
  try{
    if(path.dirname(output)!==verificationRoot||fs.lstatSync(output).isSymbolicLink())throw Error('Unsafe package test cleanup root');
    if(child&&child.exitCode===null){
      try{await close();}catch{
        spawnSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
      }
    }
    // A failed parent may leave Chromium children; constrain cleanup to this test directory.
    const cleanRoot=output.replaceAll("'","''")+'\\';
    const stop=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop';$cleanupRoot='"+cleanRoot+"';Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -and $_.ExecutablePath.StartsWith($cleanupRoot,[StringComparison]::OrdinalIgnoreCase)} | ForEach-Object {Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue}"],{windowsHide:true,encoding:'utf8'});
    if(stop.status!==0)throw Error(stop.stderr||'Could not stop isolated package processes');
    const {createReminderPlatform}=require('../reminder-platform.cjs');
    for(const folder of [first,relocated]){
      const root=path.join(folder,'data');
      if(!fs.existsSync(path.join(root,'reminders.json')))continue;
      const reminders=createReminderPlatform({root});
      for(const row of (await reminders.handle('reminders-list')).rows)await reminders.handle('reminder-cancel',{id:row.id});
    }
    fs.rmSync(output,{recursive:true,force:true,maxRetries:30,retryDelay:150});
    fs.writeFileSync(path.join(verificationRoot,'package-smoke-summary.json'),JSON.stringify({passed:process.exitCode!==1,version:buildInfo.version,runtimeFingerprint:buildInfo.runtimeFingerprint,testDataRemoved:true,checkedAt:new Date().toISOString()},null,2)+'\n');
    console.log('Packaged test copies, profiles, data and OS test tasks removed.');
  }catch(error){console.error('Package test cleanup failed:',error.message);process.exitCode=1;}
});
