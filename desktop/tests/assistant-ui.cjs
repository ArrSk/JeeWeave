const {app,BrowserWindow,dialog,nativeImage}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=process.env.JEEWEAVE_DATA_DIR;
if(!root||!path.basename(root).startsWith('assistant-check-'))throw Error('Isolated test root required');
app.disableHardwareAcceleration();
let main,fitnessRefs,pendingRequest=false,requestAborted=false;
const originalFetch=global.fetch;
global.fetch=async(url,options)=>{
  if(String(url)!=='https://api.deepseek.com/chat/completions')return originalFetch(url,options);
  const body=JSON.parse(options.body);assert.equal(body.max_tokens,2048);
  if(body.messages[1].content==='挂起请求用于插件停用检查'){
    pendingRequest=true;
    return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>{requestAborted=true;reject(new DOMException('aborted','AbortError'));},{once:true}));
  }

  if(body.messages[1].content==='创建新的提高身体素质对象，关联所有篮球课与锻炼笔记，拟在事项中加入每周锻炼计划'){
    assert.ok(fitnessRefs);
    return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({steps:[
      {action:'objects.save',fields:{title:'提高身体素质',type:'topic',purpose:'持续锻炼'}},
      {action:'objects.assign',parameters:{objectId:'@0.id',ref:fitnessRefs.course}},
      {action:'objects.assign',args:['@0.id',fitnessRefs.note]},
      {action:'items.save',fields:{title:'每周锻炼计划',type:'weekly'},options:{objectId:'@0.id'}}
    ]})}}],usage:{total_tokens:200}}));
  }

  return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({
    action:'draft',title:'为线性代数建立课程对象并关联作业',assumptions:['当前未找到课程对象，建议新建；截止时间暂按明天18:00。'],steps:[
      {action:'call',name:'objects.save',title:'新建线性代数课程对象',args:[{title:'线性代数',type:'course',purpose:'集中管理上课安排与作业'}]},
      {action:'call',name:'items.save',title:'关联线性代数作业',args:[{title:'线性代数作业',type:'deadline',date:'2026-11-01',startTime:'18:00'},{objectId:'@0.id'}]}
    ]
  })}}],usage:{total_tokens:220}}));
};
const timer=setTimeout(()=>{console.error('Assistant UI timeout');app.exit(1);},60000);
app.on('browser-window-created',(_,win)=>{if(main)return;main=win;win.webContents.once('did-finish-load',async()=>{
  const run=code=>win.webContents.executeJavaScript(code),click=s=>run('document.querySelector('+JSON.stringify(s)+').click();true'),wait=()=>new Promise(r=>setTimeout(r,160));
  try{
    for(let i=0;i<100;i++){if(await run('Boolean(document.querySelector("#desktop-assistant-open"))'))break;await wait();}
    await click('#desktop-assistant-open');await wait();
    assert.equal(await run('document.querySelector("#desktop-assistant-dialog").open'),true);
    assert.equal(await run('document.querySelector("#desktop-assistant-dialog [data-config-form]")'),null);
    assert.ok(await run('Boolean(document.querySelector("#desktop-ai-settings [data-config-form]"))'));
    assert.ok(await run('Boolean(document.querySelector("#desktop-reminders-open"))'));
    const file=path.join(root,'assistant-panel.png');fs.writeFileSync(file,(await win.webContents.capturePage()).toPNG());
    for(const width of [950,1280]){win.setSize(width,820);await wait();assert.ok(await run('(()=>{const d=document.querySelector("#desktop-assistant-dialog"),r=d.getBoundingClientRect();return d.scrollWidth<=d.clientWidth+1&&r.right<=innerWidth&&r.left>=0;})()'),'Assistant fits desktop viewport');}
    const settings={textModel:'deepseek-flash',textKey:'isolated-secret',visionUrl:'https://vision.example/chat/completions',visionModel:'vision',visionKey:'isolated-vision'};
    await run('(async()=>{const result=await jeeWeaveDesktop.assistant("settings-save",'+JSON.stringify(settings)+');if(!result.ok)throw Error(result.message);})()');
    const masked=await run('jeeWeaveDesktop.assistant("settings-get")');assert.equal(masked.textKey,undefined);assert.equal(masked.textKeySaved,true,JSON.stringify(masked));
    assert.ok(!fs.readFileSync(path.join(root,'assistant-secrets.bin')).includes(Buffer.from('isolated-secret')));
    await run('document.querySelector("#desktop-assistant-input").value="明天交线性代数作业并关联课程";true');
    await click('[data-send]');
    for(let i=0;i<30;i++){if(!await run('document.querySelector("[data-preview]").hidden'))break;await wait();}
    assert.equal(await run('document.querySelectorAll(".assistant-draft-step").length'),2);
    assert.ok(await run('document.querySelector(".assistant-assumptions").textContent.includes("新建")'));
    await run('(()=>{const f=document.querySelector("[data-draft-key=title]");f.value="线性代数课程";f.dispatchEvent(new Event("input"));document.querySelector("[data-preview]").scrollIntoView({block:"start"});})()');await wait();
    fs.writeFileSync(path.join(root,'assistant-draft.png'),(await win.webContents.capturePage()).toPNG());
    await click('[data-confirm]');
    for(let i=0;i<30;i++){if(await run('document.querySelector("[data-status]").textContent.includes("已完成 2 项安排")'))break;await wait();}
    const newObjects=await run('jeeWeaveAssistantActions({action:"call",name:"objects.list",args:[],title:"读取对象"})');
    const newObject=newObjects.find(o=>o.title==='线性代数课程');assert.ok(newObject);
    const detail=await run('jeeWeaveAssistantActions({action:"call",name:"objects.detail",args:['+JSON.stringify(newObject.id)+'],title:"读取关联"})');
    assert.ok(detail.entries.some(entry=>entry.title==='线性代数作业'),'Confirmed draft creates and links the task using the actual new object ID');
    const imagePath=path.join(root,'tiny.png');fs.writeFileSync(imagePath,nativeImage.createFromBitmap(Buffer.from([0,128,255,255]),{width:1,height:1}).toPNG());
    const choose=dialog.showOpenDialog;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[imagePath]});
    try{await click('[data-image]');for(let i=0;i<30;i++){if(!await run('document.querySelector("[data-image-preview]").hidden'))break;await wait();}assert.equal(await run('document.querySelector("[data-image-preview]").hidden'),false,await run('document.querySelector("[data-status]").textContent'));}finally{dialog.showOpenDialog=choose;}
    await click('[data-remove-image]');
    await run('document.querySelector("#desktop-assistant-input").value="120分钟后提醒我隔离测试";true');
    await click('[data-send]');await wait();assert.ok(await run('document.querySelector("[data-status]").textContent.includes("0 token")'));
    await click('[data-confirm]');for(let i=0;i<50;i++){if((await run('jeeWeaveDesktop.assistant("reminders-list")')).rows.length)break;await wait();}
    let rows=(await run('jeeWeaveDesktop.assistant("reminders-list")')).rows;assert.equal(rows.length,1);
    for(let i=0;i<50;i++){if(await run('document.querySelector("#desktop-today-reminders").textContent.includes("隔离测试")'))break;await wait();}
    assert.ok(await run('document.querySelector("#desktop-today-reminders").textContent.includes("隔离测试")'),'Today contains the newly scheduled reminder');
    await click('#desktop-assistant-dialog [data-close]');
    await run('jeeWeaveAssistantActions({action:"open",view:"today"})');await wait();
    fs.writeFileSync(path.join(root,'today-reminders.png'),(await win.webContents.capturePage()).toPNG());
    await click('#desktop-reminders-open');await wait();assert.equal(await run('document.querySelector(".main").dataset.activeView'),'reminders');
    assert.equal(await run('document.querySelector("#desktop-reminders-page").hidden'),false);
    assert.ok(await run('document.querySelector("#desktop-reminders-open svg").getBoundingClientRect().width<=24'));
    fs.writeFileSync(path.join(root,'reminders-page.png'),(await win.webContents.capturePage()).toPNG());
    await click('[data-add-reminder]');await wait();assert.equal(await run('document.querySelector("#desktop-reminder-dialog").open'),true);
    await run('(()=>{const f=document.querySelector("[data-reminder-form]");f.elements.mode.value="attention";f.elements.mode.dispatchEvent(new Event("change"));})()');
    assert.ok(await run('document.querySelector("[data-reminder-form]").elements.at.closest("label").hidden'));
    await run('(()=>{const f=document.querySelector("[data-reminder-form]");f.elements.mode.value="timed";f.elements.mode.dispatchEvent(new Event("change"));})()');
    fs.writeFileSync(path.join(root,'reminder-panel.png'),(await win.webContents.capturePage()).toPNG());
    await click('[data-reminder-close]');
    await run('jeeWeaveAssistantActions({action:"open",view:"settings"})');await wait();
    await run('document.querySelector("#desktop-ai-settings").scrollIntoView({block:"start"});true');await wait();
    fs.writeFileSync(path.join(root,'settings-ai.png'),(await win.webContents.capturePage()).toPNG());


    const quiet=await run('jeeWeaveDesktop.assistant("reminder-add",{mode:"silent",title:"静默样例",date:new Date().toLocaleDateString("sv-SE")})');
    const caution=await run('jeeWeaveDesktop.assistant("reminder-add",{mode:"attention",title:"长期注意样例"})');
    assert.equal(quiet.ok,true,JSON.stringify(quiet));assert.equal(caution.ok,true,JSON.stringify(caution));
    await run('jeeWeaveAssistantActions({action:"open",view:"today"})');await wait();
    for(let i=0;i<30;i++){if(await run('document.querySelector("#desktop-today-reminders").textContent.includes("长期注意样例")'))break;await wait();}
    assert.ok(await run('document.querySelector("#desktop-today-reminders").textContent.includes("静默样例")'));
    assert.ok(await run('document.querySelector("#desktop-today-reminders").textContent.includes("长期注意样例")'));
    fs.writeFileSync(path.join(root,'today-reminders.png'),(await win.webContents.capturePage()).toPNG());
    await run('jeeWeaveDesktop.assistant("reminder-state",'+JSON.stringify({id:caution.row.id,archived:true})+')');
    await run('jeeWeaveAssistantActions({action:"open",view:"settings"})');await run('jeeWeaveAssistantActions({action:"open",view:"today"})');await wait();
    for(let i=0;i<30;i++){if(!await run('document.querySelector("#desktop-today-reminders").textContent.includes("长期注意样例")'))break;await wait();}
    assert.ok(!await run('document.querySelector("#desktop-today-reminders").textContent.includes("长期注意样例")'));
    await run('jeeWeaveDesktop.assistant("reminder-cancel",'+JSON.stringify({id:quiet.row.id})+')');
    await run('jeeWeaveDesktop.assistant("reminder-cancel",'+JSON.stringify({id:caution.row.id})+')');
    const cancelResult=await run('jeeWeaveDesktop.assistant("reminder-cancel",'+JSON.stringify({id:rows[0].id})+')');assert.equal(cancelResult.ok,true,JSON.stringify(cancelResult));
    assert.equal((await run('jeeWeaveDesktop.assistant("reminders-list")')).rows.length,0);
    await run('jeeWeaveAssistantActions({action:"item",title:"电脑助手事项",date:"2026-11-01",time:"18:00"})');
    await run('jeeWeaveAssistantActions({action:"event",title:"电脑助手会议",date:"2026-11-01",time:"14:00",endTime:"15:00"})');
    await run('jeeWeaveAssistantActions({action:"note",title:"电脑助手笔记"})');
    const saved=(await run('jeeWeaveDesktop.readWorkspace()')).workspace;
    assert.ok(JSON.stringify(saved).includes('电脑助手笔记'));assert.ok(JSON.stringify(saved).includes('2026-11-01T15:00:00+08:00'));
    const queried=await run('jeeWeaveAssistantActions({action:"call",name:"items.list",args:[],title:"查看事项"})');assert.ok(queried.some(row=>row.title==='电脑助手事项'));
    await assert.rejects(run('jeeWeaveAssistantActions({action:"call",name:"unregistered.destroy",args:[],title:"无效"})'));
    await assert.rejects(run('jeeWeaveAssistantActions({action:"delete",title:"all"})'));

    await run('(async()=>{const {runDraft}=await import("./assistant-core.mjs");await runDraft({action:"draft",steps:[{action:"call",name:"courses.create",args:[{name:"助手课程草稿测试",totalWeeks:20,startDate:"2026-10-26"}]},{action:"call",name:"courses.saveCourse",args:[{title:"推断课程",weekday:2,periodStart:1,periodEnd:2,weeksText:"每周"}]},{action:"call",name:"objects.assign",args:['+JSON.stringify(newObject.id)+',{collection:"courseEntry",id:"@1.id",containerId:"@0.id"}]}]},jeeWeaveAssistantActions);})()');
    const courseDetail=await run('jeeWeaveAssistantActions({action:"call",name:"objects.detail",args:['+JSON.stringify(newObject.id)+'],title:"核对课程关联"})');
    assert.ok(courseDetail.entries.some(entry=>entry.ref.collection==='courseEntry'));
    const basketball=await run('jeeWeaveAssistantActions({action:"call",name:"courses.saveCourse",args:[{title:"篮球",weekday:3,periodStart:3,periodEnd:4,weeksText:"每周"}]})');
    const activeTable=await run('jeeWeaveAssistantActions({action:"call",name:"courses.current",args:[]})');
    await run('jeeWeaveAssistantActions({action:"note",title:"锻炼笔记：运动后记录感受"})');
    const notes=await run('jeeWeaveAssistantActions({action:"call",name:"journal.list",args:[]})');
    fitnessRefs={course:{collection:'courseEntry',containerId:activeTable.id,id:basketball.id},note:{collection:'journalEntry',id:notes.find(row=>row.body.includes('锻炼笔记')).id}};
    await click('#desktop-assistant-open');
    await run('document.querySelector("#desktop-assistant-input").value="创建新的提高身体素质对象，关联所有篮球课与锻炼笔记，拟在事项中加入每周锻炼计划";document.querySelector("[data-send]").click();true');
    for(let i=0;i<30;i++){if(await run('!document.querySelector("[data-send]").disabled'))break;await wait();}
    assert.equal(await run('document.querySelectorAll(".assistant-draft-step").length'),4);
    assert.ok(!await run('document.querySelector("[data-status]").textContent.includes("未通过")'));
    await click('[data-confirm]');
    for(let i=0;i<30;i++){if(await run('document.querySelector("[data-status]").textContent.includes("已完成 4 项安排")'))break;await wait();}
    assert.ok(await run('document.querySelector("[data-status]").textContent.includes("已完成 4 项安排")'));
    const fitness=await run('jeeWeaveAssistantActions({action:"call",name:"objects.list",args:[]})');
    const fitnessObject=fitness.find(row=>row.title==='提高身体素质');assert.ok(fitnessObject);
    const fitnessDetail=await run('jeeWeaveAssistantActions({action:"call",name:"objects.detail",args:['+JSON.stringify(fitnessObject.id)+']})');
    assert.equal(fitnessDetail.entries.length,3);
    const fitnessItems=await run('jeeWeaveAssistantActions({action:"call",name:"items.list",args:[]})');
    assert.deepEqual(fitnessItems.find(row=>row.title==='每周锻炼计划').anchor.weekdays,[1,3,5]);
    await click('#desktop-assistant-dialog [data-close]');
    await click('#desktop-assistant-open');
    await run('document.querySelector("#desktop-assistant-input").value="挂起请求用于插件停用检查";document.querySelector("[data-send]").click();true');
    for(let i=0;i<30&&!pendingRequest;i++)await wait();assert.equal(pendingRequest,true);
    await run('jeeWeaveAssistantActions({action:"call",name:"plugins.set",args:["assistant",false]})');
    for(let i=0;i<30&&!requestAborted;i++)await wait();assert.equal(requestAborted,true);
    assert.equal(await run('document.querySelector("#desktop-assistant-open")'),null);
    assert.equal(await run('document.querySelector("#desktop-assistant-dialog")'),null);
    assert.equal(await run('document.querySelector("#desktop-ai-settings")'),null);
    assert.equal((await run('jeeWeaveDesktop.assistant("settings-get")')).ok,false);
    assert.equal((await run('jeeWeaveDesktop.assistant("reminders-list")')).ok,true);
    assert.ok(fs.existsSync(path.join(root,'assistant-secrets.bin')));
    await click('.nav [data-view="plugins"]');
    await click('#desktop-module-assistant');await wait();
    assert.equal(await run('document.querySelectorAll("#desktop-assistant-dialog").length'),1);
    assert.equal((await run('jeeWeaveDesktop.assistant("settings-get")')).textKeySaved,true);
    const preserved=await run('jeeWeaveDesktop.assistant("reminder-add",{mode:"attention",title:"插件停用后保留"})');
    await click('#desktop-reminders-open');await wait();
    await run('jeeWeaveAssistantActions({action:"call",name:"plugins.set",args:["reminders",false]})');
    assert.equal(await run('document.querySelector("#desktop-reminders-page")'),null);
    assert.equal(await run('document.querySelector("#desktop-reminder-dialog")'),null);
    assert.equal(await run('document.querySelector("#desktop-today-reminders")'),null);
    assert.equal((await run('jeeWeaveDesktop.assistant("reminders-list")')).ok,false);
    assert.equal((await run('jeeWeaveDesktop.assistant("settings-get")')).ok,true);
    await run('jeeWeaveAssistantActions({action:"call",name:"plugins.set",args:["reminders",true]})');await wait();
    assert.equal(await run('document.querySelectorAll("#desktop-reminders-page").length'),1);
    assert.ok((await run('jeeWeaveDesktop.assistant("reminders-list")')).rows.some(row=>row.id===preserved.row.id));
    await run('jeeWeaveDesktop.assistant("reminder-cancel",'+JSON.stringify({id:preserved.row.id})+')');
    await click('.nav [data-view="plugins"]');await wait();
    fs.writeFileSync(path.join(root,'assistant-plugins.png'),(await win.webContents.capturePage()).toPNG());
    await run('jeeWeaveDesktop.assistant("settings-clear")');
    assert.ok(!fs.existsSync(path.join(root,'assistant-secrets.bin')));
    await click('#desktop-assistant-open');
    await run('document.querySelector("#desktop-assistant-input").value="未配置API也保留想法";true');
    await click('[data-send]');
    for(let i=0;i<30;i++){if(await run('document.querySelector("[data-status]").textContent.includes("本地笔记草稿")'))break;await wait();}
    assert.ok(await run('document.querySelector("[data-status]").textContent.includes("密钥")'));
    assert.equal(await run('document.querySelector("[data-confirm]").hidden'),false);
    assert.equal(await run('document.querySelector("[data-draft-key=title]").value'),'未配置API也保留想法');

    console.log('Desktop assistant: encrypted settings, image IPC, zero-token reminder registration/cancel, item/event/note writes, fitness object/course/note links and weekly plan, independent plugin toggles and live cancellation, 950/1280 layout passed.');
    clearTimeout(timer);app.exit(0);
  }catch(error){console.error(error);clearTimeout(timer);app.exit(1);}
});});
require('../main.cjs');
