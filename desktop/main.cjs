const { app, BrowserWindow, WebContentsView, Menu, globalShortcut, shell, session, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { createPortalSession, validPortalUrl } = require('./portal-session.cjs');
const { createAppLifecycle } = require('./app-lifecycle.cjs');
const { captureCurrentCoursePage } = require('./course-capture.cjs');
const { collectPublicPage } = require('./web-collector.cjs');
const { configureStorage } = require('./storage-paths.cjs');

let storagePaths;
try { storagePaths = configureStorage(app); }
catch (error) {
  require('electron').dialog.showErrorBox('无法创建本地数据目录', `请将整个几微文件夹放在可写的位置（例如桌面），再双击几微.exe。\n\n${error.message}`);
  app.exit(1);
}

let win;
let portalSession;
let prototypeWindow;
let lifecycle;
const prototypeMode = process.env.JIWEI_DESKTOP_PROTOTYPE === '1';
const crawlerDebugMode = process.env.JIWEI_DEBUG_CRAWLER === '1';
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
    return { ...captured, debug: crawlerDebugMode, debugText: crawlerDebugMode ? `${captured.text || ''}\n\n读取状态：${diagnostics}${captured.warning ? `\n${captured.warning}` : ''}` : undefined };
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
  prototypeWindow = new BrowserWindow({ width: 1440, height: 900, minWidth: 980, minHeight: 680, title: '几微 · 未来整理工作台（实验）', backgroundColor: '#f5f7fb', webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.cjs') } });
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
    backgroundColor: '#f4f7fb',
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
app.whenReady().then(() => {
  if (!lock) return;
  // Keep every development entry (normal, debug and prototype) free of native menus.
  Menu.setApplicationMenu(null);
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
  if (process.env.JIWEI_DESKTOP_PROTOTYPE === '1') openPrototypeWindow(); else createWindow();
  globalShortcut.register('CommandOrControl+Shift+J', showWindow);
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
}).catch(error => { recordError('startup', error); require('electron').dialog.showErrorBox('几微启动失败', '请重新打开应用。错误已记录到 desktop-errors.log。'); app.quit(); });

app.on('before-quit', () => { app.isQuitting = true; globalShortcut.unregisterAll(); });
