import { today, weekdayOf } from '../shared/packages/core/src/semester-calendar.mjs';
import { requireDeveloperMode, visibleRecords } from './examples.mjs';
import { writeTogether } from './workspace-transaction.mjs';
export const journalKey = 'jiwei-desktop-journal-v1';
export const journalKinds = { uncategorized: '未分类', observation: '见闻', feeling: '感受', idea: '想法', excerpt: '摘录', review: '复盘' };
const legacyKinds = { daily: 'observation', reflection: 'review', experience: 'review' };
// Display/filter old categories together without rewriting stored records or drafts.
export const journalKind = kind => Object.hasOwn(legacyKinds, kind) ? legacyKinds[kind] : kind;
export const journalKindLabel = kind => journalKinds[journalKind(kind)];
const copy = value => structuredClone(value);
const text = (value, max) => typeof value === 'string' && value.length <= max;
const isValidDate = value => { try { return typeof value === 'string' && !!weekdayOf(value); } catch { return false; } };
export function normalizeJournal(value) {
  if (value == null) return { schemaVersion: 1, entries: [], draft: null };
  if (value.schemaVersion !== 1 || !Array.isArray(value.entries)) throw Error('笔记格式不兼容，请保留原文件。');
  const state = copy(value), ids = new Set();
  const valid = (entry, draft = false) => {
    if (!entry || !text(entry.id, 200) || !entry.id || !isValidDate(entry.date) || !text(entry.body, 100000) || (!draft && !entry.body.trim()) || !text(entry.title ?? '', 160) || !(typeof entry.kind === 'string' && Object.hasOwn(journalKinds, journalKind(entry.kind))) || !Array.isArray(entry.tags) || entry.tags.length > 12 || entry.tags.some(tag => !text(tag, 40) || !tag.trim()) || new Set(entry.tags).size !== entry.tags.length || !Number.isFinite(Date.parse(entry.createdAt)) || !Number.isFinite(Date.parse(entry.updatedAt)) || !Number.isSafeInteger(entry.revision) || entry.revision < 1 || entry.example !== undefined && typeof entry.example !== 'boolean' || entry.archivedAt !== undefined && !Number.isFinite(Date.parse(entry.archivedAt)) || entry.deletedAt !== undefined && !Number.isFinite(Date.parse(entry.deletedAt))) throw Error('笔记内容、日期或标签无效，原数据未覆盖。');
    return entry;
  };
  for (const entry of state.entries) { valid(entry); if (ids.has(entry.id)) throw Error('笔记编号重复。'); ids.add(entry.id); }
  if (state.parkedDrafts !== undefined && !Array.isArray(state.parkedDrafts)) throw Error('笔记草稿格式无效。');
  const draftIds = new Set();
  for (const draft of [state.draft, ...(state.parkedDrafts || [])].filter(Boolean)) {
    valid(draft, true);
    if (draftIds.has(draft.id) || draft.editId !== undefined && (!text(draft.editId, 200) || !ids.has(draft.editId) || !Number.isSafeInteger(draft.baseRevision) || draft.baseRevision < 1)) throw Error('笔记草稿的原记录或编号无效。');
    draftIds.add(draft.id);
  }
  if (state.actionDrafts !== undefined) {
    if (!Array.isArray(state.actionDrafts)) throw Error('提炼草稿格式无效。');
    const actionIds = new Set();
    for (const action of state.actionDrafts) {
      if (!action || !text(action.id, 200) || !action.id || actionIds.has(action.id) || !text(action.entryId, 200) || !action.entryId || !Number.isSafeInteger(action.entryRevision) || action.entryRevision < 1 || !text(action.evidence, 4000) || !action.evidence.trim() || !text(action.title, 160) || !text(action.date, 10) || action.date && !isValidDate(action.date) || !text(action.time || '', 5) || action.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(action.time) || !text(action.objectId || '', 200) || !['pending', 'confirmed'].includes(action.status) || action.status === 'confirmed' && (!['task', 'plan'].includes(action.ref?.collection) || !text(action.ref.id, 200) || !action.ref.id || action.ref.containerId !== undefined)) throw Error('提炼草稿内容或来源无效。');
      actionIds.add(action.id);
    }
  }
  return state;
}
export const readJournal = storage => normalizeJournal(JSON.parse(storage.getItem(journalKey) || 'null'));
export const noteTitle = entry => entry.title?.trim() || entry.body.trim().split(/\r?\n/)[0] || '未命名笔记';
export function queryJournal(storage, { status = 'active', query = '', kind = '', date = '', tag = '' } = {}) {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return visibleRecords(storage, readJournal(storage).entries).filter(entry =>
    (status === 'trash' ? !!entry.deletedAt : !entry.deletedAt && (status === 'archived' ? !!entry.archivedAt : !entry.archivedAt)) &&
    (!kind || journalKind(entry.kind) === journalKind(kind)) && (!date || entry.date === date) && (!tag || entry.tags.includes(tag)) &&
    words.every(word => `${entry.title || ''}\n${entry.body}\n${entry.tags.join(' ')}`.toLocaleLowerCase().includes(word))
  ).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}
export function journalMarkdown(entries) {
  return entries.map(entry => `# ${noteTitle(entry)}\n\n日期：${entry.date} · ${journalKindLabel(entry.kind)}${entry.tags.length ? ` · ${entry.tags.map(t => `#${t}`).join(' ')}` : ''}\n\n${entry.body}\n`).join('\n---\n\n');
}
export function withJournalExamples(value, day = today(), at = new Date().toISOString()) {
  const state = normalizeJournal(value);
  const samples = [['review', '今天试着把复杂的事情拆成一个可以开始的小动作。\n比起追求一次做完，先走出一步更容易继续。'], ['feeling', '傍晚散步时觉得轻松了一些。给自己留一点不赶时间的空白。'], ['idea', '想到可以把课程里的例子画成图，周末再慢慢试一试。']];
  samples.forEach(([kind, body], index) => { const id = `demo-journal-${index + 1}`; if (!state.entries.some(entry => entry.id === id)) state.entries.push({ id, date: day, body, title: '', kind, tags: ['虚构示例'], example: true, revision: 1, createdAt: at, updatedAt: at }); });
  return normalizeJournal(state);
}
export function createJournalStore(storage, { onCommit = () => {}, objects = () => null, items = () => null, clock = () => new Date().toISOString(), makeId = () => `note_${Date.now()}_${Math.random().toString(36).slice(2, 10)}` } = {}) {
  const save = state => { const checked = normalizeJournal(state); storage.setItem(journalKey, JSON.stringify(checked)); onCommit(); return checked; };
  const editable = (state, id) => {
    const entry = visibleRecords(storage, state.entries).find(item => item.id === id);
    if (!entry) throw Error('笔记已不存在或当前不可见。');
    return entry;
  };
  const currentDraft = state => [state.draft, ...(state.parkedDrafts || [])].find(draft => draft && (!draft.example || storage.getItem('jiwei-desktop-developer-mode') === 'true')) || null;
  const replaceDraft = (state, old, next) => {
    if (state.draft === old) state.draft = next;
    else state.parkedDrafts = state.parkedDrafts.flatMap(draft => draft === old ? next ? [next] : [] : [draft]);
  };
  const published = (state, id) => { const entry = editable(state, id); if (entry.deletedAt) throw Error('请先从回收站恢复原笔记。'); if (entry.example) requireDeveloperMode(storage); return entry; };
  const pending = (state, id) => { const action = state.actionDrafts?.find(action => action.id === id); if (!action) throw Error('提炼草稿已不存在。'); published(state, action.entryId); return action; };
  return {
    read: () => readJournal(storage),
    inspect(id) {const entry=readJournal(storage).entries.find(e=>e.id===id);if(!entry||entry.deletedAt)return{status:'missing'};return visibleRecords(storage,[entry]).length?{status:'found',record:entry}:{status:'hidden'};},
    list: options => queryJournal(storage, options),
    features: () => ({ objects: !!objects(), items: !!items() }),
    context(id) { published(readJournal(storage), id); const service = objects(); return service ? { ...service.itemContext({ collection: 'journalEntry', id }), available: true } : { objects: [], owner: '', available: false }; },
    assign(id, objectId, originalOwner) {
      const entry = published(readJournal(storage), id), service = objects();
      if (!service) throw Error('对象功能已关闭，请重新开启后再修改归属。');
      const prepared = service.prepareItemAssignment({ ref: { collection: 'journalEntry', id }, title: noteTitle(entry).slice(0,500), example: !!entry.example, newRecord: false, objectId, originalOwner });
      writeTogether(storage, prepared.changes); onCommit();
    },
    actions(id) { const state = readJournal(storage); published(state, id); return (state.actionDrafts || []).filter(action => action.entryId === id); },
    beginAction(id, evidence) {
      const state = readJournal(storage), entry = published(state, id);
      if (!items()) throw Error('请先在插件管理中开启事项。');
      if (typeof evidence !== 'string' || !evidence.trim() || evidence.length > 4000 || !entry.body.includes(evidence)) throw Error('请从原笔记选取不超过 4000 字的连续文字。');
      const existing = state.actionDrafts?.find(action => action.entryId === id && action.entryRevision === entry.revision && action.evidence === evidence && action.status === 'pending');
      if (existing) return copy(existing);
      const owner = objects()?.itemContext({ collection: 'journalEntry', id }).owner || '';
      const action = { id: makeId(), entryId: id, entryRevision: entry.revision, evidence, title: evidence.trim().split(/\r?\n/)[0].slice(0,160), date: '', time: '', objectId: owner, status: 'pending', createdAt: clock() };
      state.actionDrafts = [...(state.actionDrafts || []), action]; save(state); return copy(action);
    },
    saveActionDraft(id, fields) {
      const state = readJournal(storage), action = pending(state, id);
      if (action.status !== 'pending') throw Error('这份草稿已经确认，请打开原事项。');
      Object.assign(action, { title: fields.title, date: fields.date, time: fields.time, objectId: fields.objectId });
      save(state); return copy(action);
    },
    confirmAction(id) {
      const state = readJournal(storage), action = pending(state, id), service = items();
      if (!service) throw Error('事项功能已关闭，请重新开启后确认。');
      if (action.status === 'confirmed') { service.get(action.ref); return { added: false, ref: copy(action.ref) }; }
      if (action.time && !action.date) throw Error('填写截止时间时，也需要填写截止日期。');
      const result = service.addFromNote({ ...action, actionId: action.id }, result => {
        action.status = 'confirmed'; action.ref = result.ref; action.confirmedAt = clock();
        return { [journalKey]: normalizeJournal(state) };
      });
      onCommit(); return result;
    },
    discardActionDraft(id) { const state = readJournal(storage), action = pending(state, id); if (action.status !== 'pending') throw Error('已确认的来源记录不能作为草稿删除。'); state.actionDrafts = state.actionDrafts.filter(item => item.id !== id); save(state); },
    draft: () => currentDraft(readJournal(storage)),
    start(id) {
      const state = readJournal(storage);
      const current = currentDraft(state);
      if (current) {
        if (current.editId === id || !id && !current.editId) return copy(current);
        throw Error('还有一份草稿，请先继续记录或明确放弃草稿。');
      }
      if (state.draft) { state.parkedDrafts = [...(state.parkedDrafts || []), state.draft]; state.draft = null; }
      const at = clock(), entry = id ? editable(state, id) : null;
      if (entry?.deletedAt) throw Error('请先从回收站恢复笔记。');
      state.draft = { ...(entry || {}), id: makeId(), date: entry?.date || today(), title: entry?.title || '', body: entry?.body || '', kind: entry?.kind || 'uncategorized', tags: copy(entry?.tags || []), createdAt: entry?.createdAt || at, updatedAt: at, revision: 1, ...(entry ? { editId: entry.id, baseRevision: entry.revision } : {}) };
      save(state); return copy(state.draft);
    },
    saveDraft(fields, expectedRevision) {
      const state = readJournal(storage), old = currentDraft(state);
      if (!old || old.revision !== expectedRevision) throw Error('草稿已变化，请重新打开以免覆盖。');
      if (old.example) requireDeveloperMode(storage);
      const kind = journalKind(fields.kind) === journalKind(old.kind) ? old.kind : fields.kind;
      const next = { ...old, body: fields.body, title: fields.title, date: fields.date, kind, tags: fields.tags, revision: old.revision + 1, updatedAt: clock() };
      replaceDraft(state, old, next); save(state); return copy(next);
    },
    publish(expectedRevision) {
      const state = readJournal(storage), draft = currentDraft(state);
      if (!draft || draft.revision !== expectedRevision) throw Error('草稿已变化，请重新打开。');
      if (draft.example) requireDeveloperMode(storage);
      if (!draft.body.trim()) throw Error('先写下一点内容，再存为笔记。');
      const previous = draft.editId ? editable(state, draft.editId) : null;
      if (previous && (previous.revision !== draft.baseRevision || previous.deletedAt)) throw Error('原笔记已变化，请保留草稿并重新核对。');
      const entry = { ...draft, id: previous?.id || draft.id, revision: (previous?.revision || 0) + 1, createdAt: previous?.createdAt || draft.createdAt, updatedAt: clock() };
      delete entry.editId; delete entry.baseRevision;
      if (previous) state.entries[state.entries.indexOf(previous)] = entry; else state.entries.push(entry);
      replaceDraft(state, draft, null); save(state); return entry;
    },
    discardDraft() { const state = readJournal(storage), draft = currentDraft(state); if (!draft) return; if (draft.example) requireDeveloperMode(storage); replaceDraft(state, draft, null); save(state); },
    change(id, action) {
      const state = readJournal(storage), entry = editable(state, id);
      if (entry.example) requireDeveloperMode(storage);
      if ([state.draft, ...(state.parkedDrafts || [])].some(draft => draft?.editId === id)) throw Error('这篇笔记还有编辑草稿，请先保存或放弃草稿。');
      if (action === 'purge') { if (!entry.deletedAt) throw Error('请先移入回收站。'); state.entries = state.entries.filter(item => item !== entry); if (state.actionDrafts) state.actionDrafts = state.actionDrafts.filter(draft => draft.entryId !== id || draft.status === 'confirmed'); }
      else if (action === 'trash') entry.deletedAt = clock();
      else if (action === 'restore') delete entry.deletedAt;
      else if (action === 'archive') entry.archivedAt = clock();
      else if (action === 'unarchive') delete entry.archivedAt;
      else throw Error('未知笔记操作。');
      entry.updatedAt = clock(); entry.revision++; save(state);
    },
    examples() {
      requireDeveloperMode(storage);
      save(withJournalExamples(readJournal(storage), today(), clock()));
    },
  };
}
