import { after } from 'node:test';
const temporaryDirectories = new Set();
const temporaryDirectory = prefix => {
  const directory = fs.mkdtempSync(prefix); temporaryDirectories.add(directory); return directory;
};
after(() => { for (const directory of temporaryDirectories) fs.rmSync(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); });
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {emptyWorkspace,validateWorkspace,readWorkspaceBackup,prepareWorkspaceRestore} from './workspace-format.mjs';
const {createWorkspaceTransfer}=createRequire(import.meta.url)('./workspace-transfer.cjs');
const {createWorkspaceFile}=createRequire(import.meta.url)('./workspace-file.cjs');
const setup=()=>{
  const root=temporaryDirectory(path.join(os.tmpdir(),'jiwei-transfer-')),repo=createWorkspaceFile(root,validateWorkspace);
  const initial=emptyWorkspace();initial.data.tasks=[{id:'original',title:'当前事项',date:''}];repo.write(initial);
  let fail=false;
  const transfer=createWorkspaceTransfer({root,version:'0.2.1',read:repo.read,write:(value,options)=>{if(fail)throw Error('disk full');return repo.write(value,options);},readBackup:readWorkspaceBackup,prepare:prepareWorkspaceRestore});
  return {root,repo,transfer,fail:value=>{fail=value;},close:()=>fs.rmSync(root,{recursive:true,force:true})};
};
test('迁移包含原文和完整未知数据，导入保留旧文件、引用及恢复前快照，重开可读',()=>{
  const s=setup();try{
    const document=s.repo.read();document.data.future={keep:true};document.data.webCaptures=[{id:'capture',drafts:[],directory:'captures/web-captures/example'}];s.repo.write(document);
    fs.mkdirSync(path.join(s.root,'captures/web-captures/example'),{recursive:true});fs.writeFileSync(path.join(s.root,'captures/web-captures/example/page.html'),'原文');
    fs.mkdirSync(path.join(s.root,'profile'));fs.writeFileSync(path.join(s.root,'profile/Cookies'),'private');
    const file=path.join(s.root,'test.jiwei');s.transfer.export(file);
    const pack=JSON.parse(fs.readFileSync(file));assert.equal(pack.appVersion,'0.2.1');assert.equal(pack.files.length,1);
    assert.equal(pack.files.some(f=>f.path.includes('Cookies')),false);
    const before=s.repo.read(),preview=s.transfer.preview(file);assert.equal(preview.summary.files,1);assert.deepEqual(s.repo.read(),before);
    const saved=s.transfer.commit(preview.token).workspace;
    assert.equal(saved.data.tasks[0].id,'original');assert.deepEqual(saved.data.future,{keep:true});
    assert.match(saved.data.webCaptures[0].directory,/^captures\/migrations\/transfer-/);
    assert.equal(fs.readFileSync(path.join(s.root,saved.data.webCaptures[0].directory,'page.html'),'utf8'),'原文');
    assert.equal(fs.readFileSync(path.join(s.root,'captures/web-captures/example/page.html'),'utf8'),'原文');
    assert.equal(fs.readdirSync(path.join(s.root,'backups')).length,1);
    assert.deepEqual(createWorkspaceFile(s.root,validateWorkspace).read().data,saved.data);
    const again=path.join(s.root,'again.jiwei');s.transfer.export(again);const next=s.transfer.preview(again);s.transfer.commit(next.token);
    assert.equal(fs.readFileSync(path.join(s.root,s.repo.read().data.webCaptures[0].directory,'page.html'),'utf8'),'原文');
  }finally{s.close();}
});
test('旧版空 JSON、旧 jiwei 工作区与旧 data 文件夹统一预览，不按应用版本猜数据格式',()=>{
  const s=setup();try{
    const file=path.join(s.root,'legacy.json'),old={exportedAt:'2026-10-17T00:00:00Z',timetables:null,tasks:[{id:'old',title:'旧任务',date:'',extra:{keep:true}}],plans:[],webCaptures:[],future:{keep:true}};
    fs.writeFileSync(file,JSON.stringify(old));let preview=s.transfer.preview(file);assert.match(preview.summary.compatibility,/转换/);s.transfer.commit(preview.token);
    assert.equal(s.repo.read().data.tasks[0].id,'old');assert.deepEqual(s.repo.read().data.tasks[0].extra,{keep:true});
    assert.deepEqual(JSON.parse(s.repo.read().data.extensions['jiwei-legacy-export-fields']).future,{keep:true});
    const folder=path.join(s.root,'old-app','data');fs.mkdirSync(folder,{recursive:true});const legacy=emptyWorkspace();legacy.format='jiwei-desktop-workspace';
    fs.writeFileSync(path.join(folder,'workspace.json'),JSON.stringify(legacy));const source=fs.readFileSync(path.join(folder,'workspace.json'),'utf8');
    preview=s.transfer.preview(path.dirname(folder),true);assert.match(preview.summary.source,/文件夹/);s.transfer.commit(preview.token);
    assert.equal(fs.readFileSync(path.join(folder,'workspace.json'),'utf8'),source);
  }finally{s.close();}
});
test('取消、预览后变化、未来格式、路径穿越与校验损坏均不覆盖原盘',()=>{
  const s=setup();try{
    const file=path.join(s.root,'backup.jiwei');s.transfer.export(file);const initial=s.repo.read();
    const preview=s.transfer.preview(file);s.transfer.cancel();assert.throws(()=>s.transfer.commit(preview.token),/失效/);
    const next=s.transfer.preview(file);s.repo.write(s.repo.read());assert.throws(()=>s.transfer.commit(next.token),/变化/);
    const before=s.repo.read(),pack=JSON.parse(fs.readFileSync(file));
    for(const value of [{...pack,packageVersion:99},{...pack,workspace:{...pack.workspace,schemaVersion:99}},
      {...pack,files:[{path:'captures/web-captures/../bad',base64:'',sha256:''}]},
      {...pack,files:[{path:'captures/web-captures/NUL.txt',base64:'',sha256:''}]},
      {...pack,files:[{path:'captures/web-captures/page.txt',base64:'eA==',sha256:'wrong'}]}]){
      fs.writeFileSync(file,JSON.stringify(value));assert.throws(()=>s.transfer.preview(file));assert.deepEqual(s.repo.read(),before);
    }
    assert.equal(initial.data.tasks[0].id,before.data.tasks[0].id);
  }finally{s.close();}
});
test('业务提交失败撤回新原文，原文件与当前工作区不变，预览可重试',()=>{
  const s=setup();try{
    fs.mkdirSync(path.join(s.root,'captures/web-captures/a'),{recursive:true});fs.writeFileSync(path.join(s.root,'captures/web-captures/a/page.txt'),'test');
    const file=path.join(s.root,'backup.jiwei');s.transfer.export(file);const preview=s.transfer.preview(file),before=s.repo.read();
    s.fail(true);assert.throws(()=>s.transfer.commit(preview.token),/disk full/);assert.deepEqual(s.repo.read(),before);
    assert.deepEqual(fs.readdirSync(path.join(s.root,'captures/migrations')),[]);
    s.fail(false);assert.ok(s.transfer.commit(preview.token).workspace);
  }finally{s.close();}
});


const {createReminderPlatform}=createRequire(import.meta.url)('./reminder-platform.cjs');
const {beginRecovery,recoverWorkspaceTransfer}=createRequire(import.meta.url)('./reminder-transfer.cjs');
function reminderSetup(){
 const root=temporaryDirectory(path.join(os.tmpdir(),'jeeweave-reminder-transfer-')),repo=createWorkspaceFile(root,validateWorkspace);
 repo.write(emptyWorkspace());let failWrite=false,failSchedule=false,failCancel=false;const operations=[],scheduled=new Map();
 const reminders=createReminderPlatform({root,enabled:()=>repo.read().data.preferences.modules?.enabled?.reminders!==false,scheduler:async(mode,row)=>{
  operations.push({mode,id:row.id,name:row.taskName});
  if(mode==='Register'&&failSchedule)throw Error('模拟注册失败');if(mode==='Cancel'&&failCancel)throw Error('模拟取消失败');
  if(mode==='Register')scheduled.set(row.id,row);else scheduled.delete(row.id);
 }});
 const transfer=createWorkspaceTransfer({root,version:'local',read:repo.read,write:(value,options)=>{if(failWrite)throw Error('模拟写入失败');return repo.write(value,options);},readBackup:readWorkspaceBackup,prepare:prepareWorkspaceRestore,reminders});
 return {root,repo,reminders,transfer,operations,scheduled,failWrite:value=>failWrite=value,failSchedule:value=>failSchedule=value,failCancel:value=>failCancel=value};
}
test('新版包完整迁移三类提醒与处理状态，重建本机任务名，不携带密钥或登录状态',async()=>{
 const source=reminderSetup(),target=reminderSetup();
 const future=await source.reminders.handle('reminder-add',{title:'未来',at:Date.now()+3600000});
 await source.reminders.handle('reminder-add',{title:'今天静默',mode:'silent',date:new Date().toLocaleDateString('sv-SE')});
 const attention=await source.reminders.handle('reminder-add',{title:'长期',mode:'attention'});await source.reminders.handle('reminder-state',{id:attention.row.id,archived:true});
 fs.writeFileSync(path.join(source.root,'assistant-secrets.bin'),'do-not-export');
 const file=path.join(source.root,'full.jiwei');source.transfer.export(file);const pack=JSON.parse(fs.readFileSync(file));
 assert.equal(pack.packageVersion,2);assert.equal(pack.reminders.rows.length,3);assert.ok(!JSON.stringify(pack).includes('taskName'));assert.ok(!JSON.stringify(pack).includes('do-not-export'));
 const preview=target.transfer.preview(file);assert.equal(preview.summary.reminders.timed,1);assert.equal(preview.summary.reminders.archived,1);
 const result=await target.transfer.commit(preview.token);assert.equal(result.warnings.length,0);assert.ok(fs.existsSync(result.backup));assert.equal(target.reminders.snapshot().rows.length,3);
 assert.equal(target.scheduled.size,1);assert.notEqual(target.scheduled.get(future.row.id).taskName,future.row.taskName);
 assert.ok(!fs.existsSync(path.join(target.root,'reminder-transfer.pending.json')));
 assert.deepEqual(createWorkspaceFile(target.root,validateWorkspace).read().data,target.repo.read().data);
});
test('旧版包和业务JSON保留本机提醒，新版空提醒明确替换为空并备份',async()=>{
 const s=reminderSetup();await s.reminders.handle('reminder-add',{title:'保留',mode:'attention'});
 const file=path.join(s.root,'old.jiwei');fs.writeFileSync(file,JSON.stringify({format:'jeeweave-desktop-transfer',packageVersion:1,workspace:emptyWorkspace(),files:[]}));
 let preview=s.transfer.preview(file);assert.equal(preview.summary.reminders.included,false);await s.transfer.commit(preview.token);assert.equal(s.reminders.snapshot().rows.length,1);
 const pack={format:'jeeweave-desktop-transfer',packageVersion:2,workspace:emptyWorkspace(),files:[],reminders:{schemaVersion:1,rows:[]}};
 fs.writeFileSync(file,JSON.stringify(pack));preview=s.transfer.preview(file);assert.equal(preview.summary.reminders.removed,1);
 const result=await s.transfer.commit(preview.token);assert.equal(s.reminders.snapshot().rows.length,0);
 assert.equal(JSON.parse(fs.readFileSync(result.backup)).reminders.rows[0].title,'保留');
});
test('同编号冲突、过期及重复UUID在预览明确处理，过期不注册，每日调到下次时刻',async()=>{
 const s=reminderSetup(),file=path.join(s.root,'incoming.jiwei');
 const existing=(await s.reminders.handle('reminder-add',{title:'本机',mode:'attention'})).row;
 const row={id:existing.id,title:'导入修改',mode:'timed',at:Date.now()-60000,daily:false};
 const daily={...row,id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',title:'每日',daily:true};
 const pack={format:'jeeweave-desktop-transfer',packageVersion:2,workspace:emptyWorkspace(),files:[],reminders:{schemaVersion:1,rows:[row,daily]}};
 fs.writeFileSync(file,JSON.stringify(pack));const preview=s.transfer.preview(file);
 assert.equal(preview.summary.reminders.conflicts,1);assert.equal(preview.summary.reminders.expired,1);
 await s.transfer.commit(preview.token);assert.equal(s.scheduled.size,1);assert.ok(s.scheduled.get(daily.id).at>Date.now());
 pack.reminders.rows.push({...row});fs.writeFileSync(file,JSON.stringify(pack));assert.throws(()=>s.transfer.preview(file),/重复/);
});
test('提醒预览后的修改阻止提交，业务写入失败恢复提醒原文回执及系统任务',async()=>{
 const s=reminderSetup(),source=reminderSetup(),file=path.join(source.root,'incoming.jiwei');
 await source.reminders.handle('reminder-add',{title:'新长期',mode:'attention'});source.transfer.export(file);
 const old=await s.reminders.handle('reminder-add',{title:'旧定时',at:Date.now()+3600000});
 let preview=s.transfer.preview(file);await s.reminders.handle('reminder-add',{title:'预览后变化',mode:'attention'});
 await assert.rejects(s.transfer.commit(preview.token),/已变化/);
 preview=s.transfer.preview(file);const before=s.repo.read(),rows=fs.readFileSync(path.join(s.root,'reminders.json'),'utf8');s.failWrite(true);
 await assert.rejects(s.transfer.commit(preview.token),/模拟写入失败/);
 assert.deepEqual(s.repo.read(),before);assert.equal(fs.readFileSync(path.join(s.root,'reminders.json'),'utf8'),rows);assert.ok(s.scheduled.has(old.row.id));
 assert.ok(!fs.existsSync(path.join(s.root,'reminder-transfer.pending.json')));
 s.failWrite(false);assert.ok((await s.transfer.commit(preview.token)).workspace);
});
test('系统恢复失败不伪装资料失败，返回可见警告且重试不重复记录',async()=>{
 const s=reminderSetup(),source=reminderSetup(),file=path.join(source.root,'future.jiwei');
 await source.reminders.handle('reminder-add',{title:'未来',at:Date.now()+3600000});source.transfer.export(file);
 const preview=s.transfer.preview(file);s.failSchedule(true);
 const result=await s.transfer.commit(preview.token);assert.match(result.warnings.join(' '),/系统提醒恢复失败/);assert.equal(s.reminders.snapshot().rows.length,1);assert.equal(s.reminders.diagnostics().appliedEnabled,null);
 s.failSchedule(false);await s.reminders.reconcile();assert.equal(s.scheduled.size,1);assert.equal(s.reminders.snapshot().rows.length,1);
});
test('迁移恢复日志在崩溃后恢复旧数据，已完成提交则保留新数据',()=>{
 for(const committed of [false,true]){
  const s=reminderSetup(),candidate=prepareWorkspaceRestore(emptyWorkspace());candidate.revision=s.repo.read().revision;
  const before=fs.readFileSync(path.join(s.root,'workspace.json'),'utf8'),id='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
  beginRecovery(s.root,[id],candidate,null);fs.writeFileSync(path.join(s.root,'reminders.json'),'[]');
  if(committed)s.repo.write(candidate,{restore:true});else fs.writeFileSync(path.join(s.root,'workspace.json'),'interrupted');
  const result=recoverWorkspaceTransfer(s.root);assert.equal(Boolean(result.committed),committed);
  if(!committed)assert.equal(fs.readFileSync(path.join(s.root,'workspace.json'),'utf8'),before);
  assert.ok(!fs.existsSync(path.join(s.root,'reminder-transfer.pending.json')));
 }
});

test('取消原系统任务失败不写入新资料，恢复后允许重试',async()=>{
 const s=reminderSetup(),source=reminderSetup(),file=path.join(source.root,'incoming.jiwei');
 await s.reminders.handle('reminder-add',{title:'原定时',at:Date.now()+3600000});await source.reminders.handle('reminder-add',{title:'新记录',mode:'attention'});source.transfer.export(file);
 const preview=s.transfer.preview(file),old=s.repo.read();s.failCancel(true);
 await assert.rejects(s.transfer.commit(preview.token),/模拟取消失败/);assert.deepEqual(s.repo.read(),old);assert.equal(s.reminders.snapshot().rows[0].title,'原定时');
 s.failCancel(false);await s.transfer.commit(preview.token);assert.equal(s.reminders.snapshot().rows[0].title,'新记录');
});
test('旧data文件夹的回执随提醒保留，旧客户端拒绝新版包而非静默丢提醒',async()=>{
 const source=reminderSetup(),target=reminderSetup(),future=await source.reminders.handle('reminder-add',{title:'投递过',at:Date.now()+3600000});
 fs.mkdirSync(path.join(source.root,'reminder-receipts'),{recursive:true});const fired=Date.now();fs.writeFileSync(path.join(source.root,'reminder-receipts',future.row.id+'.json'),JSON.stringify({fired,day:new Date(fired).toLocaleDateString('sv-SE')}));
 let preview=target.transfer.preview(source.root,true);await target.transfer.commit(preview.token);assert.equal(target.reminders.snapshot().rows[0].lastFired,fired);
 const file=path.join(source.root,'v2.jiwei');source.transfer.export(file);const legacy=setup();assert.throws(()=>legacy.transfer.preview(file),/不支持提醒迁移/);legacy.close();
 const packed=JSON.parse(fs.readFileSync(file));packed.reminders.schemaVersion=9;fs.writeFileSync(file,JSON.stringify(packed));assert.throws(()=>target.transfer.preview(file),/格式版本/);
});

test('导入关闭提醒的工作区只保存提醒，不在目标设备注册任务',async()=>{
 const source=reminderSetup(),target=reminderSetup(),file=path.join(source.root,'paused.jiwei');
 await source.reminders.handle('reminder-add',{title:'未来',at:Date.now()+3600000});
 const snapshot=source.repo.read();snapshot.data.preferences.modules={schemaVersion:1,enabled:{reminders:false}};source.repo.write(snapshot);
 source.transfer.export(file);const preview=target.transfer.preview(file);await target.transfer.commit(preview.token);
 assert.equal(target.scheduled.size,0);assert.equal(target.reminders.snapshot().rows.length,1);assert.equal(target.reminders.diagnostics().appliedEnabled,false);
});


test('提交成功但恢复日志清理失败时暂停原生写入，重启恢复保留已导入资料',async()=>{
 const s=reminderSetup(),candidate=prepareWorkspaceRestore(emptyWorkspace());candidate.revision=s.repo.read().revision;
 const incoming={schemaVersion:1,rows:[{id:'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee',title:'新注意事项',mode:'attention',at:null}]};
 const result=await s.reminders.transfer(incoming,{
  check(){},backup(){return 'isolated-backup';},begin(ids){beginRecovery(s.root,ids,candidate,null);},
  commit(){return {workspace:s.repo.write(candidate,{restore:true})};},finish(){throw Error('模拟清理失败');},rollback(){recoverWorkspaceTransfer(s.root,{forceRollback:true});}
 });
 assert.match(result.warnings.join(' '),/重启/);
 await assert.rejects(s.reminders.handle('reminder-add',{title:'不可写',mode:'attention'}),/重启/);
 await assert.rejects(s.reminders.reconcile(),/重启/);
 assert.ok(recoverWorkspaceTransfer(s.root).committed);assert.equal(s.reminders.snapshot().rows[0].title,'新注意事项');
 await s.reminders.reconcile();assert.equal(s.reminders.diagnostics().appliedEnabled,true);
});
