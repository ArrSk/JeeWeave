import { readMobileTransfer, transferSummary, transferFiles } from './transfer.mjs';

// The synchronous commit contract is shared with Desktop; disk succeeds before UI.
export function createMobileBridge(native, cache = globalThis.localStorage) {
  let sequence = 0, candidate = null;
  const pending = new Map();
  const key = 'jeeweave-android-preview-workspace';
  const parse = text => JSON.parse(text);
  const request = (action, payload = {}) => {
    if (!native) return Promise.resolve({ ok: false, message: '浏览器预览不提供 Android 系统文件窗口，请在 APK 中体验。' });
    const id = String(++sequence);
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      try { native.request(id, action, JSON.stringify(payload)); } catch (error) { pending.delete(id); reject(error); }
    });
  };
  const read = () => native ? parse(native.readWorkspace()) : { ok: true, workspace: JSON.parse(cache.getItem(key) || 'null'), paths: { root: '浏览器隔离预览（不是手机数据）' } };
  const write = (workspace, options = {}) => {
    if (native) return parse(native.writeWorkspace(JSON.stringify(workspace), options.restore === true));
    try {
      const old = read().workspace;
      if (old && old.revision !== workspace.revision) throw Error('资料已变化，请重新打开后重试。');
      const next = structuredClone(workspace); next.revision++; next.updatedAt = new Date().toISOString();
      if (options.restore && old) cache.setItem(key + '-before-import', JSON.stringify(old));
      cache.setItem(key, JSON.stringify(next)); return { ok: true, workspace: next };
    } catch (error) { return { ok: false, message: error.message }; }
  };
  return {
    platform: 'android',
    assistantRequest: (action,payload) => request(action,payload),
    resolve(id, result) { const p = pending.get(id); if (p) { pending.delete(id); p.resolve(result); } },
    readWorkspace: async () => read(), writeWorkspace: write,
    setUnsavedJournal() {}, async setWindowAppearance() {},
    exportWorkspace: () => request('export'),
    open: url => request('portal-open', { url }),
    async captureNow() { const result=await request('portal-capture'); return {...result,sourceHtml:''}; },
    onPortalStatus: () => () => {},
    saveTextFile: (name, text, mime = 'text/plain') => request('save', { name, text, mime }),
    async transferWorkspace(action, token) {
      if (action === 'cancel') { candidate = null; return { ok: true }; }
      if (action === 'export') return this.exportWorkspace();
      if (action === 'preview-file') {
        candidate = null;
        const file = await request('open'); if (!file.ok || file.cancelled) return file;
        const current = read(); if (!current.ok) return current;
        const value = JSON.parse(file.text), workspace = readMobileTransfer(value, current.workspace);
        candidate = { workspace, files: transferFiles(value), revision: current.workspace.revision, token: crypto.randomUUID() };
        return { ok: true, token: candidate.token, summary: transferSummary(workspace, value) };
      }
      if (action === 'commit') {
        if (!candidate || candidate.token !== token) throw Error('导入预览已失效，请重新选择。');
        const current = read(); if (!current.ok) return current;
        if (current.workspace.revision !== candidate.revision) throw Error('预览后本机资料已变化，请重新预览导入。');
        candidate.workspace.revision = candidate.revision;
        const result = native?.restoreTransfer ? parse(native.restoreTransfer(JSON.stringify({ workspace: candidate.workspace, files: candidate.files }))) : candidate.files.length ? {ok:false,message:'此环境未提供附件保存能力。'} : write(candidate.workspace, { restore: true }); if (result.ok) candidate = null;
        return result;
      }
      return { ok: false, message: '手机版暂不支持从电脑文件夹直接迁移，请选择 JSON 工作区文件。' };
    },
  };
}
