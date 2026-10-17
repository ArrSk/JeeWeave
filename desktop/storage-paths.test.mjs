import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { configureStorage } from './storage-paths.cjs';

test('便携数据与 exe 同目录，重复初始化保留已有课表，缓存与持久资料分开', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jiwei-storage-'));
  const paths = new Map([['exe', path.join(root, '几微.exe')]]);
  const switches = new Map();
  const app = { isPackaged: true, getPath: key => paths.get(key), setPath: (key, value) => paths.set(key, value), setAppLogsPath: value => paths.set('logs', value), commandLine: { appendSwitch: (key, value) => switches.set(key, value) } };
  const result = configureStorage(app);
  fs.writeFileSync(path.join(result.profile, 'saved-course-fixture'), 'preserve');
  configureStorage(app);
  assert.equal(fs.readFileSync(path.join(result.profile, 'saved-course-fixture'), 'utf8'), 'preserve');
  assert.equal(path.dirname(result.root), root);
  assert.equal(paths.get('userData'), paths.get('sessionData'));
  assert.notEqual(paths.get('sessionData'), switches.get('disk-cache-dir'));
  assert.ok([...paths.values()].every(value => value.startsWith(root + path.sep)));
});

test('开发入口继续使用已有资料，不擅自切换开发课表目录', () => {
  const app = { isPackaged: false, getPath() { throw Error('must not touch development storage'); } };
  assert.equal(configureStorage(app), null);
});
