import { buildItem, normalizeItem, validateItem, toggleItem, isOnDate, isComplete, executionSlotsOnDate } from './planning.mjs';
import { visibleRecords, requireDeveloperMode, isExampleRecord } from './examples.mjs';
import { writeTogether } from './workspace-transaction.mjs';
import { today, weekdayOf } from '../shared/packages/core/src/semester-calendar.mjs';
import { courseOccurs, projectCourseOccurrences } from './course-occurrences.mjs';

const keyOf = kind => {
  if (!['task', 'plan'].includes(kind)) throw Error('事项来源无效。');
  return `jiwei-desktop-${kind === 'plan' ? 'plans' : 'tasks'}`;
};

// Own the two legacy collections; callers use stable collection/id references.
export function createItemService(storage, { enabled = () => true, objects = () => null, journal = () => null, courses = () => null, onCommit = () => {} } = {}) {
  const read = kind => JSON.parse(storage.getItem(keyOf(kind)) || '[]').map(item => normalizeItem(item, kind));
  const check = kind => { keyOf(kind); if (!enabled(kind === 'task' ? 'tasks' : 'plans')) throw Error('事项功能已关闭，请在插件管理中重新开启。'); };
  const get = ref => {
    check(ref?.collection);
    const item = visibleRecords(storage, read(ref.collection)).find(item => item.id === ref.id);
    if (!item) throw Error('此事项已不存在或当前不可见。');
    return item;
  };
  const commit = (kind, item, remove = false) => {
    const all = read(kind), index = all.findIndex(old => old.id === item.id);
    if (remove) all.splice(index, 1); else all[index] = item;
    writeTogether(storage, { [keyOf(kind)]: all }); onCommit(); return item;
  };
  const list = kind => {
    const kinds = kind ? [kind] : ['task', 'plan'];
    return kinds.flatMap(source => { keyOf(source); return enabled(source === 'task' ? 'tasks' : 'plans') ? visibleRecords(storage, read(source)) : []; });
  };
  return {
    list,
    inspect(ref) {
      check(ref?.collection);
      const record = read(ref.collection).find(item => item.id === ref.id);
      if (!record) return { status: 'missing' };
      return visibleRecords(storage, [record]).length ? { status: 'found', record } : { status: 'hidden' };
    },
    summary() {
      const records = list(), unfinished = records.filter(item => !item.done).length;
      // A repeating record remains unfinished after completing one occurrence.
      return { total: records.length, unfinished, completed: records.length - unfinished };
    },
    onDate(date = today()) {
      weekdayOf(date); // Validate dates even when the only records are floating.
      return list().filter(item => executionSlotsOnDate(item, date).length || !isComplete(item, date) && (item.anchor.type === 'floating' && !item.executionSlots?.length || isOnDate(item, date)));
    },
    get,
    courseContext(origin) {
      if (!origin) return null;
      if (!enabled('courses')) return { status: 'disabled', origin };
      try {
        const result = courses()?.inspect({ collection: 'courseEntry', containerId: origin.tableId, id: origin.courseId });
        if (result?.status !== 'found') return { status: result?.status || 'unavailable', origin };
        const entries = projectCourseOccurrences(result.table).filter(entry => entry.courseId === origin.courseId && entry.originalDate === origin.originalDate);
        return { status: entries.length ? 'found' : 'changed', origin, entries };
      } catch { return { status: 'unavailable', origin }; }
    },
    addFromNote(fields, prepareRelated) {
      const prepare = result => { const related = prepareRelated?.(structuredClone(result)); if (!related || typeof related !== 'object' || Array.isArray(related) || typeof related.then === 'function' || Object.keys(related).some(key => key !== 'jiwei-desktop-journal-v1')) throw Error('笔记确认事务无效。'); return related; };
      const source = journal()?.inspect(fields.entryId);
      if (source?.status !== 'found') throw Error('原笔记已删除、关闭或当前不可见。');
      const note = source.record;
      if (note.example) requireDeveloperMode(storage);
      const all = ['task', 'plan'].flatMap(kind => read(kind));
      const duplicate = all.find(item => item.sourceRef?.collection === 'journalEntry' && item.sourceRef.id === note.id && item.sourceActionId === fields.actionId);
      if (duplicate) { check(duplicate.kind); if (isExampleRecord(storage, duplicate)) requireDeveloperMode(storage); const result = { added: false, ref: { collection: duplicate.kind, id: duplicate.id } }; writeTogether(storage, prepare(result)); onCommit(); return result; }
      if (note.revision !== fields.entryRevision || typeof fields.evidence !== 'string' || !fields.evidence.trim() || fields.evidence.length > 4000 || !note.body.includes(fields.evidence)) throw Error('原笔记内容已变化，请重新选取原文并核对。');
      if (typeof fields.actionId !== 'string' || !fields.actionId || fields.actionId.length > 200) throw Error('提炼草稿编号无效。');
      const kind = enabled('tasks') ? 'task' : 'plan'; check(kind);
      const item = buildItem({ type: fields.date ? 'deadline' : 'longterm', date: fields.date, startTime: fields.time, title: fields.title, note: fields.evidence }, null, kind);
      item.sourceRef = { collection: 'journalEntry', id: note.id }; item.sourceActionId = fields.actionId;
      item.sourceTitle = note.title || note.body.split(/\r?\n/)[0].slice(0, 160); item.evidence = fields.evidence;
      if (note.example) item.example = true;
      const objectService = objects();
      if (fields.objectId && !objectService) throw Error('对象功能已关闭，请先开启后再确认归属。');
      const assignment = objectService?.prepareItemAssignment({ ref: { collection: kind, id: item.id }, title: item.title, example: !!item.example, newRecord: true, objectId: fields.objectId || '', originalOwner: '' });
      if (assignment?.example) item.example = true;
      const result = { added: true, ref: { collection: kind, id: item.id } }, related = prepare(result);
      writeTogether(storage, { [keyOf(kind)]: [...read(kind), validateItem(item)], ...assignment?.changes, ...related });
      onCommit(); return result;
    },
    addFromSource(fields, prepareRelated = () => ({})) {
      check('task');
      if (fields.example) requireDeveloperMode(storage);
      const title = String(fields.title || '').trim(), date = String(fields.date || '').trim();
      if (!title) throw Error('请填写待办名称。');
      if (date) { try { weekdayOf(date); } catch { throw Error('请填写有效日期。'); } }
      const sourceUrl = String(fields.sourceUrl || ''), url = new URL(sourceUrl);
      if (!['http:', 'https:'].includes(url.protocol)) throw Error('来源网址必须是 HTTP 或 HTTPS。');
      const key = keyOf('task'), tasks = JSON.parse(storage.getItem(key) || '[]');
      const duplicate = tasks.find(item => item.sourceUrl === sourceUrl && item.title === title && item.date === date);
      if (duplicate && isExampleRecord(storage, duplicate)) requireDeveloperMode(storage);
      if (!duplicate && (typeof fields.id !== 'string' || !fields.id || tasks.some(item => item.id === fields.id))) throw Error('事项编号无效或已存在，请重新核对来源。');
      const item = duplicate || validateItem(normalizeItem({ id: fields.id, title, date, done: false, createdAt: new Date().toISOString(), sourceUrl, sourceTitle: fields.sourceTitle, evidence: fields.evidence, ...(fields.example ? { example: true } : {}) }, 'task'));
      const result = { added: !duplicate, ref: { collection: 'task', id: item.id } };
      // Trusted, synchronous participant only; prepare both owners before writing.
      const related = prepareRelated(structuredClone(result));
      if (!related || typeof related !== 'object' || Array.isArray(related) || typeof related.then === 'function' || ['task', 'plan'].some(kind => Object.hasOwn(related, keyOf(kind)))) throw Error('关联事务无效，不能异步准备或覆盖事项集合。');
      if (!duplicate) tasks.push(item);
      if (result.added || Object.keys(related).length) { writeTogether(storage, { [key]: tasks, ...related }); onCommit(); }
      return result;
    },
    context(ref = null) { if (ref) get(ref); return objects()?.itemContext(ref) || { objects: [], owner: '' }; },
    save(fields, { ref = null, objectId = '', originalOwner = '', courseOrigin = null } = {}) {
      const preferred = ['deadline', 'longterm'].includes(fields.type) ? 'task' : 'plan';
      const kind = ref?.collection || (enabled(preferred === 'task' ? 'tasks' : 'plans') ? preferred : preferred === 'task' ? 'plan' : 'task');
      check(kind);
      const latest = ref ? get(ref) : null;
      if (fields.type !== 'range' && fields.phases?.length) throw Error('此事项已有阶段，请先在阶段计划类型中移除阶段，再更改时间安排。');
      if (fields.deadlineTime && !fields.deadlineDate) throw Error('填写截止时间时，也需要填写截止日期。');
      const phases = (fields.phases || []).map(phase => ({ ...phase, done: latest?.phases.find(old => old.id === phase.id)?.done ?? phase.done }));
      const item = buildItem({ ...fields, phases }, latest, kind), changes = {};
      if (!latest && courseOrigin) {
        const result = courses()?.inspect({ collection: 'courseEntry', containerId: courseOrigin.tableId, id: courseOrigin.courseId });
        if (result?.status !== 'found' || !courseOccurs(result.table, result.record, courseOrigin.originalDate)) throw Error('原课次已变化或不可用，请回到课表重新选择。');
        item.courseOrigin = { tableId: result.table.id, courseId: result.record.id, originalDate: courseOrigin.originalDate, title: result.record.title.slice(0, 200) };
        if (result.table.example || result.record.example) { requireDeveloperMode(storage); item.example = true; }
        validateItem(item);
      }
      const assignment = objects()?.prepareItemAssignment({ ref: { collection: kind, id: item.id }, title: item.title, example: item.example === true, newRecord: !latest, objectId, originalOwner });
      if (assignment) { Object.assign(changes, assignment.changes); if (assignment.example) item.example = true; }
      const all = read(kind), index = all.findIndex(old => old.id === item.id);
      if (index < 0) all.push(item); else all[index] = item;
      changes[keyOf(kind)] = all;
      writeTogether(storage, changes); onCommit(); return item;
    },
    toggle(ref, date = today()) { const item = get(ref); return commit(ref.collection, toggleItem(item, date)); },
    setPhase(ref, phaseId, done) {
      const item = get(ref);
      if (typeof done !== 'boolean' || !item.phases.some(phase => phase.id === phaseId)) throw Error('阶段已不存在或状态无效，请刷新后重试。');
      const at = new Date().toISOString();
      return commit(ref.collection, { ...item, updatedAt: at, phases: item.phases.map(phase => phase.id === phaseId ? { ...phase, done, updatedAt: at } : phase) });
    },
    remove(ref) { return commit(ref.collection, get(ref), true); },
  };
}
