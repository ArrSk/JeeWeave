import { calendarPreferenceKey, normalizeCalendarPreferences } from './calendar.mjs';
import { normalizeItem, validateItem } from './planning.mjs';
import { normalizeAppearance, themeIds } from './appearance.mjs';
import { normalizeModules } from './modules.mjs';
import { normalizeChat } from './chat-monitor.mjs';

export const workspaceFormat = 'jiwei-desktop-workspace';
export const workspaceVersion = 1;
const bindings = {
  'jiwei-desktop-timetables-v1': 'timetables',
  'jiwei-desktop-plans': 'plans',
  'jiwei-desktop-tasks': 'tasks',
  'jiwei-desktop-web-collections-v1': 'webCaptures',
  'jiwei-desktop-chat-monitor-v1': 'chatMonitor',
};
const clone = value => JSON.parse(JSON.stringify(value));
export function emptyWorkspace() {
  const at = new Date().toISOString();
  return { format: workspaceFormat, schemaVersion: workspaceVersion, revision: 0, createdAt: at, updatedAt: at, data: { timetables: null, plans: [], tasks: [], webCaptures: [], preferences: { theme: 'blue', developerMode: false }, extensions: {} } };
}
export function validateWorkspace(value) {
  if (value?.format !== workspaceFormat || value.schemaVersion !== workspaceVersion) throw new Error('不支持的数据格式或版本，请保留原数据并使用兼容版本。');
  const next = clone(value), data = next.data;
  if (!data || !Number.isSafeInteger(next.revision) || next.revision < 0 || !Array.isArray(data.plans) || !Array.isArray(data.tasks) || !Array.isArray(data.webCaptures) || !data.preferences || typeof data.preferences.developerMode !== 'boolean' || !themeIds.includes(data.preferences.theme) || !data.extensions || typeof data.extensions !== 'object' || Array.isArray(data.extensions)) throw new Error('本地数据结构不完整，未覆盖已有数据。');
  data.preferences.appearance = normalizeAppearance(data.preferences.appearance, data.preferences.theme);
  data.preferences.modules = normalizeModules(data.preferences.modules);
  data.preferences.calendar = normalizeCalendarPreferences(data.preferences.calendar);
  data.chatMonitor = normalizeChat(data.chatMonitor);
  if (data.preferences.appearance.preset !== data.preferences.theme) {
    if (data.preferences.theme === 'custom') throw new Error('自定义主题数据不完整。');
    data.preferences.appearance = normalizeAppearance(null, data.preferences.theme);
  }
  for (const [key, kind] of [['plans', 'plan'], ['tasks', 'task']]) {
    data[key] = data[key].map(item => validateItem(normalizeItem(item, kind)));
    if (new Set(data[key].map(item => item.id)).size !== data[key].length) throw new Error('事项编号重复，未覆盖已有数据。');
  }
  const tables = data.timetables;
  if (tables !== null && (!Array.isArray(tables.tables) || !tables.tables.length || !tables.tables.some(t => t.id === tables.activeId) || new Set(tables.tables.map(t => t.id)).size !== tables.tables.length || tables.tables.some(t => !t.id || !t.name || !Number.isInteger(t.totalWeeks) || t.totalWeeks < 1 || t.totalWeeks > 30 || !Array.isArray(t.courses) || !Array.isArray(t.schedule)))) throw new Error('课表数据不完整，未覆盖已有数据。');
  if (data.webCaptures.some(record => !record.id || !Array.isArray(record.drafts))) throw new Error('网页记录不完整。');
  for (const record of data.webCaptures) {
    const relative = String(record.directory || '').replaceAll('\\', '/').match(/(?:^|\/)((?:web|course)-captures\/[^\n]+)$/);
    if (relative && !relative[1].split('/').includes('..')) record.directory = `captures/${relative[1]}`;
  }
  return next;
}
export function workspaceFromStorage(storage) {
  const next = emptyWorkspace();
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith('jiwei-')) assignStorageValue(next, key, storage.getItem(key));
  }
  const appearance = storage.getItem('jiwei-desktop-appearance-v1');
  if (appearance) assignStorageValue(next, 'jiwei-desktop-appearance-v1', appearance);
  return validateWorkspace(next);
}
export function readWorkspaceBackup(value, current = emptyWorkspace()) {
  if (value?.format) return validateWorkspace(value);
  // Compatibility with the desktop export shipped before the versioned format.
  // A Web/Dexie backup has a different contract and is not accepted here.
  if (typeof value?.exportedAt !== 'string' || !value.timetables?.tables || !Array.isArray(value.plans) || !Array.isArray(value.tasks) || !Array.isArray(value.webCaptures)) throw new Error('请选择几微桌面端的业务数据备份。');
  const migrated = emptyWorkspace();
  migrated.data.preferences = clone(current.data.preferences);
  for (const key of ['timetables', 'plans', 'tasks', 'webCaptures']) migrated.data[key] = clone(value[key]);
  return validateWorkspace(migrated);
}
function assignStorageValue(workspace, key, value) {
  const data = workspace.data;
  if (bindings[key]) data[bindings[key]] = value === null ? (key === 'jiwei-desktop-timetables-v1' || key === 'jiwei-desktop-chat-monitor-v1' ? null : []) : JSON.parse(value);
  else if (key === 'jiwei-theme') { data.preferences.theme = value || 'blue'; if (value !== 'custom') data.preferences.appearance = normalizeAppearance(null, value || 'blue'); }
  else if (key === 'jiwei-desktop-appearance-v1') { data.preferences.appearance = value ? normalizeAppearance(JSON.parse(value)) : normalizeAppearance(null, data.preferences.theme); data.preferences.theme = data.preferences.appearance.preset; }
  else if (key === 'jiwei-desktop-developer-mode') data.preferences.developerMode = value === 'true';
  else if (key === calendarPreferenceKey) data.preferences.calendar = normalizeCalendarPreferences(value ? JSON.parse(value) : null);
  else if (key === 'jiwei-desktop-modules-v1') data.preferences.modules = normalizeModules(value ? JSON.parse(value) : null);
  else { if (value === null) delete data.extensions[key]; else data.extensions[key] = value; }
}
export function workspaceStorageValue(workspace, key) {
  if (bindings[key]) return workspace.data[bindings[key]] === null ? null : JSON.stringify(workspace.data[bindings[key]]);
  if (key === calendarPreferenceKey) return JSON.stringify(workspace.data.preferences.calendar || normalizeCalendarPreferences(null));
  if (key === 'jiwei-theme') return workspace.data.preferences.theme;
  if (key === 'jiwei-desktop-appearance-v1') return JSON.stringify(workspace.data.preferences.appearance || normalizeAppearance(null, workspace.data.preferences.theme));
  if (key === 'jiwei-desktop-developer-mode') return String(workspace.data.preferences.developerMode);
  if (key === 'jiwei-desktop-modules-v1') return JSON.stringify(workspace.data.preferences.modules || normalizeModules(null));
  return Object.hasOwn(workspace.data.extensions, key) ? workspace.data.extensions[key] : null;
}
// A synchronous, narrow desktop bridge acknowledges the atomic file write before
// an existing synchronous store can report success or the close button can quit.
export async function createWorkspaceStorage(cache, bridge) {
  if (!bridge?.readWorkspace || !bridge?.writeWorkspace) return { storage: cache, info: null, snapshot: () => workspaceFromStorage(cache), restore: value => {
    const next = validateWorkspace(value);
    const values = Object.fromEntries([...Object.keys(bindings), calendarPreferenceKey, 'jiwei-theme', 'jiwei-desktop-appearance-v1', 'jiwei-desktop-developer-mode', 'jiwei-desktop-modules-v1', ...Object.keys(next.data.extensions)].map(key => [key, workspaceStorageValue(next, key)]));
    const old = Object.fromEntries(Object.keys(values).map(key => [key, cache.getItem(key)]));
    try { for (const [key, value] of Object.entries(values)) { if (value === null) cache.removeItem(key); else cache.setItem(key, value); } }
    catch (error) { for (const [key, value] of Object.entries(old)) { if (value === null) cache.removeItem(key); else cache.setItem(key, value); } throw error; }
  } };
  const response = await bridge.readWorkspace();
  if (!response.ok) throw new Error(response.message || '无法读取本地数据。');
  let current = response.workspace ? validateWorkspace(response.workspace) : workspaceFromStorage(cache);
  const save = (candidate, options) => {
    const checked = validateWorkspace(candidate);
    const result = bridge.writeWorkspace(checked, options);
    if (!result?.ok) throw new Error(result?.message || '保存失败，已有数据未改变。');
    current = validateWorkspace(result.workspace);
  };
  if (!response.workspace) save(current);
  const syncCache = () => {
    const keys = new Set([...Object.keys(bindings), calendarPreferenceKey, 'jiwei-theme', 'jiwei-desktop-appearance-v1', 'jiwei-desktop-developer-mode', 'jiwei-desktop-modules-v1', ...Object.keys(current.data.extensions)]);
    for (const key of keys) { const value = workspaceStorageValue(current, key); try { if (value === null) cache.removeItem(key); else cache.setItem(key, value); } catch { /* The file remains authoritative even when Chromium's cache is full. */ } }
  };
  syncCache();
  const change = (key, value) => {
    if (!key.startsWith('jiwei-')) throw new Error('只能写入几微工作区数据。');
    const next = clone(current); assignStorageValue(next, key, value); save(next); syncCache();
  };
  return {
    info: response.paths,
    storage: { getItem: key => workspaceStorageValue(current, key), setItem: (key, value) => change(key, String(value)), removeItem: key => change(key, null), transaction: changes => {
      const next = clone(current); for (const [key, value] of Object.entries(changes)) assignStorageValue(next, key, JSON.stringify(value)); save(next); syncCache();
    } },
    snapshot: () => clone(current),
    restore: value => { const next = validateWorkspace(value); next.revision = current.revision; save(next, { restore: true }); syncCache(); },
  };
}
