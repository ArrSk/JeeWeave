// Phase 0: real main-process IPC, isolated data, and cleanup after the child exits.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const base = path.resolve(__dirname, '../.cache/test-runs');
if (!process.versions.electron) {
  const { spawn } = require('node:child_process');
  fs.mkdirSync(base, { recursive: true });
  const dir = fs.mkdtempSync(path.join(base, 'skeleton-switch-'));
  if (path.dirname(dir) !== base) throw Error('Unsafe test directory');
  (async () => {
    let child, code = 1;
    const timer = setTimeout(() => child?.kill(), 180000);
    try {
      child = spawn(require('electron'), [__filename], { stdio: 'inherit', windowsHide: true, env: { ...process.env, JEEWEAVE_DIAGNOSTICS_TEST: dir, JEEWEAVE_DATA_DIR: path.join(dir, 'data'), JEEWEAVE_DESKTOP_PROTOTYPE: '1' } });
      code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', n => resolve(n ?? 1)); });
    } finally {
      clearTimeout(timer);
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 150 });
      console.log('Skeleton test data and screenshots removed.');
    }
    process.exitCode = code;
  })().catch(error => { console.error(error); process.exitCode = 1; });
} else {
  const { app, BrowserWindow } = require('electron');
  const dir = path.resolve(process.env.JEEWEAVE_DIAGNOSTICS_TEST || '');
  if (path.dirname(dir) !== base || !path.basename(dir).startsWith('skeleton-switch-')) throw Error('Run this test with node');
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
  app.on('browser-window-created', (_event, win) => { win.setSkipTaskbar(true); });
  require('../main.cjs');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  (async () => {
    await app.whenReady(); let win;
    for (let i = 0; i < 150; i++) {
      win = BrowserWindow.getAllWindows().find(w => !w.isDestroyed());
      if (win && await win.webContents.executeJavaScript('!!document.querySelector("#desktop-module-reminders")').catch(() => false)) break;
      await sleep(70);
    }
    assert.ok(win);
    win.setMinimumSize(900, 640); win.setSize(1440, 960);
    win.webContents.setBackgroundThrottling(false); win.showInactive();
    const errors = [];
    win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
    const run = code => win.webContents.executeJavaScript(code).catch(error=>{throw Error(error.message+'; step: '+code.slice(0,700));});
    const click = selector => run(`document.querySelector(${JSON.stringify(selector)}).click();true`);
    const state = () => run('document.documentElement.dataset.workspaceSkeleton');
    const disk = () => JSON.parse(fs.readFileSync(path.join(dir, 'data/workspace.json'), 'utf8'));
    const business = () => { const data = disk().data; delete data.preferences; delete data.extensions['jiwei-desktop-skeleton-v1']; return JSON.stringify(data); };
    const order = () => run('[...document.querySelector(".main").children].map(n=>n.id+":"+n.tagName+":"+n.className)');
    const capture = async name => { if(process.env.JEEWEAVE_TEST_NO_CAPTURE==='1')return;await sleep(400); fs.writeFileSync(path.join(dir, name + '.png'), (await win.webContents.capturePage()).toPNG()); };
    const reload = async () => {
      win.reload();
      await sleep(200);
      for (let i = 0; i < 150; i++) { if (await run('!!document.querySelector("#desktop-module-reminders")').catch(() => false)) return; await sleep(70); }
      throw Error('Reload timed out');
    };

    const page = () => run('document.querySelector(".main").dataset.activeView');
    // 经纬的材质原则：线只在纸上，字不能落在线上。用 Range 量真实字形框，逐个和已知的线/结/刻度求交。
    const inkClash = () => run(`(()=>{
      const cs=getComputedStyle(document.documentElement),num=v=>parseFloat(v)||0;
      const warpX=num(cs.getPropertyValue('--warp-x')),gap=num(cs.getPropertyValue('--gap'));
      const host=document.querySelector('.loom-content>section[data-page]:not([hidden]) .loom-today');
      if(!host)return 'no loom host';
      const faded=el=>{for(let n=el;n&&n!==host.parentNode;n=n.parentElement){const s=getComputedStyle(n);if(s.visibility==='hidden'||Number(s.opacity)===0)return true}return false};
      const ink=[],walker=document.createTreeWalker(host,NodeFilter.SHOW_TEXT);let node;
      while((node=walker.nextNode())){if(!node.textContent.trim())continue;const el=node.parentElement;if(!el||faded(el))continue;
        const r=document.createRange();r.selectNodeContents(node);
        for(const b of r.getClientRects())if(b.width>0&&b.height>0)ink.push({x:b.left,y:b.top,w:b.width,h:b.height,el})}
      const lines=[],add=(x,y,w,h)=>{if(w>0&&h>0)lines.push({x,y,w,h})};
      const box=sel=>[...host.querySelectorAll(sel)].map(n=>n.getBoundingClientRect());
      const warp=box('.loom-warp')[0];if(warp)add(warp.left+warpX,warp.top,1,warp.height);
      const ribbon=box('.loom-ribbon')[0];if(ribbon)add(ribbon.left+warpX-1,ribbon.top+6,1,ribbon.height-14);
      for(const b of box('.loom-course-col'))add(b.left,b.top+34,1,Math.max(1,b.height-40));
      for(const b of box('.loom-row-margin,.loom-slip-margin'))add(b.left-1,b.top,1,b.height);
      for(const b of box('.loom-row-knot,.loom-slip-knot,.loom-now-dot,.loom-tail-knot'))add(b.left,b.top,b.width,b.height);
      for(const b of box('.loom-tick'))add(b.left,b.top,b.width,b.height);
      for(const b of box('.loom-paper'))add(b.left-gap,b.top+15,gap,1);
      for(const b of box('.loom-group-title'))add(b.left-5,b.top+num(getComputedStyle(host.querySelector('.loom-group-title')).fontSize)*.62-3,7,7);
      // 另外三套布局各自的线：舆图疆界/地块边框/界桩线、涟漪水纹与水道、夜场台口与候场横线。
      const variant = document.documentElement.dataset.loomLayout;
      if(variant==='atlas') {
        for(const b of box('.loom-legs,.loom-marks'))add(b.left,b.top,1,b.height);
        for(const b of box('.loom-atlas-field')){add(b.left,b.top,b.width,1);add(b.left,b.bottom-1,b.width,1);add(b.left,b.top,1,b.height);add(b.right-1,b.top,1,b.height);}
      }
      if(variant==='ripple') {
        const rows=box('.loom-ripple-row');rows.forEach((b,i)=>{add(b.left,b.top,b.width,1);if(i===rows.length-1)add(b.left,b.bottom-1,b.width,1);});
        for(const b of box('.loom-rp-col'))add(b.left,b.top,1,b.height);
        const rp=box('.loom-rp-row');rp.forEach((b,i)=>{add(b.left,b.top,b.width,1);if(i===rp.length-1)add(b.left,b.bottom-1,b.width,1);});
      }
      if(variant==='stage') {
        for(const b of box('.loom-stage-lead'))add(b.left,b.top,b.width,2);
        const pit=box('.loom-pit-track')[0];if(pit)add(pit.left,pit.top,pit.width,1);
        const dot=box('.loom-pit-now')[0];if(dot)add(dot.left,dot.top,dot.width,dot.height);
        const legs=box('.loom-leg');legs.forEach((b,i)=>{add(b.left,b.top,b.width,1);if(i===legs.length-1)add(b.left,b.bottom-1,b.width,1);});
      }
      for(const l of lines)for(const g of ink){
        const ox=Math.min(l.x+l.w,g.x+g.w)-Math.max(l.x,g.x),oy=Math.min(l.y+l.h,g.y+g.h)-Math.max(l.y,g.y);
        if(ox>.5&&oy>1)return 'ink on line: '+(g.el.getAttribute('class')||g.el.tagName)+' '+g.el.textContent.trim().slice(0,12)}
      return false;
    })()`);
    const key = (key, extra={}) => run(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',${JSON.stringify({key,bubbles:true,...extra})}));true`);
    const call = (name,...args) => run(`window.jeeWeaveAssistantActions(${JSON.stringify({action:'call',name,args})})`);
    const go = async id => { assert.equal(await run(`(()=>{const b=[...document.querySelectorAll('[data-loom-slot] [data-loom-go=${JSON.stringify(id)}]')].find(n=>n.getClientRects().length);if(!b)return false;b.click();return true;})()`),true,'visible navigation entry for '+id); };
    assert.equal(await state(), 'workbench');
    await click('.nav [data-view="settings"]');
    assert.equal(await run('document.querySelector(".desktop-settings-subnav button").textContent'), '骨架');
    await click('[data-desktop-layout="dock"]');
    const previousLayout = disk().data.preferences.layout, before = business(), children = await order();
    await run('window.__originalPages=new Map([...document.querySelectorAll("[data-page]")].map(n=>[n.dataset.page,n]));true');
    assert.equal(await run('(()=>{const s=document.querySelector("#desktop-developer-mode").closest(".desktop-settings-section");return !!s.querySelector("#desktop-load-all-examples")&&!!s.querySelector("#desktop-open-reset")})()'),true,'示例导入与清空数据都收在开发者模式这一段里');
    await click('[data-desktop-skeleton="loom"]');
    assert.equal(await state(),'loom');
    for(const width of [1440,1100,900]) {
      win.setSize(width,900);await sleep(100);
      assert.ok(Math.abs(await run('innerWidth')-width)<=2);
      for(const id of ['overview','today','courses','calendar','plans','notes','objects','web-capture','reminders','plugins','settings']) {
        await go(id);assert.equal(await page(),id);
        if(['overview','today','courses','calendar','plans','notes','objects','web-capture','plugins','settings','reminders'].includes(id)) assert.equal(await run(`(()=>{const o=window.__originalPages.get('${id}');const w=document.querySelector('.loom-content>[data-page="${id}"]');return !!w&&w!==o&&w.classList.contains('loom-independent')&&!o.hasAttribute('hidden')&&getComputedStyle(o).display==='none'&&!!w.querySelector('.loom-today')})()`),true,id+' renders through its independent host, old section hidden in place');
        else assert.equal(await run(`document.querySelector('.loom-content>[data-page="${id}"]')===window.__originalPages.get('${id}')`),true,'same live page node '+id);
        assert.equal(await run('document.documentElement.scrollWidth<=innerWidth+1'),true,`no overflow ${width} ${id}`);
        assert.equal(await inkClash(),false,`no text crosses a loom line ${width} ${id}`);
        assert.equal(await run('document.querySelectorAll(".loom-content>[data-page]:not([hidden])").length'),1);
      }
    }
    await go('assistant');assert.equal(await run('document.querySelector("#desktop-assistant-dialog").open'),true);
    await click('#desktop-assistant-dialog [data-close]');
    assert.equal(await run('document.activeElement.getClientRects().length>0'),true);
    assert.equal(await run('document.querySelectorAll("[data-loom-slot] [data-loom-go=chat-monitor]").length'),0,'暂停开发的群消息不再出现在导航中');
    await key('Escape');
    // Native keyboard path: focus is required by Electron sendInputEvent.
    win.show();win.focus();
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'P',modifiers:['control']});
    win.webContents.sendInputEvent({type:'keyUp',keyCode:'P',modifiers:['control']});await sleep(70);
    assert.equal(await run('document.querySelector("#loom-command-panel").open'),true);
    assert.equal(await run('document.querySelector("#desktop-search-panel").hidden'),true);
    for(const id of ['overview','today','courses','calendar','plans','notes','objects','web-capture','reminders','plugins','settings','assistant']) {
      await run(`document.querySelector('#loom-command-input').value='${id}';document.querySelector('#loom-command-input').dispatchEvent(new Event('input',{bubbles:true}));true`);
      if(id==='assistant') {await click(`.loom-command-results [data-loom-go="${id}"]`);await click('#desktop-assistant-dialog [data-close]');}
      else {await key('Enter');assert.equal(await page(),id);}
      await key('p',{ctrlKey:true});
    }
    await key('Escape');
    // IME Enter must not choose a page.
    await key('p',{ctrlKey:true});await key('Enter',{isComposing:true});assert.equal(await run('document.querySelector("#loom-command-panel").open'),true);await key('Escape');
    // Existing search is the same node, and Escape returns focus to its visible trigger.
    await click('[data-loom-search]');assert.equal(await run('document.querySelector("#desktop-search-panel").hidden'),false);
    await key('Escape');assert.equal(await run('document.activeElement.hasAttribute("data-loom-search")'),true);
    // Both UI switches and public commands refresh navigation, with stale-target guards.
    await go('plugins');
    await run('window.__staleNote=document.querySelector(".loom-index [data-loom-go=notes]");true');
    await click('#desktop-module-notes');
    assert.equal(await run('!!document.querySelector(".loom-index [data-loom-go=notes]")'),false);
    await run('window.__staleNote.disabled=false;document.querySelector(".loom-index").append(window.__staleNote);window.__staleNote.click();true');
    assert.equal(await page(),'plugins');assert.match(await run('document.querySelector(".loom-feedback").textContent'),/已关闭/);
    await click('#desktop-module-notes');assert.equal(await run('!!document.querySelector(".loom-index [data-loom-go=notes]")'),true);
    for(const id of ['reminders','assistant','courses','objects']) {
      await call('plugins.set',id,false);assert.equal(await run(`!!document.querySelector('[data-loom-slot] [data-loom-go="${id}"]')`),false);
      if(id==='assistant')await click('#desktop-module-assistant');else await call('plugins.set',id,true);assert.equal(await run(`!!document.querySelector('[data-loom-slot] [data-loom-go="${id}"]')`),true);
    }
    await go('reminders');await call('plugins.set','reminders',false);assert.equal(await page(),'overview');await call('plugins.set','reminders',true);
    await go('reminders');assert.equal(await run('document.querySelectorAll(".main>[data-page=reminders]").length'),1,'the reminders plugin keeps one page node');assert.equal(await run('document.querySelectorAll(".loom-content>[data-page=reminders]").length'),1);
    await go('courses');await call('plugins.set','courses',false);assert.equal(await page(),'overview');await call('plugins.set','courses',true);
    // Original programmatic page commands continue through host.navigate.
    for(const name of ['settings.open','plugins.open','today.open','calendar.open','overview.open','reminders.open']) {await call(name);assert.equal(await page(),name.split('.')[0]);assert.equal(await run(`!!document.querySelector('.loom-content>[data-page="${name.split('.')[0]}"]')`),true);}
    for(const name of ['courses.settings','courses.import']) {
      await call(name);assert.equal(await page(),'courses');assert.equal(await run('document.querySelector("#desktop-course-dialog").open'),true);
      await run('document.querySelector("#desktop-course-dialog").dispatchEvent(new Event("cancel",{cancelable:true}));true');
    }
    await go('settings');await click('[data-loom-skeleton="workbench"]');
    assert.equal(await state(),'workbench');assert.deepEqual(await order(),children);assert.deepEqual(disk().data.preferences.layout,previousLayout);
    assert.equal(business(),before,'navigation, toggles, and switches do not write business collections');
    await click('[data-desktop-skeleton="loom"]');
    const rename=fs.renameSync;
    try {fs.renameSync=(from,to)=>{if(path.resolve(to)===path.join(dir,'data/workspace.json'))throw Error('隔离测试保存失败');return rename(from,to);};await click('[data-loom-skeleton="workbench"]');assert.equal(await state(),'loom');assert.match(await run('document.querySelector(".loom-feedback").textContent'),/失败/);}finally{fs.renameSync=rename;}
    // 重载后按地址上的 #页名 落页；上面最后去的是设置页。
    await reload();assert.equal(await state(),'loom');assert.equal(await page(),'settings');assert.equal(await run('!!document.querySelector(".loom-content>[data-page=settings]")'),true);
    // Real edits through existing forms, using isolated demo data only.
    await go('settings');await click('#desktop-developer-mode');await click('#desktop-load-all-examples');await go('courses');
    // The all-scope example always carries a course on today's weekday, so this entry works on weekends too.
    await call('today.open');await click('[data-today-adjust]');assert.equal(await page(),'courses');
    assert.equal(await run('!!document.querySelector("dialog[open] #desktop-adjust-form")'),true);
    assert.equal(await run('document.querySelector("#desktop-course-tools-dialog").parentElement===document.querySelector(".main")'),true,'adjust sheet is hosted by the shared main container');
    assert.equal(await run('document.querySelector("#desktop-course-tools-dialog").getClientRects().length>0'),true,'adjust sheet is visible inside the loom page');
    await click('#desktop-adjust-form [data-close-tool]');
    const tables=disk().data.timetables,table=tables.tables.find(t=>t.id===tables.activeId),course=table.courses[0];
    await call('courses.edit',course.id,null,table.id);
    await run('document.querySelector("#desktop-course-editor").elements.title.value="经纬编辑原课程";document.querySelector("#desktop-course-editor").requestSubmit();true');
    assert.equal(disk().data.timetables.tables.find(t=>t.id===table.id).courses.find(c=>c.id===course.id).title,'经纬编辑原课程');
    if(course.createdAt)assert.equal(disk().data.timetables.tables.find(t=>t.id===table.id).courses.find(c=>c.id===course.id).createdAt,course.createdAt);
    const object=await call('objects.save',{title:'经纬关联对象',type:'general'});await call('objects.open',object.id);assert.equal(await page(),'objects');
    await go('web-capture');await click('#desktop-demo-web');const captureRecord=disk().data.webCaptures[0];await call('web-captures.open',{collection:'capture',id:captureRecord.id});assert.equal(await page(),'web-capture');
    await go('courses');await click('#desktop-add-course');
    await run('document.querySelector("#desktop-course-editor").elements.title.value="经纬课程草稿";true');
    await key('p',{ctrlKey:true});assert.equal(await run('document.querySelector("#loom-command-panel").open'),false);
    // 骨架切换只在设置页；有未保存草稿时，公共命令与设置按钮走同一道守卫。
    await assert.rejects(run(`jeeWeaveAssistantActions({action:'call',name:'workspace.skeleton',args:['workbench']})`),/请先保存或关闭当前编辑面板/);assert.equal(await state(),'loom');
    assert.equal(await run('document.querySelector("#desktop-course-editor").elements.title.value'),'经纬课程草稿');
    await run('document.querySelector("#desktop-course-dialog").dispatchEvent(new Event("cancel",{cancelable:true}));true');
    await call('items.edit','task',null);assert.equal(await page(),'plans');
    await run('const f=document.querySelector("#desktop-plan-form");f.elements.title.value="经纬真实事项";f.requestSubmit();true');
    const item=disk().data.tasks.find(t=>t.title==='经纬真实事项');assert.ok(item);
    await call('items.toggle',{collection:'task',id:item.id});assert.equal(disk().data.tasks.find(t=>t.id===item.id).done,true);
    const exported=await call('workspace.export');assert.ok(exported);

    // Repair brief: real same-time items, read-only count, geometry and original actions.
    const day=await run(`(async()=>{const c=await import('../shared/packages/core/src/semester-calendar.mjs');return c.today()})()`);
    for(let i=0;i<3;i++)await call('items.save',{kind:'task',type:'event',title:'经纬同刻事项'+i,date:day,startTime:'10:30',endTime:'11:00',timed:true,note:'只在隔离测试中存在的真实事项，用于核对纸条和批注。'});
    await go('today');await sleep(150);
    const todayModel=await call('today.query',day,'10:30');
    assert.equal(await run('document.querySelectorAll(".loom-slip").length'),todayModel.scheduledItems.length);
    assert.ok(await run('document.querySelectorAll(".loom-warp .loom-tick").length>=24'));
    assert.equal(await run('getComputedStyle(document.querySelector(".loom-today h1")).outlineStyle'),'none');
    assert.equal(await run('!!document.querySelector(".loom-now-dot")&&document.querySelectorAll(".loom-slip-margin").length===document.querySelectorAll(".loom-paper").length'),true);
    for(const width of [1440,1100,900]){
      win.setSize(width,960);await sleep(150);
      assert.equal(await run('getComputedStyle(document.documentElement).getPropertyValue("--warp-x").trim()'),width===900?'56px':'120px');
      assert.equal(await run('(()=>{const rows=[...document.querySelectorAll(".loom-paper")];return rows.every((r,i)=>!i||parseFloat(r.style.top)>=parseFloat(rows[i-1].style.top)+rows[i-1].offsetHeight+10.9)})()'),true);
      assert.equal(await run('document.documentElement.scrollWidth<=innerWidth+1'),true);
      assert.equal(await run('(()=>{const c=document.querySelector(".loom-now-clock").getBoundingClientRect(),p=document.querySelector(".loom-paper").getBoundingClientRect();return c.left>=0&&c.right<p.left})()'),true,'clock stays clear of paper text');
    }
    // K keeps the original search; P only opens page navigation.
    await key('k',{ctrlKey:true});assert.equal(await run('document.querySelector("#desktop-search-panel").hidden'),false);assert.equal(await run('document.querySelector("#loom-command-panel").open'),false);await key('Escape');
    await key('p',{ctrlKey:true});assert.equal(await run('document.querySelector("#loom-command-panel").open'),true);assert.equal(await run('document.querySelector("#desktop-search-panel").hidden'),true);await key('Escape');
    const first=await run('document.querySelector(".loom-slip").dataset.id');
    const renameForItem=fs.renameSync;
    try{fs.renameSync=(from,to)=>{if(path.resolve(to)===path.join(dir,'data/workspace.json'))throw Error('纸条保存失败');return renameForItem(from,to);};await click('.loom-slip .loom-slip-knot');assert.equal([...disk().data.tasks,...disk().data.plans].find(t=>t.id===first).done,false);assert.match(await run('document.querySelector(".loom-feedback").textContent'),/纸条保存失败/);}finally{fs.renameSync=renameForItem;}
    await click('.loom-slip .loom-slip-knot');await sleep(100);assert.equal([...disk().data.tasks,...disk().data.plans].find(t=>t.id===first).done,true);
    assert.equal(await run('document.querySelectorAll(".loom-slip").length'),(await call('today.query',day,'10:30')).scheduledItems.length);
    await sleep(100);await click('.loom-completion-slot .design-retained-completion button');assert.equal([...disk().data.tasks,...disk().data.plans].find(t=>t.id===first).done,false);
    await click('.loom-slip .loom-slip-knot');await sleep(100);assert.equal([...disk().data.tasks,...disk().data.plans].find(t=>t.id===first).done,true);
    // P0 2026-11-07：完成之后给一条撤销带，6 秒内 Ctrl Z 撤回同一次完成。
    await sleep(60);
    assert.equal(await run('document.querySelector(".loom-toast").hidden'),false,'完成后出现撤销条');
    assert.match(await run('document.querySelector(".loom-toast-text").textContent'),/已完成/);
    await key('z',{ctrlKey:true});await sleep(150);
    assert.equal([...disk().data.tasks,...disk().data.plans].find(t=>t.id===first).done,false,'Ctrl Z 撤回刚才的完成');
    assert.equal(await run('document.querySelector(".loom-toast").hidden'),true,'撤销后收起撤销条');
    assert.match(await run('document.querySelector(".loom-feedback").textContent'),/已撤销/);
    // P1 2026-11-08：Alt↑↓ 与拖动都按一刻钟平移同一段执行时间，撤销条放回原时段。
    const { moveStamp } = await import('../item-move.mjs');
    const movableSel = '.loom-warp .loom-paper[data-loom-move]:not([data-loom-move=""])';
    assert.ok(await run(`!!document.querySelector('${movableSel}')`),'今天有时间可挪的纸条');
    const moveId = await run(`document.querySelector('${movableSel}').dataset.id`);
    const itemOf = () => [...disk().data.tasks,...disk().data.plans].find(item=>item.id===moveId);
    const stampOf = item => item.executionSlots?.length ? item.executionSlots[0].start : item.anchor.start;
    const moveBefore = stampOf(itemOf()), movePaper = () => `.loom-warp .loom-paper[data-id="${moveId}"]`;
    await run(`document.querySelector('${movePaper()} [data-loom-paper-action="open"]').focus();true`);
    await key('ArrowDown',{altKey:true});await sleep(200);
    assert.equal(stampOf(itemOf()), moveStamp(moveBefore, 15),'Alt↓ 把时段往后挪一刻钟');
    assert.match(await run('document.querySelector(".loom-toast-text").textContent'),/挪到/, '挪动后给出可撤销的提示');
    assert.equal(await run('document.querySelector(".loom-toast").hidden'),false);
    await key('z',{ctrlKey:true});await sleep(200);
    assert.equal(stampOf(itemOf()), moveBefore,'Ctrl Z 把时段放回原处');
    const ghostOn = await run(`(()=>{
      const li=document.querySelector('${movePaper()}'),y=li.getBoundingClientRect().top+20;
      li.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:7,clientY:y,isPrimary:true}));
      li.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:7,clientY:y+26}));
      const clock=document.querySelector('.loom-drag-ghost.is-on .loom-drag-ghost-time')?.textContent||'';
      li.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:7,clientY:y+26}));
      return clock;
    })()`);
    assert.match(ghostOn,/^\d{2}:\d{2}$/,'拖动时显示落点时刻');
    await sleep(200);
    assert.equal(stampOf(itemOf()), moveStamp(moveBefore, 15),'拖动同样按一刻钟落格');
    await key('z',{ctrlKey:true});await sleep(150);
    assert.equal(stampOf(itemOf()), moveBefore,'拖动也能撤销');
    await click('[data-loom-today-other]');assert.equal(await run('!!document.querySelector("dialog[open] .desktop-today-other")'),true);await click('[data-today-other-close]');
    // P1 2026-11-08：下课后问一次作业。提示条由渲染层生成，这里用真实课次身份核对回答后的写入。
    const askModel=await call('today.query',day,'10:30'),askEntry=(askModel.courses.entries||[])[0];
    const askData={table:askModel.courses.table?.id||'',course:askEntry?.courseId||'',title:askEntry?.title||'示例课程',date:askEntry?.originalDate||day};
    const askKey=askData.table+':'+(askEntry?.occurrenceId||'');
    const injectedKeys=()=>JSON.parse(disk().data.extensions['jiwei-desktop-homework-v1']||'[]');
    const injectHomework=key=>run(`(()=>{
      document.querySelector('.loom-homework')?.remove();
      const card=document.createElement('aside');card.className='loom-homework';
      const data=${JSON.stringify({ key, ...askData })};
      card.setAttribute('data-loom-homework-key',data.key);
      card.setAttribute('data-loom-homework-table',data.table);
      card.setAttribute('data-loom-homework-course',data.course);
      card.setAttribute('data-loom-homework-title',data.title);
      card.setAttribute('data-loom-homework-date',data.date);
      card.innerHTML='<p class="loom-homework-line">刚下课 · <b>'+data.title+'</b></p><span class="loom-homework-acts"><button type="button" data-loom-homework="yes">有，记一项</button><button type="button" data-loom-homework="no">没有</button></span>';
      document.querySelector('.loom-content>[data-page="today"] .loom-day-head').insertAdjacentElement('afterend',card);
      return true;
    })()`);
    await injectHomework(askKey);await click('[data-loom-homework="no"]');await sleep(150);
    assert.equal(injectedKeys().includes(askKey),true,'点“没有”只记住这次问过');
    assert.match(await run('document.querySelector(".loom-feedback").textContent'),/不问作业/);
    assert.equal(await run(`Array.from(document.querySelectorAll('.loom-homework')).some(n=>n.getAttribute('data-loom-homework-key')===${JSON.stringify(askKey)})`),false,'回答后同一次课不再提示；其他刚下课的课可继续提示');
    await injectHomework('iso-homework-yes');await click('[data-loom-homework="yes"]');await sleep(250);
    assert.equal(injectedKeys().includes('iso-homework-yes'),true,'点“有”也记住，避免重复追问');
    assert.equal(await run('document.querySelector("#desktop-plan-dialog").open'),true,'有作业时打开原有事项编辑器');
    await click('#desktop-close-plan');await sleep(100);
    // Wiring repair 2026-11-06: plans keep the real collection, notes open through journal.open, course rows carry their table.
    await call('items.save',{type:'event',title:'经纬计划事项',date:'2099-01-05',timed:false});
    const planRecord=disk().data.plans.find(item=>item.title==='经纬计划事项');assert.ok(planRecord,'plan saved into the plan collection');
    await go('plans');await sleep(150);
    assert.equal(await run('!!document.querySelector(".loom-rows")'),true,'plans page renders rows instead of a read failure');
    assert.equal(await run('(()=>{const o=document.querySelector(\'.main>[data-page="plans"]\');return !!o&&!!o.querySelector(\'#desktop-plan-list\')&&!document.querySelector(\'.loom-content\').contains(o)})()'),true,'old plans section stays out of loom content');
    assert.equal(await run(`(()=>{const w=document.querySelector('.loom-content>[data-page="plans"]');return !!w&&w.classList.contains('loom-independent')&&!!w.querySelector('[data-loom-row-open="${planRecord.id}"]')})()`),true,'plan rows come from the independent host');
    assert.equal(await run(`document.querySelector('[data-loom-row-open="${planRecord.id}"]').dataset.loomOpenCollection`),'plan');
    await click(`[data-loom-row-open="${planRecord.id}"]`);
    assert.equal(await run('document.querySelector("#desktop-plan-dialog").open'),true);
    assert.equal(await run('document.querySelector("#desktop-plan-dialog").parentElement===document.querySelector(".main")'),true,'plan sheet is hosted by the shared main container');
    assert.equal(await run('document.querySelector("#desktop-plan-form-title").textContent'),'编辑事项');
    assert.equal(await run('document.querySelector("#desktop-plan-form").elements.title.value'),'经纬计划事项');
    await click('#desktop-close-plan');
    assert.equal(await run('document.activeElement.getClientRects().length>0&&document.querySelector(".loom-content").contains(document.activeElement)'),true,'closing the plan sheet returns focus into the loom page');
    // Pilot 2026-11-06 (B): notes render through their own loom host; editors still open through public commands.
    await click('#desktop-journal-example');
    await go('notes');await sleep(150);
    assert.equal(await run('!!document.querySelector(".loom-content>.loom-independent .loom-rows [data-loom-row-open]")'),true,'note rows come from the independent host');
    assert.equal(await run('document.querySelectorAll(".loom-content #view-journal").length'),0,'old notes section is never moved into loom content');
    const noteRow=await run('document.querySelector(".loom-content>.loom-independent [data-loom-row-open]").dataset.loomRowOpen');
    await click(`.loom-content>.loom-independent [data-loom-row-open="${noteRow}"]`);
    assert.equal(await run('document.querySelector("#desktop-journal-dialog").open'),true,'journal.open through public command');
    assert.equal(await page(),'notes','opening a note keeps the notes page active');
    assert.equal(await run('document.querySelector("#desktop-journal-editor-title").textContent'),'编辑笔记');
    assert.ok(await run('document.querySelector("#desktop-journal-form").elements.body.value.length>0'));
    await click('#desktop-journal-discard');await click('#desktop-journal-confirm-discard');
    assert.equal(await run('document.querySelector("#desktop-journal-dialog").open'),false,'discard closes the sheet');
    await click('.loom-content>.loom-independent [data-loom-new="note"]');
    assert.equal(await run('document.querySelector("#desktop-journal-dialog").open'),true,'notes.new opens a blank sheet');
    assert.equal(await run('document.querySelector("#desktop-journal-editor-title").textContent'),'记一笔');
    await click('#desktop-journal-discard');await click('#desktop-journal-confirm-discard');
    await win.setSize(1440,960);await go('notes');await sleep(200);await capture('jingwei-notes-pilot-1440');
    // First-use path: no title/object/deadline, a discoverable local draft, and search back to the same entry.
    await click('.loom-content [data-loom-new="note"]');
    await run(`(()=>{const body=document.querySelector('#desktop-journal-form').elements.body;body.value='找老师问第三题';body.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
    await click('[data-journal-close]');
    await go('today');await go('notes');
    assert.match(await run('document.querySelector(".loom-content [data-page=notes]").textContent'),/还有一份草稿/);
    await capture('notes-local-draft-1440');
    win.setSize(900,640);await sleep(150);
    assert.equal(await run('document.documentElement.scrollWidth<=innerWidth+1'),true);
    assert.equal(await run('document.querySelector(".loom-content .loom-note [data-loom-new=note]").getClientRects().length>0'),true);
    await capture('notes-local-draft-900');
    win.setSize(1440,960);
    await click('.loom-content .loom-note [data-loom-new="note"]');
    assert.equal(await run('document.querySelector("#desktop-journal-form").elements.body.value'),'找老师问第三题');
    await reload();await go('notes');
    await click('.loom-content .loom-note [data-loom-new="note"]');
    assert.equal(await run('document.querySelector("#desktop-journal-form").elements.body.value'),'找老师问第三题','draft survives an application reload');
    await run('document.querySelector("#desktop-journal-form").requestSubmit();true');
    const firstNote=disk().data.journal.entries.find(n=>n.body==='找老师问第三题');
    assert.ok(firstNote);assert.equal(firstNote.title,'');assert.ok(!firstNote.objectId);
    await go('today');await key('k',{ctrlKey:true});
    await run(`(()=>{const input=document.querySelector('#desktop-search-input');input.value='第三题';input.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
    await click('[data-search-open]');
    assert.equal(await page(),'notes');
    assert.equal(await run('document.querySelector("#desktop-journal-form").elements.body.value'),'找老师问第三题');
    await run(`(()=>{const f=document.querySelector('#desktop-journal-form');f.elements.body.value='找老师问第三题，带上解题过程';f.elements.body.dispatchEvent(new Event('input',{bubbles:true}));f.requestSubmit();return true})()`);
    const corrected=disk().data.journal.entries.filter(n=>n.id===firstNote.id);
    assert.equal(corrected.length,1);assert.equal(corrected[0].body,'找老师问第三题，带上解题过程');
    await click(`.loom-content [data-loom-row-open="${firstNote.id}"]`);
    await run(`(()=>{const body=document.querySelector('#desktop-journal-form').elements.body;body.value='这是一处误改';body.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
    assert.equal(disk().data.journal.entries.find(n=>n.id===firstNote.id).body,corrected[0].body,'editing a draft must not overwrite the saved note');
    await click('#desktop-journal-discard');
    await click('#desktop-journal-keep-draft');
    assert.equal(await run('document.querySelector("#desktop-journal-form").elements.body.value'),'这是一处误改','cancel discard keeps the current input');
    await click('#desktop-journal-discard');await click('#desktop-journal-confirm-discard');
    await click(`.loom-content [data-loom-row-open="${firstNote.id}"]`);
    assert.equal(await run('document.querySelector("#desktop-journal-form").elements.body.value'),corrected[0].body,'discarding an edit restores the published note without losing its ID');
    await click('#desktop-journal-discard');await click('#desktop-journal-confirm-discard');
    // Objects: same host mechanism, and the sheet closes through its own listener instead of the old page delegation.
    await go('objects');await sleep(150);
    assert.equal(await run('(()=>{const o=document.querySelector(\'.main>[data-page="objects"]\');return !!o&&!document.querySelector(".loom-content").contains(o)})()'),true,'old objects section stays out of loom content');
    await click('.loom-content>.loom-independent [data-loom-new="object"]');
    assert.equal(await run('document.querySelector("#desktop-object-dialog").open'),true,'objects.new opens the shared sheet');
    assert.equal(await run('document.querySelector("#desktop-object-dialog").parentElement===document.querySelector(".main")'),true,'object sheet is hosted by the shared main container');
    assert.equal(await run('document.querySelector("#desktop-object-form").querySelector("h2").textContent'),'新建对象');
    await click('#desktop-object-form [data-object-close]');
    assert.equal(await run('document.querySelector("#desktop-object-dialog").open'),false,'the object sheet closes without the old page delegation');
    const objectRow=await run('document.querySelector(".loom-content>.loom-independent [data-loom-row-open]")?.dataset.loomRowOpen||""');
    assert.ok(objectRow,'the objects page offers openable rows');
    assert.ok(await run('document.querySelector(".loom-content>.loom-independent .loom-row-title").textContent.trim().length>0'),'object rows carry their real titles');
    assert.ok(await run('["课程","项目","主题"].includes(document.querySelector(".loom-content>.loom-independent .loom-row-kind").textContent.trim())'),'object rows show the object type');
    await click(`.loom-content>.loom-independent [data-loom-row-open="${objectRow}"]`);
    assert.equal(await page(),'objects','opening an object keeps the objects page active');
    // 对象行给出的是这张对象的全貌：四组关联就地可读可动，不再只丢一张编辑表，也不画回隐藏的工作台面板。
    assert.equal(await run('document.querySelector("#desktop-object-dialog").open'),true,'the object row opens the object overview through objects.sheet');
    assert.equal(await run('document.querySelector("#desktop-object-detail-sheet").getClientRects().length>0'),true,'the overview sheet is visible inside the loom page');
    const objectTitle = await run(`document.querySelector('[data-loom-row-open="${objectRow}"]').textContent.trim()`);
    assert.equal(await run('document.querySelector("#desktop-object-detail-sheet .desktop-object-heading h2").textContent'),objectTitle,'the overview shows the object whose row was clicked');
    assert.equal(await run('document.querySelectorAll("#desktop-object-detail-sheet .desktop-object-section").length'),4,'the overview keeps all four related groups');
    assert.equal(await run('document.querySelectorAll(".loom-content #desktop-object-detail").length'),0,'the overview is not rendered into the hidden workbench panel');
    const recordsBase = await run('document.querySelectorAll("#desktop-object-detail-sheet .desktop-object-record").length');
    await click('#desktop-object-detail-sheet [data-object-link]');
    assert.equal(await run('document.querySelector("#desktop-object-link-form").getClientRects().length>0'),true,'关联入口在同一个弹层里换成选择表');
    const linkOption = await run('(()=>{const f=document.querySelector("#desktop-object-link-form");f.elements.collection.value="items";f.dispatchEvent(new Event("change",{bubbles:true}));return [...f.elements.record.options].find(o=>o.value!==""&&!o.disabled)?.value||""})()');
    assert.ok(linkOption!=='' ,'示例数据里要有可关联的事项');
    await run(`(()=>{const f=document.querySelector("#desktop-object-link-form");f.elements.record.value=${JSON.stringify(linkOption)};f.requestSubmit();})()`);await sleep(120);
    assert.equal(await run('document.querySelector("#desktop-object-dialog").open'),true,'保存关联后弹层没有整块关掉');
    assert.equal(await run('document.querySelector("#desktop-object-detail-sheet").hidden'),false,'保存关联后回到对象全貌');
    assert.equal(await run('document.querySelectorAll("#desktop-object-detail-sheet .desktop-object-record").length'),recordsBase+1,'新关联立刻出现在全貌里');
    await click('#desktop-object-detail-sheet [data-object-unlink]');await sleep(120);
    assert.equal(await run('document.querySelectorAll("#desktop-object-detail-sheet .desktop-object-record").length'),recordsBase,'解除关联也在全貌里就地生效');
    await click('#desktop-object-detail-sheet [data-object-close]');
    assert.equal(await run('document.querySelector("#desktop-object-dialog").open'),false,'关闭按钮收起整个对象弹层');
    assert.equal(await run('/暂不能|读取失败|不支持从|失败/.test(document.querySelector(".loom-feedback")?.textContent||"")'),false,'objects page reports no wiring error');
    // Rollout 2026-11-07 (B): courses mount their own host, and every sheet now belongs to main, so it is really visible.
    await go('courses');await sleep(150);
    assert.equal(await run('(()=>{const o=document.querySelector(\'.main>[data-page="courses"]\');return !!o&&!document.querySelector(".loom-content").contains(o)})()'),true,'old courses section stays out of loom content');
    assert.ok(await run('(()=>{const b=document.querySelector("[data-loom-open-course]");return b&&b.dataset.loomCourseTable})()'),'course row carries its table id');
    await click('[data-loom-open-course]');
    assert.equal(await run('document.querySelector("#desktop-course-dialog").open'),true);
    assert.equal(await run('document.querySelector("#desktop-course-dialog").parentElement===document.querySelector(".main")'),true,'course sheet is hosted by the shared main container');
    assert.equal(await run('document.querySelector("#desktop-course-dialog").getClientRects().length>0'),true,'course sheet is visible inside the loom page');
    assert.ok(await run('!!document.querySelector("#desktop-course-editor").elements.title.value'));
    await run('document.querySelector("#desktop-course-dialog").dispatchEvent(new Event("cancel",{cancelable:true}));true');
    assert.equal(await run('!document.querySelector("#desktop-course-dialog").contains(document.activeElement)'),true,'closing the course sheet leaves no focus trapped in it');
    await click('.loom-content>.loom-independent [data-loom-new="course"]');
    assert.equal(await run('document.querySelector("#desktop-course-dialog").open'),true,'the loom 添加课程 entry opens the settings sheet');
    assert.equal(await run('document.querySelector("#desktop-course-settings").getClientRects().length>0'),true,'settings sheet is visible instead of a fragment of the hidden page');
    await click('#desktop-open-import');
    assert.equal(await run('document.querySelector("#desktop-course-import").getClientRects().length>0'),true,'import pane is reachable inside the shared sheet');
    await run('document.querySelector("#desktop-course-dialog").dispatchEvent(new Event("cancel",{cancelable:true}));true');
    assert.equal(await run('/暂不能|读取失败|不支持从|失败/.test(document.querySelector(".loom-feedback")?.textContent||"")'),false,'row opens report no wiring error');
    // Rollout 2026-11-07 (B): overview, calendar, settings, plugins and web-capture are loom-native as well.
    await go('overview');await sleep(150);
    assert.match(await run('document.querySelector(".loom-content>[data-page=overview] .loom-day-head h1").textContent'),/总览/);
    assert.equal(await run('document.querySelectorAll(".loom-content>[data-page=overview] .loom-row").length>0'),true,'overview reads the public workspace summary');
    assert.equal(await run('(()=>{const o=document.querySelector(\'.main>[data-page="overview"]\');return !!o&&!document.querySelector(".loom-content").contains(o)})()'),true,'old overview section stays out of loom content');
    await win.setSize(1440,960);await sleep(150);await capture('jingwei-overview-1440');
    await go('calendar');await sleep(150);
    const monthHead=await run('document.querySelector(".loom-content>[data-page=calendar] .loom-omen").textContent');
    assert.match(monthHead,/年/,'calendar names the month it is reading');
    assert.equal(await run('document.querySelectorAll(".loom-content>[data-page=calendar] [data-loom-cal-step]").length'),2);
    assert.equal(await run('document.querySelectorAll(".loom-content>[data-page=calendar] .loom-row").length>0'),true,'calendar lists the real month entries');
    await click('.loom-content>[data-page=calendar] [data-loom-cal-step="1"]');
    assert.notEqual(await run('document.querySelector(".loom-content>[data-page=calendar] .loom-omen").textContent'),monthHead,'next month asks the calendar service again');
    await click('.loom-content>[data-page=calendar] [data-loom-cal-today]');
    assert.equal(await run('document.querySelector(".loom-content>[data-page=calendar] .loom-omen").textContent'),monthHead,'回到本月 restores the current month');
    // 月 / 周 / 日共用同一条线：换视图只重画，步进按钮跟着换单位，仍回到原事项。
    await click('.loom-content>[data-page=calendar] [data-loom-cal-view="week"]');await sleep(150);
    assert.equal(await run('document.querySelector(".loom-content>[data-page=calendar] [data-loom-cal-view=week]").getAttribute("aria-pressed")'),'true');
    assert.equal(/年/.test(await run('document.querySelector(".loom-content>[data-page=calendar] .loom-omen").textContent')),false,'周视图读七日区间，不再报月份');
    assert.equal(await run('document.querySelectorAll(".loom-content>[data-page=calendar] [data-loom-cal-step]").length'),2);
    assert.match(await run('document.querySelector(\'.loom-content>[data-page=calendar] [data-loom-cal-step="1"]\').textContent'),/下周/,'步进按钮跟着视图换单位');
    await click('.loom-content>[data-page=calendar] [data-loom-cal-view="day"]');await sleep(150);
    assert.match(await run('document.querySelector(".loom-content>[data-page=calendar] .loom-omen").textContent'),/条安排/,'日视图同样报当天条数');
    await click('.loom-content>[data-page=calendar] [data-loom-cal-view="month"]');await sleep(150);
    assert.equal(await run('document.querySelector(".loom-content>[data-page=calendar] .loom-omen").textContent'),monthHead,'切回月视图仍是本月');
    await capture('jingwei-calendar-1440');
    assert.equal(await run('!!document.querySelector(".loom-content>[data-page=calendar] [data-loom-row-open]")'),true,'calendar entries open their original record');
    await click('.loom-content>[data-page=calendar] [data-loom-row-open]');
    assert.equal(await run('document.querySelector("#desktop-plan-dialog").open'),true,'calendar row opens through items.edit');
    await click('#desktop-close-plan');
    await go('settings');await sleep(150);
    const routeObject=await call('objects.save',{title:'高数路径验证',type:'course'});
    await call('objects.open',routeObject.id);
    assert.equal(await run('document.querySelector("#desktop-object-dialog").open'),true,'objects.open presents the visible loom overview');
    await click('#desktop-object-detail-sheet [data-object-add-item]');
    const futureDay=new Date(Date.parse(day+'T12:00:00Z')+7*86400000).toISOString().slice(0,10);
    const dueDay=new Date(Date.parse(futureDay+'T12:00:00Z')+86400000).toISOString().slice(0,10);
    await run(`(()=>{const f=document.querySelector('#desktop-plan-form');f.elements.title.value='高数作业路径验证';f.elements.date.value='${dueDay}';return true})()`);
    await click('#desktop-add-slot');
    await run(`(()=>{const f=document.querySelector('#desktop-plan-form'),r=f.querySelector('.desktop-slot-row');for(const [k,v] of Object.entries({startDate:'${futureDay}',endDate:'${futureDay}',startTime:'19:00',endTime:'20:00'}))r.querySelector('[data-slot-field='+k+']').value=v;f.requestSubmit();return true})()`);
    const routeItem=disk().data.tasks.find(n=>n.title==='高数作业路径验证');assert.ok(routeItem);
    const originalRouteAnchor=JSON.stringify(routeItem.anchor),routeSlotId=routeItem.executionSlots[0].id;
    await go('objects');await click(`.loom-content [data-loom-row-open="${routeObject.id}"]`);
    await run(`(()=>{const row=[...document.querySelectorAll('#desktop-object-detail-sheet .desktop-object-record')].find(n=>n.querySelector('h4')?.textContent==='高数作业路径验证');row.querySelector('[data-object-record]').click();return true})()`);
    assert.equal(await run('document.querySelector("#desktop-plan-form").elements.title.value'),'高数作业路径验证');
    await click('#desktop-item-open-object');
    assert.equal(await run('document.querySelector("#desktop-object-dialog").open'),true,'item owner button returns to the visible object overview');
    assert.equal(await run('document.querySelector("#desktop-object-detail-sheet .desktop-object-heading h2").textContent'),'高数路径验证');
    await click('#desktop-object-detail-sheet [data-object-close]');await go('calendar');
    await click('[data-loom-cal-view="week"]');await click('[data-loom-cal-step="1"]');
    const selectedWeek=await run('document.querySelector(".loom-content [data-page=calendar] .loom-omen").textContent');
    await run('document.querySelector(".loom-surface").scrollTop=0;true');
    const weekScroll=await run('document.querySelector(".loom-surface").scrollTop');
    await click(`.loom-content [data-page=calendar] [data-loom-row-open="${routeItem.id}"]`);
    assert.equal(await page(),'calendar','editing an existing calendar item preserves the calendar page');
    await run(`(()=>{const r=document.querySelector('#desktop-plan-form .desktop-slot-row');r.querySelector('[data-slot-field=startTime]').value='20:00';r.querySelector('[data-slot-field=endTime]').value='21:00';document.querySelector('#desktop-plan-form').requestSubmit();return true})()`);
    let updatedRouteItem=disk().data.tasks.find(n=>n.id===routeItem.id);
    assert.equal(JSON.stringify(updatedRouteItem.anchor),originalRouteAnchor,'moving execution time preserves the deadline');
    assert.equal(updatedRouteItem.executionSlots[0].id,routeSlotId);assert.match(updatedRouteItem.executionSlots[0].start,/T20:00/);
    assert.equal(await page(),'calendar');
    await sleep(120);
    assert.ok(Math.abs(await run('document.querySelector(".loom-surface").scrollTop')-weekScroll)<=1,'save feedback preserves calendar scroll position');
    assert.equal(await run('document.querySelector(".loom-content [data-page=calendar] .loom-omen").textContent'),selectedWeek,'save returns to the same future week');
    await sleep(4700);assert.equal(await run('document.querySelector(".loom-feedback").textContent'),'','success feedback clears from loom as well as workbench');
    assert.ok(Math.abs(await run('document.querySelector(".loom-surface").scrollTop')-weekScroll)<=1,'clearing feedback preserves scroll');
    await click(`.loom-content [data-page=calendar] [data-loom-row-open="${routeItem.id}"]`);
    const slotContent = item => JSON.stringify(item.executionSlots.map(({updatedAt,...slot})=>slot));
    const savedSlots=slotContent(updatedRouteItem);
    await run(`document.querySelector('#desktop-plan-form').elements.date.value='${futureDay}';document.querySelector('#desktop-plan-form').requestSubmit();true`);
    updatedRouteItem=disk().data.tasks.find(n=>n.id===routeItem.id);
    assert.equal(slotContent(updatedRouteItem),savedSlots,'changing the deadline preserves execution slots');
    assert.equal(updatedRouteItem.anchor.date,futureDay);
    assert.equal(disk().data.objectView.links.find(link=>link.ref.collection==='task'&&link.ref.id===routeItem.id).objectId,routeObject.id,'rescheduling preserves the original object assignment');
    await click(`.loom-content [data-page=calendar] [data-loom-row-open="${routeItem.id}"]`);
    await run('document.querySelector("#desktop-plan-form").elements.title.value="未提交的改名";true');await click('#desktop-cancel-plan');
    assert.equal(disk().data.tasks.find(n=>n.id===routeItem.id).title,routeItem.title,'cancel does not save form edits');
    assert.equal(await page(),'calendar');assert.equal((await run('document.querySelector(".loom-content [data-page=calendar] .loom-omen").textContent')).split(' · ')[0],selectedWeek.split(' · ')[0]);
    await capture('object-week-route-1440');
    await call('objects.open',routeObject.id);
    assert.equal(await run('document.querySelector("#desktop-object-detail-sheet .desktop-object-more").open'),false,'object management is disclosed on demand');
    await click('#desktop-object-detail-sheet .desktop-object-more summary');await click('#desktop-object-detail-sheet [data-object-edit]');await click('#desktop-object-form [data-object-close]');
    assert.equal(await run('document.querySelector("#desktop-object-dialog").open&&!document.querySelector("#desktop-object-detail-sheet").hidden'),true,'cancel from management returns to the open overview');
    assert.equal(await run('document.querySelectorAll("#desktop-object-detail-sheet .desktop-object-views [data-object-calendar]").length'),3,'time views remain directly available');
    await capture('object-views-overview-1440');win.setSize(900,640);await capture('object-views-overview-900');win.setSize(1440,960);await click('#desktop-object-detail-sheet [data-object-calendar="week"]');
    assert.equal(await page(),'calendar');
    assert.match(await run('document.querySelector(".loom-content [data-page=calendar]").textContent'),/只看：高数路径验证/);
    assert.equal(await run(`[].every.call(document.querySelectorAll('.loom-content [data-page=calendar] [data-loom-row-open]'),n=>n.dataset.loomRowOpen===${JSON.stringify(routeItem.id)})`),true,'object scope excludes unrelated record identities');
    for(const view of ['day','month','week']){await click(`[data-loom-cal-view="${view}"]`);assert.match(await run('document.querySelector(".loom-content [data-page=calendar]").textContent'),/只看：高数路径验证/);}
    await capture('object-calendar-scoped-1440');
    win.setSize(900,640);await sleep(100);assert.equal(await run('document.documentElement.scrollWidth<=innerWidth+1'),true);
    const compactReview=await run(`(()=>{const surface=document.querySelector('.loom-surface');surface.scrollTop=0;const header=document.querySelector('.loom-content>[data-page=calendar] .loom-day-head'),rail=[...document.querySelectorAll('[data-loom-slot=rail-right]')].find(n=>n.getClientRects().length),row=document.querySelector('.loom-content>[data-page=calendar] [data-loom-row-open]');return {headerHeight:header.getBoundingClientRect().height,railHeight:rail.getBoundingClientRect().height,firstRecordTop:row.getBoundingClientRect().top,viewportBottom:surface.getBoundingClientRect().bottom}})()`);
    assert.ok(compactReview.headerHeight<=120&&compactReview.railHeight<=80,'compact chrome and calendar controls: '+JSON.stringify(compactReview));
    assert.ok(compactReview.firstRecordTop<compactReview.viewportBottom-24,'first scoped record reaches the initial viewport: '+JSON.stringify(compactReview));
    assert.equal(await run(`(()=>{const bands=[...document.querySelectorAll('[data-loom-slot-layout=jingwei][data-loom-slot=rail-right] [data-loom-band]')].filter(n=>n.getClientRects().length);return bands.every((b,i)=>!i||bands[i-1].getBoundingClientRect().right<=b.getBoundingClientRect().left)})()`),true,'compact navigation bands never overlap');
    console.log('Compact visual review:',JSON.stringify(compactReview));await capture('object-calendar-scoped-900');win.setSize(1440,960);
    await call('plugins.set','objects',false);await sleep(120);
    assert.match(await run('document.querySelector(".loom-content [data-page=calendar]").textContent'),/对象筛选暂不可用/);
    await click('[data-loom-cal-clear]');assert.equal(await run('document.querySelector("[data-loom-cal-clear]")'),null);
    await call('plugins.set','objects',true);
    const scopeTable=await call('courses.current');
    const scopeCourse=await call('courses.saveCourse',{title:'对象课表入口验证',weekday:1,periodStart:1,periodEnd:1,weeksText:'1'}, {expected:JSON.stringify(scopeTable)});
    await call('objects.assign',routeObject.id,{collection:'courseEntry',containerId:scopeTable.id,id:scopeCourse.id});
    await call('objects.open',routeObject.id);await click('#desktop-object-detail-sheet [data-object-course-table]');
    assert.equal(await page(),'courses');assert.equal(disk().data.timetables.activeId,scopeTable.id);
    await go('calendar');
    await click('[data-loom-cal-view="month"]');await click('[data-loom-cal-today]');await go('settings');
    assert.equal(await run('(()=>{const b=document.querySelector(\'.loom-content>[data-page="settings"] [data-loom-skeleton="loom"]\');return !!b&&b.getAttribute("aria-pressed")==="true"})()'),true,'settings shows the active skeleton without duplicating the workbench panel');
    assert.equal(await run('document.querySelectorAll(".loom-content>[data-page=settings] [data-loom-theme]").length>0'),true);
    assert.equal(await run('document.querySelectorAll(".loom-content>[data-page=settings] [data-loom-action]").length'),4,'developer mode puts 示例导入 and 清空数据 into the loom settings page');
    assert.equal(await run('document.querySelector(".loom-content>[data-page=settings] [data-loom-skeleton=workbench]").getAttribute("aria-pressed")'),'false');
    await click('.loom-content>[data-page=settings] [data-loom-theme=paper]');
    assert.equal(await run('document.querySelector(".loom-content>[data-page=settings] [data-loom-theme=paper]").getAttribute("aria-pressed")'),'true','loom swatches drive the real theme preference');
    assert.equal(await run('document.querySelector("button[data-theme=paper]").getAttribute("aria-pressed")'),'true');
    await click('.loom-content>[data-page=settings] [data-loom-action=export]');await sleep(300);
    assert.match(await run('document.querySelector(".loom-feedback").textContent'),/已导出/,'loom export action reports the written package');
    assert.match(await run('document.querySelector(".loom-content>[data-page=settings] [data-loom-developer]").textContent'),/已开启/);
    await click('.loom-content>[data-page=settings] [data-loom-developer]');
    assert.match(await run('document.querySelector(".loom-content>[data-page=settings] [data-loom-developer]").textContent'),/已关闭/);
    assert.equal(await run('document.querySelector("#desktop-developer-mode").checked'),false,'the loom switch drives the real setting');
    assert.equal(await run('document.querySelectorAll(".loom-content>[data-page=settings] [data-loom-action]").length'),2,'关闭开发者模式后示例导入与清空数据一起消失');
    assert.equal(await run('[...document.querySelectorAll(".loom-content>[data-page=settings] .loom-group-title")].some(n=>n.textContent.includes("开发者"))'),false,'the developer group disappears instead of staying disabled');
    await click('.loom-content>[data-page=settings] [data-loom-developer]');
    assert.equal(await run('document.querySelector("#desktop-developer-mode").checked'),true);
    await click('.loom-content>[data-page=settings] [data-loom-action=examples]');await sleep(500);
    assert.match(await run('document.querySelector(".loom-feedback").textContent'),/示例已导入/,'loom imports examples through the same developer command as the workbench');
    const examplesAfter = business();   // 本轮前面删过示例记录，这一次会把缺的补回来，属于正常补齐
    await click('.loom-content>[data-page=settings] [data-loom-action=examples]');await sleep(500);
    assert.equal(business(),examplesAfter,'示例齐全时重复导入不重写任何业务记录');
    await click('.loom-content>[data-page=settings] [data-loom-action=reset]');
    assert.equal(await run('document.querySelector("#desktop-reset-dialog").open'),true,'loom opens the shared reset sheet');
    assert.equal(await run('document.querySelector("#desktop-reset-dialog").parentElement===document.querySelector(".main")'),true,'the reset sheet is not trapped inside the hidden workbench panel');
    assert.equal(await run('document.querySelector("#desktop-reset-dialog").getClientRects().length>0'),true,'the reset sheet actually renders in loom');
    assert.equal(await run('document.querySelector("#desktop-confirm-reset").disabled'),true,'清空数据 still needs the explicit ack');
    await click('#desktop-reset-dialog [data-reset-close]');
    assert.equal(await run('document.querySelector("#desktop-reset-dialog").open'),false,'closing the sheet clears nothing');
    await go('plugins');await sleep(150);
    assert.equal(await run('document.querySelectorAll(".loom-content>[data-page=plugins] [data-loom-module]").length>0'),true,'plugins page exposes module switches');
    assert.equal(await run('document.querySelector(".loom-content>[data-page=plugins] [data-loom-module=reminders]").dataset.loomModuleOn'),'false');
    await click('.loom-content>[data-page=plugins] [data-loom-module=reminders]');
    assert.equal(await run('document.querySelector(".loom-content>[data-page=plugins] .loom-row[data-loom-row=reminders] .loom-row-kind").textContent.trim()'),'已关闭');
    assert.equal(await run('!!document.querySelector(".loom-index [data-loom-go=reminders]")'),false,'closing a module removes its navigation entry');
    await click('.loom-content>[data-page=plugins] [data-loom-module=reminders]');
    assert.equal(await run('!!document.querySelector(".loom-index [data-loom-go=reminders]")'),true,'reopening restores the entry');
    await capture('jingwei-plugins-1440');
    await go('web-capture');await sleep(150);
    assert.equal(await run('!!document.querySelector(".loom-content>[data-page=web-capture] [data-loom-collect]")'),true,'loom web-capture owns the collect form');
    assert.equal(await run('document.querySelectorAll(".loom-content>[data-page=web-capture] [data-loom-capture-select]").length>0'),true,'captured records are listed');
    assert.equal(await run('!!document.querySelector(".loom-content>[data-page=web-capture] .loom-capture-detail")'),true,'the selected record opens its details');
    assert.equal(await run('!!document.querySelector(".loom-content>[data-page=web-capture] [data-loom-approve-draft]")'),true,'pending drafts offer approval');
    const tasksBeforeApprove=disk().data.tasks.length;
    await click('.loom-content>[data-page=web-capture] [data-loom-approve-draft]');
    await sleep(120);
    assert.equal(disk().data.tasks.length,tasksBeforeApprove+1,'approving a draft adds exactly one item');
    assert.match(await run('document.querySelector(".loom-feedback").textContent'),/已加入事项/);
    assert.match(await run('document.querySelector(".loom-content>[data-page=web-capture]").textContent'),/已加入事项/);
    await capture('jingwei-web-capture-1440');
    // Rollout 2026-11-07 (B): reminders is the last page; its records come from an asynchronous service.
    await go('reminders');await sleep(500);
    assert.match(await run('document.querySelector(".loom-content>[data-page=reminders] .loom-day-head h1").textContent'),/提醒/);
    assert.equal(await run('(()=>{const o=document.querySelector(\'.main>[data-page="reminders"]\');return !!o&&!document.querySelector(".loom-content").contains(o)&&getComputedStyle(o).display==="none"})()'),true,'old reminders section stays out of loom content');
    assert.equal(await run('document.querySelectorAll(".loom-content>[data-page=reminders] .panel").length'),0,'the reminders page shows no workbench panel boxes');
    assert.equal(await run('document.querySelector(".loom-content>[data-page=reminders]").textContent.includes("正在读取")'),false,'reminder rows resolve from the async service');
    assert.equal(await run('!!document.querySelector(".loom-content>[data-page=reminders] [data-loom-reminder-new]")'),true);
    await click('.loom-content>[data-page=reminders] [data-loom-reminder-new]');
    assert.equal(await run('document.querySelector("#desktop-reminder-dialog").open'),true,'reminders.new opens the shared sheet');
    assert.equal(await run('document.querySelector("#desktop-reminder-dialog").parentElement===document.body'),true,'the reminder sheet keeps its own host');
    await click('#desktop-reminder-dialog [data-reminder-close]');
    assert.equal(await run('document.querySelector("#desktop-reminder-dialog").open'),false);
    await capture('jingwei-reminders-1440');
    const quietDate=new Date(Date.now()+86400000).toLocaleDateString('sv-SE');
    const quiet=(await call('reminders.add',{title:'独立改期验证',mode:'silent',date:quietDate})).row;
    const beforeReminderEdit=JSON.stringify(disk().data.tasks.find(n=>n.id===routeItem.id));
    await sleep(150);await click(`[data-loom-reminder-edit="${quiet.id}"]`);
    for(let i=0;i<50&&!await run('document.querySelector("#desktop-reminder-dialog").open');i++)await sleep(30);
    assert.equal(await run('document.querySelector("#desktop-reminder-dialog h2").textContent'),'编辑提醒');
    await capture('reminder-edit-form-1440');win.setSize(900,640);await capture('reminder-edit-form-900');win.setSize(1440,960);
    await run(`(()=>{const f=document.querySelector('[data-reminder-form]');f.elements.title.value='独立提醒已改期';f.elements.date.value=${JSON.stringify(new Date(Date.now()+2*86400000).toLocaleDateString('sv-SE'))};f.requestSubmit();return true})()`);
    for(let i=0;i<100&&await run('document.querySelector("#desktop-reminder-dialog").open');i++)await sleep(30);
    assert.equal(await run('document.querySelector("#desktop-reminder-dialog").open'),false);
    assert.equal((await call('reminders.list')).rows.find(r=>r.id===quiet.id).title,'独立提醒已改期');
    assert.equal(JSON.stringify(disk().data.tasks.find(n=>n.id===routeItem.id)),beforeReminderEdit,'reminder editing never rewrites item deadline or execution slots');
    await capture('reminder-independent-edit-1440');
    await call('reminders.cancel',quiet.id);
    await call('plugins.set','reminders',false);
    assert.equal(await run(`(async()=>{
      const {installReminderUI}=await import('./reminder-ui.mjs');let release;
      const row={id:'isolated-delay',title:'原提醒',mode:'silent',date:${JSON.stringify(new Date(Date.now()+86400000).toLocaleDateString('sv-SE'))},daily:false,archived:false};
      const ui=installReminderUI({todayPanel:document.createElement('section'),bridge:{assistant:async(action)=>action==='reminders-list'?{ok:true,rows:[row]}:new Promise(resolve=>{release=()=>resolve({ok:true,row});})}});
      try{
        await ui.open(row.id);const dialog=document.querySelector('#desktop-reminder-dialog'),f=dialog.querySelector('form');f.elements.title.value='前一次修改';f.requestSubmit();
        if(!release)throw Error('Expected delayed write');dialog.querySelector('[data-reminder-close]').click();await new Promise(resolve=>setTimeout(resolve,30));
        await ui.open(row.id);f.elements.title.value='新编辑器里的输入';release();await new Promise(resolve=>setTimeout(resolve,30));
        return dialog.open&&f.elements.title.value==='新编辑器里的输入';
      }finally{ui.dispose();}
    })()`),true,'late write results never close or overwrite the reopened editor');
    await call('plugins.set','reminders',true);
    // P0 2026-11-07：键盘地图、命令面板里的插件命令、裸数字与方括号轮巡、#page 路由。
    await go('overview');await sleep(150);
    await key('?');
    assert.equal(await run('document.querySelector("#loom-keys-panel").open'),true,'? 随时打开键盘地图');
    assert.match(await run('document.querySelector("#loom-keys-panel").textContent'),/Ctrl P[\s\S]*Ctrl Z/);
    await click('#loom-keys-panel [data-keys-close]');
    assert.equal(await run('document.querySelector("#loom-keys-panel").open'),false);
    await key('p',{ctrlKey:true});
    assert.equal(await run('document.querySelector(".loom-command-results button").hasAttribute("data-loom-go")'),true,'页面仍排在命令前面');
    assert.ok(await run('document.querySelectorAll(".loom-command-results [data-loom-run]").length>0'),'命令面板列出可直接执行的插件命令');
    await run(`document.querySelector('#loom-command-input').value='新建对象';document.querySelector('#loom-command-input').dispatchEvent(new Event('input',{bubbles:true}));true`);
    assert.equal(await run('document.querySelectorAll(".loom-command-results [data-loom-run]").length'),1,'中文命令名可直接检索');
    assert.match(await run('document.querySelector("[data-command-status]").textContent'),/条命令/);
    await click('.loom-command-results [data-loom-run="objects.new"]');
    assert.equal(await run('document.querySelector("#desktop-object-dialog").open'),true,'命令面板直接执行原命令');
    await click('#desktop-object-form [data-object-close]');
    assert.equal(await run('document.querySelector("#loom-command-panel").open'),false);
    await key('2');await sleep(150);
    assert.equal(await page(),'today','裸数字直达第二个页面');
    assert.equal(await run('location.hash'),'#today','打开页面时把页名写进地址');
    await key(']');await sleep(180);
    assert.equal(await page(),'courses','] 轮巡到下一页');
    assert.equal(await run('location.hash'),'#'+await page());
    await key('[');await sleep(180);
    assert.equal(await page(),'today','[ 轮巡回上一页');
    await run('history.replaceState(null,"","#plans");true');await reload();await sleep(200);
    assert.equal(await page(),'plans','重载后按 # 地址回到同一页');
    assert.equal(await state(),'loom');
    await go('settings');assert.equal(await run('document.querySelector("[data-skeleton-section=loom]").parentElement.querySelector("h2").textContent'),'骨架');assert.equal(await run('document.querySelectorAll("[data-loom-layout-choice]:disabled").length'),0);
    await click('button[data-theme=studio-linen]');
    for(const [time,title] of [['14:00','给导师回信'],['15:30','组会 · 讨论方案'],['17:00','跑步与复盘']])await call('items.save',{type:'event',title,date:day,startTime:time,endTime:time==='14:00'?'14:15':time==='15:30'?'16:30':'17:40',timed:true,note:'来自真实服务的隔离示例，用于核对纸条版式。'});
    await go('today');win.setSize(1440,960);await sleep(150);await click('[data-loom-now]');assert.equal(await run('document.querySelector("#loom-surface").scrollTop>0&&document.querySelector(".main").scrollTop===0'),true);win.webContents.sendInputEvent({type:'mouseMove',x:4,y:80});await capture('jingwei-repaired-today-1440');
    // Reference is isolated and read-only; close it before cleanup.
    if(process.env.JEEWEAVE_TEST_NO_CAPTURE!=='1') {
    const reference=new BrowserWindow({width:1440,height:960,show:false,webPreferences:{offscreen:true,backgroundThrottling:false,contextIsolation:true,sandbox:true,partition:'loom-design-reference'}});
    await reference.loadFile(path.resolve(__dirname,'../design-lab/jingwei.html'));await sleep(1400);
    fs.writeFileSync(path.join(dir,'jingwei-reference-1440.png'),(await reference.webContents.capturePage()).toPNG());reference.destroy();
    require('node:child_process').execFileSync('python',['-c',"from PIL import Image,ImageDraw; import sys; from pathlib import Path; p=Path(sys.argv[1]); a=Image.open(p/'jingwei-repaired-today-1440.png').convert('RGB'); b=Image.open(p/'jingwei-reference-1440.png').convert('RGB'); a.thumbnail((720,480)); b.thumbnail((720,480)); c=Image.new('RGB',(1464,520),'white'); c.paste(a,(8,32)); c.paste(b,(736,32)); d=ImageDraw.Draw(c); d.text((8,8),'Current desktop - real service data',fill='black'); d.text((736,8),'Design reference - static demo',fill='black'); c.save(p/'jingwei-comparison.png')",dir],{windowsHide:true});
    }
    await go('courses');await capture('jingwei-courses-900');

    win.setSize(1440,960);await go('today');await capture('jingwei-today-1440');await go('objects');await capture('jingwei-objects-1440');
    // 织法切换收在设置页：切换后回对象页看摆位，页头不再保留快捷按钮。
    assert.equal(await run('document.documentElement.dataset.loomLayout'),'jingwei');
    await capture('jingwei-navigation-1440');
    await go('settings');await capture('jingwei-settings-1440');
    assert.equal(await run('document.querySelector(".loom-content>[data-page=settings] [data-loom-layout-choice=jingwei]").getAttribute("aria-pressed")'),'true');
    for(const id of ['ripple','atlas','stage']){
      await click(`.loom-content>[data-page=settings] [data-loom-layout-choice=${id}]`);await sleep(200);
      assert.equal(await run('document.documentElement.dataset.loomLayout'),id,'设置在设置页切换织法');
      await go('objects');await capture(id+'-navigation-1440');await go('settings');
    }
    await click('.loom-content>[data-page=settings] [data-loom-layout-choice=jingwei]');await sleep(200);
    assert.equal(await run('document.documentElement.dataset.loomLayout'),'jingwei');
    assert.equal(await run('document.querySelector(".loom-content>[data-page=settings] [data-loom-skeleton=loom]").getClientRects().length>0'),true,'loom settings show their own skeleton choices instead of a hidden workbench panel');
    await capture('jingwei-layout-settings-1440');
    await key('p',{ctrlKey:true});await capture('jingwei-command-1440');await key('Escape');
    await win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await go('today');assert.equal(await run('document.querySelector("#desktop-design-particles")?getComputedStyle(document.querySelector("#desktop-design-particles")).display:"none"'),'none');assert.equal(await run('getComputedStyle(document.querySelector(".loom-now-dot"),"::after").display'),'none');win.webContents.debugger.detach();
    for(let i=0;i<30;i++){await call(i%2?'today.open':'calendar.open');}
    assert.equal(await run('new Set([...document.querySelectorAll("[id]")].map(n=>n.id)).size===document.querySelectorAll("[id]").length'),true);
    // 四套经纬布局：只显示当前布局的导航条带，12 页每套都能到，开关实时跟随插件。
    const bandSet = { jingwei:'loom-scales,loom-index', ripple:'loom-strip,loom-depths', atlas:'loom-layers,loom-legend', stage:'loom-lights,loom-queue,loom-curtain' };
    const layoutNow = () => run('document.documentElement.dataset.loomLayout');
    const shownBands = () => run('[...document.querySelectorAll(".loom-chrome [data-loom-band]")].filter(n=>n.getClientRects().length).map(n=>n.dataset.loomBand).join(",")');
    const bandGo = id => run(`(()=>{const b=[...document.querySelectorAll('.loom-chrome [data-loom-band]')].filter(n=>n.getClientRects().length).flatMap(n=>[...n.querySelectorAll('[data-loom-go]')]).find(x=>x.dataset.loomGo===${JSON.stringify(id)}&&x.getClientRects().length);if(!b)return false;if(b.disabled)return 'disabled';b.click();return true;})()`);
    const paletteGo = async id => { await click('[data-loom-command]');await run(`document.querySelector('#loom-command-input').value=${JSON.stringify(id)};document.querySelector('#loom-command-input').dispatchEvent(new Event('input',{bubbles:true}));true`);await click(`.loom-command-results [data-loom-go="${id}"]`); };
    const rgbColor = hex => `rgb(${[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)).join(', ')})`;
    // 四套装的默认颜料，逐条来自 design-lab 的小样；ink-3/warn 那几条被 solveColor 补过，不在这里断言。
    const materialOf = {
      jingwei:{canvas:'#f2efe7',panel:'#fbf9f4',accent:'#2b5a63',ink:'#1a1712',thread:'#3a4c86',scheme:'light',blend:'multiply',haloSize:'100% 100%'},
      ripple:{canvas:'#eef2f4',panel:'#f7fafb',accent:'#2f6b8c',ink:'#12212a',thread:'#3a5a86',scheme:'light',blend:'multiply',haloSize:'100% 100%'},
      atlas:{canvas:'#f4f0e6',panel:'#faf7ef',accent:'#4a5a3f',ink:'#2a2419',thread:'#3a4c86',scheme:'light',blend:'multiply',haloSize:'96px 96px'},
      stage:{canvas:'#0e0d13',panel:'#17151f',accent:'#b8956a',ink:'#ece8f2',thread:'#93a4d6',scheme:'dark',blend:'screen',haloSize:'100% 100%'},
    };
    const paint = () => run(`(()=>{const s=getComputedStyle(document.documentElement),t=k=>s.getPropertyValue(k).trim(),gr=document.querySelector('.shell>.main');
      return {canvas:t('--canvas'),panel:t('--panel'),elev:t('--elev'),line:t('--line'),accent:t('--accent'),ink:t('--ink-1'),ink3:t('--ink-3'),thread:t('--t-indigo'),soft:t('--accent-soft'),rule:t('--rule'),scheme:s.colorScheme,bg:getComputedStyle(gr).backgroundColor,blend:getComputedStyle(gr,'::after').mixBlendMode,wash:getComputedStyle(gr,'::before').backgroundImage,size:getComputedStyle(gr,'::before').backgroundSize};})()`);
    await go('settings');await sleep(150);
    for(const [name,bands] of Object.entries(bandSet)) {
      await click(`.loom-content>[data-page=settings] [data-loom-layout-choice=${name}]`);await sleep(150);
      assert.equal(await layoutNow(),name,name+' 成为当前经纬布局');
      assert.equal(await shownBands(),bands,name+' 只显示自己的导航条带');
      // 群消息暂停，其他 12 页在每套布局中各列一次。
      assert.equal(await run(`(()=>{const links=[...document.querySelectorAll('.loom-chrome [data-loom-band]')].filter(n=>n.getClientRects().length).flatMap(n=>[...n.querySelectorAll('[data-loom-go]')]).map(b=>b.dataset.loomGo);return links.length===12&&new Set(links).size===12&&!links.includes('chat-monitor')})()`),true,name+' 的条带把 12 页各列一次');
      assert.equal(await run(`document.querySelector('.loom-content>[data-page=settings] [data-loom-layout-choice="${name}"]').getAttribute('aria-pressed')`),'true',name+' 在设置页标为已选');
      // 换布局等于换材质：纸面、文字、强调色、毛线第一支、纸纹混合与底纹都整组换过去，不留上一套的残色。
      const material = materialOf[name], nowPaint = await paint();
      for(const key of ['canvas','panel','accent','ink','thread']) assert.equal(nowPaint[key],material[key],`${name} 的 ${key} 用这一套装的颜料`);
      assert.equal(nowPaint.bg,rgbColor(material.canvas),name+' 的纸面真的刷上了这组底色');
      assert.equal(nowPaint.scheme,material.scheme,name+' 的原生控件与滚动条按材质');
      assert.equal(nowPaint.blend,material.blend,name+' 的纸纹混合模式按材质');
      // 底纹可以叠几层（水光两道、图纸纵横两遍），但每一层都按这套材质自己的比例，不许有一层退回满幅拉伸。
      assert.equal([...new Set(nowPaint.size.split(',').map(v=>v.trim()))].join('|'),material.haloSize,name+' 的底纹按自己的比例铺');
      assert.notEqual(nowPaint.wash,'none',name+' 有自己那层底纹');
      assert.notEqual(nowPaint.soft,nowPaint.canvas,name+' 的强调底色不能和纸面同色');
      assert.notEqual(nowPaint.rule,nowPaint.line,name+' 的粗线与细线不是一档');
      for(const id of ['today','courses','plans','notes','objects','web-capture','reminders','calendar','overview','settings']) {
        const viaBand = await bandGo(id);
        assert.notEqual(viaBand,'disabled',name+' 的常驻导航不会点到已关闭的 '+id);
        if(viaBand!==true) await paletteGo(id);
        assert.equal(await page(),id,name+(viaBand===true?' 常驻导航':' 命令面板')+'可以到 '+id);
      }
      const assistantViaBand = await bandGo('assistant');
      if(assistantViaBand!==true) await paletteGo('assistant');
      assert.equal(await run('document.querySelector("#desktop-assistant-dialog").open'),true,name+' 可以打开全局助手');
      await click('#desktop-assistant-dialog [data-close]');
      if(name!=='jingwei') {
        await call('plugins.set','notes',false);
        assert.equal(await run(`[...document.querySelectorAll('.loom-chrome [data-loom-band]')].filter(n=>n.getClientRects().length).some(n=>!!n.querySelector('[data-loom-go="notes"]'))`),false,name+' 关掉笔记插件后条带里不再有它');
        await call('plugins.set','notes',true);
        assert.equal(await bandGo('notes'),true,name+' 重新开启后条带恢复该入口');
      }
      // 每一套布局的今天用自己的摆位，点开仍是公共命令打开的原记录。
      if(await bandGo('today')!==true) await paletteGo('today');await sleep(200);
      const signature = { jingwei:'.loom-warp', atlas:'.loom-atlas-route', ripple:'.loom-ripple-rows', stage:'.loom-stage-lead' }[name];
      assert.equal(await run(`!!document.querySelector('.loom-content>[data-page=today] ${signature}')`),true,name+' 的今天用自己的摆位');
      if(name!=='jingwei') {
        assert.ok(await run(`document.querySelectorAll('.loom-content>[data-page=today] [data-loom-paper-action="open"]').length`),name+' 的今天有可打开的记录');
        await click('.loom-content>[data-page=today] [data-loom-paper-action="open"]');
        assert.equal(await run('!!document.querySelector("#desktop-plan-dialog[open],#desktop-course-dialog[open]")'),true,name+' 条目点击走公共命令');
        await run('document.querySelectorAll("dialog[open]").forEach(element=>element.close());true');await sleep(120);
      }
      // 夜场的换幕、幕线、灯位与台上动作：都只改这一套呈现，动作仍交回公共命令。
      if(name==='stage') {
        // 上一条里点开的记录可能把活动页带走，换幕检查必须重新回到今天再看这幕。
        if(await bandGo('today')!==true) await paletteGo('today');await sleep(220);
        assert.equal(await run(`document.querySelectorAll('.loom-content>[data-page=today] .loom-pit-time').length`),7,'夜场的幕线给出 06:00–24:00 的刻度');
        assert.equal(await run(`!!document.querySelector('.loom-content>[data-page=today] .loom-pit-now')`),true,'幕线上标出此刻');
        assert.match(await run(`document.querySelector('.loom-content>[data-page=today] .loom-day-stats').textContent`),/第 \d+ 场/,'页头报本场是第几场');
        const leadTitle = () => run(`document.querySelector('.loom-content>[data-page=today] .loom-stage-title').textContent.trim()`);
        const cueRows = await run(`[...document.querySelectorAll('.loom-content>[data-page=today] [data-loom-stage-cue]')].map(n=>({id:n.dataset.loomStageCue,title:n.textContent.trim()}))`);
        assert.ok(cueRows.length>0,'候场给出可以请上台的行');
        await click(`[data-loom-stage-cue="${cueRows[0].id}"]`);await sleep(240);
        assert.equal(await leadTitle(),cueRows[0].title,'点候场就把那件事请上台');
        assert.equal(await run(`!!document.querySelector('[data-loom-stage-cue="${cueRows[0].id}"]')`),false,'上了台的那件不再留在候场');
        await key('ArrowDown');await sleep(240);
        assert.notEqual(await leadTitle(),cueRows[0].title,'↓ 换到下一幕');
        await key('ArrowUp');await sleep(240);
        assert.equal(await leadTitle(),cueRows[0].title,'↑ 换回上一幕');
        const lightNow = () => run('document.documentElement.getAttribute("data-loom-light")||""');
        const lightBefore = await lightNow();
        await click('.loom-content>[data-page=today] [data-loom-stage-light]');await sleep(220);
        assert.notEqual(await lightNow(),lightBefore,'灯位按钮改的是根节点上的光');
        assert.equal(await run(`document.querySelector('.loom-content>[data-page=today] [data-loom-stage-light]').getAttribute('aria-pressed')`),'true','灯位按钮说明当前是暖光');
        await click('.loom-content>[data-page=today] [data-loom-stage-light]');await sleep(220);
        assert.equal(await lightNow(),lightBefore,'再点一次回到原来的灯位');
        const stageObject = await run(`document.querySelector('.loom-content>[data-page=today] [data-loom-stage-object]')?.dataset.loomStageObject||""`);
        if(stageObject) {
          await click(`[data-loom-stage-object="${stageObject}"]`);await sleep(220);
          assert.equal(await run('document.querySelector("#desktop-object-detail-sheet").getClientRects().length>0'),true,'台上的「看对象」打开对象全貌');
          await click('#desktop-object-detail-sheet [data-object-close]');await sleep(160);
        }
      }
      // 舆图的图廓、左缘标尺、地块脚注与路线摘要：数与文字都来自真实记录，标尺只是方位装饰。
      if(name==='atlas') {
        if(await bandGo('today')!==true) await paletteGo('today');await sleep(220);
        assert.match(await run(`document.querySelector('.loom-content>[data-page=today] .loom-atlas-cartouche h1').textContent`),/今天的路线/,'舆图的今天以图廓题名');
        assert.equal(await run(`!!document.querySelector('.loom-content>[data-page=today] .loom-atlas-cartouche em')`),true,'图廓题名里有一个强调字');
        assert.equal(await run(`document.querySelectorAll('.loom-content>[data-page=today] .loom-atlas-stats span').length`),3,'图廓报三个数');
        assert.equal(await run(`document.querySelector('.loom-atlas-gauge').getClientRects().length>0`),true,'舆图左缘画指北与标尺');
        await click('.loom-content>[data-page=today] [data-loom-scale]');await sleep(140);
        assert.match(await run('document.querySelector(".loom-feedback").textContent'),/比例/,'比例尺讲的是怎么读，不是报错');
        if(await bandGo('objects')!==true) await paletteGo('objects');await sleep(260);
        assert.equal(await run(`!!document.querySelector('.loom-content>[data-page=objects] .loom-atlas-cartouche')`),true,'地块页也挂图廓');
        assert.equal(await run(`!!document.querySelector('.loom-content>[data-page=objects] .loom-band-title')`),true,'地块下面接一段今天的路线摘要');
        assert.equal(await run(`document.querySelectorAll('.loom-content>[data-page=objects] .loom-atlas-annot').length`),await run(`document.querySelectorAll('.loom-content>[data-page=objects] [data-loom-row-open]').length`),'每块地都留一行脚注');
        assert.equal(await run(`[...document.querySelectorAll('.loom-content>[data-page=objects] .loom-atlas-annot')].every(n=>/完成标准：|还没有写完成标准/.test(n.textContent))`),true,'脚注补完成标准，不重复面上已有的数');
        await click('.loom-content>[data-page=objects] [data-loom-paper-action="open"]');
        assert.equal(await run('!!document.querySelector("#desktop-plan-dialog[open],#desktop-course-dialog[open]")'),true,'摘要里的条目仍打开原记录');
        await run('document.querySelectorAll("dialog[open]").forEach(element=>element.close());true');await sleep(160);
        if(await bandGo('plans')!==true) await paletteGo('plans');await sleep(220);
        assert.equal(await run(`!!document.querySelector('.loom-content>[data-page=plans] .loom-atlas-cartouche')`),true,'界标页也挂图廓');
      } else {
        assert.equal(await run('document.querySelector(".loom-atlas-gauge").getClientRects().length'),0,name+' 不画舆图的标尺');
      }
      // 涟漪把今天读成三段流水，右缘那道潮汐只在涟漪下画。
      if(name==='ripple') {
        if(await bandGo('today')!==true) await paletteGo('today');await sleep(220);
        assert.equal(await run(`document.querySelector('.loom-ripple-tide').getClientRects().length>0`),true,'涟漪右缘画潮汐');
        assert.match(await run(`document.querySelector('.loom-content>[data-page=today] .loom-rp-note').textContent`),/今天落到水面 \d+ 条/,'尺度说明用真实条数');
        const rippleGroups = await run(`[...document.querySelectorAll('.loom-content>[data-page=today] .loom-rp-title')].map(n=>n.textContent)`);
        assert.ok(rippleGroups.length>1,'今天按远近分成几段流水');
        assert.equal(rippleGroups.every(text=>/已经流过去|此刻附近|稍晚|还没落形/.test(text)),true,'分段名字说清离此刻多远：'+rippleGroups.join('/'));
        assert.equal(await run(`[...document.querySelectorAll('.loom-content>[data-page=today] .loom-ripple-rows')].reduce((n,ol)=>n+ol.children.length,0)`),await run(`document.querySelectorAll('.loom-content>[data-page=today] [data-loom-paper-action="open"]').length`),'分段之后每条石子都还在，没有重复也没有丢');
      } else {
        assert.equal(await run('document.querySelector(".loom-ripple-tide").getClientRects().length'),0,name+' 不画涟漪的潮汐');
      }
      // 页面级摆位：涟漪把本周读成水道、事项/笔记/对象读成水纹行；舆图把事项立成界标、对象铺成地块。
      const pageSignature = {
        ripple: [['courses','.loom-ripple-week'],['plans','.loom-rp-rows'],['notes','.loom-rp-rows'],['objects','.loom-rp-rows']],
        atlas: [['plans','.loom-marks'],['objects','.loom-atlas-fields']],
        jingwei: [['objects','.loom-rows']],
        stage: [['objects','.loom-rows']]
      }[name] || [];
      for(const [id,sel] of pageSignature) {
        if(await bandGo(id)!==true) await paletteGo(id);await sleep(200);
        assert.equal(await run(`!!document.querySelector('.loom-content>[data-page=${id}] ${sel}')`),true,name+' 的 '+id+' 用自己的摆位');
        if(id==='objects'&&name==='atlas') assert.equal(await run(`document.querySelectorAll('.loom-content>[data-page=objects] [data-loom-row-open]').length>0`),true,'地块仍按对象身份打开');
        if(await run(`!!document.querySelector('.loom-content>[data-page=${id}] [data-loom-open-course],.loom-content>[data-page=${id}] [data-loom-row-open]')`)) {
          await click(`.loom-content>[data-page=${id}] [data-loom-open-course],.loom-content>[data-page=${id}] [data-loom-row-open]`);
          assert.equal(await run('!!document.querySelector("dialog[open]")'),true,name+' 的 '+id+' 行仍走公共命令打开原记录');
          await run('document.querySelectorAll("dialog[open]").forEach(element=>element.close());true');await sleep(150);
        }
        assert.equal(await inkClash(),false,name+' 的 '+id+' 字不落在线上');
      }
      for(const width of [1440,900]) { win.setSize(width,960);await sleep(120);assert.equal(await run('document.documentElement.scrollWidth<=innerWidth+1'),true,`${name} ${width} 不横溢`);assert.equal(await inkClash(),false,`${name} ${width} 字不落在线上`); }
      if(await bandGo('settings')!==true) await paletteGo('settings');await sleep(120);
    }
    await click('.loom-content>[data-page=settings] [data-loom-layout-choice=atlas]');await sleep(150);
    await reload();assert.equal(await state(),'loom');assert.equal(await layoutNow(),'atlas','重载后仍是经纬 · 舆图');
    await paletteGo('settings');await click('.loom-content>[data-page=settings] [data-loom-layout-choice=jingwei]');await sleep(150);
    assert.equal(await layoutNow(),'jingwei');
    win.setSize(1440,960);await sleep(120);
    await go('settings');await click('[data-loom-skeleton="workbench"]');assert.deepEqual(await order(),children);
    // Old course surface remains the positioning boundary, independently of the modal's shared DOM owner.
    for(const width of [1440,900]) {
      win.setSize(width,width===900?640:960);await sleep(150);
      await click('.nav [data-view="courses"]');await click('#desktop-add-course');
      assert.equal(await run(`(()=>{const d=document.querySelector('#desktop-course-dialog').getBoundingClientRect(),s=document.querySelector('.desktop-timetable-panel').getBoundingClientRect();return d.left>=s.left&&d.right<=s.right+1&&d.top>=Math.max(0,s.top)&&d.bottom<=Math.min(innerHeight,s.bottom)+1})()`),true,'course sheet fits visible timetable at '+width);
      await capture('course-sheet-bounds-'+width);
      await key('Escape');
      assert.equal(await run('document.querySelector("#desktop-course-dialog").open'),false);
      assert.equal(await run('document.activeElement.id'),'desktop-add-course');
    }
    await call('objects.open',routeObject.id);
    await click('.main>[data-page="objects"] [data-object-calendar="month"]');
    assert.equal(await page(),'calendar');
    assert.match(await run('document.querySelector("[data-cal-clear-object]").parentElement.textContent'),/高数路径验证/,'workbench uses the same scoped calendar query');
    await click('[data-cal-view="day"]');await click('[data-cal-view="week"]');
    assert.equal(await run('document.querySelector("[data-cal-clear-object]").getClientRects().length>0'),true,'workbench retains scope across views');
    await click('[data-cal-clear-object]');
    assert.equal(await run('document.querySelector("[data-cal-clear-object]")'),null);
    assert.deepEqual(errors,[]);
    const summary=path.resolve(__dirname,'../.cache/verification');fs.mkdirSync(summary,{recursive:true});
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
    fs.writeFileSync(path.join(summary, 'skeleton-switch-' + date.replaceAll('-', '') + '.json'), JSON.stringify({ date, status: 'passed', checks: ['independent skeleton pages and return to workbench', 'local note draft survives navigation and reload', 'search returns to the same note; correction preserves ID', 'course sheet fits timetable at 1440 and 900; Escape restores focus', 'object overview to item and back; same owner', 'calendar editing keeps future week and scroll; deadline and slots change independently; cancel does not write', 'object-scoped day/week/month query and clear work in both skeletons; closed source stays explicit', 'reminder edits retain ID and leave items unchanged; delayed results preserve reopened input'], boundary: 'Isolated fixtures; no real reminders, external model, packaging or mobile validation.' }, null, 2));
    console.log('PASS skeleton today repair. Review screenshots: '+dir);if(process.env.JEEWEAVE_TEST_NO_CAPTURE!=='1')await sleep(55000);app.exit(0);
  })().catch(error=>{console.error(error);app.exit(1);});
}
