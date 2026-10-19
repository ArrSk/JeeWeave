const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const config = require('../package.json');

function removeGenerated(directory, parent) {
  const target = path.resolve(directory), boundary = path.resolve(parent) + path.sep;
  if (!target.startsWith(boundary) || fs.lstatSync(target).isSymbolicLink()) throw new Error(`拒绝清理生成目录：${target}`);
  fs.rmSync(target, { recursive: true, force: true });
}
const hashFile = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

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

const version = config.version;
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
  'BUILD-INFO.json          版本、构建时间与运行源码指纹',
  'SHA256SUMS.txt           exe 与 app.asar 的 SHA-256 校验值',
  'data/workspace.json      版本化课表、计划、待办、日历偏好与网页记录',
  'data/profile/            教务登录状态与兼容缓存，不要当普通缓存删除',
  'data/captures/           普通网页采集的原文与元数据',
  'data/cache/              浏览器磁盘缓存',
  'data/logs/               错误日志与崩溃诊断',
  'data/exports/            业务数据导出与浏览器下载',
  'data/backups/            确认恢复前的业务快照',
  '',
  '移动或备份：先关闭几微，再复制整个文件夹。只复制 exe 不能运行。',
  '升级：先关闭应用，把旧版 data 整个复制到新版文件夹内；保留旧版备份直到确认正常。',
  '首次使用：本包不包含开发版的个人资料。在“设置 → 开发者模式”开启后可导入功能示例，也可在课程表导入教务课表/CSV。',
  '日历：从左侧进入，默认月视图，可切周/日；选择日期或事项查看详情、编辑和完成。',
  '群消息：本版暂停入口与接收，历史代码/数据保留。',
  '当前未做数字签名，Windows 可能提示未知发布者；请核对来源和校验值。不要关闭系统安全防护。',
  '请放在可写的位置；data 内含个人资料和登录状态，不要把自己的 data 作为安装包分享。',
  '',
].join('\r\n'), 'utf8');
const files = ['package.json', ...config.build.files].map(file => ({ path: file, sha256: hashFile(path.join(root, file)) }));
fs.writeFileSync(path.join(destination, 'BUILD-INFO.json'), JSON.stringify({ product: config.build.productName, version, platform: 'win32', arch: 'x64', builtAt: new Date().toISOString(), runtimeFingerprint: crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex'), files }, null, 2) + '\n');
fs.writeFileSync(path.join(destination, 'SHA256SUMS.txt'), ['几微.exe', 'resources/app.asar'].map(file => `${hashFile(path.join(destination, file))}  ${file}`).join('\r\n') + '\r\n');
verifyNative(destination);
// Native verification exercises the real output path; distribute no probe profile.
const generatedData = path.join(destination, 'data');
const probeData = JSON.parse(fs.readFileSync(path.join(generatedData, 'workspace.json'), 'utf8')).data;
if (probeData.plans.length || probeData.tasks.length || probeData.webCaptures.length || probeData.chatMonitor.messages.length || probeData.preferences.developerMode) throw new Error('成品初始化资料不为空，保留目录待检查，不生成分发压缩包。');
removeGenerated(generatedData, destination); fs.mkdirSync(generatedData);
const archive = `${destination}.zip`;
const zipCommand = `$ErrorActionPreference='Stop'; Compress-Archive -LiteralPath '${destination.replaceAll("'", "''")}' -DestinationPath '${archive.replaceAll("'", "''")}' -CompressionLevel Optimal`;
const zipped = spawnSync('powershell.exe', ['-NoProfile', '-Command', zipCommand], { cwd: root, stdio: 'inherit', windowsHide: true });
if (zipped.error) throw zipped.error;
if (zipped.status !== 0) throw new Error('分发压缩包生成失败，已保留成品文件夹。');
fs.writeFileSync(`${archive}.sha256`, `${hashFile(archive)}  ${path.basename(archive)}\r\n`);
fs.writeFileSync(path.join(root, 'desktop/release/latest-build.json'), JSON.stringify({ version, destination, executable: path.join(destination, '几微.exe'), archive, checksum: `${archive}.sha256` }, null, 2) + '\n');
removeGenerated(staging, path.join(__dirname, '.cache'));
console.log(`封装完成：${path.join(destination, '几微.exe')}`);
console.log(`分发压缩包：${archive}`);
