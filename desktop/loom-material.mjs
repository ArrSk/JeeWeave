/* 经纬的材质颜色只在 CSS 里有一份。窗口底色与标题条要走同一套材质，就只从计算样式里读，
   不在 JS 里再抄一张颜色表——抄了就会漂。返回工作台时交还给用户自己保存的配色。 */
const toHex = value => {
  const text = (value || '').trim();
  if (/^#[\da-f]{6}$/i.test(text)) return text.toLowerCase();
  if (/^#[\da-f]{3}$/i.test(text)) return `#${[...text.slice(1)].map(c => c + c).join('').toLowerCase()}`;
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(text);
  return rgb ? `#${[rgb[1], rgb[2], rgb[3]].map(v => Math.round(Number(v)).toString(16).padStart(2, '0')).join('')}` : '';
};

export function windowChrome(tokens, skeleton) {
  const loom = skeleton === 'loom';
  const background = toHex(tokens[loom ? '--canvas' : '--sidebar']);
  const text = toHex(tokens[loom ? '--ink-1' : '--text']);
  return background && text ? { background, text } : null;
}

export function createChromeSync({ readTokens, setWindowAppearance, skeleton = () => 'workbench' }) {
  let last = '';
  // 去重只防自己重复推；用户在设置里换配色时 appearance.mjs 也在推窗口，这时必须强制盖回去。
  return (force = false) => {
    if (!setWindowAppearance) return null;
    const colors = windowChrome(readTokens(), skeleton());
    if (!colors) return null;
    const key = `${colors.background}${colors.text}`;
    if (!force && key === last) return null;
    last = key;
    return Promise.resolve(setWindowAppearance(colors)).catch(() => { last = ''; return null; });
  };
}
