// Run the actual desktop main process twice against isolated, portable data.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const output = path.resolve(__dirname, `../.cache/verification/workspace-flow-${Date.now()}`);
const first = path.join(output, 'original', 'data'), moved = path.join(output, 'new-version', 'data');
fs.mkdirSync(first, { recursive: true });
function run(root, stage) {
  const env = { ...process.env, JEEWEAVE_DATA_DIR: root, JEEWEAVE_WORKSPACE_TEST_STAGE: stage, JEEWEAVE_WORKSPACE_TEST_EVIDENCE: output };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(process.execPath, [path.resolve(__dirname, '../../node_modules/electron/cli.js'), path.join(__dirname, 'fixtures/workspace-main.cjs')], { env, encoding: 'utf8', timeout: 60000, windowsHide: true });
  process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '');
  assert.equal(result.status, 0, result.error?.message || `desktop stage ${stage} failed`);
}
run(first, 'create');
fs.mkdirSync(path.join(first, 'captures', 'web-captures', 'fixture'), { recursive: true });
fs.writeFileSync(path.join(first, 'captures', 'web-captures', 'fixture', 'source.txt'), 'fictional original');
fs.cpSync(first, moved, { recursive: true });
const sourceHash = require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(first, 'workspace.json'))).digest('hex');
run(moved, 'reopen');
assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(first, 'workspace.json'))).digest('hex'), sourceHash, 'original data is never modified by the upgraded copy');
assert.equal(fs.readFileSync(path.join(moved, 'captures/web-captures/fixture/source.txt'), 'utf8'), 'fictional original');
console.log(`PASS: real main/preload IPC, CRUD and phases, file-before-success persistence, cache reset/restart, moved data folder, explicit restore/cancel/backup and sender isolation. Evidence: ${output}`);
