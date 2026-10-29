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
