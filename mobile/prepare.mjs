// Reuse the desktop renderer and trusted plugins, without Electron or user data.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'mobile/dist');
if (path.relative(root, out) !== path.join('mobile', 'dist')) throw Error('Unsafe generated asset target');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const files = pkg.build.files.filter(name => /\.(mjs|js|css|svg|png)$/.test(name));
for (const name of files) {
  const target = path.join(out, name); fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, name), target);
}
let html = fs.readFileSync(path.join(root, 'desktop/prototype.html'), 'utf8');
html = html.replace(/<script type="module">[\s\S]*?<\/script>/, '')
  .replace('width=device-width, initial-scale=1', 'width=device-width, initial-scale=1, viewport-fit=cover')
  .replace('几微 · JeeWeave 桌面工作台', '几微 · JeeWeave')
  .replace('<html lang="zh-CN">', '<html lang="zh-CN" data-platform="android">')
  .replace('<link rel="stylesheet" href="workbench.css" />', '<link rel="stylesheet" href="workbench.css" /><link rel="stylesheet" href="../mobile.css" />')
  .replace('src="prototype-modules.js"', 'src="../mobile-entry.mjs"');
// No remote content or script can enter the native bridge's WebView.
html = html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" /><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'" />`);
fs.writeFileSync(path.join(out, 'desktop/prototype.html'), html);
const { readCoursePage } = require('../desktop/course-page.cjs');
fs.writeFileSync(path.join(out, 'portal-reader.js'), `JSON.stringify((()=>{try{return (${readCoursePage.toString()})(true);}catch(error){const text=document.body?.innerText||'';return /周数[:：]/.test(text)?{ok:true,text,cards:[],sourceHtml:'',warning:'Android 正文回退'}:{ok:false,message:'请先登录并打开学生课表查询，再重试。'};}})())`);
for (const name of ['assistant-core.mjs', 'assistant-ui.mjs', 'mobile-entry.mjs', 'mobile-layout.mjs', 'mobile.css', 'native-bridge.mjs', 'transfer.mjs']) fs.copyFileSync(path.join(root, 'mobile', name), path.join(out, name));
fs.writeFileSync(path.join(out, 'build.json'), JSON.stringify({ version: pkg.version + '-mobile-beta.3', platform: 'android', files: files.length + 10 }, null, 2));
console.log(`Android assets prepared (${files.length + 10} files), no data/profile included.`);
