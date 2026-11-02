import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skeletonKey, normalizeSkeleton, readSkeleton, saveSkeleton } from './skeleton.mjs';
import { createWorkspaceStorage, emptyWorkspace, validateWorkspace, workspaceStorageValue } from './workspace-format.mjs';
import { createWorkspaceService } from './workspace-service.mjs';
import { loomDestinations } from './loom-nav.mjs';
import { normalizeModules } from './modules.mjs';

test('经纬目录按真实开关和注册状态提供入口，挂起状态不伪装成可用页', () => {
  const modules = normalizeModules(null), inventory = { pages: ['overview','today','courses','plans','notes','objects','calendar','web-capture','reminders','plugins','settings'], commands: ['assistant.open'] };
  assert.equal(loomDestinations(modules, inventory).filter(p => !p.status).length, 12);
  modules.enabled.plans = false;
  assert.equal(loomDestinations(modules, inventory).find(p => p.id === 'plans').status, '', 'legacy tasks still enables unified items');
  modules.enabled.tasks = false; modules.enabled.notes = false;
  assert.equal(loomDestinations(modules, inventory).find(p => p.id === 'plans').status, '已关闭');
  assert.equal(loomDestinations(modules, inventory).find(p => p.id === 'notes').status, '已关闭');
  assert.equal(loomDestinations(modules, inventory).find(p => p.id === 'chat-monitor').status, '挂起');
  inventory.commands = [];
  assert.equal(loomDestinations(modules, inventory).find(p => p.id === 'assistant').status, '暂不可用');
});

const memory = () => {
  const map = new Map();
  return { get length() { return map.size; }, key: i => [...map.keys()][i], getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) };
};
test('骨架读取兼容缺省、损坏和未来版本；非法保存不覆盖旧值', () => {
  const storage = memory(), defaults = normalizeSkeleton(null);
  for (const text of [null, '{broken', '{"schemaVersion":2}', 'false']) {
    if (text === null) storage.removeItem(skeletonKey); else storage.setItem(skeletonKey, text);
    assert.deepEqual(readSkeleton(storage), defaults);
  }
  const saved = saveSkeleton(storage, { ...defaults, skeleton: 'loom', loomLayout: 'atlas' });
  assert.throws(() => saveSkeleton(storage, { ...saved, skeleton: 'unknown' }), /无效/);
  assert.deepEqual(readSkeleton(storage), saved);
});
test('骨架经偏好服务与既有extensions往返；业务与原布局不变，写盘失败不提交', async () => {
  const cache = memory();
  let disk = validateWorkspace(emptyWorkspace()), fail = false;
  disk.data.preferences.layout = { schemaVersion: 1, layout: 'dock', particles: false, position: { x: .3, y: .8 } };
  const before = structuredClone(disk);
  const bridge = { readWorkspace: async () => ({ ok: true, workspace: disk }), writeWorkspace: next => {
    if (fail) return { ok: false, message: 'disk full' };
    disk = structuredClone(next); return { ok: true, workspace: disk };
  } };
  const workspace = await createWorkspaceStorage(cache, bridge);
  const storage = createWorkspaceService(workspace).preferenceStorage([skeletonKey]);
  const saved = saveSkeleton(storage, { ...normalizeSkeleton(null), skeleton: 'loom', loomLayout: 'atlas' });
  assert.deepEqual(JSON.parse(disk.data.extensions[skeletonKey]), saved);
  assert.deepEqual(disk.data.preferences, before.data.preferences);
  assert.equal(disk.schemaVersion, 1);
  assert.deepEqual(disk.data.tasks, before.data.tasks);
  assert.deepEqual(JSON.parse(workspaceStorageValue(validateWorkspace(disk), skeletonKey)), saved);
  fail = true;
  assert.throws(() => saveSkeleton(storage, { ...saved, skeleton: 'workbench' }), /disk full/);
  assert.deepEqual(readSkeleton(storage), saved);
  assert.throws(() => storage.getItem('jiwei-desktop-tasks'), /无权/);
  const reloaded = await createWorkspaceStorage(memory(), bridge);
  assert.deepEqual(readSkeleton(createWorkspaceService(reloaded).preferenceStorage([skeletonKey])), saved);
});
