import test from 'node:test';
import assert from 'node:assert/strict';
import { createItemService } from './item-service.mjs';
import { createObjectStore, readObjects, itemContext, prepareItemAssignment } from './object-view.mjs';
import { createWorkspaceStorage, workspaceFromStorage, validateWorkspace } from './workspace-format.mjs';
import { isComplete } from './planning.mjs';

const key = kind => `jiwei-desktop-${kind === 'task' ? 'tasks' : 'plans'}`;
const ref = (id, collection = 'task') => ({ collection, id });
const memory = () => {
  const map = new Map();
  return { get length() { return map.size; }, key: index => [...map.keys()][index], getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) };
};
const fields = more => ({ type: 'longterm', title: '新事项', ...more });
function setup(storage = memory(), options = {}) {
  const flags = { tasks: true, plans: true, objects: true };
  const objects = { itemContext: value => itemContext(storage, value), prepareItemAssignment: value => prepareItemAssignment(storage, value) };
  const service = createItemService(storage, { enabled: id => flags[id] !== false, objects: () => flags.objects ? objects : null, ...options });
  return { storage, service, flags };
}

test('事项服务保留旧集合身份、来源和未知字段，同名同编号跨集合不串改', () => {
  const { storage, service } = setup();
  storage.setItem(key('task'), JSON.stringify([{ id: 'same', title: '旧事项', date: '', done: true, createdAt: '2026-10-01T00:00:00Z', sourceUrl: 'https://example.org/notice', extra: { keep: true } }]));
  storage.setItem(key('plan'), JSON.stringify([{ id: 'same', title: '同编号计划', date: '', done: false }]));
  const planBefore = storage.getItem(key('plan'));
  const changed = service.save(fields({ type: 'event', title: '修改为事件', date: '2026-10-22', timed: true, startTime: '09:00', endTime: '10:00' }), { ref: ref('same') });
  assert.equal(changed.kind, 'task'); assert.equal(changed.id, 'same'); assert.equal(changed.done, true);
  assert.equal(changed.createdAt, '2026-10-01T00:00:00Z'); assert.equal(changed.sourceUrl, 'https://example.org/notice'); assert.deepEqual(changed.extra, { keep: true });
  assert.equal(storage.getItem(key('plan')), planBefore); assert.equal(service.list().length, 2);
  const snapshot = service.get(ref('same')); snapshot.title = '外部修改快照'; assert.equal(service.get(ref('same')).title, '修改为事件');
  service.remove(ref('same')); assert.equal(service.list('task').length, 0); assert.equal(service.get(ref('same', 'plan')).title, '同编号计划');
  assert.throws(() => service.save(fields(), { ref: ref('same') }), /不存在/);
});

test('服务边界拒绝关闭来源及隐藏示例，保留旧单边开关与不可见资料', () => {
  const { storage, service, flags } = setup();
  const real = service.save(fields());
  storage.setItem(key('task'), JSON.stringify([real, { ...real, id: 'sample', example: true }, { ...real, id: 'legacy-sample', sourceUrl: 'https://example.org/demo' }]));
  storage.setItem('jiwei-desktop-web-collections-v1', JSON.stringify([{ example: true, url: 'https://example.org/demo', drafts: [{ taskId: 'legacy-sample' }] }]));
  const before = storage.getItem(key('task'));
  for (const id of ['sample', 'legacy-sample']) {
    for (const act of [() => service.get(ref(id)), () => service.save(fields(), { ref: ref(id) }), () => service.toggle(ref(id)), () => service.setPhase(ref(id), 'phase', true), () => service.remove(ref(id))]) assert.throws(act, /不可见/);
  }
  assert.equal(storage.getItem(key('task')), before); assert.equal(service.list().length, 1);
  flags.tasks = false;
  assert.throws(() => service.toggle(ref(real.id)), /关闭/); assert.equal(service.list('task').length, 0);
  assert.equal(service.save(fields()).kind, 'plan', 'new items use the still enabled legacy collection');
  flags.plans = false; assert.throws(() => service.save(fields()), /关闭/);
  flags.tasks = true; service.toggle(ref(real.id)); assert.equal(JSON.parse(storage.getItem(key('task'))).length, 3);
});

test('事项和归属同次权威事务，磁盘失败后原记录与关系不变，重试成功才通知', async () => {
  const seed = memory(); const object = createObjectStore(seed).save({ type: 'course', title: '课程' });
  let disk = workspaceFromStorage(seed), fail = false, commits = 0;
  const bridge = { readWorkspace: async () => ({ ok: true, workspace: disk }), writeWorkspace: candidate => {
    if (fail) return { ok: false, message: 'disk full' };
    disk = validateWorkspace(candidate); return { ok: true, workspace: disk };
  } };
  const workspace = await createWorkspaceStorage(memory(), bridge), { service } = setup(workspace.storage, { onCommit: () => commits++ });
  const before = JSON.stringify(disk.data); fail = true;
  assert.throws(() => service.save(fields(), { objectId: object.id }), /disk full/);
  assert.equal(JSON.stringify(workspace.snapshot().data), before); assert.equal(JSON.stringify(disk.data), before); assert.equal(commits, 0);
  fail = false; const saved = service.save(fields(), { objectId: object.id }); assert.equal(commits, 1);
  assert.equal(disk.data.tasks[0].id, saved.id); assert.equal(disk.data.objectView.links[0].ref.id, saved.id);
  assert.equal(service.context(ref(saved.id)).owner, object.id);
  service.remove(ref(saved.id)); assert.equal(readObjects(workspace.storage).links[0].ref.id, saved.id, 'source removal keeps the existing missing-source context');
});

test('归属陈旧冲突拒绝覆盖，对象关闭时仍可编辑事项且保留原关联', () => {
  const { storage, service, flags } = setup(), objects = createObjectStore(storage, { items: () => service });
  const a = objects.save({ type: 'course', title: '甲' }), b = objects.save({ type: 'course', title: '乙' });
  const item = service.save(fields(), { objectId: a.id }), source = ref(item.id);
  objects.unassign(a.id, source); objects.assign(b.id, source);
  const before = storage.getItem(key('task'));
  assert.throws(() => service.save(fields({ title: '陈旧修改' }), { ref: source, objectId: a.id, originalOwner: a.id }), /归属已变化/);
  assert.equal(storage.getItem(key('task')), before); assert.equal(service.context(source).owner, b.id);
  flags.objects = false; const links = JSON.stringify(readObjects(storage));
  service.save(fields({ title: '对象停用时修改' }), { ref: source, objectId: '', originalOwner: '' });
  assert.equal(JSON.stringify(readObjects(storage)), links); assert.deepEqual(service.context(source), { objects: [], owner: '' });
  flags.objects = true; assert.equal(service.context(source).owner, b.id);
});

test('新事项归属示例对象时继承示例标记，普通模式不能选隐藏对象或改隐藏事项', () => {
  const { storage, service } = setup();
  const object = createObjectStore(storage).save({ type: 'course', title: '示例对象' });
  const state = readObjects(storage); state.objects[0].example = true; storage.setItem('jiwei-desktop-objects-v1', JSON.stringify(state));
  assert.throws(() => service.save(fields(), { objectId: object.id }), /所属对象/);
  storage.setItem('jiwei-desktop-developer-mode', 'true'); const item = service.save(fields(), { objectId: object.id });
  assert.equal(item.example, true); assert.equal(readObjects(storage).links[0].example, true);
  storage.setItem('jiwei-desktop-developer-mode', 'false'); assert.equal(service.list().length, 0); assert.throws(() => service.remove(ref(item.id)), /不可见/);
});

test('阶段编辑读取最新完成状态，每周只完成指定一次，非法阶段/期限不写入', () => {
  const { storage, service } = setup();
  const phaseFields = fields({ type: 'range', date: '2026-10-19', endDate: '2026-10-25', phases: [{ title: '准备' }] });
  const item = service.save(phaseFields), source = ref(item.id, item.kind), phase = item.phases[0];
  service.setPhase(source, phase.id, true);
  const edited = service.save({ ...phaseFields, phases: [{ ...phase, done: false }] }, { ref: source });
  assert.equal(edited.phases[0].done, true); assert.equal(edited.phases[0].id, phase.id);
  const before = storage.getItem(key('plan'));
  assert.throws(() => service.setPhase(source, 'missing', true), /阶段/);
  assert.throws(() => service.save(fields({ deadlineTime: '12:00' })), /截止日期/);
  assert.equal(storage.getItem(key('plan')), before);
  const weekly = service.save(fields({ type: 'weekly', date: '2026-10-19', weekdays: [1, 3] }));
  const completed = service.toggle(ref(weekly.id, weekly.kind), '2026-10-19');
  assert.equal(isComplete(completed, '2026-10-19'), true); assert.equal(isComplete(completed, '2026-10-21'), false);
});

test('当天查询保留逾期待办、无期限和同名跨集合身份，排除未来及已完成事项', () => {
  const { storage, service } = setup();
  storage.setItem(key('task'), JSON.stringify([
    { id: 'same', title: '同名事项', date: '2026-10-20', sourceUrl: 'https://example.org/notice', extra: { keep: true } },
    { id: 'free', title: '无期限', date: '' },
    { id: 'done', title: '已完成', date: '2026-10-21', done: true },
    { id: 'future', title: '未来截止', date: '2026-10-22' },
  ]));
  storage.setItem(key('plan'), JSON.stringify([
    { id: 'same', title: '同名事项', date: '' },
    { id: 'range', title: '区间最后一天', anchor: { type: 'range', start: '2026-10-19', end: '2026-10-21' } },
    { id: 'midnight', title: '午夜已结束', anchor: { type: 'absolute', start: '2026-10-20T23:00:00+08:00', end: '2026-10-21T00:00:00+08:00' } },
    { id: 'weekly', title: '每周三', anchor: { type: 'weekly', startDate: '2026-10-19', weekdays: [3] }, completedDates: ['2026-10-21'] },
  ]));
  const before = [storage.getItem(key('task')), storage.getItem(key('plan'))];
  assert.deepEqual(service.onDate('2026-10-21').map(item => [item.kind, item.id]), [['task', 'same'], ['task', 'free'], ['plan', 'same'], ['plan', 'range']]);
  assert.equal(service.onDate('2026-10-28').some(item => item.id === 'weekly'), true, 'completing one week does not complete the next');
  const result = service.onDate('2026-10-21'); result[0].extra.keep = false;
  assert.equal(service.get(ref('same')).extra.keep, true);
  assert.deepEqual([storage.getItem(key('task')), storage.getItem(key('plan'))], before, 'the query never persists a second today collection');
});

test('当天查询沿用示例与旧单边开关守卫，关闭全部来源可返回空结果，非法日期拒绝', () => {
  const { storage, service, flags } = setup();
  storage.setItem(key('task'), JSON.stringify([{ id: 'real', title: '真实事项', date: '' }, { id: 'sample', title: '示例', date: '', example: true }]));
  storage.setItem(key('plan'), JSON.stringify([{ id: 'real', title: '真实计划', date: '' }]));
  assert.deepEqual(service.onDate('2026-10-21').map(item => [item.kind, item.id]), [['task', 'real'], ['plan', 'real']]);
  flags.tasks = false; assert.deepEqual(service.onDate('2026-10-21').map(item => item.kind), ['plan']);
  flags.plans = false; assert.deepEqual(service.onDate('2026-10-21'), []);
  flags.tasks = true; storage.setItem('jiwei-desktop-developer-mode', 'true'); assert.equal(service.onDate('2026-10-21').length, 2);
  for (const date of ['2026-02-30', 'invalid']) assert.throws(() => service.onDate(date));
});

test('汇总按可见启用的原记录统计，未来事项及重复本次完成不漏计，不保存计数副本', () => {
  const { storage, service, flags } = setup();
  storage.setItem(key('task'), JSON.stringify([
    { id: 'same', title: '未来截止', date: '2099-10-22', extra: 'keep' },
    { id: 'done', title: '已完成', done: true },
    { id: 'sample', title: '示例', example: true },
  ]));
  storage.setItem(key('plan'), JSON.stringify([
    { id: 'same', title: '同编号计划', date: '' },
    { id: 'weekly', title: '每周三', anchor: { type: 'weekly', startDate: '2026-10-19', weekdays: [3] }, completedDates: ['2026-10-21'] },
  ]));
  const before = [storage.getItem(key('task')), storage.getItem(key('plan'))], size = storage.length;
  assert.deepEqual(service.summary(), { total: 4, unfinished: 3, completed: 1 });
  assert.deepEqual([storage.getItem(key('task')), storage.getItem(key('plan'))], before); assert.equal(storage.length, size);
  service.toggle(ref('same')); assert.deepEqual(service.summary(), { total: 4, unfinished: 2, completed: 2 });
  service.remove(ref('same')); assert.deepEqual(service.summary(), { total: 3, unfinished: 2, completed: 1 });
  flags.tasks = false; assert.deepEqual(service.summary(), { total: 2, unfinished: 2, completed: 0 });
  flags.plans = false; assert.deepEqual(service.summary(), { total: 0, unfinished: 0, completed: 0 });
  flags.tasks = true; storage.setItem('jiwei-desktop-developer-mode', 'true');
  assert.deepEqual(service.summary(), { total: 2, unfinished: 1, completed: 1 });
});

test('来源事项在关联准备后一次提交，保留未编辑旧记录和证据，重复来源不重置原事项', () => {
  const { storage, service } = setup();
  const old = { id: 'old', title: '旧事项', extra: { keep: true } }; storage.setItem(key('task'), JSON.stringify([old]));
  const fields = { id: 'source-task', title: ' 提交报告 ', date: '2026-10-25', sourceUrl: 'https://EXAMPLE.org/notice', sourceTitle: '原始通知', evidence: '原文要求' };
  const before = storage.getItem(key('task'));
  const result = service.addFromSource(fields, ({ ref, added }) => {
    assert.equal(storage.getItem(key('task')), before); assert.equal(added, true); assert.deepEqual(ref, { collection: 'task', id: fields.id });
    return { 'jiwei-source-fixture': { ref } };
  });
  assert.equal(result.added, true); const raw = JSON.parse(storage.getItem(key('task')));
  assert.deepEqual(raw[0], old); assert.equal(raw[1].sourceUrl, fields.sourceUrl); assert.equal(raw[1].sourceTitle, fields.sourceTitle); assert.equal(raw[1].evidence, fields.evidence);
  assert.deepEqual(JSON.parse(storage.getItem('jiwei-source-fixture')).ref, result.ref);
  service.toggle(result.ref); const unchanged = storage.getItem(key('task'));
  const duplicate = service.addFromSource({ ...fields, id: 'other-candidate' });
  assert.equal(duplicate.added, false); assert.deepEqual(duplicate.ref, result.ref); assert.equal(storage.getItem(key('task')), unchanged);
});

test('来源事项拒绝编号碰撞、非法输入、关联准备失败和异步/冲突事务，均不提前写入', () => {
  const { storage, service } = setup(); storage.setItem(key('task'), JSON.stringify([{ id: 'occupied', title: '保留原事项', date: '' }]));
  const fields = { id: 'new-source', title: '报告', date: '', sourceUrl: 'https://example.org/notice' }, before = storage.getItem(key('task'));
  for (const fieldsChange of [{ id: 'occupied' }, { title: '' }, { date: '2026-02-30' }, { sourceUrl: 'file:///fixture' }]) assert.throws(() => service.addFromSource({ ...fields, ...fieldsChange }));
  for (const prepare of [() => { throw Error('related failure'); }, async () => ({}), () => ({ [key('task')]: [] }), () => ({ [key('plan')]: [] })]) assert.throws(() => service.addFromSource(fields, prepare));
  assert.equal(storage.getItem(key('task')), before); assert.equal(storage.length, 1);
});

test('来源创建也执行事项开关和示例守卫，隐藏的已有示例不能被普通来源复用', () => {
  const { storage, service, flags } = setup(), fields = { id: 'from-source', title: '报告', date: '', sourceUrl: 'https://example.org/notice' };
  flags.tasks = false; assert.throws(() => service.addFromSource(fields), /关闭/); assert.equal(storage.length, 0);
  flags.tasks = true; assert.throws(() => service.addFromSource({ ...fields, example: true }), /开发者模式/); assert.equal(storage.length, 0);
  storage.setItem(key('task'), JSON.stringify([{ ...fields, example: true, done: true }])); const before = storage.getItem(key('task'));
  assert.throws(() => service.addFromSource({ ...fields, id: 'real-candidate' }), /开发者模式/); assert.equal(storage.getItem(key('task')), before);
});


const courseRef = { collection: 'courseEntry', containerId: 'semester-A', id: 'course-A' };
const originFor = (date, more = {}) => ({ tableId: courseRef.containerId, courseId: courseRef.id, originalDate: date, title: '篮球课', ...more });
function courseWorkSetup() {
 let status = 'found';
 const context = setup(memory(), { courses: () => ({ inspect: () => ({ status, table: { id: courseRef.containerId }, record: { id: courseRef.id } }) }) });
 return { ...context, sourceStatus: value => { status = value; } };
}

test('同一课程分原课次查询，保留当前已完成及其他未结束项，不按标题或跨集合编号合并', () => {
 const {storage,service} = courseWorkSetup();
 storage.setItem(key('task'), JSON.stringify([
  {id:'same',title:'当前作业',date:'2026-10-30',courseOrigin:originFor('2026-10-26')},
  {id:'done-here',title:'本次已完成',date:'',done:true,courseOrigin:originFor('2026-10-26')},
  {id:'earlier',title:'上次未完成',date:'2026-10-27',courseOrigin:originFor('2026-10-19')},
  {id:'done-elsewhere',title:'上次已完成',date:'',done:true,courseOrigin:originFor('2026-10-19')},
  {id:'other-table',title:'篮球课',date:'',courseOrigin:originFor('2026-10-19',{tableId:'semester-B'})},
  {id:'other-course',title:'篮球课',date:'',courseOrigin:originFor('2026-10-19',{courseId:'course-B'})},
 ]));
 storage.setItem(key('plan'), JSON.stringify([
  {id:'same',title:'同编号另一事项',anchor:{type:'allDay',date:'2026-10-29'},courseOrigin:originFor('2026-10-19')},
  {id:'ongoing',title:'持续训练',anchor:{type:'weekly',startDate:'2026-10-19',weekdays:[5]},completedDates:['2026-10-30'],courseOrigin:originFor('2026-10-19')},
 ]));
 const before=[storage.getItem(key('task')),storage.getItem(key('plan'))];
 const result=service.forCourse(courseRef,{originalDate:'2026-10-26',date:'2026-10-30'});
 assert.deepEqual(result.current.map(r=>r.id),['same','done-here']);
 assert.deepEqual(new Set(result.other.map(r=>r.id)),new Set(['earlier','same','ongoing']));
 assert.equal(result.other.find(r=>r.id==='same').kind,'plan');assert.equal(result.current[0].kind,'task');
 assert.equal(result.completedCount,2);assert.equal(result.total,6);
 assert.deepEqual([storage.getItem(key('task')),storage.getItem(key('plan'))],before);
 const all=service.forCourse(courseRef,{date:'2026-10-30'});assert.equal(all.current.length,0);assert.equal(all.other.length,4);
 assert.equal(result.other.find(r=>r.id==='earlier').courseOrigin.originalDate,'2026-10-19');
});

test('课程事项查询遵守来源、开关和示例可见性，缺失服务不返回假空列表', () => {
 const {storage,service,flags,sourceStatus}=courseWorkSetup();
 storage.setItem(key('task'),JSON.stringify([{id:'hidden',title:'示例作业',date:'',example:true,courseOrigin:originFor('2026-10-19')}]));
 storage.setItem(key('plan'),JSON.stringify([{id:'real',title:'真实安排',date:'2026-10-30',courseOrigin:originFor('2026-10-19')}]));
 assert.equal(service.forCourse(courseRef).total,1);
 storage.setItem('jiwei-desktop-developer-mode','true');assert.equal(service.forCourse(courseRef).total,2);
 flags.tasks=false;assert.deepEqual(service.forCourse(courseRef).other.map(r=>r.id),['real']);
 flags.plans=false;assert.equal(service.forCourse(courseRef).total,0);
 flags.courses=false;assert.throws(()=>service.forCourse(courseRef),/关闭/);flags.courses=true;
 for(const status of ['hidden','missing','unavailable']){sourceStatus(status);assert.throws(()=>service.forCourse(courseRef),/原课程/);}
 sourceStatus('found');
 for(const ref of [{...courseRef,collection:'task'},{...courseRef,containerId:''},null])assert.throws(()=>service.forCourse(ref),/引用/);
 assert.throws(()=>service.forCourse(courseRef,{originalDate:'2026-02-30'}));
 assert.throws(()=>service.forCourse(courseRef,{date:'invalid'}));
});


const slotFields = more => ({ id: 'slot-quick', label: '投入一小时', start: '2026-10-30T19:00:00+08:00', end: '2026-10-30T20:00:00+08:00', ...more });
test('快速安排只追加原事项时段，保留截止来源归属和未知字段，相同请求重试不重复通知', () => {
 let commits=0;const {storage,service}=setup(memory(),{onCommit:()=>commits++});
 const object=createObjectStore(storage).save({type:'general',title:'身体素质'});
 const item=service.save({type:'deadline',title:'投篮练习',date:'2026-11-05',goal:'提高身体素质',note:'保持站姿'},{objectId:object.id});
 const raw=JSON.parse(storage.getItem(key('task')));raw[0].courseOrigin=originFor('2026-10-26');raw[0].unknown={keep:true};storage.setItem(key('task'),JSON.stringify(raw));
 const original=service.get(ref(item.id)),objects=storage.getItem('jiwei-desktop-objects-v1'),expected=JSON.stringify(original);commits=0;
 const scheduled=service.schedule(ref(item.id),slotFields(),{expected});
 const {executionSlots,updatedAt,...rest}=scheduled,{updatedAt:oldAt,...old}=original;
 assert.deepEqual(rest,old);assert.equal(executionSlots.length,1);assert.equal(commits,1);assert.equal(storage.getItem('jiwei-desktop-objects-v1'),objects);
 service.schedule(ref(item.id),slotFields(),{expected});assert.equal(service.get(ref(item.id)).executionSlots.length,1);assert.equal(commits,1);
 assert.throws(()=>service.schedule(ref(item.id),slotFields({label:'异内容'}),{expected}),/编号/);
 assert.throws(()=>service.schedule(ref(item.id),slotFields({id:'another'}),{expected:JSON.stringify(scheduled)}),/已存在/);
});

test('快速安排磁盘失败、过期快照和关闭来源不覆盖原事项，重试仍只写一段', () => {
 const storage=memory(),{service,flags}=setup(storage);const item=service.save(fields()),expected=JSON.stringify(item),before=storage.getItem(key('task')),set=storage.setItem;
 let fail=true;storage.setItem=(name,value)=>{if(name===key('task')&&fail)throw Error('disk full');set(name,value);};
 assert.throws(()=>service.schedule(ref(item.id),slotFields(),{expected}),/disk full/);assert.equal(storage.getItem(key('task')),before);
 fail=false;service.schedule(ref(item.id),slotFields(),{expected});assert.equal(service.get(ref(item.id)).executionSlots.length,1);
 const current=service.get(ref(item.id));assert.throws(()=>service.schedule(ref(item.id),slotFields({id:'second',end:'2026-10-30T21:00:00+08:00'}),{expected}),/事项已变化/);
 assert.deepEqual(service.get(ref(item.id)),current);flags.tasks=false;assert.throws(()=>service.schedule(ref(item.id),slotFields(),{expected}),/关闭/);
 flags.tasks=true;service.toggle(ref(item.id));assert.throws(()=>service.schedule(ref(item.id),slotFields({id:'new'}),{expected:JSON.stringify(service.get(ref(item.id)))}),/已完成/);
});

test('快速安排沿用阶段范围和原定重复规则，完成阶段或次数不能新增安排', () => {
 const {service}=setup();
 const range=service.save({type:'range',title:'训练阶段',date:'2026-10-01',endDate:'2026-11-30',phases:[{id:'p1',title:'基础',startDate:'2026-10-01',endDate:'2026-10-31',done:false}]});
 assert.throws(()=>service.schedule(ref(range.id,range.kind),slotFields({phaseId:'p1',end:'2026-11-02T20:00:00+08:00'}),{expected:JSON.stringify(range)}),/范围/);
 service.setPhase(ref(range.id,range.kind),'p1',true);const finished=service.get(ref(range.id,range.kind));
 assert.throws(()=>service.schedule(ref(range.id,range.kind),slotFields({phaseId:'p1'}),{expected:JSON.stringify(finished)}),/阶段已完成/);
 const repeat=service.save({type:'weekly',title:'每周篮球',date:'2026-10-19',weekdays:[1],until:'2026-11-30'});
 const repeatedRef=ref(repeat.id,repeat.kind);
 assert.throws(()=>service.schedule(repeatedRef,slotFields({occurrenceDate:'2026-10-30'}),{expected:JSON.stringify(repeat)}),/原定日期/);
 const moved=service.schedule(repeatedRef,slotFields({occurrenceDate:'2026-10-26'}),{expected:JSON.stringify(repeat)});
 assert.equal(moved.executionSlots[0].occurrenceDate,'2026-10-26');assert.equal(moved.anchor.startDate,repeat.anchor.startDate);
 service.toggle(repeatedRef,'2026-10-26');const done=service.get(repeatedRef);
 assert.throws(()=>service.schedule(repeatedRef,slotFields({id:'done-again',occurrenceDate:'2026-10-26'}),{expected:JSON.stringify(done)}),/已完成/);
});

const slot = (id, start, end, more = {}) => ({ id, start, end, ...more });
const day = '2026-11-08';

test('reschedule 同一批平移执行时段，标签阶段和来源不动', () => {
  const { service } = setup();
  const item = service.save(fields({ executionSlots: [
    slot('a', '2026-11-08T09:00:00+08:00', '2026-11-08T10:00:00+08:00', { label: '第一段' }),
    slot('b', '2026-11-08T14:00:00+08:00', '2026-11-08T15:30:00+08:00', { label: '第二段' })
  ] }));
  const moved = service.reschedule(ref(item.id), { slots: [
    slot('a', '2026-11-08T09:15:00+08:00', '2026-11-08T10:15:00+08:00'),
    slot('b', '2026-11-08T14:15:00+08:00', '2026-11-08T15:45:00+08:00')
  ] }, { expected: JSON.stringify(service.get(ref(item.id))), date: day });
  assert.equal(moved.id, item.id);
  assert.equal(moved.anchor.type, 'floating');
  assert.deepEqual(moved.executionSlots.map(s => [s.id, s.label, s.start, s.end]), [
    ['a', '第一段', '2026-11-08T09:15:00+08:00', '2026-11-08T10:15:00+08:00'],
    ['b', '第二段', '2026-11-08T14:15:00+08:00', '2026-11-08T15:45:00+08:00']
  ]);
  assert.equal(service.list().length, 1, '平移不新增记录');
});

test('reschedule 拒绝陈旧快照、缺号、改变时长与跨日出界', () => {
  const { service, storage } = setup();
  const item = service.save(fields({ executionSlots: [slot('a', '2026-11-08T09:00:00+08:00', '2026-11-08T10:00:00+08:00')] }));
  const current = JSON.stringify(service.get(ref(item.id))), before = storage.getItem(key('task'));
  assert.throws(() => service.reschedule(ref(item.id), { slots: [slot('a', '2026-11-08T09:15:00+08:00', '2026-11-08T10:15:00+08:00')] }, { expected: '{"id":"旧"}', date: day }), /已变化/);
  assert.throws(() => service.reschedule(ref(item.id), { slots: [slot('missing', '2026-11-08T09:15:00+08:00', '2026-11-08T10:15:00+08:00')] }, { expected: current, date: day }), /已不存在/);
  assert.throws(() => service.reschedule(ref(item.id), { slots: [slot('a', '2026-11-08T09:00:00+08:00', '2026-11-08T10:15:00+08:00')] }, { expected: current, date: day }), /平移/);
  assert.throws(() => service.reschedule(ref(item.id), { slots: [slot('a', '2026-11-09T09:15:00+08:00', '2026-11-09T10:15:00+08:00')] }, { expected: current, date: day }), /同一天/);
  assert.throws(() => service.reschedule(ref(item.id), { slots: [slot('a', '2026-11-08T09:15:00+08:00', '2026-11-08T10:15:00+08:00')], anchor: { start: '2026-11-08T09:15:00+08:00', end: '2026-11-08T10:15:00+08:00' } }, { expected: current, date: day }), /同时指定/);
  assert.equal(storage.getItem(key('task')), before, '任何拒绝都不落盘');
});

test('reschedule 已完成事项不可挪，事件锚点整体平移', () => {
  const { service } = setup();
  const done = service.save(fields({ title: '已完成', executionSlots: [slot('a', '2026-11-08T09:00:00+08:00', '2026-11-08T10:00:00+08:00')] }));
  service.toggle(ref(done.id));
  assert.throws(() => service.reschedule(ref(done.id), { slots: [slot('a', '2026-11-08T09:15:00+08:00', '2026-11-08T10:15:00+08:00')] }, { expected: JSON.stringify(service.get(ref(done.id))), date: day }), /已完成/);
  const event = service.save(fields({ type: 'event', title: '考试', date: day, timed: true, startTime: '09:00', endTime: '10:30' }));
  const moved = service.reschedule(ref(event.id, 'plan'), { anchor: { start: '2026-11-08T09:15:00+08:00', end: '2026-11-08T10:45:00+08:00' } }, { expected: JSON.stringify(service.get(ref(event.id, 'plan'))), date: day });
  assert.deepEqual([moved.anchor.type, moved.anchor.start, moved.anchor.end], ['absolute', '2026-11-08T09:15:00+08:00', '2026-11-08T10:45:00+08:00']);
  assert.equal(moved.title, '考试');
});
