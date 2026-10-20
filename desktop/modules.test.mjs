import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModules, readModules, setModuleEnabled, isModuleEnabled, moduleKey } from './modules.mjs';
import { emptyWorkspace, validateWorkspace, workspaceFromStorage } from './workspace-format.mjs';
import { createTimetableStore } from './timetable-store.mjs';
import { loadWorkbenchExamples, dataKeys } from './workbench-data.mjs';
const memory = () => { const map = new Map(); return { get length() { return map.size; }, key: i => [...map.keys()][i], getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) }; };

test('旧工作区默认开启内置功能，关闭课表只暂停教务依赖，重新开启恢复原选择', () => {
  const storage = memory(), before = validateWorkspace(emptyWorkspace());
  assert.equal(before.data.preferences.modules.enabled.courses, true);
  let next = setModuleEnabled(storage, 'courses', false);
  assert.equal(isModuleEnabled(next, 'course-import'), false); assert.equal(next.enabled['course-import'], true);
  next = setModuleEnabled(storage, 'courses', true); assert.equal(isModuleEnabled(next, 'course-import'), true);
  assert.equal(isModuleEnabled(next, 'settings'), true);
  assert.throws(() => setModuleEnabled(storage, 'settings', false), /不能/);
});
test('开关保留未知布尔项，拒绝未来格式与非布尔值，保存失败不伪造成功', () => {
  const value = normalizeModules({ schemaVersion: 1, enabled: { tasks: false, future: false } }); assert.equal(value.enabled.future, false);
  assert.throws(() => normalizeModules({ schemaVersion: 2, enabled: {} }), /格式/);
  assert.throws(() => normalizeModules({ schemaVersion: 1, enabled: { tasks: 'false' } }), /格式/);
  const storage = memory(); setModuleEnabled(storage, 'tasks', false); storage.setItem = () => { throw Error('disk full'); };
  assert.throws(() => setModuleEnabled(storage, 'tasks', true), /disk full/); assert.equal(readModules(storage).enabled.tasks, false);
});
test('关闭功能不删除数据，全部示例只补充已开启功能，开关进入统一备份', () => {
  const storage = memory(); createTimetableStore(storage);
  storage.setItem('jiwei-desktop-developer-mode','true');
  storage.setItem(dataKeys.tasks, '[{"id":"keep","title":"已有资料","done":false}]');
  setModuleEnabled(storage, 'tasks', false); setModuleEnabled(storage, 'courses', false);
  loadWorkbenchExamples(storage, 'all', '2026-10-18');
  assert.equal(JSON.parse(storage.getItem(dataKeys.tasks)).length, 1);
  assert.equal(JSON.parse(storage.getItem(dataKeys.tables)).tables.length, 1);
  assert.throws(() => loadWorkbenchExamples(storage, 'tasks'), /已关闭/);
  assert.equal(workspaceFromStorage(storage).data.preferences.modules.enabled.tasks, false);
  assert.equal(readModules(storage).enabled.plans, true); assert.ok(storage.getItem(moduleKey));
});

test('统一事项开关一次保存旧两集合，失败保留原单边状态与资料', () => {
  const storage = memory();
  setModuleEnabled(storage, 'plans', false);
  storage.setItem(dataKeys.tasks, '[{"id":"keep","title":"原事项"}]');
  const original = storage.getItem(moduleKey), set = storage.setItem;
  let writes = 0;
  storage.setItem = (key, value) => { writes++; throw Error('disk full'); };
  assert.throws(() => setModuleEnabled(storage, 'items', false), /disk full/);
  assert.equal(writes, 1); assert.equal(storage.getItem(moduleKey), original);
  storage.setItem = (key, value) => { writes++; set(key, value); };
  const next = setModuleEnabled(storage, 'items', false);
  assert.equal(writes, 2); assert.equal(next.enabled.plans, false); assert.equal(next.enabled.tasks, false);
  assert.equal(storage.getItem(dataKeys.tasks), '[{"id":"keep","title":"原事项"}]');
});
