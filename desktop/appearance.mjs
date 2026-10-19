export const themePresets = [
  { id: 'blue', name: '清晨蓝白', usage: '推荐 · 日常通用', colors: { accent: '#315efb', background: '#f5f7fb', text: '#202a3c' } },
  { id: 'paper', name: '米白书页', usage: '推荐 · 阅读与长列表', colors: { accent: '#86613b', background: '#f5f0e6', text: '#39352e' } },
  { id: 'forest', name: '松林浅绿', usage: '推荐 · 安静的学习工作区', colors: { accent: '#13775f', background: '#eef5f1', text: '#253c33' } },
  { id: 'ink', name: '深海夜读', usage: '推荐 · 深色工作区', colors: { accent: '#90b9ff', background: '#101b2b', text: '#e4edf8' } },
  { id: 'violet', name: '浅雾紫', usage: '柔和的紫色与冷白背景', colors: { accent: '#7048d6', background: '#f4f1fa', text: '#332d44' } },
  { id: 'rose', name: '玫瑰灰', usage: '低饱和暖粉', colors: { accent: '#a54468', background: '#faf1f4', text: '#45313a' } },
  { id: 'ocean', name: '海盐青', usage: '明亮清爽的青色', colors: { accent: '#087585', background: '#edf6f7', text: '#243d42' } },
  { id: 'amber', name: '琥珀暖光', usage: '温暖的浅色工作区', colors: { accent: '#99610d', background: '#faf4e8', text: '#453725' } },
  { id: 'graphite', name: '石墨深灰', usage: '中性的深色风格', colors: { accent: '#a9c5a8', background: '#202322', text: '#e7ece8' } },
];
export const themeIds = [...themePresets.map(p => p.id), 'custom'];
const hex = value => /^#[\da-fA-F]{6}$/.test(value || '');
const rgb = value => [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));
export function luminance(color) { return rgb(color).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0); }
export function contrastRatio(a, b) { const values = [luminance(a), luminance(b)].sort((x, y) => y - x); return (values[0] + .05) / (values[1] + .05); }
export function mixColors(a, b, weight) { const left = rgb(a), right = rgb(b); return '#' + left.map((v, i) => Math.round(v * (1 - weight) + right[i] * weight).toString(16).padStart(2, '0')).join(''); }
function readable(color, background, ratio = 4.5) {
  const target = contrastRatio('#ffffff', background) > contrastRatio('#000000', background) ? '#ffffff' : '#000000';
  for (let i = 0; i <= 100; i++) { const candidate = mixColors(color, target, i / 100); if (contrastRatio(candidate, background) >= ratio) return candidate; }
  return target;
}
export function normalizeAppearance(value, legacy = 'blue') {
  if (!value) { const preset = themePresets.find(p => p.id === legacy) || themePresets[0]; return { schemaVersion: 1, preset: preset.id, colors: { ...preset.colors } }; }
  if (value.schemaVersion !== 1 || !themeIds.includes(value.preset) || !value.colors || !['accent', 'background', 'text'].every(key => hex(value.colors[key]))) throw new Error('主题数据格式无效，请重新选择推荐样式。');
  const colors = Object.fromEntries(Object.entries(value.colors).filter(([key]) => ['accent', 'background', 'text'].includes(key)).map(([key, color]) => [key, color.toLowerCase()]));
  if (contrastRatio(colors.text, colors.background) < 4.5) throw new Error('文字与背景对比不足，请加深文字或调整背景后再应用。');
  return { schemaVersion: 1, preset: value.preset, colors };
}
export function appearanceTokens(value) {
  const { colors } = normalizeAppearance(value), dark = luminance(colors.text) > luminance(colors.background);
  // A valid custom foreground must stay readable on derived surfaces as well.
  const surface = (base, tint, weight) => {
    for (let i = 100; i >= 0; i--) { const candidate = mixColors(base, tint, weight * i / 100); if (contrastRatio(colors.text, candidate) >= 4.5) return candidate; }
    return base;
  };
  const panel = surface(colors.background, '#ffffff', dark ? .045 : .8);
  const text = readable(colors.text, panel), accentSoft = mixColors(panel, colors.accent, dark ? .14 : .065);
  const muted = readable(mixColors(text, panel, .32), panel);
  const successBg = mixColors(panel, dark ? '#3fbb87' : '#1b9466', .09), dangerBg = mixColors(panel, dark ? '#f28c94' : '#c13041', .07);
  return {
    '--canvas': colors.background, '--text': colors.text, '--panel': panel, '--sidebar': surface(colors.background, '#ffffff', dark ? .025 : .35),
    '--muted': readable(muted, colors.background), '--control-text': text, '--control-bg': panel, '--control-border': mixColors(panel, text, .26),
    '--line': mixColors(panel, text, .14), '--subtle': surface(panel, text, .035), '--hover': surface(panel, text, .065),
    '--blue': readable(colors.accent, accentSoft), '--accent-hover': readable(mixColors(colors.accent, text, .14), accentSoft), '--accent-soft': accentSoft, '--accent-border': mixColors(panel, colors.accent, .4),
    '--on-accent': readable('#ffffff', readable(colors.accent, accentSoft)), '--success-bg': successBg, '--success-text': readable(dark ? '#89d8b4' : '#265e43', successBg),
    '--danger-bg': dangerBg, '--danger-text': readable(dark ? '#f0a2a9' : '#a02c2c', dangerBg), '--danger-border': mixColors(panel, '#c75562', .45), '--color-scheme': dark ? 'dark' : 'light',
  };
}
export function readAppearance(storage) {
  const value = storage.getItem('jiwei-desktop-appearance-v1');
  return normalizeAppearance(value ? JSON.parse(value) : null, storage.getItem('jiwei-theme') || 'blue');
}
export function applyAppearance(value, root) {
  const next = normalizeAppearance(value);
  root.dataset.theme = next.preset;
  const tokens = appearanceTokens(next);
  for (const [key, color] of Object.entries(tokens)) root.style.setProperty(key, color);
  root.style.colorScheme = tokens['--color-scheme'];
}
export function courseColors(base, appearance) {
  const tokens = appearanceTokens(appearance);
  const bg = tokens['--color-scheme'] === 'dark' ? mixColors(tokens['--panel'], base.bg, .16) : base.bg;
  return { bg, text: readable(base.text, bg) };
}
export function saveAppearance(storage, value) {
  const next = normalizeAppearance(value), changes = { 'jiwei-theme': next.preset, 'jiwei-desktop-appearance-v1': next };
  if (storage.transaction) storage.transaction(changes);
  else {
    const previous = Object.fromEntries(Object.keys(changes).map(key => [key, storage.getItem(key)]));
    try { storage.setItem('jiwei-theme', next.preset); storage.setItem('jiwei-desktop-appearance-v1', JSON.stringify(next)); }
    catch (error) { for (const [key, old] of Object.entries(previous)) { if (old === null) storage.removeItem(key); else storage.setItem(key, old); } throw error; }
  }
  return next;
}
