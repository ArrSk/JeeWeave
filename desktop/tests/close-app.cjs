// Verifies that clicking the main window close button exits a real Electron process.
const { app, BrowserWindow, WebContentsView, Menu, globalShortcut } = require('electron');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { once } = require('node:events');
const { createPortalSession } = require('../portal-session.cjs');
const { createAppLifecycle } = require('../app-lifecycle.cjs');
app.setPath('userData', path.resolve(__dirname, '../.cache/verification/close-app-profile'));
const timeout = setTimeout(() => { console.error('FAIL: app close timed out'); app.exit(1); }, 15000);
const server = http.createServer((_request, response) => response.end('<title>Fixture</title><script>onbeforeunload=()=>false;</script>'));
app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  const main = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  await main.loadURL('about:blank');
  await main.webContents.executeJavaScript('window.onbeforeunload=()=>false; true');
  function HiddenWindow(options) { return new BrowserWindow({ ...options, show: false }); }
  const portal = createPortalSession({ BrowserWindow: HiddenWindow, WebContentsView });
  const lifecycle = createAppLifecycle({ app, globalShortcut, getWindows: () => [main], closePortal: () => portal.dispose() });
  lifecycle.bindMainWindow(main);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  portal.open(`http://127.0.0.1:${server.address().port}/`);
  const contents = portal.currentContents();
  await once(contents, 'did-finish-load');
  const child = contents.setWindowOpenHandler;
  assert.equal(typeof child, 'function');
  await contents.executeJavaScript('!!window.open("about:blank", "fixture-child")', true);
  const popup = portal.currentContents();
  await popup.executeJavaScript('window.onbeforeunload=()=>false; true');
  console.log(`CHECKED_PIDS:${JSON.stringify([...new Set([process.pid, ...app.getAppMetrics().map(item => item.pid)])])}`);
  app.on('will-quit', () => {
    try {
      assert.equal(main.isDestroyed(), true);
      assert.equal(portal.status().phase, 'closed');
      assert.equal(BrowserWindow.getAllWindows().length, 0);
      console.log('PASS: main close disposed portal views and exited despite beforeunload handlers.');
      clearTimeout(timeout); server.close();
    } catch (error) { console.error(error.stack); app.exit(1); }
  });
  main.close();
}).catch(error => { console.error(error.stack); app.exit(1); });
