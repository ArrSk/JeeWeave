const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const requestName = 'reset-request.json';
const format = 'jeeweave-desktop-reset';
function inside(parent, child) {
  const relative=path.relative(parent,child);
  if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('清空路径超出本地数据目录。');
  return child;
}
function plain(file) {if(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink())throw Error('数据目录含链接，未执行清空；请保留原资料并检查路径。');}
function prepareReset(root, workspace, options) {
  root=path.resolve(root);plain(root);
  if(!workspace?.data.preferences.developerMode)throw Error('请先开启开发者模式，才能清空所有数据。');
  if(options?.confirmation!=='清空所有数据'||options.revision!==workspace.revision)throw Error('请重新打开清空确认，当前资料已变化或尚未确认。');
  const parent=inside(root,path.join(root,'backups'));plain(parent);
  if(fs.existsSync(parent)&&!fs.statSync(parent).isDirectory())throw Error('备份路径不是文件夹，未提交清空。');
  const backupName=`before-clear-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const request={format,schemaVersion:1,revision:workspace.revision,sourcePid:process.pid,backupName,requestedAt:new Date().toISOString()};
  const file=inside(root,path.join(root,requestName));plain(file);
  fs.writeFileSync(file,JSON.stringify(request,null,2)+'\n',{encoding:'utf8',flag:'wx'});
  return {request,backupPath:path.join(root,'backups',backupName)};
}
function cancelReset(root, request) {
  const file=inside(path.resolve(root),path.join(path.resolve(root),requestName));plain(file);
  if(fs.existsSync(file)&&JSON.parse(fs.readFileSync(file,'utf8')).backupName===request.backupName)fs.unlinkSync(file);
}
function resetSourceIsRunning(root) {
  const file=inside(path.resolve(root),path.join(path.resolve(root),requestName));plain(file);
  if(!fs.existsSync(file))return false;
  const request=JSON.parse(fs.readFileSync(file,'utf8'));
  if(!Number.isSafeInteger(request.sourcePid)||request.sourcePid<=0)throw Error('清空请求缺少来源进程，原资料未覆盖。');
  try{process.kill(request.sourcePid,0);return true;}catch(error){if(error.code==='ESRCH')return false;if(error.code==='EPERM')return true;throw error;}
}
// Called after the source process has exited, before any profile/session or
// single-instance lock is initialized. Move into the local backup, never delete.
function applyPendingReset(root, {rename=fs.renameSync}={}) {
  root=path.resolve(root);plain(root);const file=inside(root,path.join(root,requestName));plain(file);
  if(!fs.existsSync(file))return null;
  const request=JSON.parse(fs.readFileSync(file,'utf8'));
  if(request.format!==format||request.schemaVersion!==1||!/^before-clear-\d+-[a-f0-9]{8}$/.test(request.backupName)||!Number.isSafeInteger(request.revision))throw Error('清空请求无效，原资料未覆盖。');
  const parent=inside(root,path.join(root,'backups'));plain(parent);
  const backup=inside(parent,path.join(parent,request.backupName));plain(backup);
  const archived=inside(backup,path.join(backup,'data'));
  if(fs.existsSync(backup))throw Error('上次清空尚未完成，请保留 backups 中的原资料，勿覆盖备份。');
  const original=JSON.parse(fs.readFileSync(path.join(root,'workspace.json'),'utf8'));
  if(!original?.data.preferences.developerMode||original.revision!==request.revision)throw Error('清空请求已过期，原资料未覆盖。');
  const entries=fs.readdirSync(root).filter(name=>name!=='backups'&&name!==requestName);
  for(const name of entries) {plain(inside(root,path.join(root,name)));inside(archived,path.join(archived,name));}
  fs.mkdirSync(archived,{recursive:true});
  fs.writeFileSync(path.join(backup,'reset-manifest.json'),JSON.stringify({...request,entries,status:'preparing'},null,2)+'\n',{flag:'wx'});
  const moved=[];
  try {
    for(const name of entries){rename(inside(root,path.join(root,name)),inside(archived,path.join(archived,name)));moved.push(name);}
    fs.writeFileSync(path.join(backup,'reset-manifest.json'),JSON.stringify({...request,entries,status:'complete'},null,2)+'\n');
    rename(file,path.join(backup,requestName));
    return {backupPath:backup};
  } catch(error) {
    const failures=[];
    for(const name of moved.reverse())try{rename(inside(archived,path.join(archived,name)),inside(root,path.join(root,name)));}catch(e){failures.push(e.message);}
    fs.writeFileSync(path.join(backup,'reset-manifest.json'),JSON.stringify({...request,entries,status:failures.length?'recovery-required':'rolled-back',error:error.message},null,2)+'\n');
    if(!failures.length)cancelReset(root,request);
    throw Error(`清空未完成，${failures.length?'请从备份检查并恢复资料':'原资料已恢复'}。${error.message}`);
  }
}
module.exports={prepareReset,cancelReset,applyPendingReset,resetSourceIsRunning};
