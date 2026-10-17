// Local Electron integration check. No school account, network service or real cookies.
// Run: electron desktop/tests/portal-flow.cjs
const { app, BrowserWindow, WebContentsView, Menu, session: electronSession } = require('electron');
const http = require('node:http');
const assert = require('node:assert/strict');
const path = require('node:path');
const { once } = require('node:events');
const { createPortalSession } = require('../portal-session.cjs');
app.setPath('userData', path.resolve(__dirname, '../.cache/verification/portal-flow-profile'));
const timeout = setTimeout(() => { console.error('FAIL: portal integration timed out'); app.exit(1); }, 25000);
const requests = [];
const server = http.createServer((request, response) => {
  if (request.url === '/unavailable') { response.writeHead(502); response.end(); return; }
  if (request.url === '/home') {
    response.setHeader('Set-Cookie', 'fixture_session=fake; SameSite=Lax; Path=/');
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(`<title>模拟登录完成</title><script>
      function openTeaching() {
        const child = window.open('', 'teaching');
        const form = document.createElement('form'); form.method = 'POST'; form.action = '/teaching'; form.target = 'teaching';
        const ticket = document.createElement('input'); ticket.name = 'ticket'; ticket.value = 'fake-ticket'; form.append(ticket); document.body.append(form); form.submit();
        return !!child;
      }
    </script><button onclick="openTeaching()">教务系统</button>`);
    return;
  }
  if (request.url === '/teaching') {
    let body = '';
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      requests.push({ method: request.method, body, cookie: request.headers.cookie, referer: request.headers.referer });
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end('<title>模拟个人课表</title><h1>课表信息</h1><p>星期一 1-2 测试课程 周数：1-16周</p>');
    });
    return;
  }
  response.writeHead(404); response.end();
});
app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const isolated = electronSession.fromPartition(`portal-fixture-${Date.now()}`);
  let root;
  function TestWindow(options) {
    const window = new BrowserWindow({ ...options, show: false, webPreferences: { ...options.webPreferences, session: isolated } });
    const suppress = target => {
      target.show = () => {};
      target.focus = () => target.emit('focus');
      target.webContents.on('did-create-window', child => suppress(child));
    };
    suppress(window); root = window;
    return window;
  }
  const portal = createPortalSession({ BrowserWindow: TestWindow, WebContentsView });
  assert.equal(portal.open(`${base}/home`).ok, true);
  const initial = portal.currentContents();
  await once(initial, 'did-finish-load');
  assert.equal(await initial.executeJavaScript('openTeaching()', true), true);
  const child = portal.currentContents();
  assert.notEqual(child, initial);
  if (!child.getURL().endsWith('/teaching') || child.isLoading()) {
    await new Promise(resolve => {
      const loaded = () => { if (child.getURL().endsWith('/teaching') && !child.isLoading()) { child.off('did-stop-loading', loaded); resolve(); } };
      child.on('did-stop-loading', loaded); loaded();
    });
  }
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].body, 'ticket=fake-ticket');
  assert.match(requests[0].cookie, /fixture_session=fake/);
  assert.equal(requests[0].referer, `${base}/home`);
  assert.equal(await child.executeJavaScript('!!window.opener'), true);
  assert.equal(initial.getURL(), `${base}/home`);
  assert.equal(portal.current(), root);
  assert.equal(BrowserWindow.getAllWindows().length, 1);
  assert.equal(root.isMenuBarVisible(), false);
  assert.match(await portal.currentContents().executeJavaScript('document.body.innerText'), /测试课程/);
  portal.open(`${base}/home`);
  assert.equal(child.getURL(), `${base}/teaching`);
  const closed = once(child, 'destroyed'); child.close(); await closed;
  assert.equal(portal.currentContents(), initial);
  assert.equal(BrowserWindow.getAllWindows().length, 1);
  const failed = once(initial, 'did-stop-loading');
  await initial.loadURL(`${base}/unavailable`); await failed;
  assert.equal(portal.status().phase, 'error');
  assert.match(portal.status().message, /HTTP 502/);
  const recovered = once(initial, 'did-stop-loading');
  await initial.loadURL(`${base}/home`); await recovered;
  assert.equal(portal.status().phase, 'ready');
  const disposed = once(initial, 'destroyed'); portal.dispose(); await disposed;
  assert.equal(initial.isDestroyed(), true);
  assert.equal(root.isDestroyed(), true);
  console.log('PASS: single portal window; blank popup → POST retains body, Cookie, Referer and opener; capture follows visible view; reopen preserves page; all views disposed.');
}).then(() => app.exit(0)).catch(error => { console.error(error.stack); app.exit(1); }).finally(() => { clearTimeout(timeout); server.close(); });
