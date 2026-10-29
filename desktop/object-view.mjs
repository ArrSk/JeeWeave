import { visibleRecords } from './examples.mjs';
import { normalizeItem, describeItem } from './planning.mjs';
import { projectCourseOccurrences, courseTimes } from './course-occurrences.mjs';
export const objectKey = 'jiwei-desktop-objects-v1';
export const objectTypes = { course:'课程', project:'项目', general:'主题' };
export const refKey = ref => JSON.stringify([ref.collection, ref.containerId || '', ref.id]);
export function nextObjectCourse(table,id,date,time) {
  return projectCourseOccurrences(table).filter(c=>c.courseId===id&&c.status==='normal'&&(c.date>date||c.date===date&&courseTimes(table,c).end>time)).sort((a,b)=>a.date.localeCompare(b.date)||a.periodStart-b.periodStart)[0]||null;
}
const collections = ['courseEntry','task','plan','capture','journalEntry'];
const string = (value, limit) => typeof value === 'string' && value.length <= limit;
export function normalizeObjects(value) {
  if (value === undefined || value === null) return { schemaVersion:1, objects:[], links:[] };
  if (value.schemaVersion !== 1 || !Array.isArray(value.objects) || !Array.isArray(value.links)) throw Error('对象视图格式不兼容，请保留原文件。');
  const next = structuredClone(value), ids = new Set();
  for (const object of next.objects) {
    if (!object || !string(object.id,200) || !object.id || ids.has(object.id) || !Object.hasOwn(objectTypes,object.type) || !string(object.title,160) || !object.title.trim() || object.purpose !== undefined && !string(object.purpose,4000) || !['active','archived'].includes(object.status) || object.example !== undefined && typeof object.example !== 'boolean') throw Error('对象资料无效或编号重复。');
    ids.add(object.id);
    if (object.completionCriteria !== undefined && !string(object.completionCriteria, 4000)) throw Error('对象完成标准无效。');
  }
  const refs = new Set();
  for (const link of next.links) {
    const r = link?.ref;
    if (!ids.has(link?.objectId) || !r || !collections.includes(r.collection) || !string(r.id,200) || !r.id || r.collection === 'courseEntry' && (!string(r.containerId,200) || !r.containerId) || r.collection !== 'courseEntry' && r.containerId !== undefined || refs.has(refKey(r)) || link.title !== undefined && !string(link.title,500) || link.example !== undefined && typeof link.example !== 'boolean') throw Error('对象关联无效，同一记录只能有一个主归属。');
    refs.add(refKey(r));
  }
  return next;
}
export const readObjects = storage => normalizeObjects(JSON.parse(storage.getItem(objectKey) || 'null'));
// Narrow bridge for the existing item editor; prepare changes without committing.
export function itemContext(storage, ref = null) {
  const state = readObjects(storage);
  return { objects: visibleRecords(storage, state.objects), owner: ref ? state.links.find(link => refKey(link.ref) === refKey(ref))?.objectId || '' : '' };
}
export function prepareItemAssignment(storage, { ref, title, example, newRecord, objectId, originalOwner }) {
  if (!['task', 'plan', 'journalEntry'].includes(ref?.collection) || typeof ref.id !== 'string' || !ref.id) throw Error('事项或笔记引用无效。');
  const state = readObjects(storage), previous = state.links.find(link => refKey(link.ref) === refKey(ref)), owner = previous?.objectId || '';
  if (owner !== originalOwner) throw Error('事项归属已变化，请关闭后重新编辑。');
  const object = visibleRecords(storage, state.objects).find(object => object.id === objectId);
  if (objectId && !object && objectId !== originalOwner) throw Error('所属对象已变化，请重新打开编辑器。');
  const markExample = example || Boolean(newRecord && object?.example);
  state.links = state.links.filter(link => refKey(link.ref) !== refKey(ref));
  if (objectId) state.links.push({ ...(previous?.objectId === objectId ? previous : {}), objectId, ref, title, example: markExample, createdAt: previous?.objectId === objectId ? previous.createdAt : new Date().toISOString() });
  return { changes: { [objectKey]: normalizeObjects(state) }, example: markExample };
}
const sourceModule = ref => ({ courseEntry:'courses', task:'tasks', plan:'plans', capture:'web-capture', journalEntry:'notes' })[ref.collection];
const serviceSource = (ref, record, table) => ({ ref, record, ...(table ? {table} : {}), available:sourceModule(ref), label:ref.collection === 'courseEntry' ? `${table.name} · ${record.title} · ${record.weekday?`周${record.weekday} 第${record.periodStart}–${record.periodEnd}节`:'待安排'}${record.teacher?' · '+record.teacher:''}` : ref.collection === 'capture' ? `${record.title} · ${record.url}` : ref.collection === 'journalEntry' ? `${record.title || record.body.split(/\r?\n/)[0].slice(0,160)} · ${record.date}` : `${record.title} · ${describeItem(normalizeItem(record,ref.collection))}` });
export function objectSources(storage, { courses, items, captures, journal, enabled = () => true } = {}) {
  const sources = [];
  if (enabled('courses')) {
    try { sources.push(...courses().listEntries().map(({ref,record,table}) => serviceSource(ref,record,table))); }
    catch { /* Existing links report provider unavailability through inspect. */ }
  }
  // An unavailable provider contributes no candidates; never read its private keys.
  for (const collection of ['task','plan','capture','journalEntry']) {
    const ref = { collection };
    if (!enabled(sourceModule(ref))) continue;
    try {
      const records = collection === 'capture' ? captures().list() : collection === 'journalEntry' ? journal().list() : items().list(collection);
      sources.push(...records.map(record => serviceSource({ collection, id:record.id },record)));
    } catch { /* Existing links report provider unavailability through inspect. */ }
  }
  return sources;
}
export function resolveObjectSource(storage, ref, { courses, items, captures, journal, enabled = () => true } = {}) {
  if (!enabled(sourceModule(ref))) return { status:'disabled' };
  try {
    const result = ref.collection === 'courseEntry' ? courses().inspect(ref) : ref.collection === 'capture' ? captures().inspect(ref.id) : ref.collection === 'journalEntry' ? journal().inspect(ref.id) : items().inspect(ref);
    if (result.status === 'found' && result.record?.id === ref.id && (ref.collection !== 'courseEntry' || result.table?.id === ref.containerId)) return { status:'found', source:serviceSource(ref,result.record,result.table) };
    if (['hidden','missing'].includes(result.status)) return { status:result.status };
  } catch { /* Missing, unloaded, incompatible, or failed services are not deletions. */ }
  return { status:'unavailable' };
}
export function objectDetail(storage, id, providers) {
  const state = readObjects(storage), object = visibleRecords(storage,state.objects).find(o => o.id === id);
  if (!object) throw Error('对象不存在或当前不可见。');
  return { object, entries:state.links.filter(l => l.objectId === id).flatMap(link => {
    if (!visibleRecords(storage,[link]).length) return [];
    const result = resolveObjectSource(storage,link.ref,providers);
    if (result.status === 'hidden') return [];
    return [{...link,...result}];
  }) };
}
export function createObjectStore(storage, providers) {
  const write = state => storage.setItem(objectKey,JSON.stringify(normalizeObjects(state)));
  return {
    read:()=>readObjects(storage),
    save(fields, id) {
      const state=readObjects(storage), old=id?state.objects.find(o=>o.id===id):null;
      if(id&&!old)throw Error('对象已不存在，请重新打开。');
      const at=new Date().toISOString();
      const object={...old,id:old?.id||`object_${Date.now()}_${Math.random().toString(36).slice(2,9)}`,type:fields.type,title:String(fields.title||'').trim(),purpose:String(fields.purpose||'').trim(),status:old?.status||'active',createdAt:old?.createdAt||at,updatedAt:at};
      if (fields.completionCriteria !== undefined) object.completionCriteria = String(fields.completionCriteria).trim();
      if(old)state.objects[state.objects.indexOf(old)]=object;else state.objects.push(object);
      write(state);return object;
    },
    archive(id) {const state=readObjects(storage),object=state.objects.find(o=>o.id===id);if(!object)throw Error('对象已不存在。');object.status=object.status==='archived'?'active':'archived';object.updatedAt=new Date().toISOString();write(state);},
    assign(objectId, ref) {
      const state=readObjects(storage);
      if(!visibleRecords(storage,state.objects).some(o=>o.id===objectId))throw Error('请选择有效对象。');
      const resolved=resolveObjectSource(storage,ref,providers),source=resolved.source;
      if(!source)throw Error(['disabled','unavailable'].includes(resolved.status)?'原功能已关闭或服务不可用，请重新开启后再关联。':'原记录已不存在或当前不可见，请重新选择。');
      const old=state.links.find(l=>refKey(l.ref)===refKey(ref));
      if(old&&old.objectId!==objectId)throw Error('记录已有主归属，请先在原对象中解除关联。');
      if(!old)state.links.push({objectId,ref:structuredClone(ref),title:source.record.title,example:source.table?.example===true||source.record.example===true,createdAt:new Date().toISOString()});
      write(state);
    },
    unassign(objectId,ref) {const state=readObjects(storage);state.links=state.links.filter(l=>l.objectId!==objectId||refKey(l.ref)!==refKey(ref));write(state);},
  };
}
