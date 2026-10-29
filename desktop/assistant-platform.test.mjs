import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {createRequire} from 'node:module';
import {localIntent,validateIntent,remindersForDay,asDraft,fallbackDraft,normalizeDraft,runDraft,intentRequest,parseDraftContent} from './assistant-core.mjs';
const {createAssistantPlatform}=createRequire(import.meta.url)('./assistant-platform.cjs');
const {createReminderPlatform}=createRequire(import.meta.url)('./reminder-platform.cjs');
function fixture(t,options={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jeeweave-assistant-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true,maxRetries:20,retryDelay:100}));
 const assistant=createAssistantPlatform({root,safeStorage:{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from('sealed:'+s).reverse(),decryptString:b=>Buffer.from(b).reverse().toString().slice(7)},...options});
 const reminders=createReminderPlatform({root,...options,enabled:()=>options.enabled?.('reminders')??true});
 return {root,api:{handle:(action,p)=>action.startsWith('reminder')?reminders.handle(action,p):assistant.handle(action,p),reconcile:async()=>{assistant.reconcile();await reminders.reconcile();}}};
}

const config={textModel:'deepseek-flash',textKey:'fake-secret',visionUrl:'https://vision.example/chat/completions',visionModel:'vision',visionKey:'fake-vision'};
test('desktop credentials are encrypted, redacted, retained when blank, cleared explicitly',async t=>{
 const {root,api}=fixture(t);await api.handle('settings-save',config);
 assert.ok(!fs.readFileSync(path.join(root,'assistant-secrets.bin')).includes(Buffer.from('fake-secret')));
 assert.equal((await api.handle('settings-get')).textKey,undefined);assert.equal((await api.handle('settings-get')).textKeySaved,true);
 await api.handle('settings-save',{...config,textKey:'',visionKey:''});assert.equal((await api.handle('settings-get')).visionKeySaved,true);
 await assert.rejects(api.handle('settings-save',{...config,visionUrl:'http://unsafe.example'}));
 await api.handle('settings-clear');assert.equal((await api.handle('settings-get')).textKeySaved,false);
});
test('single short API call uses only current input and separate vision credentials',async t=>{
 const calls=[];const {api}=fixture(t,{fetcher:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({action:'item',title:'测试事项'})}}],usage:{total_tokens:32}}),{status:200});}});
 await api.handle('settings-save',config);
 assert.equal((await api.handle('parse',{text:'添加测试事项'})).tokens,32);
 assert.equal(calls[0].url,'https://api.deepseek.com/chat/completions');const body=JSON.parse(calls[0].options.body);
 assert.equal(body.max_tokens,2048);assert.equal(body.messages.length,2);assert.equal(body.thinking.type,'disabled');assert.equal(calls[0].options.redirect,'error');
 await api.handle('parse',{text:'识别',image:'data:image/jpeg;base64,YQ=='});
 assert.equal(calls[1].options.headers.Authorization,'Bearer fake-vision');
 await assert.rejects(api.handle('parse',{text:'x',image:'https://external.example/a.png'}));
});
test('failed OS registration rolls back; cancellation failures keep the reminder',async t=>{
 let fail=true;const operations=[];const {api}=fixture(t,{scheduler:async(mode,row)=>{operations.push([mode,row.id]);if(fail)throw Error('registration failed');}});
 const value={title:'测试提醒',at:Date.now()+3600000,daily:false};
 await assert.rejects(api.handle('reminder-add',value));assert.equal((await api.handle('reminders-list')).rows.length,0);
 fail=false;const result=await api.handle('reminder-add',value);assert.equal((await api.handle('reminders-list')).rows.length,1);
 fail=true;await assert.rejects(api.handle('reminder-cancel',{id:result.row.id}));assert.equal((await api.handle('reminders-list')).rows.length,1);
 fail=false;await api.handle('reminder-cancel',{id:result.row.id});assert.equal((await api.handle('reminders-list')).rows.length,0);
});
test('desktop protocol rejects unsupported calls and distinguishes events from deadlines',()=>{
 assert.equal(localIntent('5分钟后提醒我关火').action,'reminder');
 assert.throws(()=>validateIntent({action:'delete',title:'all'}));
 assert.throws(()=>validateIntent({action:'event',title:'会议',date:'2026-11-01',time:'15:00',endTime:'14:00'}));
});

test('async safeStorage decrypt object is supported',async t=>{
 const {api}=fixture(t,{safeStorage:{encryptStringAsync:async s=>Buffer.from(s),decryptStringAsync:async b=>({result:b.toString(),shouldReEncrypt:false})}});
 await api.handle('settings-save',config);assert.equal((await api.handle('settings-get')).textKeySaved,true);
});

test('reminders accept relative minutes and draft a suggested later-today time',()=>{
 const now=new Date(2026,9,29,12,0).getTime();
 assert.equal(localIntent('五分钟后提醒我取快递',now).at,now+300000);
 assert.equal(localIntent('今天18:30提醒我关窗',now).at,new Date(2026,9,29,18,30).getTime());
 const later=localIntent('今日晚些时候提醒我关窗',now);assert.equal(later.action,'draft');assert.equal(later.steps[0].at,now+7200000);assert.equal(later.steps[0].title,'关窗');assert.ok(later.assumptions.length);
 const rows=[{title:'today',at:now+600000,daily:false},{title:'tomorrow',at:now+86400000,daily:false},{title:'daily',at:now-86400000,daily:true},{title:'future daily',at:now+86400000,daily:true}];
 assert.deepEqual(remindersForDay(rows,new Date(now)).map(r=>r.title).sort(),['daily','today']);
 assert.equal(validateIntent({action:'call',name:'items.list',args:[],title:'查看'}).name,'items.list');
 assert.throws(()=>validateIntent({action:'call',name:'__proto__.exec',args:[]}));
});

test('global command response and compact catalog survive API validation',async t=>{
 let sent;const {api}=fixture(t,{fetcher:async(url,options)=>{sent=JSON.parse(options.body);return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({action:'call',name:'calendar.open',args:[],title:'打开日历'})}}]}),{status:200});}});
 await api.handle('settings-save',config);const result=await api.handle('parse',{text:'打开日历',catalog:[{name:'calendar.open',args:'[]'}],context:[]});
 assert.equal(result.intent.steps[0].name,'calendar.open');assert.match(sent.messages[0].content,/calendar.open/);assert.equal(sent.messages.length,2);
});

test('silent prompts and enduring cautions never create Windows tasks',async t=>{
 const scheduled=[];const {api}=fixture(t,{scheduler:async(mode,row)=>scheduled.push([mode,row.id])});
 const day=new Date().toLocaleDateString('sv-SE');
 const silent=(await api.handle('reminder-add',{mode:'silent',title:'今日静默提示',date:day})).row;
 const attention=(await api.handle('reminder-add',{mode:'attention',title:'长期留意'})).row;
 assert.equal(scheduled.length,0);
 assert.deepEqual(remindersForDay((await api.handle('reminders-list')).rows).map(r=>r.title).sort(),['今日静默提示','长期留意'].sort());
 await api.handle('reminder-state',{id:attention.id,archived:true});assert.equal(remindersForDay((await api.handle('reminders-list')).rows).length,1);
 await api.handle('reminder-state',{id:attention.id,archived:false});assert.equal(remindersForDay((await api.handle('reminders-list')).rows).length,2);
 await api.handle('reminder-repair');assert.equal(scheduled.length,0);
 await api.handle('reminder-cancel',{id:silent.id});await api.handle('reminder-cancel',{id:attention.id});assert.equal(scheduled.length,0);
 assert.equal(validateIntent({action:'reminder',title:'注意',mode:'attention'}).at,null);
});
test('quiet reminders respect selected day and archived state',()=>{
 const now=new Date(2026,9,29,12);const rows=[{mode:'silent',title:'today',date:'2026-10-29',at:now.getTime()},{mode:'silent',title:'tomorrow',date:'2026-10-30',at:now.getTime()+86400000},{mode:'attention',title:'forever',at:null},{mode:'attention',title:'handled',at:null,archived:true}];
 assert.deepEqual(remindersForDay(rows,now).map(r=>r.title).sort(),['forever','today']);
 assert.deepEqual(remindersForDay(rows,new Date(2026,9,30,12)).map(r=>r.title).sort(),['forever','tomorrow']);
});

test('Flash-1017 is default and older model choices migrate with credentials preserved',async t=>{
 const {root,api}=fixture(t);
 assert.equal((await api.handle('settings-get')).textModel,'deepseek-flash');
 const legacy={...config};
 fs.writeFileSync(path.join(root,'assistant-secrets.bin'),Buffer.from('sealed:'+JSON.stringify(legacy)).reverse());
 const upgraded=await api.handle('settings-get');
 assert.equal(upgraded.textModel,'deepseek-flash');assert.equal(upgraded.textKeySaved,true);assert.equal(upgraded.textKey,undefined);
 await api.handle('settings-save',config);
 assert.equal((await api.handle('settings-get')).textModel,'deepseek-flash');
});
test('ask and failed model shape become editable drafts rather than dead ends',async t=>{
 const fallback=normalizeDraft({action:'ask',title:'课程叫什么？'},'安排新课程作业');
 assert.equal(fallback.action,'draft');assert.equal(fallback.steps[0].title,'安排新课程作业');assert.ok(fallback.assumptions.length);
 assert.equal(fallbackDraft('@同学的一些想法').steps[0].action,'note');
 let invalid=false;
 const {api}=fixture(t,{fetcher:async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(invalid?{action:'unknown'}:{action:'ask',title:'什么时候？'})}}]}))});
 await api.handle('settings-save',config);
 assert.equal((await api.handle('parse',{text:'高数作业'})).intent.action,'draft');
 invalid=true;const result=await api.handle('parse',{text:'高数作业'});assert.equal(result.intent.steps[0].title,'高数作业');assert.ok(result.notice);
 const request=intentRequest('高数作业',null,new Date(),[],[{title:'高等数学',ref:{id:'real'}}]);
 assert.match(request.messages[0].content,/不要生成ask/);assert.match(request.messages[0].content,/主动安排新建/);assert.match(request.messages[0].content,/real/);
});
test('dependent drafts use real IDs and resume only unfinished steps',async()=>{
 const draft=asDraft({action:'draft',title:'课程与作业',assumptions:['按长期事项保存'],steps:[
  {action:'call',name:'objects.save',args:[{title:'高数',type:'course'}],title:'新建高数对象'},
  {action:'call',name:'items.save',args:[{type:'longterm',title:'完成作业'},{objectId:'@0.id'}],title:'关联作业'}
 ]});
 const progress={results:[]},calls=[];let fail=true;
 const execute=async step=>{calls.push(step);if(step.name==='objects.save')return {id:'real-object'};if(fail)throw Error('暂时失败');return {id:'real-task'};};
 await assert.rejects(runDraft(draft,execute,progress),/暂时失败/);
 assert.equal(progress.results.length,1);assert.equal(calls[1].args[1].objectId,'real-object');
 fail=false;await runDraft(draft,execute,progress);
 assert.equal(calls.filter(v=>v.name==='objects.save').length,1);assert.equal(progress.results.length,2);
 assert.throws(()=>asDraft({...draft,steps:[{action:'call',name:'items.save',args:[{objectId:'@0.id'}]}]}),/前面/);
 assert.throws(()=>asDraft({...draft,steps:[{action:'call',name:'items.save',args:[{objectId:'@9.id'}]}]}),/格式/);
});
test('a malicious field or missing dependency cannot dispatch a later operation',async()=>{
 const bad=JSON.parse('{"action":"call","name":"items.save","args":[{"__proto__":{"x":1}}]}');
 assert.throws(()=>asDraft(bad),/字段无效/);
 const draft=asDraft({action:'draft',steps:[{action:'open',view:'today'},{action:'call',name:'objects.open',args:['@0.id']}]});
 let calls=0;await assert.rejects(runDraft(draft,async()=>{calls++;}),/没有返回编号/);assert.equal(calls,1);
});

test('course creation returns an ID string and can be referenced as a new container',async()=>{
 const draft=asDraft({action:'draft',steps:[{action:'call',name:'courses.create',args:[{name:'学期',totalWeeks:20}]},{action:'call',name:'objects.assign',args:['real-object',{collection:'courseEntry',id:'real-course',containerId:'@0.id'}]}]});
 let linked;await runDraft(draft,async step=>{if(step.name==='courses.create')return 'real-table';linked=step.args[1];});
 assert.equal(linked.containerId,'real-table');
});

test('incomplete events get a marked duration; reminder wall clocks are converted locally',()=>{
 const now=new Date(2026,9,29,12).getTime();
 const event=normalizeDraft({action:'event',title:'讨论',date:'2026-10-30',time:'14:00'},'明天两点讨论',now);
 assert.equal(event.steps[0].endTime,'15:00');assert.ok(event.assumptions.length);
 const reminder=normalizeDraft({action:'reminder',title:'出门',date:'2026-10-30',time:'09:00'},'明早九点出门',now);
 assert.equal(reminder.steps[0].at,new Date('2026-10-30T09:00:00+08:00').getTime());
 const passed=localIntent('今天08:00提醒我出门',now);assert.equal(passed.action,'draft');assert.equal(passed.steps[0].at,new Date(2026,9,30,8).getTime());
});

test('the reported fitness draft accepts qualified actions and object argument wrappers',()=>{
 const source='创建新的提高身体素质对象，关联所有篮球课与锻炼笔记，拟在事项中加入每周锻炼计划';
 const catalog=['objects.save','objects.assign','items.save'].map(name=>({name}));
 const value={steps:[
  {action:'objects.save',fields:{title:'提高身体素质',type:'topic',purpose:'持续锻炼'}},
  {action:'objects.assign',parameters:{objectId:'@0.id',ref:{collection:'courseEntry',containerId:'real-table',id:'real-basketball'}}},
  {action:'objects.assign',args:['@0.id',{collection:'journalEntry',id:'real-note'}]},
  {action:'items.save',fields:{title:'每周锻炼计划',type:'weekly'},options:{objectId:'@0.id'}}
 ]};
 const result=normalizeDraft(value,source,new Date(2026,9,29,12).getTime(),catalog);
 assert.equal(result.steps[0].action,'call');assert.equal(result.steps[0].name,'objects.save');assert.equal(result.steps[0].args[0].type,'general');
 assert.equal(result.steps[1].args[1].id,'real-basketball');assert.equal(result.steps[3].args[1].objectId,'@0.id');
 assert.deepEqual(result.steps[3].args[0].weekdays,[1,3,5]);assert.ok(result.assumptions.length);
 assert.deepEqual(parseDraftContent(String.fromCharCode(96).repeat(3)+'json\n'+JSON.stringify(value)+'\n'+String.fromCharCode(96).repeat(3)),value);
 assert.throws(()=>normalizeDraft({steps:[{action:'notes.capture',args:[]}]},source,Date.now(),catalog),/第1项.*未注册.*notes.capture/);
});
test('version-one model configuration migrates to Flash while preserving credentials',async t=>{
 const {root,api}=fixture(t);
 fs.writeFileSync(path.join(root,'assistant-secrets.bin'),Buffer.from('sealed:'+JSON.stringify({...config,draftModelVersion:1,textModel:'deepseek-v4-flash'})).reverse());
 const settings=await api.handle('settings-get');assert.equal(settings.textModel,'deepseek-flash');assert.equal(settings.textKeySaved,true);
});
test('one bounded repair retains the requested action and sums both API usages',async t=>{
 const sent=[];const {api}=fixture(t,{fetcher:async(url,options)=>{const payload=JSON.parse(options.body);sent.push(payload);return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(sent.length===1?{steps:[{action:'notes.capture',args:[]}]}:{action:'draft',steps:[{action:'call',name:'objects.save',args:[{title:'提高身体素质',type:'general'}]}]})}}],usage:{total_tokens:30}}));}});
 await api.handle('settings-save',config);
 const result=await api.handle('parse',{text:'创建提高身体素质对象',catalog:[{name:'objects.save',args:'[{title,type:general}]'}]});
 assert.equal(sent.length,2);assert.equal(result.repaired,true);assert.equal(result.tokens,60);assert.equal(result.intent.steps[0].name,'objects.save');
 assert.match(sent[1].messages.at(-1).content,/未注册.*notes.capture/);assert.equal(sent[1].max_tokens,3072);
});
test('unrepairable output surfaces a concrete reason and never retries indefinitely',async t=>{
 let count=0;const {api}=fixture(t,{fetcher:async()=>{count++;return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{"steps":[{"action":"notes.capture","args":[]}]}'}}]}));}});
 await api.handle('settings-save',config);
 const result=await api.handle('parse',{text:'关联锻炼笔记',catalog:[{name:'objects.assign',args:'[id,ref]'}]});
 assert.equal(count,2);assert.match(result.notice,/第1项.*未注册.*notes.capture/);assert.equal(result.intent.steps[0].action,'note');
});

test('closing assistant aborts the live API request and blocks settings without disabling reminders',async t=>{
 let enabled=true,start,signal;const started=new Promise(resolve=>start=resolve);
 const {api}=fixture(t,{enabled:id=>id==='assistant'?enabled:true,fetcher:async(url,options)=>{signal=options.signal;start();return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true}));},scheduler:async()=>{}});
 await api.handle('settings-save',config);
 const request=api.handle('parse',{text:'创建事项'});await started;enabled=false;await api.reconcile();
 await assert.rejects(request,/插件已关闭/);assert.equal(signal.aborted,true);
 await assert.rejects(api.handle('settings-get'),/插件已关闭/);
 const reminder=await api.handle('reminder-add',{mode:'attention',title:'独立提醒'});assert.ok(reminder.row.id);
 enabled=true;assert.equal((await api.handle('settings-get')).textKeySaved,true);
});
test('reminder switch cancels tasks without deleting rows and re-enables only future/daily rows',async t=>{
 let enabled=true;const operations=[];
 const {api}=fixture(t,{enabled:id=>id==='reminders'?enabled:true,scheduler:async(mode,row)=>operations.push([mode,row.title])});
 await api.reconcile();
 await api.handle('reminder-add',{title:'将来',at:Date.now()+3600000});
 await api.handle('reminder-add',{title:'每日',at:Date.now()+3600000,daily:true});
 await api.handle('reminder-add',{title:'静默',mode:'attention'});
 operations.length=0;enabled=false;await api.reconcile();
 assert.deepEqual(operations.map(v=>v[0]),['Cancel','Cancel']);
 await assert.rejects(api.handle('reminders-list'),/插件已关闭/);
 assert.equal((await api.handle('settings-get')).ok,true);
 enabled=true;await api.reconcile();assert.deepEqual(operations.slice(2).map(v=>v[0]),['Register','Register']);
 assert.equal((await api.handle('reminders-list')).rows.length,3);
});
test('previous default Pro migrates to Flash-1017, later custom models and secrets remain',async t=>{
 const {root,api}=fixture(t);
 fs.writeFileSync(path.join(root,'assistant-secrets.bin'),Buffer.from('sealed:'+JSON.stringify({...config,draftModelVersion:2,textModel:'deepseek-v4-pro'})).reverse());
 assert.equal((await api.handle('settings-get')).textModel,'deepseek-flash');
 await api.handle('settings-save',{...config,textModel:'flash-1017'});
 assert.equal((await api.handle('settings-get')).textModel,'deepseek-flash');
 await api.handle('settings-save',{...config,textModel:'my-custom-model'});
 assert.equal((await api.handle('settings-get')).textModel,'my-custom-model');assert.equal((await api.handle('settings-get')).textKeySaved,true);
});

test('queued reminder writes cannot start after the reminder plugin is disabled',async t=>{
 let enabled=true,started,release;
 const entered=new Promise(resolve=>started=resolve),blocked=new Promise(resolve=>release=resolve);
 const {api}=fixture(t,{enabled:id=>id==='reminders'?enabled:true,scheduler:async mode=>{if(mode==='Register'){started();await blocked;}}});
 const first=api.handle('reminder-add',{title:'已开始',at:Date.now()+3600000});await entered;
 const next=api.handle('reminder-add',{title:'尚未开始',at:Date.now()+3600000});
 const rejected=assert.rejects(next,/插件已关闭/);enabled=false;const paused=api.reconcile();release();
 await first;await rejected;await paused;
 enabled=true;assert.deepEqual((await api.handle('reminders-list')).rows.map(r=>r.title),['已开始']);
});
