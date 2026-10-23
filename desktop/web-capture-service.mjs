import { today } from '../shared/packages/core/src/semester-calendar.mjs';
import { organizeWebText } from './web-extract.mjs';
import { readModules, isModuleEnabled } from './modules.mjs';
import { requireDeveloperMode, isExampleRecord, visibleRecords } from './examples.mjs';

export const webCaptureKey = 'jiwei-desktop-web-collections-v1';
const read = (storage, key) => JSON.parse(storage.getItem(key) || '[]');
const requireEnabled = (storage, id) => {
  if (!isModuleEnabled(readModules(storage), id)) throw Error(id === 'web-capture' ? '网页采集已关闭，请在插件管理中开启。' : '请先在插件管理中开启事项。');
};

// Legacy exports remain available while callers migrate to the hosted service.
export function saveWebCapture(storage, source, day = today()) {
  requireEnabled(storage, 'web-capture');
  const url = new URL(source.url);
  if (!['http:', 'https:'].includes(url.protocol)) throw Error('来源网址必须是 HTTP 或 HTTPS。');
  const text = String(source.text || '').trim();
  if (!text) throw Error('网页没有可整理的正文。');
  const records = read(storage, webCaptureKey);
  const existing = records.find(record => record.url === url.href && record.text === text);
  if (existing) { if (isExampleRecord(storage, existing)) requireDeveloperMode(storage); return existing; }
  const record = { id: `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, url: url.href, title: String(source.title || url.hostname), text, links: source.links || [], directory: source.directory || '', capturedAt: source.capturedAt || new Date().toISOString(), ...organizeWebText({ text }, day) };
  storage.setItem(webCaptureKey, JSON.stringify([record, ...records]));
  return record;
}

function approveWebDraft(storage, captureId, draftId, fields, items) {
  requireEnabled(storage, 'web-capture'); requireEnabled(storage, 'tasks');
  const records = read(storage, webCaptureKey);
  const record = records.find(item => item.id === captureId), draft = record?.drafts.find(item => item.id === draftId);
  if (!draft) throw Error('草稿已不存在，请重新打开网页记录。');
  if (isExampleRecord(storage, record)) requireDeveloperMode(storage);
  if (draft.status === 'added') return { added: false };
  const title = String(fields.title || '').trim(), date = String(fields.date || '').trim();
  const provider = items();
  if (typeof provider?.addFromSource !== 'function') throw Error('事项服务不兼容，请重新打开应用。');
  const result = provider.addFromSource({ id: `web-task-${captureId}-${draftId}`, title, date, sourceUrl: record.url, sourceTitle: record.title, evidence: draft.evidence, example: record.example === true }, ({ ref }) => {
    Object.assign(draft, { title, date, status: 'added', taskId: ref.id });
    return { [webCaptureKey]: records };
  });
  return { added: result.added };
}

export function createWebCaptureService(storage, { items = () => { throw Error('事项服务未连接，请重新打开应用。'); }, onCommit = () => {} } = {}) {
  const list = () => { requireEnabled(storage, 'web-capture'); return visibleRecords(storage, read(storage, webCaptureKey)); };
  const commit = action => {
    const before = storage.getItem(webCaptureKey), result = action();
    if (storage.getItem(webCaptureKey) !== before) onCommit();
    return result;
  };
  return {
    list,
    inspect(id) {
      requireEnabled(storage, 'web-capture');
      const record = read(storage, webCaptureKey).find(record => record.id === id);
      if (!record) return { status: 'missing' };
      return visibleRecords(storage, [record]).length ? { status: 'found', record } : { status: 'hidden' };
    },
    get(id) { const record = list().find(record => record.id === id); if (!record) throw Error('网页记录已不存在或当前不可见。'); return record; },
    save: (source, day) => commit(() => saveWebCapture(storage, source, day)),
    approve: (captureId, draftId, fields) => commit(() => approveWebDraft(storage, captureId, draftId, fields, items)),
  };
}
