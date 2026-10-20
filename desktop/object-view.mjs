import { visibleRecords } from './examples.mjs';
import { normalizeItem, describeItem } from './planning.mjs';
import { projectCourseOccurrences, courseTimes } from './course-occurrences.mjs';
export const objectKey = 'jiwei-desktop-objects-v1';
export const objectTypes = { course:'课程', project:'项目', general:'主题' };
export const refKey = ref => JSON.stringify([ref.collection, ref.containerId || '', ref.id]);
export function nextObjectCourse(table,id,date,time) {
  return projectCourseOccurrences(table).filter(c=>c.courseId===id&&c.status==='normal'&&(c.date>date||c.date===date&&courseTimes(table,c).end>time)).sort((a,b)=>a.date.localeCompare(b.date)||a.periodStart-b.periodStart)[0]||null;
}
const collections = ['courseEntry','task','plan','capture'];
const string = (value, limit) => typeof value === 'string' && value.length <= limit;
export function normalizeObjects(value) {
  if (value === undefined || value === null) return { schemaVersion:1, objects:[], links:[] };
  if (value.schemaVersion !== 1 || !Array.isArray(value.objects) || !Array.isArray(value.links)) throw Error('对象视图格式不兼容，请保留原文件。');
  const next = structuredClone(value), ids = new Set();
  for (const object of next.objects) {
    if (!object || !string(object.id,200) || !object.id || ids.has(object.id) || !Object.hasOwn(objectTypes,object.type) || !string(object.title,160) || !object.title.trim() || object.purpose !== undefined && !string(object.purpose,4000) || !['active','archived'].includes(object.status) || object.example !== undefined && typeof object.example !== 'boolean') throw Error('对象资料无效或编号重复。');
    ids.add(object.id);
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
// Modules supply their records here, rather than importing one another's UI.
export function objectSources(storage, includeHidden = false) {
  const read = key => JSON.parse(storage.getItem(key) || '[]');
  const visible = records => includeHidden ? records : visibleRecords(storage,records);
  const tables = JSON.parse(storage.getItem('jiwei-desktop-timetables-v1') || 'null');
  return [
    ...visible(tables?.tables || []).flatMap(table => [...table.courses,...(table.unplacedCourses || [])].map(record => ({ ref:{collection:'courseEntry',containerId:table.id,id:record.id}, record, table, label:`${table.name} · ${record.title} · ${record.weekday?`周${record.weekday} 第${record.periodStart}–${record.periodEnd}节`:'待安排'}${record.teacher?' · '+record.teacher:''}`, available:'courses' }))),
    ...['task','plan'].flatMap(kind => visible(read(`jiwei-desktop-${kind === 'task' ? 'tasks' : 'plans'}`)).map(record => ({ref:{collection:kind,id:record.id},record,label:`${record.title} · ${describeItem(normalizeItem(record,kind))}`,available:kind === 'task'?'tasks':'plans'}))),
    ...visible(read('jiwei-desktop-web-collections-v1')).map(record => ({ref:{collection:'capture',id:record.id},record,label:`${record.title} · ${record.url}`,available:'web-capture'})),
  ];
}
export function objectDetail(storage, id) {
  const state = readObjects(storage), object = visibleRecords(storage,state.objects).find(o => o.id === id);
  if (!object) throw Error('对象不存在或当前不可见。');
  const sources = objectSources(storage), raw=objectSources(storage,true);
  return { object, entries:state.links.filter(l => l.objectId === id).flatMap(link => {
    const source=sources.find(s=>refKey(s.ref)===refKey(link.ref));
    // Links to hidden examples should disappear with their source, not look deleted.
    if(!source && raw.some(s=>refKey(s.ref)===refKey(link.ref)))return [];
    return [{...link,source}];
  }) };
}
export function createObjectStore(storage) {
  const write = state => storage.setItem(objectKey,JSON.stringify(normalizeObjects(state)));
  return {
    read:()=>readObjects(storage),
    save(fields, id) {
      const state=readObjects(storage), old=id?state.objects.find(o=>o.id===id):null;
      if(id&&!old)throw Error('对象已不存在，请重新打开。');
      const at=new Date().toISOString();
      const object={...old,id:old?.id||`object_${Date.now()}_${Math.random().toString(36).slice(2,9)}`,type:fields.type,title:String(fields.title||'').trim(),purpose:String(fields.purpose||'').trim(),status:old?.status||'active',createdAt:old?.createdAt||at,updatedAt:at};
      if(old)state.objects[state.objects.indexOf(old)]=object;else state.objects.push(object);
      write(state);return object;
    },
    archive(id) {const state=readObjects(storage),object=state.objects.find(o=>o.id===id);if(!object)throw Error('对象已不存在。');object.status=object.status==='archived'?'active':'archived';object.updatedAt=new Date().toISOString();write(state);},
    assign(objectId, ref) {
      const state=readObjects(storage);
      if(!visibleRecords(storage,state.objects).some(o=>o.id===objectId))throw Error('请选择有效对象。');
      const source=objectSources(storage).find(s=>refKey(s.ref)===refKey(ref));if(!source)throw Error('原记录已不存在或当前不可见，请重新选择。');
      const old=state.links.find(l=>refKey(l.ref)===refKey(ref));
      if(old&&old.objectId!==objectId)throw Error('记录已有主归属，请先在原对象中解除关联。');
      if(!old)state.links.push({objectId,ref:structuredClone(ref),title:source.record.title,example:source.table?.example===true||source.record.example===true,createdAt:new Date().toISOString()});
      write(state);
    },
    unassign(objectId,ref) {const state=readObjects(storage);state.links=state.links.filter(l=>l.objectId!==objectId||refKey(l.ref)!==refKey(ref));write(state);},
  };
}
