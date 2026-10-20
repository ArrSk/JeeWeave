import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { emptyWorkspace, validateWorkspace } from './workspace-format.mjs';
const { prepareReset, cancelReset, applyPendingReset, resetSourceIsRunning }=createRequire(import.meta.url)('./reset-data.cjs');
const parent=path.resolve('desktop/.cache/verification');fs.mkdirSync(parent,{recursive:true});
function fixture(){const root=fs.mkdtempSync(path.join(parent,'reset-unit-')),workspace=validateWorkspace(emptyWorkspace());workspace.revision=3;workspace.data.preferences.developerMode=true;fs.writeFileSync(path.join(root,'workspace.json'),JSON.stringify(workspace));return {root,workspace,options:{confirmation:'清空所有数据',revision:3}};}
test('只有开发者模式及当前版本的明确确认可提交清空请求，取消不改变原文件',()=>{
  const {root,workspace,options}=fixture(),before=fs.readFileSync(path.join(root,'workspace.json'),'utf8');
  assert.throws(()=>prepareReset(root,{...workspace,data:{...workspace.data,preferences:{...workspace.data.preferences,developerMode:false}}},options),/开发者/);
  for(const option of [{...options,revision:2},{...options,confirmation:''}])assert.throws(()=>prepareReset(root,workspace,option),/确认/);
  const pending=prepareReset(root,workspace,options);assert.throws(()=>prepareReset(root,workspace,options),/exist/i);cancelReset(root,pending.request);
  assert.equal(applyPendingReset(root),null);assert.equal(fs.readFileSync(path.join(root,'workspace.json'),'utf8'),before);
});
test('原应用进程未退出时不应在第二次启动中提前执行清空',()=>{
  const {root,workspace,options}=fixture();assert.equal(resetSourceIsRunning(root),false);const pending=prepareReset(root,workspace,options);
  assert.equal(resetSourceIsRunning(root),true);assert.equal(fs.existsSync(path.join(root,'workspace.json')),true);cancelReset(root,pending.request);assert.equal(resetSourceIsRunning(root),false);
});
test('清空将全部活动数据移入同目录备份，登录/原文/未知文件完整保留，旧备份不动',()=>{
  const {root,workspace,options}=fixture();
  for(const folder of ['profile','captures','integrations','exports','cache','logs','backups']){fs.mkdirSync(path.join(root,folder));fs.writeFileSync(path.join(root,folder,'keep.txt'),folder);}
  fs.writeFileSync(path.join(root,'reset-manifest.json'),'user-owned metadata');
  const request=prepareReset(root,workspace,options),result=applyPendingReset(root);assert.equal(result.backupPath,request.backupPath);
  assert.equal(JSON.parse(fs.readFileSync(path.join(result.backupPath,'data/workspace.json'),'utf8')).revision,3);
  for(const folder of ['profile','captures','integrations','exports','cache','logs'])assert.equal(fs.readFileSync(path.join(result.backupPath,'data',folder,'keep.txt'),'utf8'),folder);
  assert.equal(fs.readFileSync(path.join(result.backupPath,'data/reset-manifest.json'),'utf8'),'user-owned metadata');
  assert.equal(fs.readFileSync(path.join(root,'backups/keep.txt'),'utf8'),'backups');assert.deepEqual(fs.readdirSync(root),['backups']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(result.backupPath,'reset-manifest.json'),'utf8')).status,'complete');assert.equal(applyPendingReset(root),null);
});
test('移动失败逐项回滚，不清除业务、登录和原文，失败状态可检查',()=>{
  const {root,workspace,options}=fixture();fs.mkdirSync(path.join(root,'profile'));fs.writeFileSync(path.join(root,'profile/session'),'keep');fs.mkdirSync(path.join(root,'captures'));fs.writeFileSync(path.join(root,'captures/original'),'source');
  const pending=prepareReset(root,workspace,options);let calls=0;
  assert.throws(()=>applyPendingReset(root,{rename:(a,b)=>{if(++calls===3)throw Error('fixture locked');fs.renameSync(a,b);}}),/原资料已恢复/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'workspace.json'),'utf8')).revision,3);assert.equal(fs.readFileSync(path.join(root,'profile/session'),'utf8'),'keep');assert.equal(fs.readFileSync(path.join(root,'captures/original'),'utf8'),'source');
  assert.equal(fs.existsSync(path.join(root,'reset-request.json')),false);assert.equal(JSON.parse(fs.readFileSync(path.join(pending.backupPath,'reset-manifest.json'),'utf8')).status,'rolled-back');
});
test('过期、路径穿越和未完成的旧请求都停止，不覆盖原文件或旧备份',()=>{
  const {root,workspace,options}=fixture(),pending=prepareReset(root,workspace,options),file=path.join(root,'reset-request.json');
  fs.writeFileSync(file,JSON.stringify({...pending.request,backupName:'../outside'}));assert.throws(()=>applyPendingReset(root),/无效/);
  fs.writeFileSync(file,JSON.stringify({...pending.request,revision:2}));assert.throws(()=>applyPendingReset(root),/过期/);
  fs.writeFileSync(file,JSON.stringify(pending.request));fs.mkdirSync(pending.backupPath,{recursive:true});assert.throws(()=>applyPendingReset(root),/上次/);assert.equal(fs.existsSync(path.join(root,'workspace.json')),true);
});
