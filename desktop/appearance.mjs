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
  { id: 'studio-linen', name: '澄纸', usage: '纸面精选 · 自由搭配布局', colors: { accent: '#3a4a93', background: '#f1efe9', text: '#1b1d21' } },
  { id: 'studio-ink', name: '墨夜', usage: '纸面精选 · 自由搭配布局', colors: { accent: '#9daaee', background: '#101218', text: '#eae7e0' } },
  { id: 'studio-mist', name: '雾青', usage: '纸面精选 · 自由搭配布局', colors: { accent: '#2f6b60', background: '#edf0ee', text: '#171b1a' } },
  { id: 'studio-sand', name: '暖砂', usage: '纸面精选 · 自由搭配布局', colors: { accent: '#8b6034', background: '#eae5dd', text: '#2a241c' } },
  { id: 'studio-lavender', name: '浅紫', usage: '纸面精选 · 自由搭配布局', colors: { accent: '#6a4a8c', background: '#e8e5ef', text: '#2b2438' } },
  { id: 'studio-graphite', name: '石墨', usage: '设计精选 · 中性深灰', colors: { accent: '#bacddd', background: '#191d21', text: '#e7ebef' } },
  { id: 'studio-rose', name: '玫灰', usage: '纸面精选 · 自由搭配布局', colors: { accent: '#9e4c68', background: '#eee5e8', text: '#3a2530' } },
  { id: 'studio-ocean', name: '深海', usage: '设计精选 · 深色青蓝', colors: { accent: '#8bd4ce', background: '#102b32', text: '#e1f0f1' } },
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
// Minimum displacement along black/white poles, against every supplied surface.
export function solveColor(base, backgrounds, ratio) {
  let best=null;
  for(const pole of ['#000000','#ffffff'])for(let i=0;i<=200;i++){
    const candidate=mixColors(base,pole,i/200);
    if(backgrounds.every(bg=>contrastRatio(candidate,bg)>=ratio)){if(!best||i<best.i)best={i,candidate};break;}
  }
  if(best)return best.candidate;
  const min=c=>Math.min(...backgrounds.map(bg=>contrastRatio(c,bg)));
  return min('#000000')>=min('#ffffff')?'#000000':'#ffffff';
}
const tokenCache=new Map();
export function appearanceTokens(value) {
  const {colors}=normalizeAppearance(value),cacheKey=JSON.stringify(colors);if(tokenCache.has(cacheKey))return tokenCache.get(cacheKey);
  const dark=luminance(colors.text)>luminance(colors.background),canvas=colors.background;
  const panel=mixColors(canvas,'#ffffff',dark?.055:.62),elev=dark?mixColors(canvas,'#ffffff',.10):'#ffffff',sunken=mixColors(panel,colors.text,dark?.055:.06),bgs=[panel,canvas,elev,sunken];
  const line=mixColors(panel,colors.text,dark?.10:.14),lineStrong=solveColor(mixColors(panel,colors.text,dark?.50:.55),[panel,canvas,elev],3),lineSoft=mixColors(panel,colors.text,dark?.16:.20);
  const ink1=solveColor(colors.text,bgs,7),ink2=solveColor(mixColors(colors.text,panel,.24),bgs,5.5),ink3=solveColor(mixColors(colors.text,panel,.44),bgs,4.6);
  let accentSoft=mixColors(panel,colors.accent,dark?.14:.08),accent=solveColor(colors.accent,[...bgs,accentSoft],4.8);
  accentSoft=mixColors(panel,accent,dark?.14:.08);accent=solveColor(accent,[...bgs,accentSoft],4.8);
  const onAccent=solveColor(dark?canvas:'#ffffff',[accent],4.6);
  const status=(light,night)=>{const seed=dark?night:light,soft=mixColors(panel,seed,.09);return {soft,ink:solveColor(seed,[...bgs,soft],4.5)};};
  const ok=status('#1b9466','#3fbb87'),bad=status('#c13041','#f28c94'),warn=status('#b07d18','#e0b06a');
  const tokens={
    '--canvas':canvas,'--surface':panel,'--panel':panel,'--elev':elev,'--sunken':sunken,'--sidebar':panel,'--today-warmth':dark?'4%':'6%',
    '--line':line,'--line-soft':lineSoft,'--line-strong':lineStrong,'--ink-1':ink1,'--ink-2':ink2,'--ink-3':ink3,
    '--accent':accent,'--accent-soft':accentSoft,'--on-accent':onAccent,'--ok':ok.ink,'--ok-soft':ok.soft,'--bad':bad.ink,'--bad-soft':bad.soft,'--warn':warn.ink,'--warn-soft':warn.soft,
    '--text':ink1,'--muted':ink3,'--control-text':ink1,'--control-bg':elev,'--control-border':lineStrong,'--subtle':sunken,'--hover':sunken,
    '--blue':accent,'--accent-hover':accent,'--accent-border':solveColor(accent,[panel,canvas,elev,accentSoft],3),
    '--success-text':ok.ink,'--success-bg':ok.soft,'--danger-text':bad.ink,'--danger-bg':bad.soft,'--danger-border':bad.ink,'--color-scheme':dark?'dark':'light'
  };
  if(tokenCache.size>=32)tokenCache.delete(tokenCache.keys().next().value);tokenCache.set(cacheKey,Object.freeze(tokens));return tokens;
}
export const semanticContrastPairs = [
  ...['--panel','--canvas','--elev','--sunken'].flatMap(bg=>[['--ink-1',bg,4.5],['--ink-2',bg,4.5],['--ink-3',bg,4.5],['--accent',bg,4.5]]),
  ['--accent','--accent-soft',4.5],['--on-accent','--accent',4.5],...['ok','bad','warn'].map(k=>['--'+k,'--'+k+'-soft',4.5]),
  ...['--panel','--canvas','--elev'].map(bg=>['--line-strong',bg,3])
];
export function assertAppearanceContrast(value) {
  const tokens=appearanceTokens(value);
  for(const [fg,bg,min]of semanticContrastPairs)if(contrastRatio(tokens[fg],tokens[bg])<min)throw Error('配色在字段或面板上的对比不足，请调整背景与文字后重试。');
  return tokens;
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
  const windowAppearance = root.ownerDocument?.defaultView?.jeeWeaveDesktop?.setWindowAppearance;
  if (windowAppearance) windowAppearance({ background: tokens['--sidebar'], text: tokens['--text'] }).catch(() => {});
}
export function courseColors(base, appearance) {
  const t=appearanceTokens(appearance),dark=t['--color-scheme']==='dark';
  const hue=base.thread||base.text,bg=mixColors(t['--elev'],hue,dark?.14:.10);
  return {bg:t['--elev'],text:t['--ink-1'],thread:solveColor(hue,[t['--panel'],t['--canvas'],t['--elev'],t['--sunken'],bg],4.6)};
}
export function saveAppearance(storage, value) {
  const next = normalizeAppearance(value); assertAppearanceContrast(next); const changes = { 'jiwei-theme': next.preset, 'jiwei-desktop-appearance-v1': next };
  if (storage.transaction) storage.transaction(changes);
  else {
    const previous = Object.fromEntries(Object.keys(changes).map(key => [key, storage.getItem(key)]));
    try { storage.setItem('jiwei-theme', next.preset); storage.setItem('jiwei-desktop-appearance-v1', JSON.stringify(next)); }
    catch (error) { for (const [key, old] of Object.entries(previous)) { if (old === null) storage.removeItem(key); else storage.setItem(key, old); } throw error; }
  }
  return next;
}
