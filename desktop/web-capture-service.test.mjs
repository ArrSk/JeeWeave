import test from 'node:test';
import assert from 'node:assert/strict';
import { createWebCaptureService, webCaptureKey, saveWebCapture } from './web-capture-service.mjs';
import { createItemService } from './item-service.mjs';
import { createWorkbenchHost } from './workbench-host.mjs';
import { saveWebCapture as legacySave, approveWebDraft as legacyApprove } from './workbench-data.mjs';
import { setModuleEnabled, readModules, isModuleEnabled } from './modules.mjs';
import { visibleRecords } from './examples.mjs';
import { createWorkspaceStorage, emptyWorkspace, validateWorkspace } from './workspace-format.mjs';

const day = '2026-10-21', taskKey = 'jiwei-desktop-tasks';
const source = { url: 'https://example.org/notice', title: '虚构通知', text: '请于 2026-10-25 前提交实验报告。', directory: 'captures/web-captures/fixture', links: [{ text: '资料', href: 'https://example.org/material' }] };
const fields = { title: '核对后的实验报告', date: '2026-10-24' };
const memory = () => {
  const map = new Map();
  return { get length() { return map.size; }, key: index => [...map.keys()][index], getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key), snapshot: () => Object.fromEntries(map) };
};
const connected = (storage, options = {}) => createWebCaptureService(storage, { items: () => createItemService(storage, { enabled: id => isModuleEnabled(readModules(storage), id) }), ...options });

test('网页服务仅保存正文和草稿，重复采集保留原身份、元数据与已有修改，查询为独立快照', () => {
  const storage = memory(); let commits = 0;
  const service = connected(storage, { onCommit: () => commits++ }), record = service.save(source, day);
  assert.equal(storage.getItem(taskKey), null); assert.equal(record.drafts.length, 1); assert.equal(commits, 1);
  assert.equal(record.directory, source.directory); assert.deepEqual(record.links, source.links);
  const state = service.list(); state[0].futureField = { keep: true }; state[0].drafts[0].futureFlag = 'preserve'; storage.setItem(webCaptureKey, JSON.stringify(state));
  const duplicate = service.save({ ...source, title: '不应覆盖旧标题' }, day);
  assert.equal(duplicate.id, record.id); assert.equal(duplicate.capturedAt, record.capturedAt); assert.equal(duplicate.title, record.title); assert.equal(commits, 1);
  duplicate.futureField.keep = false; assert.equal(service.get(record.id).futureField.keep, true);
  const before = storage.snapshot(); service.list(); service.get(record.id); assert.deepEqual(storage.snapshot(), before);
  assert.throws(() => service.get('missing'), /不存在/);
  assert.throws(() => service.save({ ...source, url: 'file:///fixture' }, day), /HTTP/);
  assert.throws(() => service.save({ ...source, text: ' ' }, day), /正文/); assert.deepEqual(storage.snapshot(), before);
});

test('草稿确认保留证据和原文，重复确认及同来源行动去重不复制或重置已有事项', () => {
  const storage = memory(); let commits = 0;
  const service = connected(storage, { onCommit: () => commits++ }), record = service.save(source, day), draft = record.drafts[0];
  const raw = service.list(); raw[0].futureField = 'keep'; raw[0].drafts[0].futureFlag = 'keep'; storage.setItem(webCaptureKey, JSON.stringify(raw));
  const before = storage.snapshot();
  assert.throws(() => service.approve(record.id, draft.id, { title: '', date: '' }), /名称/);
  assert.throws(() => service.approve(record.id, draft.id, { title: '报告', date: '2026-02-30' }), /有效日期/); assert.deepEqual(storage.snapshot(), before);
  assert.deepEqual(service.approve(record.id, draft.id, fields), { added: true });
  const task = JSON.parse(storage.getItem(taskKey))[0]; assert.equal(task.sourceUrl, source.url); assert.equal(task.sourceTitle, source.title); assert.equal(task.evidence, draft.evidence);
  assert.equal(service.get(record.id).text, source.text); assert.equal(service.get(record.id).futureField, 'keep'); assert.equal(service.get(record.id).drafts[0].futureFlag, 'keep');
  assert.deepEqual(service.approve(record.id, draft.id, { title: '重复点击', date: '' }), { added: false }); assert.equal(commits, 2);
  storage.setItem(taskKey, JSON.stringify([{ ...task, done: true, extra: { keep: true } }]));
  const taskBefore = storage.getItem(taskKey), changed = service.save({ ...source, text: source.text + '\n重要：携带学生证。' }, day);
  assert.deepEqual(service.approve(changed.id, changed.drafts[0].id, fields), { added: false });
  assert.equal(storage.getItem(taskKey), taskBefore); assert.equal(service.get(changed.id).drafts[0].taskId, task.id); assert.equal(commits, 4);
});

test('网页与事项开关在服务及兼容导出边界生效，旧计划单边开启不绕过原待办依赖', () => {
  assert.equal(legacySave, saveWebCapture);
  const storage = memory(), service = connected(storage), record = service.save(source, day), id = record.drafts[0].id;
  setModuleEnabled(storage, 'web-capture', false); const disabled = storage.snapshot();
  for (const act of [() => service.list(), () => service.get(record.id), () => service.save(source, day), () => service.approve(record.id, id, fields), () => legacySave(storage, source, day), () => legacyApprove(storage, record.id, id, fields)]) assert.throws(act, /关闭/);
  assert.deepEqual(storage.snapshot(), disabled);
  setModuleEnabled(storage, 'web-capture', true); setModuleEnabled(storage, 'tasks', false);
  assert.equal(service.list().length, 1); const before = storage.snapshot();
  assert.throws(() => service.approve(record.id, id, fields), /开启事项/); assert.throws(() => legacyApprove(storage, record.id, id, fields), /开启事项/); assert.deepEqual(storage.snapshot(), before);
  setModuleEnabled(storage, 'tasks', true); assert.deepEqual(service.approve(record.id, id, fields), { added: true });
});

test('隐藏示例不能经查询、重复采集或确认使用，开发者模式恢复原数据并传递示例标记', () => {
  const storage = memory(), service = connected(storage), record = service.save(source, day);
  storage.setItem(webCaptureKey, JSON.stringify([{ ...record, example: true }])); const before = storage.snapshot();
  assert.deepEqual(service.list(), []); assert.throws(() => service.get(record.id), /不可见/);
  assert.throws(() => service.save(source, day), /开发者模式/); assert.throws(() => service.approve(record.id, record.drafts[0].id, fields), /开发者模式/); assert.deepEqual(storage.snapshot(), before);
  storage.setItem('jiwei-desktop-developer-mode', 'true'); service.approve(record.id, record.drafts[0].id, fields);
  const tasks = JSON.parse(storage.getItem(taskKey)); assert.equal(tasks[0].example, true);
  storage.setItem('jiwei-desktop-developer-mode', 'false'); assert.deepEqual(service.list(), []); assert.deepEqual(visibleRecords(storage, tasks), []);
  assert.equal(JSON.parse(storage.getItem(webCaptureKey)).length, 1);
});

test('权威写入失败保护原网页与事项，成功重试后才通知，完整快照继续包含来源和草稿状态', async () => {
  let disk = emptyWorkspace(), fail = false, commits = 0;
  const bridge = { readWorkspace: async () => ({ ok: true, workspace: disk }), writeWorkspace: candidate => {
    if (fail) return { ok: false, message: 'disk full' };
    disk = validateWorkspace(candidate); return { ok: true, workspace: disk };
  } };
  const workspace = await createWorkspaceStorage(memory(), bridge), service = connected(workspace.storage, { onCommit: () => commits++ });
  const empty = JSON.stringify(disk.data); fail = true;
  assert.throws(() => service.save(source, day), /disk full/); assert.equal(JSON.stringify(disk.data), empty); assert.equal(commits, 0);
  fail = false; const record = service.save(source, day), before = JSON.stringify(disk.data); assert.equal(commits, 1);
  fail = true; assert.throws(() => service.approve(record.id, record.drafts[0].id, fields), /disk full/);
  assert.equal(JSON.stringify(disk.data), before); assert.equal(JSON.stringify(workspace.snapshot().data), before); assert.equal(commits, 1);
  fail = false; service.approve(record.id, record.drafts[0].id, fields); assert.equal(commits, 2);
  const restored = validateWorkspace(JSON.parse(JSON.stringify(workspace.snapshot())));
  assert.equal(restored.data.tasks.length, 1); assert.equal(restored.data.webCaptures[0].drafts[0].taskId, restored.data.tasks[0].id); assert.equal(restored.data.tasks[0].sourceUrl, source.url);
});

test('宿主连接的来源事项与网页草稿同次提交，失败不发通知，重试后两方观察者均读到完整结果', () => {
  const storage = memory(), events = [], enabled = id => isModuleEnabled(readModules(storage), id);
  const host = createWorkbenchHost({ enabled }); let captureId, approving = false;
  const observe = owner => {
    if (approving) {
      const draft = JSON.parse(storage.getItem(webCaptureKey)).find(record => record.id === captureId).drafts[0];
      assert.equal(draft.status, 'added'); assert.ok(JSON.parse(storage.getItem(taskKey)).some(task => task.id === draft.taskId));
    }
    events.push(owner);
  };
  host.provide('items', createItemService(storage, { enabled, onCommit: () => observe('items') }));
  host.provide('web-captures', createWebCaptureService(storage, { items: () => host.use('items'), onCommit: () => observe('web') }), { owner: 'web-capture' });
  const web = host.use('web-captures'), record = web.save(source, day); captureId = record.id; events.length = 0; approving = true;
  const before = storage.snapshot(), write = storage.setItem; let fail = true;
  storage.setItem = (key, value) => { if (fail && key === webCaptureKey) { fail = false; throw Error('storage full'); } write(key, value); };
  try { assert.throws(() => web.approve(record.id, record.drafts[0].id, fields), /storage full/); }
  finally { storage.setItem = write; }
  assert.deepEqual(storage.snapshot(), before); assert.deepEqual(events, []);
  assert.deepEqual(web.approve(record.id, record.drafts[0].id, fields), { added: true }); assert.deepEqual(events, ['items', 'web']);
  web.approve(record.id, record.drafts[0].id, fields); assert.deepEqual(events, ['items', 'web']);
});

test('缺失、版本错配或缺少来源接口时保留草稿，不回退直写事项，重新连接后可确认', () => {
  const storage = memory(), host = createWorkbenchHost(), service = createWebCaptureService(storage, { items: () => host.use('items') });
  const record = service.save(source, day), before = storage.snapshot();
  assert.throws(() => service.approve(record.id, record.drafts[0].id, fields), /不可用/);
  let revoke = host.provide('items', {}, { version: 2 });
  assert.throws(() => service.approve(record.id, record.drafts[0].id, fields), /版本不兼容/); revoke();
  revoke = host.provide('items', {});
  assert.throws(() => service.approve(record.id, record.drafts[0].id, fields), /事项服务不兼容/); revoke();
  assert.throws(() => createWebCaptureService(storage).approve(record.id, record.drafts[0].id, fields), /未连接/);
  assert.deepEqual(storage.snapshot(), before);
  host.provide('items', createItemService(storage)); assert.deepEqual(service.approve(record.id, record.drafts[0].id, fields), { added: true });
});
