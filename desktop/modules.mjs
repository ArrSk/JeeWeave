export const moduleKey = 'jiwei-desktop-modules-v1';
export const builtinModules = [
  { id: 'objects', name:'对象视图 Beta', description:'围绕课程、项目或主题集中查看安排、事项与网页资料。' },
  { id: 'today', name: '今天', description: '汇总已开启功能中的今日课程、计划与待办。' },
  { id: 'courses', name: '课程表', description: '多课表、周次切换、课程编辑与独立作息。' },
  { id: 'plans', name: '计划', description: '长期、定时、重复计划与区间阶段。' },
  { id: 'tasks', name: '待办', description: '有期限或无期限的单步行动。' },
  { id: 'calendar', name: '日历', description: '按月、周、日查看待办期限、计划区间与阶段。' },
  { id: 'web-capture', name: '网页采集', description: '公开网页、重点整理与待确认行动草稿。' },
  { id: 'course-import', name: '教务导入', description: '默认南邮 WebVPN，手动登录后抓取课表。CSV 不受此开关影响。', requires: 'courses' },
  { id: 'chat-monitor', name: '群消息', description: '本地群消息收件箱、关键词与待确认事项。QQ/微信登录适配器需另行配置。', defaultEnabled: false, suspended: true },
];
// One visible switch controls both legacy collections; reading never rewrites
// partial old preferences until the user explicitly toggles the combined switch.
export const availableModules = builtinModules.filter(item => !item.suspended && item.id !== 'tasks').map(item => item.id === 'plans' ? { ...item, name: '事项', description: '统一管理待办、事件、考试、阶段计划与重复安排。' } : item);
export const isModuleAvailable = id => !builtinModules.find(item => item.id === id)?.suspended;
export function normalizeModules(value) {
  const defaults = Object.fromEntries(builtinModules.map(item => [item.id, item.defaultEnabled !== false]));
  if (value == null) return { schemaVersion: 1, enabled: defaults };
  if (value.schemaVersion !== 1 || !value.enabled || typeof value.enabled !== 'object' || Array.isArray(value.enabled) || Object.values(value.enabled).some(enabled => typeof enabled !== 'boolean')) throw new Error('功能开关格式无效，请保留原数据并使用兼容版本。');
  return { schemaVersion: 1, enabled: { ...defaults, ...value.enabled } };
}
export function readModules(storage) { const value = storage.getItem(moduleKey); return normalizeModules(value ? JSON.parse(value) : null); }
export function isModuleEnabled(value, id) {
  if (id === 'items') return value.enabled.plans !== false || value.enabled.tasks !== false;
  const module = builtinModules.find(item => item.id === id);
  return !module || (value.enabled[id] !== false && (!module.requires || value.enabled[module.requires] !== false));
}
export function setModuleEnabled(storage, id, enabled) {
  if ((id !== 'items' && !builtinModules.some(item => item.id === id)) || typeof enabled !== 'boolean') throw new Error('该功能不能切换。');
  const next = readModules(storage);
  for (const key of id === 'items' ? ['plans', 'tasks'] : [id]) next.enabled[key] = enabled;
  storage.setItem(moduleKey, JSON.stringify(next));
  return next;
}
