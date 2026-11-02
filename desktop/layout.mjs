export const layoutKey = 'jiwei-desktop-layout-v1';
export const layoutPresets = [
  { id: 'sidebar', name: '文字侧栏', copy: '稳定目录，适合日常处理' },
  { id: 'rail', name: '图标侧栏', copy: '收窄导航，留出内容空间' },
  { id: 'top', name: '横向顶栏', copy: '横向展开课程与资料' },
  { id: 'float', name: '左侧悬浮栏', copy: '独立悬浮，可自由移动' },
  { id: 'dock', name: '底部 Dock', copy: '入口集中在工作面下方' },
  { id: 'island', name: '顶部悬浮岛', copy: '工具轻轻悬在内容上方' },
  { id: 'focus', name: '专注菜单', copy: '收起目录，按需展开' },
];
export const floatingLayouts = ['float', 'dock', 'island'];
export function normalizeLayout(value) {
  if (value == null) return { schemaVersion: 1, layout: 'sidebar', particles: true, position: null };
  if (value.schemaVersion !== 1 || !layoutPresets.some(p => p.id === value.layout) || typeof value.particles !== 'boolean') throw Error('布局设置格式无效，请使用兼容版本检查资料。');
  const position = value.position ?? null;
  if (position !== null && (!floatingLayouts.includes(value.layout) || !['x','y'].every(key => Number.isFinite(position[key]) && position[key] >= 0 && position[key] <= 1))) throw Error('悬浮栏位置无效。');
  return { schemaVersion: 1, layout: value.layout, particles: value.particles, position: position && { x: position.x, y: position.y } };
}
export function readLayout(storage) { return normalizeLayout(JSON.parse(storage.getItem(layoutKey) || 'null')); }
export function saveLayout(storage, value) { const next = normalizeLayout(value); storage.setItem(layoutKey, JSON.stringify(next)); return next; }
export function clampBarPosition(point, area, bar) {
  const maxX=Math.max(8,area.width-bar.width-8),maxY=Math.max(8,area.height-bar.height-8);
  return {x:Math.max(8,Math.min(point.x,maxX)),y:Math.max(8,Math.min(point.y,maxY))};
}
