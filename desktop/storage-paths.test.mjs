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

test('开发资料首次迁入统一 data，保留旧课表和登录文件，重复启动不覆盖新资料', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'jiwei-dev-migration-'));
  const legacy = path.join(temporary, 'legacy'); const root = path.join(temporary, 'data');
  fs.mkdirSync(path.join(legacy, 'Local Storage'), { recursive: true });
  fs.mkdirSync(path.join(legacy, 'Network'), { recursive: true });
  fs.writeFileSync(path.join(legacy, 'Local Storage', 'fixture'), 'old-courses');
  fs.writeFileSync(path.join(legacy, 'Network', 'Cookies'), 'fake-cookie');
  const paths = new Map([['userData', legacy]]);
  const app = { isPackaged: false, getPath: key => paths.get(key), setPath: (key, value) => paths.set(key, value), setAppLogsPath() {}, commandLine: { appendSwitch() {} } };
  const result = configureStorage(app, { root, legacyProfile: legacy });
  assert.equal(fs.readFileSync(path.join(result.profile, 'Local Storage', 'fixture'), 'utf8'), 'old-courses');
  assert.equal(fs.readFileSync(path.join(legacy, 'Network', 'Cookies'), 'utf8'), 'fake-cookie');
  fs.writeFileSync(path.join(result.profile, 'Local Storage', 'fixture'), 'new-courses');
  configureStorage(app, { root, legacyProfile: legacy });
  assert.equal(fs.readFileSync(path.join(result.profile, 'Local Storage', 'fixture'), 'utf8'), 'new-courses');
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')).workspace, 'workspace.json');
});
