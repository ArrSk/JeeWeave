import { test } from 'node:test';
import assert from 'node:assert/strict';
import { themePresets, normalizeAppearance, appearanceTokens, contrastRatio, courseColors, readAppearance, saveAppearance, applyAppearance } from './appearance.mjs';
import { validateWorkspace, emptyWorkspace } from './workspace-format.mjs';
test('九套主题同时覆盖背景与文字，正文、辅助文字、按钮和课程卡片保持可读对比', () => {
  assert.equal(themePresets.length, 9);
  for (const preset of themePresets) {
    const appearance = normalizeAppearance(null, preset.id), t = appearanceTokens(appearance);
    for (const [foreground, background] of [['--text', '--canvas'], ['--text', '--panel'], ['--muted', '--canvas'], ['--muted', '--panel'], ['--control-text', '--control-bg'], ['--blue', '--accent-soft'], ['--on-accent', '--blue']]) assert.ok(contrastRatio(t[foreground], t[background]) >= 4.5, `${preset.id}: ${foreground}/${background}`);
    for (const base of [{ bg: '#fdf6d8', text: '#b8971f' }, { bg: '#e0edff', text: '#4a7de0' }]) { const card = courseColors(base, appearance); assert.ok(contrastRatio(card.text, card.bg) >= 4.5); }
  }
  const gray = appearanceTokens({ schemaVersion: 1, preset: 'custom', colors: { background: '#767676', text: '#ffffff', accent: '#aaddff' } });
  for (const background of ['--canvas', '--panel', '--sidebar', '--subtle', '--hover']) assert.ok(contrastRatio(gray['--text'], gray[background]) >= 4.5, background);
});
test('旧三色主题无损升级，新的自定义配色在工作区格式中持久保存', () => {
  for (const theme of ['blue', 'violet', 'forest']) { const value = emptyWorkspace(); value.data.preferences.theme = theme; assert.equal(validateWorkspace(value).data.preferences.appearance.preset, theme); }
  const value = emptyWorkspace(); value.data.preferences.theme = 'custom'; value.data.preferences.appearance = { schemaVersion: 1, preset: 'custom', colors: { background: '#172029', text: '#e4edf2', accent: '#90c8d8' } };
  assert.deepEqual(validateWorkspace(value).data.preferences.appearance, value.data.preferences.appearance);
});
test('过浅文字、无效颜色、未来主题格式在写入前被拒绝', () => {
  assert.throws(() => normalizeAppearance({ schemaVersion: 1, preset: 'custom', colors: { background: '#ffffff', text: '#fafafa', accent: '#315efb' } }), /对比/);
  assert.throws(() => normalizeAppearance({ schemaVersion: 2, preset: 'blue', colors: themePresets[0].colors }), /格式/);
  assert.throws(() => normalizeAppearance({ schemaVersion: 1, preset: 'custom', colors: { background: 'url(x)', text: '#202a3c', accent: '#315efb' } }), /格式/);
});
test('主题一次事务保存，失败回滚主题和颜色，不改变其他资料', () => {
  const entries = new Map([['jiwei-theme', 'blue'], ['jiwei-desktop-tasks', 'preserve']]); let fail = true;
  const storage = { getItem: key => entries.get(key) ?? null, removeItem: key => entries.delete(key), setItem(key, value) { if (key === 'jiwei-desktop-appearance-v1' && fail) { fail = false; throw Error('disk full'); } entries.set(key, value); } };
  assert.throws(() => saveAppearance(storage, normalizeAppearance(null, 'ink')), /disk full/); assert.equal(entries.get('jiwei-theme'), 'blue'); assert.equal(entries.get('jiwei-desktop-tasks'), 'preserve');
  saveAppearance(storage, normalizeAppearance(null, 'ink')); assert.equal(readAppearance(storage).preset, 'ink');
  let calls = 0; const transaction = { transaction: changes => { calls++; assert.equal(changes['jiwei-theme'], 'paper'); assert.equal(changes['jiwei-desktop-appearance-v1'].preset, 'paper'); } }; saveAppearance(transaction, normalizeAppearance(null, 'paper')); assert.equal(calls, 1);
});

test('窗口按钮背景与侧边栏共用主题色，所有预设及自定义主题切换保持可读', () => {
  const custom = { schemaVersion: 1, preset: 'custom', colors: { background: '#172029', text: '#e4edf2', accent: '#90c8d8' } };
  for (const appearance of [...themePresets.map(p => normalizeAppearance(null, p.id)), custom]) {
    const tokens = appearanceTokens(appearance), properties = new Map(); let native;
    const root = { dataset: {}, style: { setProperty: (key, value) => properties.set(key, value) }, ownerDocument: { defaultView: { jeeWeaveDesktop: { setWindowAppearance: value => { native = value; return Promise.resolve({ ok: true }); } } } } };
    applyAppearance(appearance, root);
    assert.equal(native.background, properties.get('--sidebar')); assert.equal(native.text, properties.get('--text'));
    assert.equal(native.background, tokens['--sidebar']); assert.ok(contrastRatio(native.text, native.background) >= 4.5);
  }
});
