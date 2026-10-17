const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('jiweiDesktop', {
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
