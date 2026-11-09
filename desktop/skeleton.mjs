export const skeletonKey = 'jiwei-desktop-skeleton-v1';
export const skeletonPresets = [
  { id: 'workbench', name: '工作台', copy: '固定导航与内容区，保留原有七种布局。' },
  { id: 'loom', name: '经纬', copy: '沿一条经线，在现在、本周与长线之间切换。' },
];
export const loomLayouts = [
  { id: 'jingwei', name: '经纬', copy: '一条经线：现在 · 本周 · 长线' },
  { id: 'ripple', name: '涟漪', copy: '一天是一条河面，近处有形，远处只是水光' },
  { id: 'atlas', name: '舆图', copy: '时间是疆域：地块、路线、界标三个图层' },
  { id: 'stage', name: '夜场', copy: '台上只站一件事，其余在两侧候场' },
];
export function normalizeSkeleton(value) {
  if (value == null) return { schemaVersion: 1, skeleton: 'workbench', loomLayout: 'jingwei' };
  if (value.schemaVersion !== 1 || !skeletonPresets.some(p => p.id === value.skeleton) || !loomLayouts.some(p => p.id === value.loomLayout)) throw Error('骨架设置无效，请重新选择骨架。');
  return { schemaVersion: 1, skeleton: value.skeleton, loomLayout: value.loomLayout };
}
// Reading is tolerant; an invalid preference must never prevent workspace startup.
export function readSkeleton(storage) {
  try { return normalizeSkeleton(JSON.parse(storage.getItem(skeletonKey) || 'null')); }
  catch { return normalizeSkeleton(null); }
}
export function saveSkeleton(storage, value) {
  const next = normalizeSkeleton(value);
  storage.setItem(skeletonKey, JSON.stringify(next));
  return next;
}
