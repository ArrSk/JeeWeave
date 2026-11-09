import { intentRequest, parseDraftContent, normalizeDraft } from './assistant-core.mjs';
import { validateReminder } from '../desktop/reminder-core.mjs';
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
    async assistant(action,payload={}) {
      const id=action.startsWith('reminder')?'reminders':'assistant';
      const flags=read().workspace?.data?.preferences?.modules?.enabled||{};
      if(flags[id]===false)return {ok:false,message:'该功能已关闭，请在插件管理中开启。'};
      if(action==='parse') {
        if(!native)return {ok:false,message:'浏览器预览未连接手机原生 API；可体验本地提醒草稿与其他操作，原输入仍可存为笔记。'};
        const now=Date.now(),body=intentRequest(payload.text||'',payload.image,new Date(now),payload.catalog||[],payload.context||[]);
        let result=await request('assistant-parse',{request:body,vision:Boolean(payload.image)}),tokens=0;
        for(let attempt=0;attempt<2;attempt++){
          if(!result?.ok)return result;
          tokens+=Number(result.tokens)||0;
          try{return {...result,tokens,intent:normalizeDraft(parseDraftContent(result.content),payload.text,now,payload.catalog||[])};}
          catch(error){
            if(attempt)throw error;
            const repair={...body,max_tokens:3072,messages:[...body.messages,{role:'assistant',content:String(result.content||'').slice(0,24000)},{role:'user',content:'修正草稿JSON格式，保留原意，只用允许的公共命令。错误：'+error.message}]};
            result=await request('assistant-parse',{request:repair,vision:Boolean(payload.image)});
          }
        }
      }
      if(!native){
        if(action==='settings-get')return {ok:true,textModel:'deepseek-flash',visionUrl:'',visionModel:'',textKeySaved:false};
        if(action.startsWith('settings-')||['voice','image'].includes(action))return {ok:false,message:'此项需要 Android 原生服务；浏览器预览不保存密钥。'};
        const reminderKey=key+'-reminders',rows=JSON.parse(cache.getItem(reminderKey)||'[]');
        const save=()=>cache.setItem(reminderKey,JSON.stringify(rows));
        if(action==='reminders-list')return {ok:true,rows,preview:true};
        if(action==='reminder-add'){const row={...validateReminder(payload),id:crypto.randomUUID(),createdAt:new Date().toISOString()};rows.push(row);save();return {ok:true,row,preview:true};}
        if(action==='reminder-cancel'){const index=rows.findIndex(row=>row.id===payload.id);if(index>=0)rows.splice(index,1);save();return {ok:true};}
        if(action==='reminder-state'){const row=rows.find(row=>row.id===payload.id);if(!row)return {ok:false,message:'提醒已不存在'};row.archived=payload.archived===true;save();return {ok:true,row};}
        if(action==='reminder-repair')return {ok:true,count:0,message:'浏览器预览只展示提醒，不发系统通知'};
      }
      const value=action==='reminder-add'?validateReminder(payload):payload;
      return request(action.startsWith('reminder')?action:'assistant-'+action,value);
    },
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
