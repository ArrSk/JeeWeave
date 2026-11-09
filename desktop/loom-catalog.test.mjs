import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModules } from './modules.mjs';
import { loomDestinations, loomLayoutBands, loomBandGroups, pluginThread } from './loom-catalog.mjs';

const inventory = {
  pages: ['overview', 'today', 'courses', 'plans', 'notes', 'objects', 'calendar', 'web-capture', 'reminders', 'plugins', 'settings'],
  commands: ['assistant.open']
};
const visiblePages = catalog => catalog.filter(page => !page.status || page.status === '挂起');
const entriesOf = (layout, catalog) => (loomLayoutBands[layout] || [])
  .flatMap(def => loomBandGroups(layout, def, catalog).flatMap(group => group.entries.map(entry => entry.page.id)));

test('经纬目录从注册页生成；后装插件的页自动落进「新装」，不要求先改四套布局', () => {
  const catalog = loomDestinations(normalizeModules(null), inventory);
  assert.equal(catalog.length, 12);
  assert.equal(catalog.some(page => page.id === 'chat-monitor'), false);
  assert.equal(catalog.find(page => page.id === 'assistant').status, '');
  const extended = loomDestinations(normalizeModules(null), { ...inventory, pages: [...inventory.pages, 'focus-timer', 'ledger'] });
  const extra = extended.filter(page => page.group === 'more');
  assert.deepEqual(extra.map(page => page.id), ['focus-timer', 'ledger']);
  assert.equal(extra[0].name, 'Focus Timer');
  assert.equal(extra[0].pluginName, '后装插件');
  assert.ok(extra.every(page => page.status === ''), '后装页注册成功即为可用');
});

test('四套织法都把可见页各列一次；新增页不需要改条带表也能被每套接住', () => {
  const modules = normalizeModules(null);
  const base = loomDestinations(modules, inventory);
  for (const layout of Object.keys(loomLayoutBands)) {
    const entries = entriesOf(layout, base);
    assert.equal(entries.length, visiblePages(base).length, `${layout} 不全`);
    assert.equal(new Set(entries).size, entries.length, `${layout} 有重复入口`);
  }
  const extended = loomDestinations(modules, { ...inventory, pages: [...inventory.pages, 'focus-timer'] });
  for (const layout of Object.keys(loomLayoutBands)) {
    const entries = entriesOf(layout, extended);
    assert.equal(entries.length, visiblePages(extended).length, `${layout} 没接住后装页`);
    assert.ok(entries.includes('focus-timer'), `${layout} 漏了 focus-timer`);
    assert.equal(new Set(entries).size, entries.length);
  }
});

test('关掉的插件和暂停开发的群消息从所有条带消失', () => {
  const modules = normalizeModules(null);
  modules.enabled.notes = false;
  const catalog = loomDestinations(modules, inventory);
  assert.equal(catalog.find(page => page.id === 'notes').status, '已关闭');
  for (const layout of Object.keys(loomLayoutBands)) {
    const entries = entriesOf(layout, catalog);
    assert.equal(entries.includes('notes'), false, `${layout} 仍列出已关闭的笔记`);
    assert.equal(entries.includes('chat-monitor'), false, `${layout} 不应列出群消息`);
    assert.equal(entries.length, visiblePages(catalog).length);
  }
});

test('每个已知插件有稳定的线色，课程固定用靛；未知插件按 id 散列到同一支', () => {
  assert.equal(pluginThread('courses'), '--t-indigo');
  assert.equal(pluginThread('notes'), '--t-wisteria');
  assert.equal(pluginThread('focus-timer'), pluginThread('focus-timer'));
  assert.notEqual(pluginThread('today'), pluginThread('plans'));
  const catalog = loomDestinations(normalizeModules(null), inventory);
  assert.equal(catalog.find(page => page.id === 'notes').thread, '--t-wisteria');
});
