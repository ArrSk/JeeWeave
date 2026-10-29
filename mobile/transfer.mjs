import { readWorkspaceBackup, prepareWorkspaceRestore } from './desktop/workspace-format.mjs';

export function readMobileTransfer(value, current) {
  if (value?.format === 'jeeweave-desktop-transfer') {
    if (value.packageVersion !== 1 || !Array.isArray(value.files)) throw Error('迁移包格式暂不支持，请保留原文件并升级应用。');
    transferFiles(value);
    value = value.workspace;
  }
  return prepareWorkspaceRestore(readWorkspaceBackup(value, current));
}

export function transferFiles(value) {
  if (value?.format !== 'jeeweave-desktop-transfer') return [];
  const files = value.files, names = new Set(); let bytes = 0;
  if (!Array.isArray(files) || files.length > 10000) throw Error('迁移包原文清单无效。');
  for (const file of files) {
    const name = file?.path;
    if (typeof name !== 'string' || !/^captures\/(web-captures|course-captures|migrations)\//.test(name) || /[\\:<>"|?*\x00-\x1f]/.test(name) || name.split('/').some(part => !part || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) || names.has(name.toLowerCase())) throw Error('迁移包原文路径无效或重复。');
    names.add(name.toLowerCase());
    if (typeof file.base64 !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.base64) || !/^[a-f0-9]{64}$/.test(file.sha256 || '')) throw Error('迁移包附件编码或校验值无效。');
    bytes += file.base64.length / 4 * 3 - (file.base64.endsWith('==') ? 2 : file.base64.endsWith('=') ? 1 : 0);
    if (bytes > 64 * 1024 * 1024) throw Error('原文超过 64 MiB，请拆分后迁移。');
  }
  return files;
}

export function transferSummary(workspace, value) {
  const d = workspace.data;
  return { source: '几微工作区 / 迁移包', sourceVersion: String(value?.appVersion || 'JSON / 未记录应用版本'), targetVersion: '0.3.0-mobile-beta.3', compatibility: '同一工作区格式；将替换本机资料', dataVersion: workspace.schemaVersion,
    tables: d.timetables?.tables.length || 0, items: d.plans.length + d.tasks.length, notes: d.journal?.entries?.length || 0,
    drafts: (d.journal?.draft ? 1 : 0) + (d.journal?.parkedDrafts?.length || 0), objects: d.objectView?.objects?.length || 0,
    captures: d.webCaptures.length, files: transferFiles(value).length, warnings: ['确认导入前保留本机工作区；附件逐项校验，失败不覆盖。登录状态不迁移。'] };
}
