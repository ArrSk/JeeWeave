import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createPortalSession } from './portal-session.cjs';

function fixture() {
  const windows = [], views = [], statuses = [], errors = [], timers = new Set();
  class Contents extends EventEmitter {
    constructor() { super(); this.loads = []; this.url = ''; this.destroyed = false; this.session = {}; }
    isDestroyed() { return this.destroyed; }
    getURL() { return this.url; }
    setWindowOpenHandler(handler) { this.openHandler = handler; }
    loadURL(url, options) { this.loads.push({ url, options }); this.url = url; this.emit('did-start-loading'); return Promise.resolve(); }
    finish(url) { this.url = url; this.emit('did-stop-loading'); }
    close(options) { this.closeOptions = options; this.destroyed = true; this.emit('destroyed'); }
  }
  class Window extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.webContents = new Contents(); this.destroyed = false;
      const children = new Set();
      this.contentView = { children, addChildView: view => children.add(view), removeChildView: view => children.delete(view) }; windows.push(this);
    }
    getContentBounds() { return { width: 1120, height: 760 }; }
    isDestroyed() { return this.destroyed; }
    setMenu(menu) { this.menu = menu; }
    isMinimized() { return false; }
    show() {}
    focus() {}
    destroy() { if (this.destroyed) return; this.destroyed = true; this.webContents.close(); this.emit('closed'); }
  }
  class View {
    constructor(options) { this.options = options; this.webContents = options.webContents || new Contents(); views.push(this); }
    setVisible(value) { this.visible = value; }
    setBounds(value) { this.bounds = value; }
  }
  const session = createPortalSession({ BrowserWindow: Window, WebContentsView: View, onStatus: status => statuses.push(status), recordError: (...args) => errors.push(args), setTimer: callback => { timers.add(callback); return callback; }, clearTimer: timer => timers.delete(timer) });
  session.open('https://login.example.edu/');
  return { session, windows, views, statuses, errors, timers, Contents, root: windows[0].webContents };
}

test('重复打开入口只聚焦当前教务页面，变更入口也只用同一个窗口', () => {
  const { session, windows, root } = fixture();
  root.finish('https://portal.example.edu/home');
  session.open('https://login.example.edu/');
  assert.equal(windows.length, 1);
  assert.equal(root.loads.length, 1);
  assert.equal(root.getURL(), 'https://portal.example.edu/home');
  session.open('https://new.example.edu/');
  assert.equal(windows.length, 1);
  assert.equal(root.loads.length, 2);
});

test('空白中转、POST 弹窗采用 Chromium 内容，不复制请求，不创建新原生窗口', () => {
  const { session, windows, views, root, Contents } = fixture();
  const chromiumContents = new Contents();
  const handler = root.openHandler({ url: 'about:blank', disposition: 'new-window' });
  assert.equal(handler.action, 'allow');
  assert.equal(handler.createWindow({ webContents: chromiumContents, webPreferences: {} }), chromiumContents);
  assert.equal(session.currentContents(), chromiumContents);
  assert.equal(windows.length, 1);
  assert.equal(views.length, 1);
  assert.equal(views[0].visible, true);
  assert.equal(root.loads.length, 1);
  assert.equal(chromiumContents.loads.length, 0);
  assert.equal(views[0].options.webPreferences.session, root.session);
  assert.equal(views[0].options.webPreferences.nodeIntegration, false);
  assert.equal(views[0].options.webPreferences.preload, undefined);
  assert.equal(root.openHandler({ url: 'javascript:alert(1)' }).action, 'deny');
  assert.equal(root.openHandler({ url: 'file:///secret' }).action, 'deny');
});

test('后台标签延迟导航时保留 POST 内容、来源和 multipart boundary', () => {
  const { root, session } = fixture();
  const data = [{ bytes: Buffer.from('fake') }];
  const referrer = { url: 'https://login.example.edu/', policy: 'default' };
  const handler = root.openHandler({ url: 'https://teaching.example.edu/', disposition: 'background-tab', referrer, postBody: { data, contentType: 'multipart/form-data', boundary: 'test-boundary' } });
  handler.createWindow({ webPreferences: {} });
  const request = session.currentContents().loads[0];
  assert.equal(request.options.postData, data);
  assert.equal(request.options.httpReferrer, referrer);
  assert.equal(request.options.extraHeaders, 'Content-Type: multipart/form-data; boundary=test-boundary');
});

test('抓取跟随可见内容，关闭内部页面恢复原页面，调整大小适配当前视图', () => {
  const { session, root, views, windows } = fixture();
  root.finish('https://portal.example.edu/');
  const child = root.openHandler({ url: 'about:blank' }).createWindow({});
  child.finish('https://teaching.example.edu/');
  assert.equal(session.status().phase, 'ready');
  assert.equal(session.currentContents(), child);
  windows[0].emit('resize');
  assert.deepEqual(views[0].bounds, { x: 0, y: 0, width: 1120, height: 760 });
  child.close();
  assert.equal(session.currentContents(), root);
  assert.equal(windows[0].contentView.children.has(views[0]), false);
});

test('关闭教务窗口或退出时销毁全部内容和计时器，允许重新打开', () => {
  const { session, root, windows, timers } = fixture();
  const child = root.openHandler({ url: 'about:blank' }).createWindow({});
  child.emit('did-start-loading');
  windows[0].emit('close');
  assert.equal(root.isDestroyed(), true);
  assert.equal(child.isDestroyed(), true);
  assert.deepEqual(child.closeOptions, { waitForBeforeUnload: false });
  assert.equal(timers.size, 0);
  assert.equal(session.current(), null);
  assert.equal(session.status().phase, 'closed');
  session.dispose();
  assert.equal(session.open('https://login.example.edu/').ok, true);
  assert.equal(windows.length, 2);
});

test('失败、超时和空白跳转有反馈，后台内容不覆盖当前状态，不记录票据', () => {
  const { session, root, errors, timers, statuses } = fixture();
  [...timers][0](); assert.equal(session.status().phase, 'slow');
  root.emit('did-fail-load', {}, -3, 'ERR_ABORTED', '', true);
  assert.equal(errors.length, 0);
  root.emit('did-fail-load', {}, -105, 'ERR_NAME_NOT_RESOLVED', 'https://example.edu/?ticket=secret', true);
  root.emit('did-stop-loading');
  assert.match(session.status().message, /-105/);
  assert.doesNotMatch(JSON.stringify(errors) + session.status().message, /ticket|secret/);
  const child = root.openHandler({ url: 'about:blank' }).createWindow({});
  child.finish('about:blank'); assert.equal(session.status().phase, 'waiting');
  const count = statuses.length;
  root.emit('did-start-loading'); assert.equal(statuses.length, count);
  child.finish('https://teaching.example.edu/'); assert.equal(session.status().phase, 'ready');
});

test('加载异常不会产生未处理 Promise 拒绝', async () => {
  const { session, root } = fixture();
  root.loadURL = () => Promise.reject(Object.assign(new Error('network'), { errno: -106 }));
  session.open('https://other.example.edu/');
  await new Promise(resolve => setImmediate(resolve));
  assert.match(session.status().message, /-106/);
  assert.equal(session.open('file:///test').ok, false);
});

test('HTTP 502 即使正常结束加载也保持失败，重新成功导航后可恢复', () => {
  const { session, root, errors } = fixture();
  root.emit('did-navigate', {}, 'https://example.edu/sso?ticket=private', 502, 'Bad Gateway');
  root.finish('https://example.edu/sso?ticket=private');
  assert.equal(session.status().phase, 'error');
  assert.match(session.status().message, /HTTP 502/);
  assert.doesNotMatch(JSON.stringify(errors) + session.status().message, /private|ticket/);
  root.emit('did-start-loading');
  root.emit('did-navigate', {}, 'https://example.edu/timetable', 200, 'OK');
  root.finish('https://example.edu/timetable');
  assert.equal(session.status().phase, 'ready');
});
