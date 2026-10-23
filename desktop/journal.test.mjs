import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJournalStore, journalKey, journalKinds, journalKindLabel, readJournal, normalizeJournal, journalMarkdown, queryJournal } from './journal.mjs';
import { emptyWorkspace, validateWorkspace, workspaceFromStorage, workspaceStorageValue, createWorkspaceStorage } from './workspace-format.mjs';
const memory = () => { const map = new Map(); return { get length() { return map.size; }, key: index => [...map.keys()][index], getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) }; };
function setup(storage = memory()) { let id = 0; return { storage, store: createJournalStore(storage, { makeId: () => `n${++id}`, clock: () => '2026-10-21T10:00:00+08:00' }) }; }
function write(store, body = '今日感受\n完整正文', more = {}) { const draft = store.start(); return store.saveDraft({ ...draft, body, date: '2026-10-21', ...more }, draft.revision); }

test('笔记用途可不选，新用途独立保存、筛选和导出，不强制填写标题或标签', () => {
  const { store } = setup();
  assert.equal(store.start().kind, 'uncategorized'); store.discardDraft();
  for (const kind of Object.keys(journalKinds)) {
    const draft = write(store, `正文 ${kind}`, { kind });
    const entry = store.publish(draft.revision);
    assert.equal(entry.title, ''); assert.deepEqual(entry.tags, []);
    assert.equal(store.list({ kind }).length, 1);
    assert.ok(journalMarkdown([entry]).includes(journalKinds[kind]));
  }
  assert.equal(store.list().length, 6);
});

test('旧分类按新用途显示与合并筛选，读取、编辑及备份保留原分类和未知字段', () => {
  const { storage, store } = setup();
  for (const kind of ['daily', 'reflection', 'experience']) {
    const draft = write(store, `旧正文 ${kind}`, { kind }); store.publish(draft.revision);
  }
  const raw = JSON.parse(storage.getItem(journalKey)); raw.extension = { keep: true };
  raw.entries[0].unknownField = '保留'; storage.setItem(journalKey, JSON.stringify(raw));
  const before = storage.getItem(journalKey);
  assert.equal(journalKindLabel('daily'), '见闻');
  assert.equal(journalKindLabel('reflection'), '复盘'); assert.equal(journalKindLabel('experience'), '复盘');
  assert.equal(store.list({ kind: 'observation' }).length, 1);
  assert.equal(store.list({ kind: 'review' }).length, 2);
  assert.equal(store.list({ kind: 'experience' }).length, 2);
  assert.equal(storage.getItem(journalKey), before, 'reading never migrates original data');
  let draft = store.start(raw.entries[2].id);
  draft = store.saveDraft({ ...draft, kind: 'review', body: draft.body + '\n补充' }, draft.revision);
  assert.equal(draft.kind, 'experience', 'editing another field keeps the legacy category');
  const updated = store.publish(draft.revision); assert.equal(updated.kind, 'experience');
  assert.equal(updated.id, raw.entries[2].id); assert.equal(updated.createdAt, raw.entries[2].createdAt);
  const restored = validateWorkspace(workspaceFromStorage(storage));
  assert.deepEqual(restored.data.journal.extension, { keep: true });
  assert.equal(restored.data.journal.entries[0].unknownField, '保留');
  assert.deepEqual(restored.data.journal.entries.map(e => e.kind), ['daily', 'reflection', 'experience']);
});

test('旧编辑草稿和隐藏草稿兼容新用途；无效分类失败时不覆盖原记录', () => {
  const { storage, store } = setup();
  let draft = write(store, '旧的草稿', { kind: 'experience' });
  const original = store.read(); original.parkedDrafts = [{ ...draft, id: 'parked', kind: 'daily', example: true }];
  storage.setItem(journalKey, JSON.stringify(original));
  assert.equal(createJournalStore(storage).draft().kind, 'experience');
  const before = storage.getItem(journalKey);
  for (const kind of ['unknown', '__proto__', '', null]) assert.throws(() => store.saveDraft({ ...draft, kind }, draft.revision), /内容/);
  assert.equal(storage.getItem(journalKey), before);
  draft = store.saveDraft({ ...draft, kind: 'excerpt' }, draft.revision);
  assert.equal(store.publish(draft.revision).kind, 'excerpt');
  assert.equal(store.read().parkedDrafts[0].kind, 'daily');
});

test('随记无标题录入、草稿重开与发布编辑保留身份、创建时间和原文', () => {
  const { storage, store } = setup(); let draft = write(store, '<script>字面文本</script>\n第二行', { kind: 'feeling', tags: ['日常'] });
  assert.equal(readJournal(storage).entries.length, 0);
  assert.equal(createJournalStore(storage).draft().body, draft.body);
  const note = store.publish(draft.revision); assert.equal(store.draft(), null);
  assert.throws(() => store.publish(draft.revision), /草稿已变化/);
  draft = store.start(note.id); draft = store.saveDraft({ ...draft, title: '后来补的标题', body: '修改后的感受' }, draft.revision);
  const edited = store.publish(draft.revision);
  assert.equal(edited.id, note.id); assert.equal(edited.createdAt, note.createdAt); assert.equal(edited.revision, 2);
  assert.equal(store.list().length, 1); assert.equal(journalMarkdown([edited]).includes('修改后的感受'), true);
});

test('保存/发布失败保留草稿和权威快照，过期草稿与未知格式拒绝写入', () => {
  const { storage, store } = setup(); const draft = write(store); const before = storage.getItem(journalKey), original = storage.setItem;
  storage.setItem = () => { throw Error('disk full'); };
  assert.throws(() => store.saveDraft({ ...draft, body: '没有落盘' }, draft.revision), /disk full/);
  assert.throws(() => store.publish(draft.revision), /disk full/); assert.equal(storage.getItem(journalKey), before);
  storage.setItem = original;
  const newer = store.saveDraft({ ...draft, body: '已保存的新版本' }, draft.revision);
  assert.throws(() => store.saveDraft(draft, draft.revision), /草稿已变化/);
  assert.equal(store.draft().body, newer.body);
  assert.throws(() => normalizeJournal({ ...store.read(), schemaVersion: 2 }), /不兼容/);
  assert.throws(() => store.saveDraft({ ...newer, date: '2026-02-30' }, newer.revision), /日期/);
});

test('归档、回收站和恢复独立，永久删除需先回收，编辑草稿保护原记录', () => {
  const { store } = setup(); const draft = write(store), note = store.publish(draft.revision);
  assert.throws(() => store.change(note.id, 'purge'), /回收站/);
  store.start(note.id); assert.throws(() => store.change(note.id, 'trash'), /编辑草稿/); store.discardDraft();
  store.change(note.id, 'archive'); assert.equal(store.list().length, 0); assert.equal(store.list({ status: 'archived' }).length, 1);
  store.change(note.id, 'trash'); assert.equal(store.list({ status: 'trash' }).length, 1);
  store.change(note.id, 'restore'); assert.equal(store.list({ status: 'archived' }).length, 1);
  store.change(note.id, 'unarchive'); assert.equal(store.list().length, 1);
  store.change(note.id, 'trash'); store.change(note.id, 'purge'); assert.equal(store.read().entries.length, 0);
});

test('按记录日期排序与筛选，中文/特殊字符按字面搜索，同名不合并', () => {
  const { store } = setup();
  for (const [date, kind, body] of [['2026-10-21', 'feeling', '散步时心情好多了 [a+b]'], ['2026-10-20', 'idea', '同名记录']]) { const draft = write(store, body, { date, kind, tags: ['生活'] }); store.publish(draft.revision); }
  const draft = write(store, '同名记录'); store.publish(draft.revision);
  assert.equal(store.list().length, 3); assert.equal(store.list({ query: '[a+b]' }).length, 1);
  assert.equal(store.list({ kind: 'idea', date: '2026-10-20', query: '生活 同名' }).length, 1);
  assert.equal(store.list().at(-1).date, '2026-10-20');
});

test('示例服务守卫，隐藏示例及其草稿不妨碍真实记录，也不删除隐藏数据', () => {
  const { storage, store } = setup(); assert.throws(() => store.examples(), /开发者/);
  storage.setItem('jiwei-desktop-developer-mode', 'true'); store.examples(); store.examples(); assert.equal(store.list().length, 3);
  const example = store.list()[0]; store.start(example.id);
  storage.setItem('jiwei-desktop-developer-mode', 'false'); assert.equal(store.list().length, 0); assert.equal(store.draft(), null);
  assert.throws(() => store.change(example.id, 'trash'), /不可见/);
  const draft = write(store, '这是自己的记录'); store.publish(draft.revision);
  assert.equal(store.list().length, 1); assert.equal(store.read().entries.length, 4);
  storage.setItem('jiwei-desktop-developer-mode', 'true'); assert.equal(store.draft().editId, example.id);
});

test('新字段与关闭模块资料通过完整工作区备份/恢复，未来子版本不覆盖原文件', async () => {
  const { storage, store } = setup(); const draft = write(store); store.publish(draft.revision);
  const snapshot = workspaceFromStorage(storage); snapshot.data.journal.futureField = { keep: true };
  const restored = validateWorkspace(JSON.parse(JSON.stringify(snapshot)));
  assert.deepEqual(restored.data.journal.futureField, { keep: true });
  assert.equal(queryJournal({ getItem: () => workspaceStorageValue(restored, journalKey) }).length, 1);
  const old = validateWorkspace(emptyWorkspace()); assert.equal(old.data.journal, undefined);
  assert.equal(JSON.parse(workspaceStorageValue(old, journalKey)).entries.length, 0);
  const target = await createWorkspaceStorage(memory()); target.restore(restored); assert.equal(target.snapshot().data.journal.entries.length, 1);
  const before = JSON.stringify(target.snapshot().data); const future = structuredClone(restored); future.data.journal.schemaVersion = 9;
  assert.throws(() => target.restore(future), /不兼容/); assert.equal(JSON.stringify(target.snapshot().data), before);
});
