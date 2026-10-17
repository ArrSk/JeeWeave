// Regression for live reading in a page whose scripts replace DOM APIs, plus
// course content hosted in another origin. All content/accounts are fictional.
const { app, BrowserWindow } = require('electron');
const { readCoursePage } = require('../course-page.cjs');
const { captureCurrentCoursePage } = require('../course-capture.cjs');
const http = require('node:http');
const assert = require('node:assert/strict');
const path = require('node:path');
app.setPath('userData', path.resolve(__dirname, '../.cache/verification/course-capture-vpn-profile'));
app.on('window-all-closed', () => {});
const timeout = setTimeout(() => { console.error('FAIL: WebVPN capture regression timed out'); app.exit(1); }, 25000);
const lesson = '<h1>课表信息</h1><p>星期一 1-2 模拟课程 周数：1-15周(单) 校区：本部 上课地点：模拟教室 教师 ：模拟教师 学分：2</p>';
let childBase;
const serve = (request, response) => {
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'nonce-fixture'; frame-src http://127.0.0.1:*");
  if (request.url.startsWith('/frame')) {
    response.end(`<h1>教务首页</h1><iframe src="${childBase}/course?ticket=never-return-ticket"></iframe>`);
  } else {
    response.end(lesson + `<script nonce="fixture">window.portalMarker='preserve';
      Document.prototype.querySelectorAll = function () { throw new EvalError('fixture WebVPN DOM interception'); };
      window.Set = undefined;
    </script>`);
  }
};
const server = http.createServer(serve), childServer = http.createServer(serve);
app.whenReady().then(async () => {
  await Promise.all([server, childServer].map(item => new Promise(resolve => item.listen(0, '127.0.0.1', resolve))));
  const base = `http://127.0.0.1:${server.address().port}`;
  childBase = `http://127.0.0.1:${childServer.address().port}`;
  const { prepareCapturedCourses } = await import('../course-import.mjs');
  const window = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false } });
  await window.loadURL(`${base}/course`);
  // The old default-world reader reproduces Electron's generic Script failed error.
  await assert.rejects(window.webContents.executeJavaScript(`(${readCoursePage.toString()})()`), /Script failed to execute/);
  const direct = await captureCurrentCoursePage(window.webContents);
  assert.equal(direct.ok, true);
  assert.deepEqual(prepareCapturedCourses(direct).courses[0].weeks, [1, 3, 5, 7, 9, 11, 13, 15]);
  assert.equal(await window.webContents.executeJavaScript('window.portalMarker'), 'preserve');
  assert.equal(await window.webContents.executeJavaScript('typeof Set'), 'undefined');
  assert.equal(window.webContents.getLastWebPreferences().webSecurity, true);
  await window.loadURL(`${base}/frame`);
  const nested = await captureCurrentCoursePage(window.webContents);
  assert.equal(nested.ok, true);
  assert.equal(prepareCapturedCourses(nested).additions.length, 1);
  assert.equal(nested.url, `${childBase}/course`);
  assert.equal(nested.warning, 'live-text-fallback');
  assert.equal(nested.diagnostics.some(item => item.mode === 'frame' && item.result === 'ok'), true);
  assert.equal(BrowserWindow.getAllWindows().length, 1);
  console.log('PASS: old execution error reproduced; isolated live read under strict CSP and patched globals; cross-origin frame live-text fallback; unchanged page state/security; URL secrets stripped.');
  clearTimeout(timeout); server.close(); childServer.close(); app.exit(0);
}).catch(error => { console.error(error.stack); app.exit(1); });
