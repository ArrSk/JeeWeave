const {app,BrowserWindow,Menu}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const port=Number(process.argv[2]),origin='http://127.0.0.1:'+port;
if(!Number.isInteger(port)||port<1024||port>65535)app.exit(1);
app.setPath('userData',path.join(__dirname,'.cache','preview','browser-profile'));
app.disableHardwareAcceleration();
let win;
if(!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.show();win.focus();}});
  app.whenReady().then(async()=>{
    Menu.setApplicationMenu(null);
    win=new BrowserWindow({width:414,height:844,useContentSize:true,minWidth:320,minHeight:480,title:'JeeWeave · 手机预览',autoHideMenuBar:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
    win.removeMenu();win.on('page-title-updated',event=>event.preventDefault());
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    win.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==origin)event.preventDefault();});
    await win.loadURL(origin+'/');
    win.show();win.focus();
    fs.mkdirSync(path.join(__dirname,'.cache','preview'),{recursive:true});
    fs.writeFileSync(path.join(__dirname,'.cache','preview','ready.json'),JSON.stringify({pid:process.pid,url:origin,visible:win.isVisible(),started:new Date().toISOString()}));
    if(process.env.JEEWEAVE_PREVIEW_CHECK==='1') {
      for(let i=0;i<100;i++){
        if(await win.webContents.executeJavaScript('document.documentElement.dataset.mobileReady==="true"')) break;
        await new Promise(resolve=>setTimeout(resolve,50));
      }
      if(!await win.webContents.executeJavaScript('document.documentElement.dataset.mobileReady==="true"'))throw Error('Phone UI did not start');
      console.log('Phone preview loaded; closing its window to check service shutdown.');
      win.close();
    }
  }).catch(error=>{console.error(error);app.exit(1);});
  app.on('window-all-closed',()=>app.quit());
}
