import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { contrastRatio, solveColor } from './appearance.mjs';
import { windowChrome, createChromeSync } from './loom-material.mjs';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'loom-shell.css'), 'utf8');
const parse = body => {
  const out = {};
  for (const declaration of body.split(';')) {
    const index = declaration.indexOf(':');
    if (index < 0) continue;
    const key = declaration.slice(0, index).trim();
    if (key.startsWith('--')) out[key] = declaration.slice(index + 1).replace(/!important/g, '').trim();
  }
  return out;
};
const blocksFor = selector => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g'))].map(match => parse(match[1]));
};
const base = blocksFor('[data-workspace-skeleton="loom"]');
const recipe = base.find(block => '--surface' in block);
const paper = base.find(block => '--canvas' in block);
const materials = {
  jingwei: paper,
  ripple: blocksFor('[data-workspace-skeleton="loom"][data-loom-layout="ripple"]').at(-1),
  atlas: blocksFor('[data-workspace-skeleton="loom"][data-loom-layout="atlas"]').at(-1),
  stage: blocksFor('[data-workspace-skeleton="loom"][data-loom-layout="stage"]').at(-1),
};

// 颜色只有两处来源：design-lab/<布局>.css 的 :root，和 loom.css 四套皮肤里同一语义的那一档。
// 小样没有的令牌取皮肤原值（舆图高起面 #fffdf6、夜场沉面 #0a0910、涟漪强线 #61787f、夜场小字
// #8d8798 与强线 #6f6885）；经纬与舆图的 ok / warn / bad 用小样自己的毛线那支。
const surfaces = ['--canvas', '--panel', '--elev', '--sunken'];
const pigments = {
  jingwei: { '--canvas': '#f2efe7', '--panel': '#fbf9f4', '--elev': '#fffdf9', '--sunken': '#e9e5da', '--line': '#d8d3c6', '--line-strong': '#7e7a6e', '--ink-1': '#1a1712', '--ink-2': '#504b41', '--ink-3': '#6c665b', '--accent': '#2b5a63', '--on-accent': '#fffdf9', '--warn': '#826116', '--bad': '#9a3b4e', '--ok': '#2f6c68' },
  ripple: { '--canvas': '#eef2f4', '--panel': '#f7fafb', '--elev': '#ffffff', '--sunken': '#e4ebee', '--line': '#d2dee3', '--line-strong': '#61787f', '--ink-1': '#12212a', '--ink-2': '#3f5661', '--ink-3': '#5a6c73', '--accent': '#2f6b8c', '--accent-2': '#6fa3c0', '--on-accent': '#f7fafb', '--warn': '#896315', '--bad': '#9b3a3a', '--ok': '#2f6b6a' },
  atlas: { '--canvas': '#f4f0e6', '--panel': '#faf7ef', '--elev': '#fffdf6', '--sunken': '#efe9db', '--line': '#d9d1bd', '--line-strong': '#8a6f4e', '--ink-1': '#2a2419', '--ink-2': '#5b5241', '--ink-3': '#766750', '--accent': '#4a5a3f', '--accent-2': '#6f7d5c', '--on-accent': '#faf7ef', '--warn': '#886315', '--bad': '#8f3f2f', '--ok': '#46664a' },
  stage: { '--canvas': '#0e0d13', '--panel': '#17151f', '--elev': '#1e1b27', '--sunken': '#0a0910', '--line': '#332e40', '--line-strong': '#6f6885', '--ink-1': '#ece8f2', '--ink-2': '#b3acc2', '--ink-3': '#8d8798', '--accent': '#b8956a', '--accent-2': '#8f7fb8', '--on-accent': '#14121a', '--warn': '#d8b26a', '--bad': '#e0918f', '--ok': '#7fbfa8' },
};

// 唯一允许不照抄来源的 6 条：种子（离它最近的那一档）在自己四种面上达不到 4.5:1，上线值就是 solveColor 的最小改动。
const nudged = {
  jingwei: { '--ink-3': ['#6e685c', '#6c665b'], '--warn': ['#8a6717', '#826116'] },
  ripple: { '--ink-3': ['#5a6d74', '#5a6c73'], '--warn': ['#8a6415', '#896315'] },
  atlas: { '--ink-3': ['#7d6d55', '#766750'], '--warn': ['#8a6415', '#886315'] },
};

test('经纬的四套颜料照抄小样与皮肤，只有补下限的 6 条改过值', () => {
  for (const [layout, expected] of Object.entries(pigments)) {
    const block = materials[layout];
    assert.ok(block, `${layout} 的颜料块找不到`);
    for (const [token, value] of Object.entries(expected)) assert.equal(block[token], value, `${layout} 的 ${token} 应为 ${value}`);
  }
  // 补下限只许这 6 条，且必须真的改过；再想动第 7 条得先写进这张表并说明来源。
  assert.equal(Object.values(nudged).reduce((sum, list) => sum + Object.keys(list).length, 0), 6, '改动清单只应有 6 条');
  for (const [layout, list] of Object.entries(nudged)) for (const [token, [from, to]] of Object.entries(list)) {
    assert.equal(materials[layout][token], to, `${layout} 的 ${token} 应是补过下限的 ${to}`);
    const backgrounds = surfaces.map(name => materials[layout][name]);
    assert.ok(Math.min(...backgrounds.map(background => contrastRatio(to, background))) >= 4.5, `${layout} 的 ${token} 仍不够 4.5:1`);
    // 种子必须确实达不到下限，上线值必须正是 solveColor 从该套四种面算出的最小改动：既不许自创颜色，也不许多压一档。
    const fromWorst = Math.min(...backgrounds.map(background => contrastRatio(from, background)));
    assert.ok(fromWorst < 4.5, `${layout} 的 ${token} 种子 ${from} 其实够用，别改`);
    assert.equal(solveColor(from, backgrounds, 4.5), to, `${layout} 的 ${token} 不是 solveColor 的最小改动值`);
  }
});

test('每套材质的小字与强调色在自己四种面上都过对比下限', () => {
  for (const [layout, block] of Object.entries(materials)) {
    const backgrounds = surfaces.map(token => block[token]);
    const floors = [['--ink-1', 7], ['--ink-2', 4.5], ['--ink-3', 4.5], ['--accent', 4.5], ['--ok', 4.5], ['--warn', 4.5], ['--bad', 4.5], ['--line-strong', 3]];
    for (const [token, min] of floors) {
      const worst = Math.min(...backgrounds.map(background => contrastRatio(block[token], background)));
      assert.ok(worst >= min, `${layout} 的 ${token} 在 ${backgrounds.join('/')} 上只有 ${worst.toFixed(2)}:1（需 ≥${min}）`);
    }
  }
});

test('八色毛线四套各有其档，夜场整组提亮一档', () => {
  const threads = ['--t-indigo', '--t-madder', '--t-turmeric', '--t-moss', '--t-wisteria', '--t-clay', '--t-celadon', '--t-slate'];
  for (const [layout, block] of Object.entries(materials)) for (const token of threads) assert.match(block[token] || '', /^#[\da-f]{6}$/, `${layout} 缺 ${token}`);
  assert.deepEqual(threads.map(token => materials.jingwei[token]), threads.map(token => materials.atlas[token]), '舆图与经纬共用同一组毛线');
  for (const token of threads) assert.notEqual(materials.stage[token], materials.jingwei[token], `夜场的 ${token} 应换成亮档`);
  assert.equal(materials.ripple['--t-indigo'], '#3a5a86');
});

test('夜场是暗色原生，其余三套仍是压暗的纸纹', () => {
  assert.equal(materials.stage['--grain-blend'], 'screen');
  assert.equal(materials.stage['--grain'], '.07');
  assert.match(css, /\[data-workspace-skeleton="loom"\]\[data-loom-layout="stage"\][^}]*color-scheme:dark!important/);
  assert.match(css, /\[data-workspace-skeleton="loom"\] \{[^}]*color-scheme:light!important/);
  for (const layout of ['jingwei', 'ripple', 'atlas']) assert.equal(materials[layout]['--grain-blend'], 'multiply', `${layout} 的纸纹仍应压暗`);
});

test('配方块只推派生令牌，不另存一份颜色表', () => {
  assert.ok(recipe, '配方块找不到');
  assert.equal(Object.values(recipe).some(value => /#[\da-f]{3,8}/i.test(value)), false, '派生令牌不该写死颜色');
  for (const token of ['--surface', '--sidebar', '--raised', '--text', '--muted', '--line-soft', '--accent-soft', '--ok-soft', '--control-border']) {
    assert.match(recipe[token] || '', /^var\(--|color-mix\(/, `${token} 应由颜料推出`);
  }
  assert.match(css, /opacity:var\(--grain\);\s*mix-blend-mode:var\(--grain-blend\)/, '纸纹深浅与混合模式应跟着材质');
});

test('窗口底色与标题条按材质走，回工作台交还保存的配色', async () => {
  assert.deepEqual(windowChrome({ '--canvas': '#0E0D13', '--ink-1': '#ece8f2', '--sidebar': '#f5f7fb', '--text': '#202a3c' }, 'loom'), { background: '#0e0d13', text: '#ece8f2' });
  assert.deepEqual(windowChrome({ '--canvas': '#0e0d13', '--ink-1': '#ece8f2', '--sidebar': '#f5f7fb', '--text': '#202a3c' }, 'workbench'), { background: '#f5f7fb', text: '#202a3c' });
  assert.equal(windowChrome({ '--canvas': 'rgb(14, 13, 19)', '--ink-1': 'rgb(236, 232, 242)' }, 'loom').background, '#0e0d13');
  assert.equal(windowChrome({}, 'loom'), null, '读不到颜色就不该动窗口');

  const pushed = [];
  const sync = createChromeSync({
    skeleton: () => 'loom',
    readTokens: () => ({ '--canvas': '#0e0d13', '--ink-1': '#ece8f2' }),
    setWindowAppearance: colors => { pushed.push(colors); return Promise.resolve({ ok: true }); },
  });
  sync(); sync();
  assert.equal(pushed.length, 1, '同一材质不该反复推窗口');
  sync(true);
  assert.equal(pushed.length, 2, '换配色后 appearance 会抢窗口，材质要强制盖回去');

  const failed = [];
  const failing = createChromeSync({
    skeleton: () => 'loom',
    readTokens: () => ({ '--canvas': '#0e0d13', '--ink-1': '#ece8f2' }),
    setWindowAppearance: colors => { failed.push(colors); return Promise.reject(new Error('窗口已关闭')); },
  });
  await failing();
  await failing();
  assert.equal(failed.length, 2, '推窗口失败时不记住这次，下次切换还要再推');
});
