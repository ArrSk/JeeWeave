const {app,BrowserWindow}=require('electron');const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
app.disableHardwareAcceleration();
const output=process.env.JEEWEAVE_RESET_EVIDENCE,root=process.env.JEEWEAVE_DATA_DIR,armed=path.join(output,'armed.json'),complete=path.join(output,'complete.json');
const fail=error=>{fs.writeFileSync(complete,JSON.stringify({ok:false,error:error.stack||String(error)}));console.error(error);app.exit(1);};
const timer=setTimeout(()=>fail(Error('Reset fixture timed out')),35000);
require('../../main.cjs');
app.on('before-quit',()=>clearTimeout(timer));
app.whenReady().then(async()=>{
  let window;for(let i=0;i<100;i++){window=BrowserWindow.getAllWindows().find(w=>!w.isDestroyed());if(window)break;await new Promise(r=>setTimeout(r,40));}assert.ok(window);window.hide();
  const run=code=>window.webContents.executeJavaScript(code),click=s=>run(`document.querySelector(${JSON.stringify(s)}).click();true`);
  const wait=async()=>{for(let i=0;i<100;i++){if(await run('!!document.querySelector("#desktop-open-reset")'))return;await new Promise(r=>setTimeout(r,40));}throw Error('reset controls did not render');};
  const disk=()=>JSON.parse(fs.readFileSync(path.join(root,'workspace.json'),'utf8'));
  const shot=async name=>{window.showInactive();await new Promise(r=>setTimeout(r,180));fs.writeFileSync(path.join(output,name),(await window.webContents.capturePage()).toPNG());window.hide();};
  await wait();
  if(fs.existsSync(armed)){
    const backups=fs.readdirSync(path.join(root,'backups')).filter(n=>n.startsWith('before-clear-'));assert.equal(backups.length,1);
    const backup=path.join(root,'backups',backups[0],'data');const original=JSON.parse(fs.readFileSync(path.join(backup,'workspace.json'),'utf8'));
    assert.ok(original.data.tasks.length>0);assert.ok(original.data.objectView.objects.length>0);assert.equal(original.data.preferences.developerMode,true);
    assert.equal(disk().data.tasks.length,0);assert.equal(disk().data.plans.length,0);assert.equal(disk().data.webCaptures.length,0);assert.equal(disk().data.objectView.objects.length,0);assert.equal(disk().data.preferences.developerMode,false);
    assert.equal(disk().data.timetables.tables.length,1);assert.equal(disk().data.timetables.tables[0].courses.length,0);
    assert.equal(await run('localStorage.getItem("fixture-before-reset")'),null);
    for(const [file,text] of [['profile/sentinel.txt','profile'],['captures/raw.txt','original'],['exports/old.txt','export']]){assert.equal(fs.readFileSync(path.join(backup,file),'utf8'),text);assert.equal(fs.existsSync(path.join(root,file)),false);}
    assert.equal(await run('document.querySelector("#desktop-open-reset").closest("section").hidden'),true);
    await shot('reset-empty-after-relaunch.png');fs.writeFileSync(complete,JSON.stringify({ok:true,backup}));clearTimeout(timer);window.close();return;
  }
  // Main process checks developer mode even for direct IPC requests.
  let response=await run('(async()=>{const w=await window.jeeWeaveDesktop.readWorkspace();return window.jeeWeaveDesktop.resetWorkspace({confirmation:"清空所有数据",revision:w.workspace.revision})})()');assert.equal(response.ok,false);assert.match(response.message,/开发者/);
  await click('[data-view="settings"]');await click('#desktop-developer-mode');await click('#desktop-load-all-examples');
  // Give unplaced records a long, realistic fixture to inspect the section inset.
  await run(`(async()=>{const w=await window.jeeWeaveDesktop.readWorkspace();w.workspace.data.timetables.tables.find(t=>t.id===w.workspace.data.timetables.activeId).unplacedCourses=[{id:'unplaced-fixture',title:'大学生职业发展与学习规划 · 联合授课教师组',weekText:'1–16周',weeks:[1,2,3],raw:'课程原文：此课程暂未提供具体星期与节次，请保留学校安排说明并等待后续通知。'}];const r=window.jeeWeaveDesktop.writeWorkspace(w.workspace);if(!r.ok)throw Error(r.message);return true})()`);
  await window.reload();await wait();await click('[data-view="courses"]');await run('document.querySelector("#desktop-unplaced-courses").open=true;document.querySelector("#desktop-unplaced-courses").scrollIntoView({block:"end"});true');
  assert.equal(await run('getComputedStyle(document.querySelector("#desktop-unplaced-courses")).paddingLeft'),'22px');await shot('brand-unplaced-wide.png');
  window.setSize(900,700);await run('document.querySelector("#desktop-unplaced-courses").scrollIntoView({block:"end"});true');await shot('brand-unplaced-compact.png');
  assert.equal(await run('(()=>{const b=document.querySelector(".brand"),n=b.querySelector(".brand-wordmark");return n.getBoundingClientRect().right<=b.getBoundingClientRect().right&&n.scrollWidth<=n.clientWidth})()'),true);
  await click('[data-view="settings"]');await click('#desktop-open-reset');assert.equal(await run('document.querySelector("#desktop-confirm-reset").disabled'),true);await shot('reset-confirm-compact.png');await click('#desktop-reset-form [data-reset-close]');assert.equal(fs.existsSync(path.join(root,'reset-request.json')),false);
  response=await run('(async()=>{const w=await window.jeeWeaveDesktop.readWorkspace();return window.jeeWeaveDesktop.resetWorkspace({confirmation:"清空所有数据",revision:w.workspace.revision-1})})()');assert.equal(response.ok,false);assert.match(response.message,/变化|确认/);
  const foreign=new BrowserWindow({show:false,webPreferences:{preload:path.resolve(__dirname,'../../preload.cjs'),sandbox:true,contextIsolation:true}});await foreign.loadURL('about:blank');response=await foreign.webContents.executeJavaScript('window.jeeWeaveDesktop.resetWorkspace({confirmation:"清空所有数据",revision:0})');assert.equal(response.ok,false);assert.match(response.message,/不能/);foreign.destroy();
  fs.writeFileSync(path.join(root,'profile/sentinel.txt'),'profile');fs.writeFileSync(path.join(root,'captures/raw.txt'),'original');fs.writeFileSync(path.join(root,'exports/old.txt'),'export');await run('localStorage.setItem("fixture-before-reset","must disappear");true');
  window.setSize(1280,900);await click('#desktop-open-reset');await shot('reset-confirm-wide.png');
  fs.writeFileSync(armed,JSON.stringify({requestedAt:new Date().toISOString()}));await click('#desktop-reset-ack');await click('#desktop-confirm-reset');
}).catch(fail);
