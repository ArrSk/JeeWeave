const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('jeeWeaveDesktop', {
  setWindowAppearance: colors => ipcRenderer.invoke('window:appearance', colors),
  readWorkspace: () => ipcRenderer.invoke('workspace:read'),
  writeWorkspace: (workspace, options) => ipcRenderer.sendSync('workspace:write', workspace, { restore: options?.restore === true }),
  openDataFolder: () => ipcRenderer.invoke('workspace:open-folder'),
  exportWorkspace: () => ipcRenderer.invoke('workspace:export'),
  resetWorkspace: options => ipcRenderer.invoke('workspace:reset', options),
  chat: (action, value) => ['status', 'start', 'stop', 'credentials', 'pending', 'ack'].includes(action) ? ipcRenderer.invoke(`chat:${action}`, value) : Promise.reject(Error('不支持的群消息操作。')),
  onChatAvailable: callback => {
    const listener = () => callback(); ipcRenderer.on('chat:available', listener);
    return () => ipcRenderer.removeListener('chat:available', listener);
  },
  open: (url) => ipcRenderer.invoke('edu:open', url),
  captureNow: () => ipcRenderer.invoke('edu:capture-now'),
  onPortalStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('edu:status', listener);
    return () => ipcRenderer.removeListener('edu:status', listener);
  },
  collectPage: (url) => ipcRenderer.invoke('collector:fetch', url),
  openCollectorFolder: () => ipcRenderer.invoke('collector:open-folder'),
  openMainline: () => ipcRenderer.invoke('desktop:open-mainline'),
})
