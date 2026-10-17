const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('jiweiDesktop', {
  open: async () => ({ ok: true, message: '测试登录窗口' }),
  captureNow: () => ipcRenderer.invoke('fixture:capture'),
  onPortalStatus: () => {},
});
