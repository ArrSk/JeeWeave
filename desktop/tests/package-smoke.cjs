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
const output = path.resolve(__dirname, '../.cache/verification', `package-smoke-${Date.now()}`);
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
  return { run, waitFor, send };
}

async function close() {
  // WM_CLOSE is the same main-window close path as the titlebar X.
  await delay(700);
  const pid = child.pid;
  // Poll actual processes, as package-native.ps1 does. Redirected Chromium
  // handles can keep .NET WaitForExit waiting after the process has gone.
  const ownedRoot = output.replace(/'/g, "''") + '\\';
  const command = `$ErrorActionPreference='Stop'; $p=Get-Process -Id ${pid}; for($i=0;$i -lt 40 -and $p.MainWindowHandle -eq 0;$i++){Start-Sleep -Milliseconds 100;$p.Refresh()}; Write-Output "Closing PID=${pid} handle=$($p.MainWindowHandle) title=$($p.MainWindowTitle)"; if($p.MainWindowTitle -notlike '*几微*'){throw 'Expected the application main window'}; if(-not $p.CloseMainWindow()){exit 2}; for($i=0;$i -lt 60;$i++){ $owned=@(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith('${ownedRoot}',[StringComparison]::OrdinalIgnoreCase) }); if($owned.Count -eq 0){exit 0}; Start-Sleep -Milliseconds 200 }; Write-Output "Remaining: $($owned.ProcessId -join ',')"; exit 3`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], { encoding: 'utf8', windowsHide: true });
  console.log(result.stdout.trim());
  assert.equal(result.status, 0, result.stderr || result.stdout);
  socket.close(); socket = null;
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
  console.log(`PASS: standalone exe, examples, real IPC/file capture, persistence after folder move, and X-close process cleanup.\nEvidence: ${output}`);
})().catch(error => {
  console.error(error.stack);
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ id: 99999, method: 'Browser.close' }));
  process.exitCode = 1;
}).finally(() => { socket?.close(); server.close(); });
