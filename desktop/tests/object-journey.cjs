// Run with node. Own the Electron lifetime and remove the isolated test data on success/failure.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=path.resolve(__dirname,'../.cache/test-runs');
if(!process.versions.electron){
  const {spawn}=require('node:child_process');
  fs.mkdirSync(base,{recursive:true});const run=fs.mkdtempSync(path.join(base,'object-journey-'));
  if(path.dirname(run)!==base)throw Error('Unsafe test directory');
  (async()=>{
    let code=1,child;const timer=setTimeout(()=>child?.kill(),90000);
    try{
      child=spawn(require('electron'),[__filename],{stdio:'inherit',windowsHide:true,env:{...process.env,JEEWEAVE_DIAGNOSTICS_TEST:run,JEEWEAVE_DATA_DIR:path.join(run,'data'),JEEWEAVE_DESKTOP_PROTOTYPE:'1'}});
      code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',n=>resolve(n??1));});
    }finally{clearTimeout(timer);fs.rmSync(run,{recursive:true,force:true,maxRetries:20,retryDelay:150});console.log('Object journey test data removed.');}
    process.exitCode=code;
  })().catch(error=>{console.error(error);process.exitCode=1;});
}else{
  const {app,BrowserWindow}=require('electron'),output=path.resolve(process.env.JEEWEAVE_DIAGNOSTICS_TEST||'');
  if(path.dirname(output)!==base||!path.basename(output).startsWith('object-journey-'))throw Error('Use node desktop/tests/object-journey.cjs');
  app.disableHardwareAcceleration();
  app.on('browser-window-created',(_event,win)=>{win.setSkipTaskbar(true);win.__diagnosticHide=()=>win.hide();win.on('show',win.__diagnosticHide);});
  require('../main.cjs');
  const wait=()=>new Promise(r=>setTimeout(r,70));
  (async()=>{
    await app.whenReady();let win;
    for(let i=0;i<150;i++){win=BrowserWindow.getAllWindows().find(w=>!w.isDestroyed());if(win&&await win.webContents.executeJavaScript('Boolean(document.querySelector("#desktop-module-reminders"))').catch(()=>false))break;await wait();}
    assert.ok(win);const errors=[];win.webContents.on('console-message',event=>{if(event.level==='error'){errors.push(event.message);console.error('renderer:',event.message);}});
    const run=code=>win.webContents.executeJavaScript(code).catch(error=>{throw Error(error.message+'; step: '+code.slice(0,600));}),click=selector=>run('document.querySelector('+JSON.stringify(selector)+').click();true');

    const disk=()=>JSON.parse(fs.readFileSync(path.join(output,'data/workspace.json'),'utf8'));
    const {today,mondayOf}=await import('../../shared/packages/core/src/semester-calendar.mjs');
    const day=today(),addDays=(date,n)=>new Date(Date.parse(date+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
    const fill=(selector,fields)=>run('(()=>{const f=document.querySelector('+JSON.stringify(selector)+');for(const[k,v]of Object.entries('+JSON.stringify(fields)+')){f.elements[k].value=v;}f.requestSubmit();return true;})()');
    await click('.nav [data-view="courses"]');await click('#desktop-add-course');
    await fill('#desktop-course-editor',{title:'篮球课',teacher:'测试教师',location:'体育馆',weeksText:'1-16'});
    assert.equal(disk().data.timetables.tables.flatMap(t=>t.courses).length,1,'course created through UI');
    await click('.nav [data-view="objects"]');await click('#desktop-new-object');
    await fill('#desktop-object-form',{title:'提高身体素质',type:'general',purpose:'将每周篮球课和训练记录放在一起'});
    const object=disk().data.objectView.objects[0];assert.ok(object);
    await click('[data-object-link]');await run('document.querySelector("#desktop-object-link-form").requestSubmit();true');
    assert.equal(disk().data.objectView.links.length,1,'course reference kept');
    await click('[data-object-add-item]');await click('#desktop-add-slot');
    await fill('#desktop-plan-form',{title:'练习投篮并整理动作',date:day,note:'训练后回看动作'});
    const item=disk().data.tasks[0];assert.ok(item);assert.equal(item.executionSlots.length,1);
    assert.equal(disk().data.objectView.links.find(l=>l.ref.id===item.id).objectId,object.id);
    await click('.nav [data-view="objects"]');await click('[data-object-add-note]');
    assert.ok(await run('document.querySelector("#desktop-journal-object-context").textContent.includes("提高身体素质")'));
    await run('document.querySelector("#desktop-journal-form").elements.body.value="今天练习时发现出手不够稳定，下次先练习站姿。";document.querySelector("#desktop-journal-form").elements.body.dispatchEvent(new Event("input",{bubbles:true}));true');
    assert.equal(disk().data.journal.draft.pendingObjectId,object.id);
    await click('#desktop-journal-form [data-journal-close]');await click('.nav [data-view="objects"]');await click('[data-object-add-note]');
    assert.equal(await run('document.querySelector("#desktop-journal-form").elements.body.value'),'今天练习时发现出手不够稳定，下次先练习站姿。');
    const before=JSON.stringify(disk().data),rename=fs.renameSync;
    try{
      fs.renameSync=(from,to)=>{if(path.resolve(to)===path.resolve(output,'data/workspace.json'))throw Error('isolated note save failure');return rename(from,to);};
      await run('document.querySelector("#desktop-journal-form").requestSubmit();true');
      assert.equal(JSON.stringify(disk().data),before,'failed publish keeps draft and references');
      assert.ok(await run('!document.querySelector("#desktop-journal-error").hidden'));
    }finally{fs.renameSync=rename;}
    await run('document.querySelector("#desktop-journal-form").requestSubmit();true');
    const note=disk().data.journal.entries[0];assert.ok(note);assert.equal(disk().data.journal.draft,null);
    assert.equal(disk().data.objectView.links.find(l=>l.ref.id===note.id).objectId,object.id);
    await click('.nav [data-view="objects"]');
    assert.ok(await run('document.querySelector("#desktop-object-detail").textContent.includes("今天练习时发现出手不够稳定")'));
    await click('.nav [data-view="today"]');
    const card='[data-today-item="'+item.id+'"]';await click(card+' summary');
    assert.equal(await run('document.querySelector('+JSON.stringify(card+' [data-today-item-complete]')+').getClientRects().length>0'),true);
    await click(card+' [data-today-item-complete]');
    assert.equal(disk().data.tasks.find(t=>t.id===item.id).done,true);
    assert.equal(await run('Boolean(document.querySelector('+JSON.stringify(card)+'))'),false);
    await click('.nav [data-view="objects"]');
    assert.ok(await run('document.querySelector("#desktop-object-detail").textContent.includes("已完成")'));
    assert.equal(disk().data.tasks.length,1);assert.equal(disk().data.objectView.links.length,3);

    await click('[data-object-record="0"]');assert.equal(await run('document.querySelector("#desktop-course-editor").elements.title.value'),'篮球课');
    await click('#desktop-course-open-object');assert.equal(await run('document.querySelector("#desktop-object-detail h2").textContent'),object.title);
    await click('[data-object-record="2"]');assert.equal(await run('document.querySelector("#desktop-journal-form").elements.body.value'),note.body);
    await click('#desktop-journal-discard');await click('#desktop-journal-confirm-discard');
    // Complete the rescheduled occurrence, not the calendar day of execution.
    await click('.nav [data-view="objects"]');await click('[data-object-add-item]');
    const original=addDays(day,-7),weekday=new Date(day+'T12:00:00Z').getUTCDay()||7;
    await run('(()=>{const f=document.querySelector("#desktop-plan-form");f.elements.type.value="weekly";f.elements.type.dispatchEvent(new Event("change",{bubbles:true}));f.elements.date.value='+JSON.stringify(original)+';for(const c of f.querySelectorAll("[name=weekdays]"))c.checked=Number(c.value)==='+weekday+';return true;})()');
    await click('#desktop-add-slot');
    await run('document.querySelector("#desktop-slot-rows [data-slot-field=occurrenceDate]").value='+JSON.stringify(original)+';true');
    await fill('#desktop-plan-form',{title:'每周训练',until:addDays(day,30)});
    const repeat=[...disk().data.tasks,...disk().data.plans].find(row=>row.title==='每周训练');assert.ok(repeat);
    await click('.nav [data-view="today"]');const repeatCard='[data-today-item="'+repeat.id+'"]';await click(repeatCard+' summary');
    assert.equal(await run('document.querySelector('+JSON.stringify(repeatCard)+').querySelectorAll("[data-today-item-complete]").length'),2);
    await click(repeatCard+' [data-completion-date="'+original+'"]');
    const completedRepeat=[...disk().data.tasks,...disk().data.plans].find(row=>row.id===repeat.id);
    assert.deepEqual(completedRepeat.completedDates,[original]);assert.equal(completedRepeat.done,false);
    assert.equal(await run('document.querySelector('+JSON.stringify(repeatCard)+').querySelectorAll("[data-today-item-complete]").length'),1);

    // An unrelated existing draft must never become this object's note.
    await click('.nav [data-view="notes"]');await click('#desktop-journal-new');
    await run('document.querySelector("#desktop-journal-form").elements.body.value="独立草稿不能被重新归属";document.querySelector("#desktop-journal-form").elements.body.dispatchEvent(new Event("input",{bubbles:true}));true');
    await click('#desktop-journal-form [data-journal-close]');await click('.nav [data-view="objects"]');await click('[data-object-add-note]');
    assert.equal(disk().data.journal.draft.pendingObjectId,undefined);
    assert.equal(await run('document.querySelector("#desktop-journal-form").elements.body.value'),'独立草稿不能被重新归属');
    await click('#desktop-journal-discard');await click('#desktop-journal-confirm-discard');
    // Plugin availability controls the entry; reopening does not duplicate it.
    await click('.nav [data-view="plugins"]');await click('#desktop-module-notes');
    await click('.nav [data-view="objects"]');assert.equal(await run('document.querySelector("[data-object-add-note]").disabled'),true);
    await click('.nav [data-view="plugins"]');await click('#desktop-module-notes');await click('.nav [data-view="objects"]');
    assert.equal(await run('document.querySelectorAll("[data-object-add-note]").length'),1);
    const capture=async(name,width,height)=>{
      win.removeListener('show',win.__diagnosticHide);win.setSize(width,height);win.setTitle('几微 · 隔离对象流程验证');win.showInactive();await new Promise(r=>setTimeout(r,250));
      for(let i=0;i<3;i++){try{fs.writeFileSync(path.join(output,name),(await win.webContents.capturePage()).toPNG());break;}catch(error){if(i===2)throw error;await wait();}}
      assert.equal(await run('document.querySelector(".main").scrollWidth<=document.querySelector(".main").clientWidth+1'),true);win.hide();
    };

    await click('.nav [data-view="courses"]');await click('#desktop-open-course-settings');await click('#desktop-tab-semester');
    const monday=mondayOf(day),termStart=addDays(monday,-14);
    await fill('#desktop-semester-form',{startDate:termStart,totalWeeks:'20'});await click('#desktop-close-course-settings');
    const course=disk().data.timetables.tables.flatMap(table=>table.courses)[0];
    const openWeek=async week=>{await click('.nav [data-view="courses"]');await run('document.querySelector("#desktop-course-week").value='+JSON.stringify(String(week))+';document.querySelector("#desktop-course-week").dispatchEvent(new Event("change"));true');await click('#desktop-timetable-scroll [data-course-id="'+course.id+'"]');};
    const addCourseWork=async(week,title,date,slot)=>{
      await openWeek(week);await click('#desktop-course-add-work');
      await run('document.querySelector("#desktop-plan-form").elements.type.value="deadline";document.querySelector("#desktop-plan-form").elements.type.dispatchEvent(new Event("change",{bubbles:true}));true');
      if(slot)await click('#desktop-add-slot');await fill('#desktop-plan-form',{title,date});
    };
    await addCourseWork(3,'本次训练要点',addDays(day,5),false);
    await addCourseWork(2,'上次课的投篮练习与动作复盘，保留完整标题和原课次',addDays(day,3),true);
    const previous=disk().data.tasks.find(row=>row.title.startsWith('上次课的投篮练习'));
    assert.equal(previous.courseOrigin.originalDate,addDays(monday,-7));
    const courseTasks=disk().data.tasks.filter(row=>row.courseOrigin?.courseId===course.id);
    assert.equal(courseTasks.length,2);assert.ok(courseTasks.every(row=>disk().data.objectView.links.some(link=>link.ref.id===row.id&&link.objectId===object.id)));
    await openWeek(3);
    assert.ok(await run('document.querySelector("#desktop-course-work-list").textContent.includes("本次训练要点")'));
    assert.equal(await run('document.querySelector("#desktop-course-other-work").open'),false);
    assert.ok(await run('document.querySelector("#desktop-course-other-work summary").textContent.includes("1 项")'));
    const snapshot=JSON.stringify(disk().data);await click('#desktop-course-other-work summary');
    assert.equal(JSON.stringify(disk().data),snapshot,'expanding course history does not write');
    assert.ok(await run('document.querySelector("#desktop-course-other-work-list").textContent.includes('+JSON.stringify(addDays(monday,-7))+')'));
    assert.ok(await run('document.querySelector("#desktop-course-other-work-list").textContent.includes("19:00")'));
    await run('document.querySelector(".desktop-class-work").scrollIntoView({block:"center",behavior:"instant"});true');
    await capture('course-work-wide.png',1280,900);await capture('course-work-compact.png',900,740);
    if(process.env.JEEWEAVE_DIAGNOSTIC_REVIEW==='1'){console.log('Course work visual batch: '+output);await new Promise(r=>setTimeout(r,45000));}
    await click('#desktop-course-other-work-list [data-class-work]');
    assert.equal(await run('document.querySelector("#desktop-plan-form").elements.title.value'),previous.title);
    await fill('#desktop-plan-form',{date:addDays(day,6)});assert.equal(disk().data.tasks.filter(row=>row.id===previous.id).length,1);
    assert.equal(disk().data.tasks.find(row=>row.id===previous.id).courseOrigin.originalDate,previous.courseOrigin.originalDate);
    await openWeek(3);await click('#desktop-course-other-work summary');
    assert.ok(await run('document.querySelector("#desktop-course-other-work-list").textContent.includes('+JSON.stringify(addDays(day,6))+')'));
    await click('#desktop-course-other-work-list [data-class-work]');await click('#desktop-item-open-course');
    assert.ok(await run('document.querySelector("#desktop-course-work-date").textContent.includes('+JSON.stringify(previous.courseOrigin.originalDate)+')'));
    assert.ok(await run('document.querySelector("#desktop-course-work-list").textContent.includes('+JSON.stringify(previous.title)+')'));
    await click('#desktop-close-editor');await click('.nav [data-view="today"]');
    const previousCard='[data-today-item="'+previous.id+'"]';await click(previousCard+' summary');await click(previousCard+' [data-today-item-complete]');
    await openWeek(3);assert.equal(await run('document.querySelector("#desktop-course-other-work").hidden'),true);
    await click('#desktop-close-editor');
    console.log('Course work flow passed: original lesson groups, collapsed pending history, deadline/slot text, read-only expand, edit same record, original lesson return and completion removal.');
    assert.deepEqual(errors,[]);
    console.log('Object journey UI/real IPC passed: course link, timed item, linked note draft/retry/publish, today completion, unchanged identities, unrelated draft and plugin switch.');
    app.exit(0);
  })().catch(error=>{console.error(error);app.exit(1);});
}
