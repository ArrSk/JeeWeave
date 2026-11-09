// Isolated review of the standalone prototype; never loads the application preload or data.
const fs=require('node:fs');
const path=require('node:path');
if(!process.versions.electron){
 const {spawn}=require('node:child_process');
 const base=path.resolve(__dirname,'../.cache/verification');
 const temporary=path.join(base,'design-demo-test');
 if(path.dirname(temporary)!==base||path.basename(temporary)!=='design-demo-test')throw Error('Unsafe cleanup directory');
 const child=spawn(require('electron'),[__filename],{stdio:'inherit',windowsHide:true});
 const timer=setTimeout(()=>child.kill(),95000);
 child.on('error',e=>console.error(e));
 child.on('close',code=>{clearTimeout(timer);fs.rmSync(temporary,{recursive:true,force:true,maxRetries:20,retryDelay:150});process.exitCode=code??1;});
}else{
const {app,BrowserWindow,session}=require('electron');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../.cache/verification');
const temporary=path.join(root,'design-demo-test');
fs.mkdirSync(temporary,{recursive:true});
app.setPath('userData',path.join(temporary,'profile'));
app.disableHardwareAcceleration();
let win;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const timeout=setTimeout(()=>{console.error('design demo timeout');app.exit(1);},90000);
app.whenReady().then(async()=>{
 let error;
 try{
  win=new BrowserWindow({width:1440,height:960,show:false,webPreferences:{offscreen:true,backgroundThrottling:false,sandbox:true,contextIsolation:true,session:session.fromPartition('design-demo-test')}});
  const errors=[];win.webContents.on('console-message',e=>{if(e.level==='error')errors.push(e.message)});
  await win.loadFile(path.resolve(__dirname,'../design-demo/index.html'));
  const run=c=>win.webContents.executeJavaScript(c);
  const click=s=>run(`document.querySelector(${JSON.stringify(s)}).click();true`);
  const capture=async name=>{if(process.env.JEEWEAVE_TEST_NO_CAPTURE==='1')return;await delay(450);fs.writeFileSync(path.join(temporary,name+'.png'),(await win.webContents.capturePage()).toPNG())};
  const fit=async()=>assert.equal(await run('document.documentElement.scrollWidth<=innerWidth && document.querySelector(".shell").getBoundingClientRect().bottom<=innerHeight'),true);
  const layouts=['sidebar','rail','top','float','dock','island','focus'];
  const palettes=['linen','ink','mist','sand','lavender','graphite','rose','ocean'];
  const choose=async(kind,id)=>click(`[data-${kind}-choice=${id}]`);
  const geometry=()=>run(`(()=>{const b=document.querySelector('.sidebar').getBoundingClientRect(),s=document.querySelector('#stage').getBoundingClientRect();return [b.x,b.y,b.width,b.height,s.x,s.y,s.width,s.height]})()`);
  // 布局与配色切换收进设置页；先把设置页建出来，后续断言仍用同一批按钮。
  await click('[data-go=settings]');await delay(120);
  assert.equal(await run('document.querySelector("#page-settings .layout-options")!==null'),true,'设置页承载布局切换');
  assert.equal(await run('document.querySelector("#page-settings .palette-options")!==null'),true,'设置页承载配色切换');
  assert.equal(await run('document.querySelector(".studio-controls")===null'),true,'页头不再放切换');
  assert.equal(await run('document.querySelector("#page-settings #motion")!==null'),true,'设置页承载动效开关');
  assert.equal(await run('document.querySelectorAll("#page-settings .skeleton-card").length'),2,'设置页承载骨架入口');
  assert.equal(await run('document.querySelector("#page-settings .skeleton-card.current b").textContent'),'工作台');
  assert.match(await run('document.querySelector("#page-settings a.skeleton-card").getAttribute("href")'),/loom\.html$/);
  // 侧栏收起：整条滑到左边直到关闭，左侧展开签负责恢复。
  await click('#side-collapse');await delay(320);
  assert.equal(await run('document.body.classList.contains("side-closed")'),true);
  assert.equal(await run('document.querySelector(".sidebar").inert'),true);
  assert.equal(await run('document.querySelector("#side-open").getClientRects().length>0'),true,'收起后左侧留展开签');
  assert.equal(await run('document.activeElement.id'),'side-open');
  assert.ok(await run('document.querySelector(".sidebar").getBoundingClientRect().width<1'),'侧栏收起到 0 宽');
  await click('#side-open');await delay(320);
  assert.equal(await run('document.body.classList.contains("side-closed")'),false);
  assert.equal(await run('document.querySelector(".sidebar").inert'),false);
  assert.ok(await run('document.querySelector(".sidebar").getBoundingClientRect().width>100'),'展开还原侧栏');
  for(const width of [1440,900]){
   win.setSize(width,width===1440?960:820);
   for(const layout of layouts){
    await choose('layout',layout);await delay(300);const before=await geometry();
    for(const palette of palettes){
     await choose('palette',palette);await fit();assert.deepEqual(await geometry(),before,'palette must not alter layout');
     assert.equal(await run('document.body.dataset.layout'),layout);
     assert.equal(await run('document.body.dataset.palette'),palette);
    }
    if(width===1440){await choose('palette',{sidebar:'linen',rail:'ink',top:'mist',float:'lavender',dock:'sand',island:'ocean',focus:'rose'}[layout]);await capture(layout);}
    if(layout==='focus'){await click('#menu-toggle');assert.equal(await run('document.querySelector("#menu-toggle").getAttribute("aria-expanded")'),'true');}
    for(const id of ['objects','courses','items','calendar','notes','capture','search','plugins','settings','today']){
     await click(`[data-go=${id}]`);await delay(15);
     assert.equal(await run('document.querySelectorAll(".page.active").length'),1);
     assert.equal(await run('document.querySelectorAll(".page:not([inert])").length'),1);
    }
    if(['float','dock','island'].includes(layout)){
     const initial=await geometry();
     await run('document.querySelector("#drag-handle").dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}));true');
     const moved=await geometry();assert.ok(moved[0]>initial[0],'keyboard moves the floating bar');
     await choose('palette','rose');assert.deepEqual(await geometry(),moved,'palette preserves dragged position');
     await run('document.querySelector("#drag-handle").dispatchEvent(new KeyboardEvent("keydown",{key:"Home",bubbles:true}));true');
     assert.deepEqual(await geometry(),initial,'Home restores position');
    }
   }
  }
  await choose('layout','dock');await choose('palette','lavender');win.setSize(900,820);await capture('dock-900');
  await choose('layout','float');await capture('float-900');
  await choose('layout','focus');await click('#menu-toggle');await capture('focus-menu-900');
  await run('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));true');
  assert.equal(await run('document.querySelector("#menu-toggle").getAttribute("aria-expanded")'),'false');
  await choose('layout','sidebar');
  await click('[data-go=items]');await click('#page-items [data-complete=math]');await choose('layout','dock');await choose('palette','sand');assert.equal(await run('document.querySelector(".page.active").id'),'page-items');
  assert.equal(await run('document.querySelectorAll("[data-task-row=math].done").length>=3'),true);
  await click('#page-items [data-schedule=math]');
  await run('document.querySelector("#slot-end").value="18:00"; document.querySelector("#schedule-form").requestSubmit();true');
  assert.match(await run('document.querySelector("#schedule-error").textContent'),/晚于/);
  await run('document.querySelector("#slot-end").value="20:30"; document.querySelector("#schedule-form").requestSubmit();true');
  assert.match(await run('document.querySelector("#page-items [data-task-time=math]").textContent'),/20:30/);
  await click('[data-go=search]');await run('document.querySelector("#search-input").value="无此示例";document.querySelector("#search-input").dispatchEvent(new Event("input"));true');
  assert.match(await run('document.querySelector("#search-results").textContent'),/没有找到/);
  await choose('layout','rail');await choose('palette','ink');await click('[data-go=objects]');win.setSize(1100,820);await fit();await capture('ink-objects-1100');
  await click('[data-object="1"]');assert.equal(await run('document.querySelector("#object-title").textContent'),'程序设计');
  await click('[data-object-tab=notes]');assert.equal(await run('document.querySelectorAll("#object-sources .source-row:not([hidden])").length'),1);
  await choose('layout','top');await choose('palette','mist');win.setSize(900,760);await click('[data-go=calendar]');await fit();await capture('mist-calendar-900');
  await click('#page-calendar [data-detail]');await capture('detail-900');
  await run('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));true');
  assert.equal(await run('document.querySelector("#inspector").inert'),true);
  await run('document.dispatchEvent(new KeyboardEvent("keydown",{key:"k",ctrlKey:true,bubbles:true}));true');
  assert.equal(await run('document.activeElement.id'),'search-input');
  // 插件原生导航：分组、开关、后装页与横向滚动都由同一份目录决定。
  await choose('layout','sidebar');await choose('palette','linen');win.setSize(1440,960);await click('[data-go=plugins]');await delay(120);
  const counts=await run('(()=>Object.fromEntries([...document.querySelectorAll(".nav-group")].map(g=>[g.dataset.navGroup,g.querySelectorAll(".nav-button").length])))()');
  assert.deepEqual(counts,{home:2,now:4,record:4,help:3,system:2});
  assert.equal(await run('document.querySelector("[data-nav-group=now] .nav-count").textContent'),'4');
  await click('[data-go=import]');
  assert.equal(await run('document.querySelector(".page.active").id'),'page-import');
  assert.match(await run('document.querySelector("#page-import").textContent'),/手动登录/);
  await capture('import-1440');
  await click('[data-go=assistant]');
  assert.match(await run('document.querySelector("#page-assistant").textContent'),/草稿由你确认/);
  await click('#page-assistant [data-assistant-draft]');
  assert.match(await run('document.querySelector("#assistant-page-draft").textContent'),/第三章/);
  const assistantGeom=await run('(()=>{const q=s=>document.querySelector(s).getBoundingClientRect(),l=q("#page-assistant label"),a=q("#assistant-page-input"),b=q("#page-assistant [data-assistant-draft]");return {stacked:l.bottom<=a.top+1&&b.top>=a.bottom-1,wide:a.width>400}})()');
  assert.equal(assistantGeom.stacked,true,'assistant fields stack without overlap');
  assert.equal(assistantGeom.wide,true,'assistant textarea uses the panel width');
  await capture('assistant-1440');
  await click('[data-go=chat]');
  assert.match(await run('document.querySelector("#page-chat").textContent'),/适配器还需另行配置/);
  assert.equal(await run('document.querySelector("[data-go=chat] .nav-state").textContent'),'挂起');
  await capture('chat-1440');
  await click('[data-go=plugins]');
  await capture('plugins-states-1440');
  await run('document.querySelector("[data-plugin-row=ledger]").scrollIntoView({block:"end"});true');
  await capture('plugins-states-tail-1440');
  assert.equal(await run('document.querySelectorAll("[data-plugin-state=suspended]").length'),1);
  assert.equal(await run('document.querySelectorAll("[data-plugin-state=missing]").length'),1);
  assert.equal(await run('document.querySelector("[data-plugin-row=chat-monitor] .toggle").disabled'),true,'suspended plugin cannot be switched');
  assert.equal(await run('document.querySelector("[data-plugin-row=ledger] .toggle").disabled'),true,'unimplemented plugin cannot be switched');
  await click('[data-plugin-toggle=courses]');
  assert.equal(await run('document.querySelectorAll(".nav-button[data-go=import]").length'),0,'blocked plugin removes its navigation entry');
  assert.equal(await run('document.querySelector("[data-plugin-row=course-import]").dataset.pluginState'),'blocked');
  assert.equal(await run('document.querySelector("[data-plugin-row=course-import] .toggle").disabled'),true,'blocked plugin cannot be switched');
  await run('document.querySelector("[data-plugin-row=course-import]").scrollIntoView({block:"center"});true');
  await capture('plugins-blocked-1440');
  await click('[data-plugin-toggle=courses]');
  assert.equal(await run('document.querySelectorAll(".nav-button[data-go=import]").length'),1,'restoring the dependency brings the entry back');
  assert.equal(await run('document.querySelector("[data-plugin-row=course-import]").dataset.pluginState'),'on');
  await click('[data-plugin-toggle=assistant]');
  assert.equal(await run('document.querySelectorAll(".nav-button[data-go=assistant]").length'),0,'closing the assistant removes its page');
  assert.equal(await run('document.querySelector("#assistant-button").hidden'),true,'closing the assistant removes its toolbar command');
  await click('[data-plugin-toggle=assistant]');
  assert.equal(await run('document.querySelectorAll(".nav-button[data-go=assistant]").length'),1);
  assert.equal(await run('document.querySelector("#assistant-button").hidden'),false);
  await click('[data-plugin-toggle=calendar]');
  assert.equal(await run('document.querySelectorAll(".nav-button[data-go=calendar]").length'),0,'closing a plugin removes its navigation entry');
  await click('[data-plugin-toggle=calendar]');
  assert.equal(await run('document.querySelectorAll(".nav-button[data-go=calendar]").length'),1,'reopening restores it');
  for(let i=0;i<8;i++)await click('[data-stress-install]');
  assert.equal(await run('document.querySelectorAll("[data-nav-group=more] .nav-button").length'),11);
  assert.equal(await run('document.querySelectorAll("#navigation .nav-button").length'),26);
  assert.equal(await run('(()=>{const n=document.querySelector("#navigation");return n.scrollHeight>n.clientHeight+2})()'),true,'long plugin list scrolls in the vertical sidebar');
  await choose('layout','top');win.setSize(900,760);await delay(120);
  assert.equal(await run('(()=>{const n=document.querySelector("#navigation");return n.scrollWidth>n.clientWidth+2})()'),true,'long plugin list scrolls in the horizontal top bar');
  await click('[data-go="focus-1-timer"]');
  assert.equal(await run('document.querySelector(".page.active").id'),'page-focus-1-timer');
  assert.equal(await run('(()=>{const a=document.querySelector(".nav-button.active").getBoundingClientRect(),n=document.querySelector("#navigation").getBoundingClientRect();return a.left>=n.left-1&&a.right<=n.right+1})()'),true,'active installed page is kept visible');
  await click('[data-go=plugins]');await click('[data-stress-reset]');
  assert.equal(await run('document.querySelectorAll("[data-nav-group=more]").length'),0);
  assert.equal(await run('document.querySelectorAll("#navigation .nav-button").length'),15);
  await win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  assert.equal(await run('getComputedStyle(document.querySelector("#particles")).display'),'none');
  win.webContents.debugger.detach();
  assert.deepEqual(errors,[]);
  assert.equal(await run('localStorage.length'),0);
  fs.writeFileSync(path.join(root,'design-demo-summary.json'),JSON.stringify({date:'2026-11-08',result:'passed',layouts:7,palettes:8,combinations:56,widths:[1440,1100,900],checks:['palette/layout geometry independence at 1440/900','floating keyboard movement and reset','palette preserves moved position','focus menu open and Escape','rapid navigation','single active and interactive page','shared completion','schedule error and save','object filters','search empty state','Escape and Ctrl+K','plugin catalog grouping and counts','assistant page draft','suspended chat page and disabled switch','unimplemented ledger row','dependency-blocked import entry and switch','closing/reopening a plugin adds and removes its entry','assistant page and toolbar command appear together','8 stress batches land 11 pages in 新装','vertical and horizontal navigation overflow scrolls','active installed page kept visible','reset returns the catalog to 15 entries','reduced motion','zero localStorage writes'],boundary:'Offscreen software rendering; catalog and stress plugins are in-memory only; no real-workspace or subjective hardware smoothness validation.'},null,2));
  console.log('PASS. Review screenshots available for 30 seconds: '+temporary);
  if(process.env.JEEWEAVE_TEST_NO_CAPTURE!=='1')await delay(30000);
 }catch(e){error=e;console.error(e.stack)}
 finally{
  if(win&&!win.isDestroyed())win.destroy();
  clearTimeout(timeout);
  app.exit(error?1:0);
 }
});
}
