const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('jeeWeaveDesktop',{
  collectPage:url=>ipcRenderer.invoke('fixture:collect',url),
  openCollectorFolder:async()=>({ok:true}),
  onPortalStatus:()=>{},
});
