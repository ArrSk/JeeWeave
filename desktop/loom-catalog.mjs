/* 经纬目录：导航的唯一来源。
   已知页在这里补中文名、分组与插件归属；插件后来注册的新页不需要改四套布局，
   只要出现在 host.inventory().pages 里，就自动落进「新装」组，仍能被四套织法接住。 */

import { builtinModules, isModuleAvailable, isModuleEnabled } from './modules.mjs';

const threadPalette = ['--t-indigo', '--t-madder', '--t-turmeric', '--t-moss', '--t-wisteria', '--t-clay', '--t-celadon', '--t-slate'];
const pluginPalette = threadPalette.slice(1);
// 已知插件用固定的线色，先避开「今天 / 事项 / 笔记」挤在同一支的情况；后装插件再走散列。
const knownThreads = {
  today: '--t-turmeric',
  courses: '--t-indigo',
  calendar: '--t-celadon',
  plans: '--t-madder',
  notes: '--t-wisteria',
  objects: '--t-moss',
  'web-capture': '--t-clay',
  assistant: '--t-slate',
  reminders: '--t-madder',
  'chat-monitor': '--t-wisteria',
  'course-import': '--t-clay'
};

export const loomGroupOrder = ['home', 'now', 'record', 'help', 'system', 'more'];
export const loomGroups = {
  home: { name: '总览', copy: '所有线的入口' },
  now: { name: '此刻', copy: '今天、课程与日历' },
  record: { name: '记录', copy: '事情、笔记、对象与网页' },
  help: { name: '助手', copy: '对话与提醒' },
  system: { name: '系统', copy: '插件与设置' },
  more: { name: '新装', copy: '后装插件自动落在这里' }
};

// scale 只给「时间尺度」页用：同一页在不同织法里读成不同的刻度名。
const pageMeta = {
  overview: { name: '总览', group: 'home', plugin: null },
  today: { name: '今天', group: 'now', plugin: 'today', scale: { jingwei: ['现在', '今天的行动'], ripple: ['日'], atlas: ['路线'], stage: ['今日'] } },
  courses: { name: '课程表', group: 'now', plugin: 'courses', scale: { jingwei: ['本周', '课程与时间'], ripple: ['周'], atlas: ['课程'], stage: ['一周'] } },
  calendar: { name: '日历', group: 'now', plugin: 'calendar', scale: { ripple: ['月'], atlas: ['日历'], stage: ['日历'] } },
  plans: { name: '事项', group: 'record', plugin: 'plans' },
  notes: { name: '笔记', group: 'record', plugin: 'notes' },
  objects: { name: '对象视图', group: 'record', plugin: 'objects', scale: { jingwei: ['长线', '对象与进展'], atlas: ['地块'] } },
  'web-capture': { name: '网页采集', group: 'record', plugin: 'web-capture' },
  assistant: { name: '全局助手', group: 'help', plugin: 'assistant', command: 'assistant.open' },
  reminders: { name: '提醒', group: 'help', plugin: 'reminders' },
  'chat-monitor': { name: '群消息', group: 'help', plugin: 'chat-monitor' },
  plugins: { name: '插件管理', group: 'system', plugin: null },
  settings: { name: '设置', group: 'system', plugin: null }
};

export const loomLayoutBands = {
  jingwei: [
    { band: 'loom-scales', slot: 'rail-right', label: '经纬尺度', roles: ['today', 'courses', 'objects'] },
    { band: 'loom-index', slot: 'rail-right', label: '经纬页目', groups: loomGroupOrder, excludeRoles: ['today', 'courses', 'objects'] }
  ],
  ripple: [
    { band: 'loom-strip', slot: 'top', label: '涟漪页面', groups: loomGroupOrder, excludeRoles: ['today', 'courses', 'calendar'] },
    { band: 'loom-depths', slot: 'bottom', label: '涟漪尺度', roles: ['today', 'courses', 'calendar'] }
  ],
  atlas: [
    { band: 'loom-layers', slot: 'top', label: '舆图图层', groups: ['home', 'now', 'record'] },
    { band: 'loom-legend', slot: 'rail-left', label: '舆图图例', groups: ['help', 'system', 'more'] }
  ],
  stage: [
    { band: 'loom-lights', slot: 'top', label: '夜场灯位', groups: ['help', 'system', 'more'] },
    { band: 'loom-queue', slot: 'rail-right', label: '夜场候场', groups: ['home', 'now', 'record'], excludeRoles: ['today', 'calendar'] },
    { band: 'loom-curtain', slot: 'bottom', label: '夜场幕线', roles: ['today', 'calendar'] }
  ]
};

export const loomLayoutKeys = { jingwei: 'loom-scales', ripple: 'loom-depths', atlas: 'loom-layers', stage: 'loom-queue' };

export function pluginThread(id) {
  if (!id) return '--accent';
  if (knownThreads[id]) return knownThreads[id];
  const text = String(id);
  let hash = 0;
  for (let index = 0; index < text.length; index++) hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  return pluginPalette[hash % pluginPalette.length];
}

const prettyName = id => String(id).replace(/[-_.:]+/g, ' ').replace(/\b[a-z]/g, letter => letter.toUpperCase());

const visible = page => !page.status || page.status === '挂起';
const moduleId = id => (id === 'plans' ? 'items' : id);

export function loomDestinations(modules, inventory = {}) {
  const registered = Array.isArray(inventory.pages) ? inventory.pages : [];
  const commands = Array.isArray(inventory.commands) ? inventory.commands : [];
  const entries = Object.entries(pageMeta).map(([id, meta]) => {
    const owner = meta.plugin;
    const definition = owner ? builtinModules.find(item => item.id === owner) : null;
    const active = owner && isModuleAvailable(moduleId(owner)) && isModuleEnabled(modules, moduleId(owner));
    const present = meta.command ? commands.includes(meta.command) : registered.includes(id);
    const status = definition?.suspended ? '挂起' : owner && !active ? '已关闭' : !present ? '暂不可用' : '';
    return { id, name: meta.name, group: meta.group, plugin: owner, pluginName: definition?.name || '', status, thread: pluginThread(owner), scale: meta.scale || null };
  });
  // 后装插件注册的页：不要求先改这张表，四套织法照常接收，只是先落到「新装」组。
  const extra = registered
    .filter(id => !pageMeta[id])
    .sort((a, b) => String(a).localeCompare(String(b)))
    .map(id => ({ id, name: prettyName(id), group: 'more', plugin: String(id), pluginName: '后装插件', status: '', thread: pluginThread(id), scale: null }));
  return [...entries, ...extra].filter(page => page.id !== 'chat-monitor');
}

export function loomScaleEntries(layoutId, catalog) {
  const def = (loomLayoutBands[layoutId] || []).find(band => band.roles);
  return (def?.roles || []).map(id => {
    const page = catalog.find(item => item.id === id);
    if (!page || !visible(page)) return null;
    const scale = page.scale?.[layoutId] || [];
    return { page, name: scale[0] || page.name, copy: scale[1] || '' };
  }).filter(Boolean);
}

export function loomBandGroups(layoutId, def, catalog) {
  if (def.roles) return [{ id: 'scales', label: '', copy: '', entries: loomScaleEntries(layoutId, catalog) }];
  const allowed = new Set(def.groups || []);
  const excluded = new Set(def.excludeRoles || []);
  return loomGroupOrder
    .filter(id => allowed.has(id))
    .map(id => ({
      id,
      label: loomGroups[id].name,
      copy: loomGroups[id].copy,
      entries: catalog
        .filter(page => page.group === id && !excluded.has(page.id) && visible(page))
        .map(page => ({ page, name: page.name, copy: '' }))
    }))
    .filter(group => group.entries.length);
}
