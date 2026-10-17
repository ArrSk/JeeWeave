const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('jiweiDesktop',{
  collectPage:url=>ipcRenderer.invoke('fixture:collect',url),
  openCollectorFolder:async()=>({ok:true}),
  onPortalStatus:()=>{},
});
