import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkbenchHost } from './workbench-host.mjs';
import { createPluginRuntime } from './plugin-runtime.mjs';
import { createPluginStorage } from './plugin-storage.mjs';
import { createWorkbenchServices } from './workbench-services.mjs';
import { createWorkspaceStorage, emptyWorkspace, validateWorkspace } from './workspace-format.mjs';
import { readModules, isModuleEnabled } from './modules.mjs';
import { createCalendarService } from './calendar-service.mjs';
import { createRequire } from 'node:module';
const {createPlatformPermissions}=createRequire(import.meta.url)('./platform-permissions.cjs');
const memory = () => { const map = new Map(); return { get length() { return map.size; }, key: i => [...map.keys()][i], getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), snapshot: () => JSON.stringify([...map]) }; };
const plugin = (id, activate = () => { }, extra = {}) => ({ id, version: '1.0.0', hostApiVersion: 1, activate, ...extra });
async function setup(extra = {}) {
    let disk = emptyWorkspace(), fail = false;
    const workspace = await createWorkspaceStorage(memory(), { readWorkspace: async () => ({ ok: true, workspace: disk }), writeWorkspace: candidate => {
            if (fail)
                return { ok: false, message: 'disk full' };
            disk = validateWorkspace({ ...candidate, revision: disk.revision + 1 });
            return { ok: true, workspace: disk };
        } });
    const enabled = id => isModuleEnabled(readModules(workspace.storage), id), errors = [], host = createWorkbenchHost({ enabled, onError: e => errors.push(e.message) });
    const runtime = createWorkbenchServices({ host, workspace, enabled, bridge: extra.bridge, onError: e => errors.push(e.message) }), api = host.client('workspace');
    return { host, runtime, workspace, api, errors, disk: () => structuredClone(disk), fail: value => { fail = value; }, toggle(id, on) { api.setModule(id, on); runtime.reconcile(); } };
}
test('笔记主归属双向查询与更换/解除，模块关闭保留引用；写入失败不串改原文', async () => {
    const {host,api,disk,fail,toggle,runtime}=await setup(), journal=host.client('journal'),objects=host.client('objects');
    const first=objects.save({type:'course',title:'高数'}),second=objects.save({type:'project',title:'报告'});
    let draft=journal.start(); draft=journal.saveDraft({...draft,body:'选取这段话。\n其他感受保持原样。'},draft.revision);
    const note=journal.publish(draft.revision),before=structuredClone(disk().data.journal),ref={collection:'journalEntry',id:note.id};
    fail(true);assert.throws(()=>journal.assign(note.id,first.id,''),/disk full/);fail(false);
    assert.equal(journal.context(note.id).owner,'');journal.assign(note.id,first.id,'');
    const extended=api.snapshot();extended.data.objectView.links[0].futureRelation={keep:true};api.restore(extended);
    journal.assign(note.id,first.id,first.id);assert.deepEqual(disk().data.objectView.links[0].futureRelation,{keep:true});
    assert.equal(objects.detail(first.id).entries[0].source.record.body,note.body);
    journal.assign(note.id,second.id,first.id);assert.equal(objects.detail(first.id).entries.length,0);
    assert.throws(()=>journal.assign(note.id,first.id,first.id),/归属已变化/);
    toggle('objects',false);assert.equal(journal.context(note.id).available,false);
    assert.throws(()=>journal.assign(note.id,'',second.id),/关闭/);
    toggle('objects',true);assert.equal(journal.context(note.id).owner,second.id);
    toggle('notes',false);assert.equal(objects.detail(second.id).entries[0].status,'disabled');
    toggle('notes',true);assert.equal(host.client('records').inspect(ref).status,'found');
    journal.assign(note.id,'',second.id);assert.equal(objects.detail(second.id).entries.length,0);
    assert.deepEqual(disk().data.journal,before);api.restore(api.snapshot());assert.equal(journal.inspect(note.id).record.id,note.id);runtime.dispose();
});

test('笔记提炼先保存草稿，确认时事项/归属/来源一次提交，失败与重复确认均不丢不重建', async () => {
    const {host,api,disk,fail,runtime}=await setup(), journal=host.client('journal'),items=host.client('items'),objects=host.client('objects');
    const object=objects.save({type:'course',title:'程序设计'});
    let draft=journal.start();draft=journal.saveDraft({...draft,body:'完成两个示例。其余内容不变。'},draft.revision);
    const note=journal.publish(draft.revision);journal.assign(note.id,object.id,'');
    let action=journal.beginAction(note.id,'完成两个示例。');assert.equal(items.list().length,0);
    assert.equal(journal.beginAction(note.id,'完成两个示例。').id,action.id);
    action=journal.saveActionDraft(action.id,{title:'练习示例',date:'2026-10-25',time:'20:00',objectId:object.id});
    const before=disk();fail(true);assert.throws(()=>journal.confirmAction(action.id),/disk full/);fail(false);
    assert.deepEqual(disk(),before);assert.equal(journal.actions(note.id)[0].title,'练习示例');
    const result=journal.confirmAction(action.id),task=items.get(result.ref);assert.equal(task.anchor.time,'20:00');
    assert.equal(task.sourceRef.id,note.id);assert.equal(task.evidence,'完成两个示例。');
    assert.equal(items.context(result.ref).owner,object.id);assert.equal(objects.detail(object.id).entries.length,2);
    items.toggle(result.ref,'2026-10-22');assert.equal(journal.confirmAction(action.id).added,false);
    assert.equal(items.list().length,1);assert.equal(items.get(result.ref).done,true);
    assert.equal(journal.inspect(note.id).record.body,note.body);assert.equal(journal.inspect(note.id).record.revision,note.revision);
    const snapshot=api.snapshot();api.restore(snapshot);assert.equal(journal.actions(note.id)[0].ref.id,task.id);
    items.remove(result.ref);assert.throws(()=>journal.confirmAction(action.id),/不存在/);assert.equal(items.list().length,0);runtime.dispose();
});

test('提炼拒绝陈旧或伪造原文，模块停用不建事项，放弃草稿不删除笔记', async () => {
    const {host,toggle,runtime}=await setup(),journal=host.client('journal'),items=host.client('items');
    let draft=journal.start();draft=journal.saveDraft({...draft,body:'原始要求。'},draft.revision);const note=journal.publish(draft.revision);
    assert.throws(()=>journal.beginAction(note.id,'伪造的内容'),/选取/);
    const action=journal.beginAction(note.id,'原始要求。');
    toggle('items',false);assert.throws(()=>journal.confirmAction(action.id),/关闭/);assert.equal(journal.actions(note.id)[0].status,'pending');
    toggle('items',true);draft=journal.start(note.id);draft=journal.saveDraft({...draft,body:'新的要求。'},draft.revision);journal.publish(draft.revision);
    assert.throws(()=>journal.confirmAction(action.id),/已变化/);assert.equal(items.list().length,0);
    journal.discardActionDraft(action.id);assert.equal(journal.actions(note.id).length,0);
    const next=journal.beginAction(note.id,'新的要求。');const result=journal.confirmAction(next.id);assert.equal(items.get(result.ref).anchor.type,'floating');
    const unfinished=journal.beginAction(note.id,'新的要求。');
    journal.change(note.id,'trash');assert.equal(items.get(result.ref).sourceRef.id,note.id);assert.equal(host.client('records').inspect(items.get(result.ref).sourceRef).status,'missing');
    journal.change(note.id,'purge');assert.equal(journal.read().actionDrafts.some(a=>a.id===unfinished.id),false);assert.ok(journal.read().actionDrafts.some(a=>a.ref?.id===result.ref.id));assert.equal(items.get(result.ref).evidence,'新的要求。');runtime.dispose();
});

test('独立执行时段与截止互不改写，今天去重、日历按时投影，完成和恢复只修改原事项', async () => {
    const {host,api,disk,fail,runtime}=await setup(),items=host.client('items');
    const slots=[{id:'s1',label:'做题',start:'2026-10-22T19:00:00+08:00',end:'2026-10-22T20:00:00+08:00'},{id:'s2',label:'检查',start:'2026-10-23T23:00:00+08:00',end:'2026-10-24T00:00:00+08:00'}];
    const item=items.save({type:'deadline',title:'一份作业',date:'2026-10-25',startTime:'21:00',executionSlots:slots}),ref={collection:item.kind,id:item.id};
    assert.equal(items.onDate('2026-10-22').filter(i=>i.id===item.id).length,1);assert.equal(items.onDate('2026-10-24').length,0);
    const filters={plans:true,tasks:true,phases:true,completed:false,courses:false},range={start:'2026-10-22',end:'2026-10-25'};
    let entries=host.client('calendar').query(range,filters).entries;assert.equal(entries.filter(e=>e.type==='execution').length,2);assert.equal(entries.filter(e=>e.type==='deadline').length,1);
    assert.equal(new Set(entries.map(e=>e.id)).size,3);assert.equal(entries.find(e=>e.slotId==='s2').end,'2026-10-23');
    const changed=items.save({type:'deadline',title:item.title,date:'2026-10-25',startTime:'21:00',executionSlots:[{...item.executionSlots[0],end:'2026-10-22T21:00:00+08:00'}]}, {ref});
    assert.equal(changed.id,item.id);assert.equal(changed.createdAt,item.createdAt);assert.deepEqual(changed.anchor,item.anchor);assert.equal(changed.executionSlots[0].id,'s1');
    const before=disk();fail(true);assert.throws(()=>items.save({type:'longterm',title:'失败修改',executionSlots:[]},{ref}),/disk full/);fail(false);assert.deepEqual(disk(),before);
    assert.throws(()=>items.save({type:'weekly',title:'不能静默丢安排',date:'2026-10-22',weekdays:[4]},{ref}),/有效日期/);
    assert.throws(()=>items.save({type:'deadline',title:item.title,date:'2026-10-25',executionSlots:[{...slots[0],end:slots[0].start}]},{ref}),/结束/);
    items.toggle(ref,'2026-10-22');assert.equal(host.client('calendar').query(range,filters).entries.length,0);
    items.toggle(ref,'2026-10-22');assert.equal(host.client('today').query('2026-10-22','22:00').work[0].slots.length,1);
    api.restore(api.snapshot());assert.equal(items.get(ref).executionSlots[0].id,'s1');assert.equal(items.get(ref).done,false);runtime.dispose();
});

test('阶段与每周重复可保存独立时段，保留阶段状态、单次完成和未知字段', async () => {
    const {host,api,disk,runtime}=await setup(),items=host.client('items');
    const rows=[{type:'range',title:'阶段旧事项',date:'2026-10-19',endDate:'2026-10-25',phases:[{title:'准备'}]},
      {type:'weekly',title:'每周旧事项',date:'2026-10-19',weekdays:[1,3]}];
    for (const fields of rows) {
      const item=items.save(fields),ref={collection:item.kind,id:item.id};
      if(item.phases.length)items.setPhase(ref,item.phases[0].id,true);else items.toggle(ref,'2026-10-19');
      const extended=api.snapshot();extended.data[item.kind==='task'?'tasks':'plans'].find(i=>i.id===item.id).futureState={keep:true};api.restore(extended);
      const slot={id:'supported',start:'2026-10-22T19:00:00+08:00',end:'2026-10-22T20:00:00+08:00',...(item.phases.length?{phaseId:item.phases[0].id}:{occurrenceDate:'2026-10-21'})};
      const arranged=items.save({...fields,phases:item.phases,executionSlots:[slot]},{ref});
      assert.equal(arranged.executionSlots[0].id,'supported');
      const before=disk();
      assert.throws(()=>items.save({...fields,phases:item.phases,executionSlots:[{...slot,...(item.phases.length?{phaseId:'missing'}:{occurrenceDate:'2026-10-20'})}]},{ref}),/阶段不存在|原定/);
      assert.deepEqual(disk(),before);
      const saved=items.save({...fields,...(item.phases.length?{phases:item.phases}:{}),note:'只修改备注'},{ref});
      assert.deepEqual(saved.futureState,{keep:true});assert.equal(saved.id,item.id);assert.equal(saved.createdAt,item.createdAt);
      if(item.phases.length)assert.equal(saved.phases[0].done,true);else assert.deepEqual(saved.completedDates,['2026-10-19']);
    }
    runtime.dispose();
});

test('今天分流明确日程与其他事项，保留跨集合身份、午夜边界和原始数据', async () => {
    const {host,api,disk,runtime}=await setup(),items=host.client('items');
    const add=fields=>items.save({title:'测试事项',...fields});
    const due=add({type:'deadline',date:'2026-10-22'});
    const free=add({type:'longterm'}),late=add({type:'deadline',date:'2026-10-20'}),future=add({type:'deadline',date:'2026-10-24'});
    const arranged=add({type:'deadline',date:'2026-10-20',executionSlots:[{id:'today',start:'2026-10-22T19:00:00+08:00',end:'2026-10-22T20:00:00+08:00'}]});
    const range=add({type:'range',date:'2026-10-21',endDate:'2026-10-23'}),weekly=add({type:'weekly',date:'2026-10-19',weekdays:[4]});
    const midnight=add({type:'event',date:'2026-10-21',endDate:'2026-10-22',startTime:'23:00',endTime:'00:00'});
    const secondaryDue=add({type:'event',date:'2026-10-24',startTime:'09:00',endTime:'10:00',deadlineDate:'2026-10-22'});
    const complete=add({type:'deadline',date:'2026-10-22'});items.toggle({collection:complete.kind,id:complete.id},'2026-10-22');
    const snapshot=api.snapshot();snapshot.data.plans.push({...free,kind:'plan'});api.restore(snapshot);
    const before=disk(),result=host.client('today').query('2026-10-22','12:00');
    assert.deepEqual(new Set(result.scheduledItems.map(i=>i.id)),new Set([due,arranged,range,weekly,secondaryDue].map(i=>i.id)));
    assert.equal(result.otherItems.filter(i=>i.id===free.id).length,2,'same id in task/plan remains two original records');
    assert.deepEqual(new Set(result.otherGroups.find(g=>g.id==='overdue').items.map(i=>i.id)),new Set([late.id]));
    assert.ok(result.otherGroups.find(g=>g.id==='dated').items.some(i=>i.id===future.id));
    assert.ok(result.otherGroups.find(g=>g.id==='dated').items.some(i=>i.id===midnight.id));
    assert.equal(result.otherItems.some(i=>i.id===arranged.id||i.id===complete.id),false);
    assert.deepEqual(disk(),before,'grouping is a read-only projection');
    runtime.dispose();
});

test('插件清单检查版本/缺失依赖/循环，激活失败释放已注册部分且保持既有服务', () => {
    const host = createWorkbenchHost(), runtime = createPluginRuntime(host, { enabled: () => true });
    assert.throws(() => runtime.register(plugin('bad', () => { }, { hostApiVersion: 2 })), /清单/);
    runtime.register(plugin('base', scope => scope.provide('base', { read: () => 1 })));
    runtime.reconcile();
    runtime.register(plugin('failure', scope => { scope.provide('partial', {}); throw Error('activation failed'); }, { requires: ['base'] }));
    assert.throws(() => runtime.reconcile(), /activation failed/);
    assert.equal(host.use('base').read(), 1);
    assert.throws(() => host.use('partial'), /不可用/);
    const copy = runtime.list();
    copy[0].requires.push('missing');
    assert.deepEqual(runtime.list()[0].requires, []);
    const cycle = createPluginRuntime(createWorkbenchHost(), { enabled: () => true });
    cycle.register(plugin('a', () => { }, { requires: ['b'] }));
    cycle.register(plugin('b', () => { }, { requires: ['a'] }));
    assert.throws(() => cycle.reconcile(), /循环/);
    const missing = createPluginRuntime(createWorkbenchHost(), { enabled: () => true });
    missing.register(plugin('a', () => { }, { requires: ['absent'] }));
    assert.throws(() => missing.reconcile(), /缺少插件/);
    const version = createPluginRuntime(host, { enabled: () => true });
    version.register(plugin('wrong', () => { }, { servicesRequired: { base: 2 } }));
    assert.throws(() => version.reconcile(), /版本不兼容/);
    runtime.dispose();
});
test('必需依赖停用时级联撤销，监听/命令/页面重新开启不重复，旧代理与在途令牌失效', () => {
    const flags = { base: true, child: true }, host = createWorkbenchHost({ enabled: id => flags[id] !== false }), runtime = createPluginRuntime(host, { enabled: id => flags[id] !== false }), target = new EventTarget();
    let count = 0, cleanup = 0;
    runtime.register(plugin('base', scope => scope.provide('base', { read: () => true })));
    runtime.register(plugin('child', scope => { scope.provide('child', { read: () => ++count }); scope.command('child.run', () => ++count); scope.own(host.page('child', { enter() { } })); }, { requires: ['base'] }));
    runtime.bindings('child').listen(target, 'input', () => count++);
    runtime.bindings('child').onStop(() => cleanup++);
    runtime.reconcile();
    const old = host.use('child'), client = host.client('child'), ticket = runtime.ticket('child');
    target.dispatchEvent(new Event('input'));
    assert.equal(count, 1);
    flags.base = false;
    runtime.reconcile();
    target.dispatchEvent(new Event('input'));
    assert.equal(count, 1);
    assert.equal(cleanup, 1);
    assert.throws(ticket, /取消/);
    assert.throws(() => host.run('child.run'), /不可用/);
    assert.deepEqual(host.inventory().pages, []);
    flags.base = true;
    runtime.reconcile();
    assert.throws(() => old.read(), /卸载/);
    assert.equal(client.read(), 2);
    target.dispatchEvent(new Event('input'));
    assert.equal(count, 3);
    assert.equal(runtime.list().find(p => p.id === 'child').resources, 2);
    for (let i = 0; i < 4; i++) {
        flags.child = false;
        runtime.reconcile();
        flags.child = true;
        runtime.reconcile();
    }
    target.dispatchEvent(new Event('input'));
    assert.equal(count, 4);
    runtime.dispose();
    runtime.dispose();
    target.dispatchEvent(new Event('input'));
    assert.equal(count, 4);
    assert.deepEqual(host.inventory(), { services: [], commands: [], pages: [], listeners: 0, scopes: 0 });
});
test('命名空间拒绝跨插件读写，受控关联事务先校验所有键并保留失败回滚', () => {
    const raw = memory();
    raw.setItem('own', 'old');
    raw.setItem('related', 'before');
    raw.setItem('secret', 'private');
    const storage = createPluginStorage(raw, { write: ['own'], transaction: ['related'] });
    assert.throws(() => storage.getItem('secret'), /未授权/);
    assert.throws(() => storage.setItem('related', 'bad'), /未授权/);
    const before = raw.snapshot();
    assert.throws(() => storage.transaction({ own: 'new', secret: 'bad' }), /未授权/);
    assert.equal(raw.snapshot(), before);
    const write = raw.setItem;
    raw.setItem = (key, value) => { if (key === 'related' && value === '"fail"')
        throw Error('disk full'); write(key, value); };
    assert.throws(() => storage.transaction({ own: 'new', related: 'fail' }), /disk full/);
    assert.equal(raw.snapshot(), before);
    raw.setItem = write;
    storage.transaction({ own: 'new', related: 'after' });
    assert.equal(raw.getItem('own'), '"new"');
    assert.equal(raw.getItem('related'), '"after"');
});
test('内置提供者完整工作区写入、对象引用、网页确认、随记与聚合均经接口，通知只带元信息', async () => {
    const { host, runtime, api, disk } = await setup();
    const events = [];
    host.on('items:committed', event => events.push(event));
    const objects = host.client('objects'), items = host.client('items'), courses = host.client('courses'), journal = host.client('journal');
    courses.update({ startDate: '2026-10-19', totalWeeks: 4 });
    const object = objects.save({ title: '课程对象', type: 'course' });
    const course = courses.saveCourse({ title: '课程', weekday: 1, periodStart: 1, periodEnd: 2, weekText: '1-3单' }), ref = { collection: 'courseEntry', containerId: courses.current().id, id: course.id };
    objects.assign(object.id, ref);
    const item = items.save({ title: '作业', type: 'deadline', date: '2026-10-20' }, { objectId: object.id });
    assert.equal(objects.detail(object.id).entries.length, 2);
    const capture = host.client('web-captures').save({ url: 'https://example.org/fixture', title: '通知', text: '请于2026-10-25前提交报告。' }, '2026-10-21');
    const draft = capture.drafts[0];
    assert.ok(draft);
    host.client('web-captures').approve(capture.id, draft.id, { title: '报告', date: '2026-10-25' });
    assert.equal(disk().data.tasks.length, 2);
    let note = journal.start();
    note = journal.saveDraft({ body: '虚构感悟', title: '', date: '2026-10-21', kind: 'reflection', tags: [] }, note.revision);
    const saved = journal.publish(note.revision);
    assert.equal(host.client('records').inspect({ collection: 'journalEntry', id: saved.id }).status, 'found');
    assert.equal(host.client('overview').query().notes.count, 1);
    assert.equal(host.client('today').query('2026-10-20', '08:00').items.some(i => i.id === item.id), true);
    assert.equal(host.client('calendar').query({ start: '2026-10-19', end: '2026-10-25' }, { courses: true, plans: true, tasks: true, phases: true, completed: false }).entries.some(e => e.kind === 'course'), true);
    assert.ok(events.length >= 2);
    assert.ok(events.every(e => e.source === 'items' && Number.isInteger(e.revision) && e.correlationId && !('body' in e)));
    assert.equal(api.snapshot().data.objectView.links.length, 2);
    assert.throws(() => api.preferenceStorage().getItem('jiwei-desktop-tasks'), /无权访问/);
    assert.throws(() => api.examples('all', '2026-10-21'), /开发者/);
    runtime.dispose();
});
test('课程写入保留身份/未知字段、隐藏样本和引用，陈旧编辑/作息/导入失败保持原盘', async () => {
    const { host, runtime, api, disk, fail } = await setup(), courses = host.client('courses');
    courses.update({ startDate: '2026-10-19', totalWeeks: 4 });
    const course = courses.saveCourse({ title: '旧课程', weekday: 1, periodStart: 1, periodEnd: 2, weekText: '1-4' });
    const object = host.client('objects').save({ title: '背景', type: 'course' }), ref = { collection: 'courseEntry', containerId: courses.current().id, id: course.id };
    host.client('objects').assign(object.id, ref);
    courses.update({ courses: [{ ...courses.current().courses[0], extra: 'keep' }] });
    const expected = JSON.stringify(courses.current());
    courses.saveCourse({ title: '修改', weekday: 1, periodStart: 1, periodEnd: 2, weekText: '1-4' }, { id: course.id, expected });
    assert.equal(courses.current().courses[0].createdAt, course.createdAt);
    assert.equal(courses.current().courses[0].extra, 'keep');
    assert.throws(() => courses.saveCourse({ title: '陈旧', weekday: 1, periodStart: 1, periodEnd: 2 }, { id: course.id, expected }), /变化/);
    const before = JSON.stringify(disk());
    fail(true);
    assert.throws(() => courses.adjust(course.id, '2026-10-19', { action: 'cancel' }), /disk full/);
    assert.equal(JSON.stringify(disk()), before);
    fail(false);
    assert.throws(() => courses.update({ courses: [{ ...courses.current().courses[0], example: true }] }), /开发者/);
    api.setDeveloperMode(true);
    courses.update({ courses: [...courses.current().courses, { ...course, id: 'sample-course', example: true }] });
    api.setDeveloperMode(false);
    courses.saveCourse({ title: '真实修改', weekday: 1, periodStart: 1, periodEnd: 2, weekText: '1-4' }, { id: course.id });
    assert.equal(disk().data.timetables.tables[0].courses.length, 2);
    courses.deleteCourse(course.id);
    assert.equal(host.client('records').inspect(ref).status, 'missing');
    assert.equal(host.client('objects').detail(object.id).entries[0].status, 'missing');
    assert.equal(disk().data.timetables.tables[0].courses[0].id, 'sample-course');
    runtime.dispose();
});
test('网页/教务异步操作在停用再启用后仍拒绝旧结果，不向工作区写入', async () => {
    let completeWeb, completePortal;
    const bridge = { collectPage: () => new Promise(resolve => { completeWeb = resolve; }), captureNow: () => new Promise(resolve => { completePortal = resolve; }) };
    const { host, runtime, toggle, disk } = await setup({ bridge });
    const web = host.client('web-captures').collect('https://example.org/async', '2026-10-21');
    toggle('web-capture', false);
    toggle('web-capture', true);
    const before = JSON.stringify(disk().data);
    completeWeb({ ok: true, url: 'https://example.org/async', title: '过期结果', text: '不应保存' });
    await assert.rejects(web, /取消/);
    assert.equal(JSON.stringify(disk().data), before);
    const portal = host.client('course-import').capture();
    toggle('courses', false);
    assert.equal(runtime.list().find(p => p.id === 'course-import').active, false);
    toggle('courses', true);
    completePortal({ ok: true, text: '过期课表' });
    await assert.rejects(portal, /取消/);
    assert.equal(disk().data.webCaptures.length, 0);
    runtime.dispose();
});
test('所有业务停用后保留资料，原引用返回关闭，稳定客户端重连，备份/恢复含未知扩展', async () => {
    const { host, runtime, api, toggle, disk } = await setup(), items = host.client('items');
    const item = items.save({ title: '迁移记录', type: 'longterm' }), ref = { collection: 'task', id: item.id };
    const old = host.use('items'), snapshot = api.snapshot();
    snapshot.data.extensions['jiwei-future-plugin'] = { schemaVersion: 99, keep: 'unknown' };
    api.restore(snapshot);
    for (const id of ['items', 'courses', 'objects', 'notes', 'web-capture', 'calendar', 'today'])
        toggle(id, false);
    assert.equal(host.client('records').inspect(ref).status, 'disabled');
    assert.equal(disk().data.tasks[0].id, item.id);
    assert.equal(host.client('overview').query().items, null);
    assert.throws(() => old.list(), /卸载/);
    for (const id of ['items', 'courses', 'objects', 'notes', 'web-capture', 'calendar', 'today'])
        toggle(id, true);
    assert.equal(items.get(ref).title, '迁移记录');
    assert.deepEqual(api.snapshot().data.extensions['jiwei-future-plugin'], { schemaVersion: 99, keep: 'unknown' });
    runtime.dispose();
});
test('诊断观察者失败不把成功提交冒充失败，引用路由只向所属模块发命令', async () => {
    const { host, runtime } = await setup(), items = host.client('items');
    host.on('items:committed', () => { throw Error('observer failed'); });
    const record = items.save({ title: '已提交', type: 'longterm' });
    const opened = [];
    host.command('items.open', ref => opened.push(ref), 'items');
    host.client('records').open({ collection: 'task', id: record.id });
    assert.deepEqual(opened, [{ collection: 'task', id: record.id }]);
    assert.throws(() => host.client('records').open({ collection: 'plan', id: record.id }), /已删除/);
    assert.equal(opened.length, 1);
    const severe = createWorkbenchHost({ onError: () => { throw Error('diagnostic failed'); } });
    severe.on('commit', () => { throw Error('observer failed'); });
    assert.doesNotThrow(() => severe.emit('commit'));
    severe.dispose();
    runtime.dispose();
});
test('旧空课表恢复先准备再单次提交，写入失败保留整份工作区及未知扩展', async () => {
    const { host, runtime, api, disk, fail } = await setup();
    host.client('items').save({ title: '原数据', type: 'longterm' });
    const candidate = emptyWorkspace();
    candidate.data.extensions['jiwei-legacy-extra'] = { keep: true };
    const before = JSON.stringify(disk());
    fail(true);
    assert.throws(() => api.restore(candidate), /disk full/);
    assert.equal(JSON.stringify(disk()), before);
    fail(false);
    const revision = disk().revision;
    api.restore(candidate);
    assert.equal(disk().revision, revision + 1);
    assert.equal(disk().data.tasks.length, 0);
    assert.equal(disk().data.timetables.tables.length, 1);
    assert.deepEqual(disk().data.extensions['jiwei-legacy-extra'], { keep: true });
    runtime.dispose();
});

test('主进程平台边界拒绝非本地页面、关闭功能与过期操作，关闭教务释放句柄',()=>{
    let snapshot={data:{preferences:{modules:{enabled:{courses:true,'course-import':true,'web-capture':true}}}}};const disabled=[];
    const guard=createPlatformPermissions({isLocal:event=>event.local===true,getWorkspace:()=>snapshot,onDisable:id=>disabled.push(id)});
    assert.throws(()=>guard.begin({local:false},'course-import'),/无权/);assert.throws(()=>guard.begin({local:true},'unknown'),/无权/);
    const portal=guard.begin({local:true},'course-import'),web=guard.begin({local:true},'web-capture'),before=structuredClone(snapshot);snapshot.data.preferences.modules.enabled.courses=false;guard.reconcile(before,snapshot);
    assert.deepEqual(disabled,['course-import']);assert.throws(portal,/关闭/);assert.doesNotThrow(web);
    const off=structuredClone(snapshot);snapshot.data.preferences.modules.enabled.courses=true;guard.reconcile(off,snapshot);assert.throws(portal,/取消/);
    const current=guard.begin({local:true},'web-capture');guard.reconcile(snapshot,snapshot,true);assert.throws(current,/取消/);
});

test('日历可选来源失效时明确降级，查询不持久化伪空数据',()=>{
  const storage=memory(),before=storage.snapshot(),service=createCalendarService(storage,{enabled:()=>true,items:()=>{throw Error('unloaded');},courses:()=>{throw Error('version mismatch');}});
  const result=service.query({start:'2026-10-19',end:'2026-10-25'},{tasks:true,plans:true,courses:true,phases:true,completed:false});
  assert.deepEqual(result.errors,['事项服务暂不可用','课程服务暂不可用']);assert.deepEqual(result.entries,[]);assert.equal(storage.snapshot(),before);
});

test('原型存储方法保留接收者，映射读取不影响事务备份与完整正文回滚',()=>{
  class StorageLike{entries=new Map();getItem(key){return this.entries.get(key)??null;}setItem(key,value){if(key==='related'&&value==='"fail"')throw Error('quota');this.entries.set(key,String(value));}}
  const raw=new StorageLike();raw.setItem('own','old');raw.setItem('related',JSON.stringify({text:'完整正文',example:true}));
  const storage=createPluginStorage(raw,{write:['own'],read:['related'],transaction:['related'],projectRead:(key,text)=>key==='related'?'只读元信息':text});
  storage.setItem('own','new');assert.equal(raw.getItem('own'),'new');assert.equal(storage.getItem('related'),'只读元信息');const original=raw.getItem('related');
  assert.throws(()=>storage.transaction({own:'changed',related:'fail'}),/quota/);assert.equal(raw.getItem('own'),'new');assert.equal(raw.getItem('related'),original);
});

test('助手和提醒服务独立启停，公共命令撤销、数据由原平台保留，陈旧回包失效',async()=>{
 let pending;const calls=[];
 const bridge={assistant:async(action,payload)=>{calls.push(action);if(action==='parse')return new Promise(resolve=>pending=resolve);return {ok:true,rows:[],textModel:'deepseek-flash'};}};
 const {host,runtime,toggle}=await setup({bridge});
 const assistant=host.use('assistant'),reminders=host.client('reminders');
 assert.ok(runtime.list().some(p=>p.id==='assistant'&&p.active));
 assert.ok(runtime.list().some(p=>p.id==='reminders'&&p.active));
 const request=assistant.request('parse',{text:'想法'});toggle('assistant',false);pending({ok:true,intent:{action:'note',title:'陈旧'}});await assert.rejects(request,/关闭|取消/);
 assert.throws(()=>assistant.request('settings-get'),/卸载/);
 assert.equal((await reminders.list()).ok,true);
 toggle('reminders',false);assert.ok(!host.inventory().commands.includes('reminders.add'));assert.throws(()=>reminders.list(),/服务不可用/);
 toggle('assistant',true);assert.equal((await host.client('assistant').request('settings-get')).textModel,'deepseek-flash');
 toggle('reminders',true);assert.equal((await reminders.list()).ok,true);
 assert.equal(host.inventory().commands.filter(name=>name==='reminders.list').length,1);
 runtime.dispose();
});

test('提醒平台失败必须抛出，助手不可把没有创建的提醒标记为完成',async()=>{
 const {host,runtime}=await setup({bridge:{assistant:async()=>({ok:false,message:'系统任务注册失败'})}});
 let commits=0;host.on('reminders:committed',()=>commits++);
 await assert.rejects(host.client('reminders').add({title:'提醒',at:Date.now()+3600000}),/系统任务注册失败/);
 await assert.rejects(host.client('assistant').execute({action:'reminder',title:'提醒',at:Date.now()+3600000}),/系统任务注册失败/);
 assert.equal(commits,0);runtime.dispose();
});
