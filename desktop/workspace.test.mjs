import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createWorkspaceFile } from './workspace-file.cjs';
import { createWorkspaceStorage, emptyWorkspace, validateWorkspace, workspaceFromStorage, readWorkspaceBackup } from './workspace-format.mjs';
import { createTimetableStore } from './timetable-store.mjs';
function memory(initial = {}) { const entries = new Map(Object.entries(initial)); return { get length() { return entries.size; }, key: i => [...entries.keys()][i], getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) }; }
const temporary = () => fs.mkdtempSync(path.join(os.tmpdir(), 'jiwei-workspace-'));
test('旧 localStorage 一次迁移为可读版本化文件，文件在刷新后优先，保留未知扩展键', async () => {
  const root = temporary(), repo = createWorkspaceFile(root, validateWorkspace);
  const cache = memory({ 'jiwei-desktop-tasks': JSON.stringify([{ id: 'old', title: '保留', date: '', done: true }]), 'jiwei-future-setting': 'value' });
  const bridge = { readWorkspace: async () => ({ ok: true, workspace: repo.read(), paths: { root } }), writeWorkspace: (doc, options) => ({ ok: true, workspace: repo.write(doc, options) }) };
  const { storage } = await createWorkspaceStorage(cache, bridge);
  createTimetableStore(storage);
  const disk = JSON.parse(fs.readFileSync(path.join(root, 'workspace.json'), 'utf8'));
  assert.equal(disk.format, 'jeeweave-desktop-workspace'); assert.equal(disk.data.tasks[0].anchor.type, 'floating'); assert.equal(disk.data.tasks[0].done, true); assert.equal(disk.data.extensions['jiwei-future-setting'], 'value');
  const stale = memory({ 'jiwei-theme': 'forest' }); const reopened = await createWorkspaceStorage(stale, bridge);
  assert.equal(reopened.storage.getItem('jiwei-theme'), 'blue'); assert.equal(JSON.parse(reopened.storage.getItem('jiwei-desktop-tasks'))[0].id, 'old');
});
test('保存失败不改变内存、缓存或磁盘；多键事务一次提交且旧版本写入被拒绝', async () => {
  const root = temporary(), repo = createWorkspaceFile(root, validateWorkspace), cache = memory(); let fail = false;
  const bridge = { readWorkspace: async () => ({ ok: true, workspace: repo.read() }), writeWorkspace: doc => fail ? { ok: false, message: 'disk full' } : { ok: true, workspace: repo.write(doc) } };
  const { storage, snapshot } = await createWorkspaceStorage(cache, bridge);
  const before = fs.readFileSync(path.join(root, 'workspace.json'), 'utf8'); fail = true;
  assert.throws(() => storage.setItem('jiwei-theme', 'forest'), /disk full/); assert.equal(storage.getItem('jiwei-theme'), 'blue'); assert.equal(cache.getItem('jiwei-theme'), 'blue'); assert.equal(fs.readFileSync(path.join(root, 'workspace.json'), 'utf8'), before);
  fail = false; const old = snapshot(); storage.transaction({ 'jiwei-desktop-plans': [{ id: 'p', title: '计划', date: '' }], 'jiwei-desktop-tasks': [{ id: 't', title: '待办', date: '' }] });
  assert.equal(snapshot().revision, old.revision + 1); assert.throws(() => repo.write(old), /已被更新/);
  assert.equal(repo.read().data.tasks[0].kind, 'task'); assert.equal(repo.read().data.plans[0].kind, 'plan');
});
test('恢复单独保留之前的快照，data 整目录搬动后独立载入，不依赖旧安装路径', () => {
  const root = temporary(), repo = createWorkspaceFile(root, validateWorkspace); const first = repo.write(emptyWorkspace());
  const next = structuredClone(first); next.data.preferences.theme = 'forest';
  next.data.webCaptures = [{ id: 'capture', drafts: [], directory: 'E:\\old-version\\data\\captures\\web-captures\\fixture' }];
  const saved = repo.write(next, { restore: true });
  assert.equal(saved.data.webCaptures[0].directory, 'captures/web-captures/fixture');
  const archive = fs.readdirSync(path.join(root, 'backups'))[0]; assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'backups', archive), 'utf8')).data.preferences.theme, 'blue');
  const moved = path.join(temporary(), 'data'); fs.cpSync(root, moved, { recursive: true });
  assert.equal(createWorkspaceFile(moved, validateWorkspace).read().data.preferences.theme, 'forest');
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'workspace.previous.json'), 'utf8')).revision, first.revision);
});
test('未来版本、损坏文件、阶段越界和课表引用错误都拒绝，不覆盖原资料', () => {
  const root = temporary(), file = path.join(root, 'workspace.json'); fs.writeFileSync(file, '{broken');
  assert.throws(() => createWorkspaceFile(root, validateWorkspace)); assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
  assert.throws(() => validateWorkspace({ ...emptyWorkspace(), schemaVersion: 99 }), /版本/);
  const invalid = emptyWorkspace(); invalid.data.timetables = { activeId: 'missing', tables: [{ id: 'table', name: '课表', totalWeeks: 20, courses: [], schedule: [] }] };
  assert.throws(() => validateWorkspace(invalid), /课表/);
  const cache = memory({ 'jiwei-desktop-tasks': '[{"id":"legacy","title":"合法","date":"2026-10-19"}]' }); assert.equal(workspaceFromStorage(cache).data.tasks[0].anchor.type, 'deadline');
});
test('旧桌面 JSON 导出转换为新格式；保留当前偏好，不误读网页端备份', () => {
  const cache = memory(); createTimetableStore(cache); const current = workspaceFromStorage(cache); current.data.preferences.developerMode = true;
  const legacy = { exportedAt: '2026-10-17T10:00:00Z', timetables: current.data.timetables, plans: [{ id: 'p', title: '安排日期', date: '2026-10-19', done: false }], tasks: [{ id: 't', title: '截止日期', date: '2026-10-20', done: true }], webCaptures: [] };
  const migrated = readWorkspaceBackup(legacy, current);
  assert.equal(migrated.data.preferences.developerMode, true); assert.equal(migrated.data.plans[0].anchor.type, 'allDay'); assert.equal(migrated.data.tasks[0].anchor.type, 'deadline'); assert.equal(migrated.data.tasks[0].done, true);
  assert.throws(() => readWorkspaceBackup({ version: 1, blocks: [] }), /桌面端/);
});
test('旧 jiwei 工作区可读取并升级为 JeeWeave 格式，课程和待办不丢失', () => {
  const old = emptyWorkspace(); old.format = 'jiwei-desktop-workspace';
  old.data.tasks = [{ id: 'legacy-task', title: '旧待办', date: '2026-10-19' }];
  const upgraded = validateWorkspace(old);
  assert.equal(upgraded.format, 'jeeweave-desktop-workspace');
  assert.equal(upgraded.data.tasks[0].title, '旧待办');
  assert.equal(readWorkspaceBackup(old).format, 'jeeweave-desktop-workspace');
});

test('待安排课程与定时课程一起原子保存、重开和备份恢复，旧课表仍兼容', async () => {
  const root = temporary(), repo = createWorkspaceFile(root, validateWorkspace), cache = memory();
  const bridge = { readWorkspace: async () => ({ ok: true, workspace: repo.read() }), writeWorkspace: (doc, options) => ({ ok: true, workspace: repo.write(doc, options) }) };
  const workspace = await createWorkspaceStorage(cache, bridge), store = createTimetableStore(workspace.storage);
  assert.equal(store.current().unplacedCourses, undefined);
  const old = workspace.snapshot();
  const unplaced = [{ id: 'unplaced-fixture', title: '模拟专题甲老师', weekText: '1-3周', weeks: [1,2,3], raw: '模拟专题甲老师(共3周)/1-3周/无' }];
  store.update({ courses: [{ id: 'scheduled-fixture', title: '定时课' }], unplacedCourses: unplaced });
  assert.equal(repo.read().revision, old.revision + 1);
  const reopened = createTimetableStore((await createWorkspaceStorage(memory(), bridge)).storage);
  assert.deepEqual(reopened.current().unplacedCourses, unplaced);
  const backup = readWorkspaceBackup(workspace.snapshot());
  assert.deepEqual(backup.data.timetables.tables[0].unplacedCourses, unplaced);
  const invalid = structuredClone(backup); invalid.data.timetables.tables[0].unplacedCourses[0].weeks = [0];
  assert.throws(() => workspace.restore(invalid), /待安排课程/);
  assert.deepEqual(repo.read().data.timetables.tables[0].unplacedCourses, unplaced);
  const firstId = store.current().id;
  store.create({ name: '另一课表', totalWeeks: 20 }); assert.equal(store.current().unplacedCourses, undefined);
  store.select(firstId); assert.deepEqual(store.current().unplacedCourses, unplaced);
});
