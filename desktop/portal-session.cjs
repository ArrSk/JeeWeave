// A single visible portal window; Chromium popup contexts are hosted as views.
const portalPreferences = { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true };
function validPortalUrl(value) {
  try { return ['https:', 'http:'].includes(new URL(value).protocol); } catch { return false; }
}
function createPortalSession({ BrowserWindow, WebContentsView, onStatus = () => {}, recordError = () => {}, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const pages = new Map();
  let window, active, entryUrl, disposing = false;
  const usable = contents => contents && !contents.isDestroyed();
  const currentContents = () => usable(active) ? active : [...pages.keys()].reverse().find(usable);
  const stopTimer = item => { if (item?.timer) clearTimer(item.timer); if (item) item.timer = null; };
  const publish = (contents, phase, message) => {
    const item = pages.get(contents);
    if (!item || disposing) return;
    item.status = { phase, message };
    if (currentContents() === contents) onStatus(item.status);
  };
  function show(contents) {
    if (!usable(contents) || !window || window.isDestroyed()) return;
    active = contents;
    for (const [candidate, item] of pages) if (item.view) item.view.setVisible(candidate === contents);
    const view = pages.get(contents)?.view;
    if (view) {
      window.contentView.addChildView(view);
      const { width, height } = window.getContentBounds();
      view.setBounds({ x: 0, y: 0, width, height });
    }
    onStatus(pages.get(contents).status);
  }
  const failure = (contents, code, description = '') => {
    if (!usable(contents) || code === -3 || code === 'ERR_ABORTED') return;
    const item = pages.get(contents);
    if (!item) return;
    stopTimer(item);
    recordError('portal-load', new Error(`code=${code}`));
    publish(contents, 'error', `教务页面加载失败（${code}${/^ERR_[A-Z_]+$/.test(description) ? ` / ${description}` : ''}）。请检查校园网或 VPN 连接，再在教务窗口重试。`);
  };
  function attach(contents, view = null, parent = null) {
    pages.set(contents, { view, parent, status: { phase: 'loading', message: '正在加载教务页面…' }, timer: null });
    contents.setWindowOpenHandler(details => {
      if (details.url !== 'about:blank' && details.url !== '' && !validPortalUrl(details.url)) return { action: 'deny' };
      return {
        action: 'allow', outlivesOpener: true,
        createWindow: options => {
          const child = new WebContentsView({
            // Adopt Chromium's supplied contents to preserve POST/referrer/opener.
            webContents: options.webContents,
            webPreferences: { ...options.webPreferences, ...portalPreferences, session: contents.session },
          });
          attach(child.webContents, child, contents);
          show(child.webContents);
          if (details.disposition === 'background-tab' && !options.webContents && validPortalUrl(details.url)) {
            const loadOptions = { httpReferrer: details.referrer };
            if (details.postBody) {
              loadOptions.postData = details.postBody.data;
              loadOptions.extraHeaders = `Content-Type: ${details.postBody.contentType || 'application/x-www-form-urlencoded'}${details.postBody.boundary ? `; boundary=${details.postBody.boundary}` : ''}`;
            }
            child.webContents.loadURL(details.url, loadOptions).catch(error => failure(child.webContents, error.errno || error.code || 'LOAD_FAILED', error.code));
          }
          return child.webContents;
        },
        overrideBrowserWindowOptions: { webPreferences: { ...portalPreferences } },
      };
    });
    contents.on('will-navigate', (event, legacyUrl) => {
      const url = event.url || legacyUrl;
      if (url !== 'about:blank' && !validPortalUrl(url)) event.preventDefault();
    });
    contents.on('did-start-loading', () => {
      const item = pages.get(contents); if (!item || disposing) return;
      stopTimer(item);
      publish(contents, 'loading', '正在加载教务页面，请在同一教务窗口内完成登录或跳转…');
      item.timer = setTimer(() => { item.timer = null; publish(contents, 'slow', '教务页面已等待超过 25 秒。请检查校园网或 VPN；也可在原教务窗口中返回重试。'); }, 25000);
      item.timer?.unref?.();
    });
    contents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => { if (isMainFrame) failure(contents, code, description); });
    // HTTP failures still finish loading normally in Chromium; a blank 502 page
    // must not be reported as ready or become a capture source.
    contents.on('did-navigate', (_event, _url, statusCode) => {
      if (statusCode >= 400) failure(contents, `HTTP ${statusCode}`);
    });
    contents.on('did-stop-loading', () => {
      const item = pages.get(contents); if (!item || disposing) return;
      stopTimer(item);
      if (item.status.phase === 'error') return;
      publish(contents, validPortalUrl(contents.getURL()) ? 'ready' : 'waiting', validPortalUrl(contents.getURL())
        ? '教务页面已载入。进入个人课表列表视图后，回到几微点击“抓取并导入”。'
        : '正在等待教务系统跳转，请稍候；若持续空白，请关闭教务窗口后重新打开。');
    });
    contents.on('render-process-gone', () => failure(contents, 'RENDERER_GONE'));
    contents.on('destroyed', () => {
      const item = pages.get(contents); if (!item) return;
      stopTimer(item); pages.delete(contents);
      if (item.view && window && !window.isDestroyed()) window.contentView.removeChildView(item.view);
      if (disposing) return;
      if (active === contents) show(usable(item.parent) ? item.parent : [...pages.keys()].reverse().find(usable));
    });
  }
  function dispose() {
    if (disposing) return;
    disposing = true;
    for (const [contents, item] of [...pages].reverse()) {
      stopTimer(item);
      if (item.view && usable(contents)) contents.close({ waitForBeforeUnload: false });
    }
    if (window && !window.isDestroyed()) window.destroy();
    pages.clear(); window = null; active = null; entryUrl = null;
    disposing = false;
  }
  return {
    current: () => window && !window.isDestroyed() ? window : null,
    currentContents,
    status: () => pages.get(currentContents())?.status || { phase: 'closed', message: '请先打开并登录教务系统。' },
    dispose,
    open(value) {
      if (!validPortalUrl(value)) return { ok: false, message: '教务系统地址必须是 http 或 https 地址。' };
      if (window && !window.isDestroyed()) {
        if (window.isMinimized()) window.restore();
        window.show(); window.focus();
        if (entryUrl !== value) {
          entryUrl = value;
          const contents = currentContents();
          contents.loadURL(value).catch(error => failure(contents, error.errno || error.code || 'LOAD_FAILED', error.code));
        }
        return { ok: true, message: pages.get(currentContents()).status.message };
      }
      window = new BrowserWindow({ width: 1120, height: 760, minWidth: 800, minHeight: 560, title: '教务系统', autoHideMenuBar: true, webPreferences: { ...portalPreferences } });
      window.setMenu(null); entryUrl = value;
      // Match the native root page used in the successful live school experiment.
      attach(window.webContents); show(window.webContents);
      window.on('resize', () => show(currentContents()));
      window.on('page-title-updated', event => event.preventDefault());
      window.on('close', () => dispose());
      window.on('closed', () => { if (!disposing) dispose(); });
      const contents = window.webContents;
      contents.loadURL(value).catch(error => failure(contents, error.errno || error.code || 'LOAD_FAILED', error.code));
      return { ok: true, message: '已打开教务窗口，正在加载登录页面…' };
    },
  };
}
module.exports = { createPortalSession, validPortalUrl };
