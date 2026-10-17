const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const root = path.resolve(__dirname, '..');

function run(command, args) {
  const result = spawnSync(process.execPath, [command, ...args], { cwd: root, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function verifyNative(directory) {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-File', path.join(__dirname, 'tests', 'package-native.ps1'), '-PackageDirectory', directory], { cwd: root, stdio: 'inherit', windowsHide: true, shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`成品普通启动检查失败，不能交付：${directory}`);
}

const version = require('../package.json').version;
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');
const staging = path.join(root, 'desktop', '.cache', `package-${stamp}`);
const destination = path.join(root, 'desktop', 'release', `几微-${version}-Windows-${stamp}`);
if (fs.existsSync(destination)) throw new Error(`目标文件夹已存在，拒绝覆盖：${destination}`);
console.log('开始封装 Windows x64 免安装文件夹版…');
run('node_modules/electron-builder/cli.js', ['--win', '--x64', '--dir', `--config.directories.output=${staging}`]);
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.cpSync(path.join(staging, 'win-unpacked'), destination, { recursive: true, errorOnExist: true, force: false });
fs.mkdirSync(path.join(destination, 'data'));
fs.writeFileSync(path.join(destination, '使用说明.txt'), '\ufeff' + [
  `几微 ${version} · Windows x64 免安装版`,
  '',
  '启动：双击本文件夹内的“几微.exe”，无需安装 Node、Python 或启动开发服务器。',
  '退出：关闭主窗口，教务窗口及应用的后台进程会一起退出。',
  '',
  '文件布局：',
  '几微.exe                 应用入口',
  'resources/、locales/、DLL  应用运行资源，请保持原有位置',
  'data/profile/            课表、计划、待办、设置及教务登录状态，不要删除',
  'data/captures/           普通网页采集的原文与元数据',
  'data/cache/              浏览器磁盘缓存',
  'data/logs/               错误日志与崩溃诊断',
  '',
  '移动或备份：先关闭几微，再复制整个文件夹。只复制 exe 不能运行。',
  '升级：先关闭应用，把旧版 data 整个复制到新版文件夹内；保留旧版备份直到确认正常。',
  '首次使用：本包不包含开发版的个人资料，可在“设置 → 功能示例”导入示例，或在课程表导入教务课表/CSV。',
  '请放在可写的位置；data 内含个人资料和登录状态，不要把自己的 data 作为安装包分享。',
  '',
].join('\r\n'), 'utf8');
fs.writeFileSync(path.join(staging, 'result.json'), JSON.stringify({ destination, executable: path.join(destination, '几微.exe') }, null, 2));
verifyNative(destination);
console.log(`封装完成：${path.join(destination, '几微.exe')}`);
