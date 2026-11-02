// Keep legacy UI assertions unchanged, but redirect their fixed output directory
// into an owned run so profiles/fixtures/screenshots are cleaned even on failure.
const fs = require('node:fs'), path = require('node:path');
const target = process.argv[2];
if (!['next-development', 'workbench-features'].includes(target)) throw Error('Unknown regression suite');
const base = path.resolve(__dirname, '../.cache/test-runs');
if (process.versions.electron) {
  const dir = path.resolve(process.env.JEEWEAVE_LEGACY_TEST_RUN || '');
  if (path.dirname(dir) !== base || !path.basename(dir).startsWith('legacy-regression-')) throw Error('Run using node');
  const filename = path.join(__dirname, target + '.cjs');
  const original = fs.readFileSync(filename, 'utf8');
  const source = original.replace(/const output\s*=\s*path\.resolve\(__dirname,\s*['"]\.\.\/\.cache\/verification(?:\/next-development)?['"]\);/, 'const output = process.env.JEEWEAVE_LEGACY_TEST_RUN;');
  if (source === original) throw Error('Output path changed; review isolation adapter');
  const Module = require('node:module'), fixture = new Module(filename, module);
  fixture.filename = filename; fixture.paths = Module._nodeModulePaths(__dirname);
  fixture._compile(source, filename);
} else {
  fs.mkdirSync(base, { recursive: true });
  const dir = fs.mkdtempSync(path.join(base, 'legacy-regression-'));
  if (path.dirname(dir) !== base) throw Error('Unsafe test directory');
  (async () => {
    let child, code = 1;
    const timer = setTimeout(() => child?.kill(), 120000);
    try {
      child = require('node:child_process').spawn(require('electron'), [__filename, target], { stdio: 'inherit', windowsHide: true, env: { ...process.env, JEEWEAVE_LEGACY_TEST_RUN: dir, JEEWEAVE_SKIP_SHOTS: '1', JEEWEAVE_NEXT_NATIVE: '0' } });
      code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', n => resolve(n ?? 1)); });
    } finally {
      clearTimeout(timer);
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 150 });
      console.log('Legacy regression test data removed.');
    }
    const summaries = path.resolve(__dirname, '../.cache/verification'); fs.mkdirSync(summaries, { recursive: true });
    fs.writeFileSync(path.join(summaries, target + '-20261102.json'), JSON.stringify({ date: '2026-11-02', target, status: code === 0 ? 'passed' : 'failed', isolation: 'Only fixed output path redirected; existing assertions unchanged' }, null, 2));
    process.exitCode = code;
  })().catch(error => { console.error(error); process.exitCode = 1; });
}
