const { app, BrowserWindow, WebContentsView, Menu, globalShortcut, shell, session, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { createPortalSession, validPortalUrl } = require('./portal-session.cjs');
const { createAppLifecycle } = require('./app-lifecycle.cjs');
const { captureCurrentCoursePage } = require('./course-capture.cjs');
const { collectPublicPage } = require('./web-collector.cjs');
const { configureStorage, resolveStorageRoot } = require('./storage-paths.cjs');
const { createWorkspaceFile } = require('./workspace-file.cjs');
const { createChatReceiver } = require('./chat-receiver.cjs');
const { prepareReset, cancelReset, applyPendingReset, resetSourceIsRunning } = require('./reset-data.cjs');

let storagePaths;
try {
  // Do this before setPath/single-instance initialization can lock Chromium's
  // profile on Windows. A second launch while the old owner is alive skips it.
  const root=resolveStorageRoot(app);
  const reset=!resetSourceIsRunning(root)&&applyPendingReset(root);
  storagePaths = configureStorage(app,{skipLegacyMigration:Boolean(reset)});
}
catch (error) {
  require('electron').dialog.showErrorBox('本地数据初始化失败', `请保留整个 data 文件夹及其中的备份，检查目录可写后重试；也可以把整个几微文件夹放在可写的位置。\n\n${error.message}`);
  app.exit(1);
}

let win;
let portalSession;
let prototypeWindow;
let lifecycle;
let workspaceFile;
let chatReceiver;
let resetPending = false;
let windowAppearance = { background: '#f9fafd', text: '#202a3c' };
// Keep the adapter and saved messages while this feature is suspended.
let chatMonitorAvailable = false;
const prototypeMode = (process.env.JEEWEAVE_DESKTOP_PROTOTYPE || process.env.JIWEI_DESKTOP_PROTOTYPE) === '1';
function recordError(stage, error) {
  try { fs.appendFileSync(path.join(storagePaths?.logs || app.getPath('userData'), 'desktop-errors.log'), `${new Date().toISOString()} ${stage}: ${error?.stack || error}\n`); } catch {}
}
const lock = app.requestSingleInstanceLock();
process.on('uncaughtExceptionMonitor', error => recordError('uncaught-exception', error));
if (!lock) app.quit();
app.on('second-instance', showWindow);

function captureDirectory(kind) {
  return path.join(storagePaths?.captures || app.getPath('userData'), kind === 'course' ? 'course-captures' : 'web-captures');
}

function registerIpc() {
  const isLocal = event => [win, prototypeWindow].some(window => window && !window.isDestroyed() && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame);
  ipcMain.handle('window:appearance', (event, colors) => {
    if (!isLocal(event) || !/^#[0-9a-f]{6}$/i.test(colors?.background || '') || !/^#[0-9a-f]{6}$/i.test(colors?.text || '')) return { ok: false };
    const target = BrowserWindow.fromWebContents(event.sender);
    windowAppearance = colors;
    target.setBackgroundColor(colors.background);
    if (process.platform !== 'darwin') target.setTitleBarOverlay({ color: colors.background, symbolColor: colors.text, height: 36 });
    return { ok: true };
  });
  ipcMain.handle('workspace:read', event => {
    if (!isLocal(event)) return { ok: false, message: '此页面不能读取本地资料。' };
    return { ok: true, workspace: workspaceFile.read(), paths: { root: storagePaths.root, workspace: path.join(storagePaths.root, 'workspace.json') } };
  });
  ipcMain.on('workspace:write', (event, workspace, options) => {
    try {
      if (!isLocal(event)) throw new Error('此页面不能写入本地资料。');
      if (resetPending) throw Error('正在清空并重启，暂时不能写入资料。');
      event.returnValue = { ok: true, workspace: workspaceFile.write(workspace, { restore: options?.restore === true }) };
      if (!chatMonitorAvailable || options?.restore === true || workspaceFile.read()?.data.preferences.modules.enabled['chat-monitor'] !== true) chatReceiver?.stop();
    } catch (error) { recordError('workspace-save', error); event.returnValue = { ok: false, message: error.message }; }
  });
  ipcMain.handle('workspace:open-folder', async event => {
    if (!isLocal(event)) return { ok: false, message: '此页面不能打开资料目录。' };
    const error = await shell.openPath(storagePaths.root);
    return { ok: !error, message: error };
  });
  ipcMain.handle('workspace:export', event => {
    try {
      if (!isLocal(event)) throw new Error('此页面不能导出本地资料。');
      const file = path.join(storagePaths.exports, `workspace-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
      fs.writeFileSync(file, JSON.stringify(workspaceFile.read(), null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
      return { ok: true, path: file };
    } catch (error) { return { ok: false, message: error.message }; }
  });
  ipcMain.handle('workspace:reset', (event, options) => {
    let pending;
    try {
      if(!isLocal(event))throw Error('此页面不能清空资料。');
      if(resetPending)throw Error('清空请求已提交，请等待重启。');
      pending=prepareReset(storagePaths.root,workspaceFile.read(),options);
      app.relaunch(); resetPending=true;
      setTimeout(()=>lifecycle.quit(),100);
      return {ok:true,backupPath:pending.backupPath};
    }catch(error){if(pending)cancelReset(storagePaths.root,pending.request);return {ok:false,message:error.message};}
  });
  for (const action of ['status', 'start', 'stop', 'credentials', 'pending', 'ack']) {
    ipcMain.handle(`chat:${action}`, async (event, value) => {
      try {
        if (!isLocal(event)) throw Error('此页面不能访问群消息接入。');
        const enabled = chatMonitorAvailable && workspaceFile.read()?.data.preferences.modules.enabled['chat-monitor'] === true;
        if (!enabled && action !== 'stop' && action !== 'status') throw Error('群消息功能已暂停，历史资料仍然保留。');
        const result = action === 'start' ? await chatReceiver.start(value) : action === 'ack' ? chatReceiver.ack(value) : chatReceiver[action]();
        return { ok: true, result };
      } catch (error) { return { ok: false, message: error.code === 'EADDRINUSE' ? '端口已被占用，请更换端口后重试。' : error.message }; }
    });
  }
  ipcMain.handle('desktop:open-mainline', () => { if (!win || win.isDestroyed()) createWindow(); else showWindow(); return { ok: true }; });
  ipcMain.handle('edu:open', (_event, value) => portalSession.open(value));

  ipcMain.handle('edu:capture-now', async () => {
    return capturePortalPage();
  });
  ipcMain.handle('collector:fetch', async (_event, value) => collectPublicPage(value, { root: captureDirectory('web') }));
  ipcMain.handle('collector:open-folder', async () => {
    const folder = captureDirectory('web');
    fs.mkdirSync(folder, { recursive: true });
    return { ok: true, path: folder, error: await shell.openPath(folder) };
  });

}

async function capturePortalPage() {
  const contents = portalSession.currentContents();
  if (!contents || contents.isDestroyed()) return { ok: false, message: '教务页面已经关闭，请重新打开。' };
  const status = portalSession.status();
  if (status.phase !== 'ready') return { ok: false, message: status.message };
  try {
    const captured = await captureCurrentCoursePage(contents);
    const diagnostics = captured.diagnostics.map(item => `${item.mode}/${item.result}`).join('，');
    const debug = workspaceFile.read()?.data.preferences.developerMode === true;
    return { ...captured, debug, debugText: debug ? `${captured.text || ''}\n\n读取状态：${diagnostics}${captured.warning ? `\n${captured.warning}` : ''}` : undefined };
  } catch (error) {
    recordError('portal-capture', error);
    return { ok: false, message: '教务页面正在跳转或已关闭，请在原教务窗口打开课表后重新抓取。' };
  }
}

function showWindow() {
  const target = prototypeMode ? prototypeWindow : win;
  if (!target || target.isDestroyed()) return;
  if (target.isMinimized()) target.restore();
  target.show(); target.focus();
}
function openPrototypeWindow() {
  if (prototypeWindow && !prototypeWindow.isDestroyed()) { prototypeWindow.show(); prototypeWindow.focus(); return; }
  prototypeWindow = new BrowserWindow({ width: 1440, height: 900, minWidth: 980, minHeight: 680, title: '几微 · JeeWeave', icon: path.join(__dirname, 'assets/app-icon.png'), titleBarStyle: 'hidden', ...(process.platform !== 'darwin' ? { titleBarOverlay: { color:windowAppearance.background, symbolColor:windowAppearance.text, height:36 } } : {}), backgroundColor: windowAppearance.background, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.cjs') } });
  lifecycle.bindMainWindow(prototypeWindow);
  prototypeWindow.on('closed', () => { prototypeWindow = undefined; });
  prototypeWindow.setMenu(null);
  prototypeWindow.loadFile(path.join(__dirname, 'prototype.html')).catch(error => {
    recordError('prototype-load', error);
    require('electron').dialog.showErrorBox('工作台打开失败', '请重新启动几微。错误已记录到 desktop-errors.log。');
  });
}
function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    show: false,
    title: '几微 · 桌面工作台',
    icon: path.join(__dirname, 'assets/app-icon.png'),
    titleBarStyle: 'hidden',
    ...(process.platform !== 'darwin' ? { titleBarOverlay: { color:windowAppearance.background, symbolColor:windowAppearance.text, height:36 } } : {}),
    backgroundColor: windowAppearance.background,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  win.once('ready-to-show', () => { if (win && !win.isDestroyed()) { win.show(); win.focus(); } });
  // Some Windows graphics drivers never emit ready-to-show for a hidden window.
  // A completed local page must still become visible and usable.
  win.webContents.once('did-finish-load', () => {
    if (win && !win.isDestroyed() && !win.isVisible()) { win.show(); win.focus(); }
  });
  win.setMenu(null);
  lifecycle.bindMainWindow(win);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });
  const entry = path.join(__dirname, 'prototype.html');
  win.loadFile(entry).catch(error => {
    recordError('main-load', error);
    require('electron').dialog.showErrorBox('桌面端打开失败', '请检查桌面资源后重新打开。错误已记录到 desktop-errors.log。');
  });
}
app.whenReady().then(async () => {
  if (!lock) return;
  // Keep every development entry (normal, debug and prototype) free of native menus.
  Menu.setApplicationMenu(null);
  const { isModuleAvailable } = await import('./modules.mjs');
  chatMonitorAvailable = isModuleAvailable('chat-monitor');
  const { validateWorkspace } = await import('./workspace-format.mjs');
  workspaceFile = createWorkspaceFile(storagePaths.root, validateWorkspace);
  const { appearanceTokens, normalizeAppearance } = await import('./appearance.mjs');
  const preferences = workspaceFile.read()?.data.preferences;
  const tokens = appearanceTokens(normalizeAppearance(preferences?.appearance, preferences?.theme));
  windowAppearance = { background: tokens['--sidebar'], text: tokens['--text'] };
  const { normalizeChat, normalizeChatEvent, sourceForEvent } = await import('./chat-monitor.mjs');
  chatReceiver = createChatReceiver({ root: storagePaths.root, accept: (payload, transport) => {
    const workspace = workspaceFile.read();
    if (!chatMonitorAvailable || workspace?.data.preferences.modules.enabled['chat-monitor'] !== true) return null;
    const event = normalizeChatEvent(payload, transport);
    return event && sourceForEvent(normalizeChat(workspace.data.chatMonitor), event) ? event : null;
  }, notify: () => {
    for (const target of [win, prototypeWindow]) if (target && !target.isDestroyed()) target.webContents.send('chat:available');
  } });
  portalSession = createPortalSession({ BrowserWindow, WebContentsView, recordError, onStatus: status => {
    for (const target of [win, prototypeWindow]) {
      if (target && !target.isDestroyed()) target.webContents.send('edu:status', status);
    }
  } });
  lifecycle = createAppLifecycle({ app, globalShortcut, getWindows: () => [win, prototypeWindow], closePortal: () => portalSession.dispose() });
  registerIpc();
  app.isQuitting = false;
  app.on('activate', showWindow);
  app.on('window-all-closed', () => lifecycle.quit());
  if ((process.env.JEEWEAVE_DESKTOP_PROTOTYPE || process.env.JIWEI_DESKTOP_PROTOTYPE) === '1') openPrototypeWindow(); else createWindow();
  globalShortcut.register('CommandOrControl+Shift+J', showWindow);
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
}).catch(error => { recordError('startup', error); require('electron').dialog.showErrorBox('几微启动失败', '请重新打开应用。错误已记录到 desktop-errors.log。'); app.quit(); });

app.on('before-quit', () => { app.isQuitting = true; globalShortcut.unregisterAll(); chatReceiver?.stop(); });
