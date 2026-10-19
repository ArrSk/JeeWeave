import { today } from '../shared/packages/core/src/semester-calendar.mjs';
import { organizeWebText, validDate } from './web-extract.mjs';
import { normalizeItem } from './planning.mjs';
import { writeTogether, dataKeys } from './workbench-data.mjs';
import { readModules, isModuleEnabled } from './modules.mjs';

export const chatKey = 'jiwei-desktop-chat-monitor-v1';
export const emptyChat = () => ({ schemaVersion: 1, sources: [], messages: [] });
const id = () => `chat-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const text = (value, max = 200) => typeof value === 'string' && value.length <= max;
const scalar = value => typeof value === 'string' ? value : Number.isSafeInteger(value) ? String(value) : '';
export function normalizeChat(value) {
  if (value == null) return emptyChat();
  if (value.schemaVersion !== 1 || !Array.isArray(value.sources) || !Array.isArray(value.messages) || value.sources.length > 50 || value.messages.length > 500) throw Error('群消息格式无效或超过容量，请先导出并整理记录。');
  const next = JSON.parse(JSON.stringify(value));
  for (const s of next.sources) {
    if (!text(s.id) || !s.id || !text(s.name) || !s.name.trim() || !['qq', 'wechat'].includes(s.platform) || !['manual', 'onebot11', 'wechat-bridge'].includes(s.transport) || (s.transport === 'onebot11' && s.platform !== 'qq') || (s.transport === 'wechat-bridge' && s.platform !== 'wechat') || !text(s.groupId) || !s.groupId.trim() || !text(s.accountId) || (s.transport !== 'manual' && !s.accountId.trim()) || typeof s.enabled !== 'boolean' || [s.keywords, s.excluded].some(words => !Array.isArray(words) || words.length > 20 || words.some(w => !text(w, 80) || !w.trim()))) throw Error('请填写来源名称、群标识和接入账号；关键词最多各 20 个。');
  }
  if (new Set(next.sources.map(s => s.id)).size !== next.sources.length || new Set(next.sources.map(s => JSON.stringify([s.platform, s.transport, s.accountId, s.groupId]))).size !== next.sources.length) throw Error('消息来源重复，请编辑已有来源。');
  const sources = new Set(next.sources.map(s => s.id));
  for (const m of next.messages) {
    if (!text(m.id, 1000) || !m.id || !sources.has(m.sourceId) || !text(m.text, 16000) || !m.text.trim() || !text(m.senderName) || !text(m.senderId) || !text(m.sentAt, 50) || !Number.isFinite(Date.parse(m.sentAt)) || !text(m.receivedAt, 50) || !Number.isFinite(Date.parse(m.receivedAt)) || !m.draft || !text(m.draft.title, 160) || !m.draft.title.trim() || !['pending', 'added', 'ignored'].includes(m.draft.status) || (m.draft.date !== '' && !validDate(m.draft.date)) || (m.draft.status === 'added' && (!text(m.draft.taskId, 1200) || !m.draft.taskId))) throw Error('群消息记录或来源引用无效，已有资料未覆盖。');
  }
  if (new Set(next.messages.map(m => m.id)).size !== next.messages.length) throw Error('群消息编号重复。');
  return next;
}
export const readChat = storage => normalizeChat(JSON.parse(storage.getItem(chatKey) || 'null'));
export function saveChatSource(storage, fields, sourceId) {
  const state = readChat(storage), old = state.sources.find(s => s.id === sourceId);
  if (sourceId && !old) throw Error('来源已不存在。');
  const split = value => [...new Set(String(value || '').split(/[,，\n]/).map(s => s.trim()).filter(Boolean))];
  const source = { ...old, id: old?.id || id(), name: String(fields.name || '').trim(), platform: fields.platform, transport: fields.transport, accountId: String(fields.accountId || '').trim(), groupId: String(fields.groupId || '').trim(), enabled: old?.enabled ?? true, keywords: split(fields.keywords), excluded: split(fields.excluded) };
  if (old && state.messages.some(m => m.sourceId === old.id) && ['platform', 'transport', 'accountId', 'groupId'].some(key => source[key] !== old[key])) throw Error('此来源已有记录，修改账号/群标识请另建来源，避免原文归属混淆。');
  state.sources = [...state.sources.filter(s => s.id !== source.id), source];
  storage.setItem(chatKey, JSON.stringify(normalizeChat(state))); return source;
}
export function setChatSourceEnabled(storage, sourceId, enabled) {
  const state = readChat(storage), source = state.sources.find(s => s.id === sourceId);
  if (!source || typeof enabled !== 'boolean') throw Error('来源已不存在。');
  source.enabled = enabled; storage.setItem(chatKey, JSON.stringify(state));
}
export function normalizeChatEvent(payload, transport) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw Error('消息事件必须是对象。');
  let event;
  if (transport === 'onebot11') {
    if (payload.post_type !== 'message' || payload.message_type !== 'group' || String(payload.user_id) === String(payload.self_id)) return null;
    const raw = payload.message;
    let body;
    if (Array.isArray(raw)) body = raw.filter(segment => segment?.type === 'text').map(segment => typeof segment.data?.text === 'string' ? segment.data.text : '').join('');
    else body = typeof raw === 'string' ? raw.replace(/\[CQ:[^\]]*\]/g, '').replace(/&#91;/g, '[').replace(/&#93;/g, ']').replace(/&#44;/g, ',').replace(/&amp;/g, '&') : '';
    event = { platform: 'qq', transport, accountId: scalar(payload.self_id), groupId: scalar(payload.group_id), externalId: scalar(payload.message_id), senderId: scalar(payload.user_id), senderName: payload.sender?.card || payload.sender?.nickname || scalar(payload.user_id), text: body, sentAt: typeof payload.time === 'number' && Number.isFinite(payload.time) ? new Date(payload.time * 1000).toISOString() : '' };
  } else if (transport === 'wechat-bridge') {
    if (payload.self === true) return null;
    event = { platform: 'wechat', transport, accountId: scalar(payload.accountId), groupId: scalar(payload.groupId), externalId: scalar(payload.id), senderId: scalar(payload.senderId), senderName: payload.senderName || scalar(payload.senderId), text: payload.text, sentAt: payload.sentAt };
  } else throw Error('不支持的消息协议。');
  if (!text(event.text, 16000)) throw Error('消息正文无效或超过 16000 字。');
  if (!event.text.trim()) return null;
  if (['accountId', 'groupId', 'externalId', 'senderId'].some(key => !text(event[key]) || !event[key]) || !text(event.senderName) || !text(event.sentAt, 50) || !/T.+(?:Z|[+-]\d{2}:\d{2})$/.test(event.sentAt) || !Number.isFinite(Date.parse(event.sentAt))) throw Error('消息缺少账号、群、发送者、消息编号或含时区的有效时间。');
  return { ...event, text: event.text.trim() };
}
export function sourceForEvent(state, event) {
  return state.sources.find(s => s.enabled && ['platform', 'transport', 'accountId', 'groupId'].every(key => s[key] === event[key]) && (!s.keywords.length || s.keywords.some(word => event.text.includes(word))) && !s.excluded.some(word => event.text.includes(word)));
}
export function ingestChatEvents(storage, events) {
  if (!isModuleEnabled(readModules(storage), 'chat-monitor')) throw Error('请先在插件管理中开启群消息。');
  const state = readChat(storage); let added = 0, skipped = 0;
  if (!Array.isArray(events) || events.length > 200) throw Error('一次最多接收 200 条消息。');
  for (const event of events) {
    const source = sourceForEvent(state, event);
    if (!source) { skipped++; continue; }
    const messageId = JSON.stringify([event.platform, event.accountId, event.groupId, event.externalId]);
    if (state.messages.some(m => m.id === messageId)) { skipped++; continue; }
    const reference = new Date(event.sentAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });
    const result = organizeWebText({ text: event.text }, reference), first = result.drafts[0];
    state.messages.unshift({ id: messageId, sourceId: source.id, text: event.text, senderName: event.senderName, senderId: event.senderId, sentAt: event.sentAt, receivedAt: new Date().toISOString(), draft: { title: first?.title || event.text.split('\n')[0].slice(0, 160), date: first?.date || '', dateInferred: first?.dateInferred || false, status: 'pending' } }); added++;
  }
  if (added) storage.setItem(chatKey, JSON.stringify(normalizeChat(state)));
  return { added, skipped };
}
export function importChatText(storage, sourceId, body, sentAt = `${today()}T12:00:00+08:00`) {
  const source = readChat(storage).sources.find(s => s.id === sourceId);
  if (!source || source.transport !== 'manual') throw Error('请选择手动整理来源；实时来源请通过接收接口导入。');
  const content = String(body || '').trim();
  if (!content || content.length > 16000 || !Number.isFinite(Date.parse(sentAt))) throw Error('请填写 1–16000 字消息和有效发送日期。');
  // Pasted text has no external message ID. Keep identical copies idempotent.
  if (readChat(storage).messages.some(m => m.sourceId === sourceId && m.text === content && m.sentAt === sentAt)) return { added: 0, skipped: 1 };
  return ingestChatEvents(storage, [{ ...source, externalId: id(), senderName: '手动提供', senderId: 'manual', text: content, sentAt }]);
}
export function reviewChatMessage(storage, messageId, fields) {
  const state = readChat(storage), message = state.messages.find(m => m.id === messageId);
  if (!message) throw Error('消息已不存在。');
  if (message.draft.status === 'added') return { added: false };
  if (fields.ignore) { message.draft.status = 'ignored'; storage.setItem(chatKey, JSON.stringify(state)); return { added: false }; }
  if (!isModuleEnabled(readModules(storage), 'chat-monitor') || !isModuleEnabled(readModules(storage), 'tasks')) throw Error('请先开启群消息和待办功能。');
  const title = String(fields.title || '').trim(), date = String(fields.date || '');
  if (!title || title.length > 160 || (date && !validDate(date))) throw Error('请填写 1–160 字待办名称和有效日期，或留空日期。');
  const tasks = JSON.parse(storage.getItem(dataKeys.tasks) || '[]'), taskId = `chat-task:${message.id}`;
  const source = state.sources.find(s => s.id === message.sourceId);
  if (!tasks.some(t => t.id === taskId)) tasks.push(normalizeItem({ id: taskId, title, date, done: false, createdAt: new Date().toISOString(), sourceTitle: source.name, sourceMessageId: message.id, sourceGroupId: source.groupId, evidence: message.text }, 'task'));
  Object.assign(message.draft, { title, date, status: 'added', taskId });
  writeTogether(storage, { [chatKey]: state, [dataKeys.tasks]: tasks }); return { added: true };
}
