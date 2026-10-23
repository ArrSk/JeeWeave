// A portable, versioned JSON envelope; no profile, cookies, caches or dependencies.
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID, createHash} = require('node:crypto');
const format = 'jeeweave-desktop-transfer', maxBytes = 128 * 1024 * 1024, maxFilesBytes = 64 * 1024 * 1024;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function safeRelative(name) {
  if (typeof name !== 'string' || !/^captures\/(?:web-captures|course-captures|migrations)\//.test(name) || /[\\:<>"|?*\x00-\x1f]/.test(name) || name.split('/').some(part => !part || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw Error('原文文件路径无效，未导入。');
  return name;
}
function collectFiles(root) {
  if (fs.existsSync(path.join(root,'captures')) && fs.lstatSync(path.join(root,'captures')).isSymbolicLink()) throw Error('原文目录包含链接，未迁移。');
  const files = []; let total = 0;
  const walk = (folder, relative) => {
    if (!fs.existsSync(folder)) return;
    if (fs.lstatSync(folder).isSymbolicLink()) throw Error('原文目录包含文件链接，请先移除链接再迁移。');
    for (const name of fs.readdirSync(folder)) {
      const file = path.join(folder,name), rel = `${relative}/${name}`, stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) throw Error('原文包含文件链接，请先移除链接再迁移。');
      if (stat.isDirectory()) { walk(file,rel); continue; }
      if (!stat.isFile()) throw Error('原文包含不支持的文件类型。');
      safeRelative(rel); total += stat.size;
      if (total > maxFilesBytes || files.length >= 10000) throw Error('原文超过 64 MiB 或 10000 个文件，请使用整目录迁移。');
      const bytes = fs.readFileSync(file); files.push({path:rel,base64:bytes.toString('base64'),sha256:digest(bytes)});
    }
  };
  for (const name of ['web-captures','course-captures','migrations']) walk(path.join(root,'captures',name),`captures/${name}`);
  return files;
}
function decodeFiles(input) {
  if (!Array.isArray(input) || input.length > 10000) throw Error('迁移包原文清单无效。');
  const seen = new Set(); let total = 0;
  return input.map(file => {
    const name = safeRelative(file?.path), key = name.toLowerCase();
    if (seen.has(key) || typeof file.base64 !== 'string') throw Error('迁移包有重复路径或损坏文件。');
    seen.add(key); const bytes = Buffer.from(file.base64,'base64'); total += bytes.length;
    if (total > maxFilesBytes || bytes.toString('base64') !== file.base64 || digest(bytes) !== file.sha256) throw Error('迁移包原文校验失败或超过 64 MiB。');
    return {name,bytes};
  });
}
function removeOwnedFolder(root, folder) {
  const base = path.resolve(root,'captures','migrations'), target = path.resolve(folder);
  if (path.dirname(target) !== base || !/^transfer-[0-9a-f-]+$/.test(path.basename(target))) throw Error('拒绝清理非迁移临时目录。');
  fs.rmSync(target,{recursive:true,force:true});
}
function createWorkspaceTransfer({root,version,read,write,readBackup,prepare}) {
  let pending = null;
  const packageData = () => ({format,packageVersion:1,appVersion:version,exportedAt:new Date().toISOString(),workspace:read(),files:collectFiles(root)});
  return {
    export(file) {
      const encoded = JSON.stringify(packageData());
      if (Buffer.byteLength(encoded) > maxBytes) throw Error('迁移包超过 128 MiB，请使用整目录迁移。');
      const temporary = `${file}.${randomUUID()}.tmp`;
      try { fs.writeFileSync(temporary,encoded,{flag:'wx'}); fs.renameSync(temporary,file); }
      finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
      return {path:file};
    },
    preview(file, folder = false) {
      pending = null;
      let sourceRoot = null;
      if (folder) {
        sourceRoot = fs.existsSync(path.join(file,'workspace.json')) ? file : path.join(file,'data');
        file = path.join(sourceRoot,'workspace.json');
      }
      if (!fs.existsSync(file)) throw Error('没有找到 workspace.json；请从旧版导出 JSON 后导入，原目录未修改。');
      if (fs.statSync(file).size > maxBytes) throw Error('文件超过 128 MiB，请使用整目录迁移。');
      const value = JSON.parse(fs.readFileSync(file,'utf8')), packed = value?.format === format;
      if (packed && value.packageVersion !== 1) throw Error('此迁移包来自不支持的新格式，请升级几微；当前资料未修改。');
      const current = read(), workspace = prepare(readBackup(packed ? value.workspace : value,current));
      const files = decodeFiles(packed ? value.files : sourceRoot ? collectFiles(sourceRoot) : []);
      const data = workspace.data, warnings = ['登录状态和接入密钥不会迁入，换机后请重新登录教务系统。'];
      if (!packed && !sourceRoot && data.webCaptures.some(record=>record.directory)) warnings.push('此 JSON 不包含独立原文。需要原文时，请选择旧版文件夹或迁移包。');
      const missing = data.webCaptures.filter(record=>record.directory && !files.some(file=>file.name.startsWith(record.directory+'/'))).length;
      if (missing && (packed || sourceRoot)) warnings.push(`${missing} 条网页记录没有找到独立原文；记录正文仍会保留。`);
      const token = randomUUID();
      pending = {token,workspace,files,revision:current.revision};
      return {token,summary:{source:packed?'几微迁移包':sourceRoot?'旧版数据文件夹':'桌面 JSON 备份',sourceVersion:packed?String(value.appVersion||'未记录'):'旧版未记录应用版本',targetVersion:version,dataVersion:workspace.schemaVersion,
        compatibility:!packed&&value.format!=='jeeweave-desktop-workspace'?'已转换旧版格式':'数据格式兼容',tables:data.timetables?.tables.length||0,items:data.tasks.length+data.plans.length,notes:data.journal?.entries.length||0,drafts:(data.journal?.draft?1:0)+(data.journal?.parkedDrafts?.length||0),objects:data.objectView?.objects.length||0,captures:data.webCaptures.length,files:files.length,warnings}};
    },
    cancel() { pending = null; },
    commit(token) {
      if (!pending || token !== pending.token) throw Error('迁移预览已失效，请重新选择文件。');
      if (read().revision !== pending.revision) throw Error('预览后当前数据有变化，请重新预览后确认，避免覆盖新修改。');
      const candidate = structuredClone(pending.workspace), directory = path.join(root,'captures','migrations',`transfer-${token}`);
      for (const folder of [path.join(root,'captures'),path.join(root,'captures','migrations')]) if (fs.existsSync(folder) && fs.lstatSync(folder).isSymbolicLink()) throw Error('目标原文目录包含链接，未导入。');
      try {
        for (const file of pending.files) {
          const target = path.join(directory,...file.name.split('/').slice(1));
          fs.mkdirSync(path.dirname(target),{recursive:true}); fs.writeFileSync(target,file.bytes,{flag:'wx'});
        }
        const prefix = `captures/migrations/transfer-${token}/`;
        if (pending.files.length) for (const record of candidate.data.webCaptures) {
          const relative = String(record.directory||'');
          if (pending.files.some(file=>file.name.startsWith(relative+'/'))) record.directory = prefix + relative.slice('captures/'.length);
        }
        candidate.revision = pending.revision;
        const workspace = write(candidate,{restore:true}); pending = null;
        return {workspace};
      } catch (error) { removeOwnedFolder(root,directory); throw error; }
    },
  };
}
module.exports = {createWorkspaceTransfer};
