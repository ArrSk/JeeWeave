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
