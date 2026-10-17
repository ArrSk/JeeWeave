import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createAppLifecycle } from './app-lifecycle.cjs';

test('主窗口关闭退出整个应用，即使教务窗口仍开着；重复退出不会递归', () => {
  const app = new EventEmitter(), main = new EventEmitter();
  const calls = [];
  const windows = [main, { isDestroyed: () => true, destroy: () => assert.fail('already destroyed') }];
  main.isDestroyed = () => false;
  main.destroy = () => { calls.push('destroy-main'); main.emit('close'); };
  app.quit = () => { calls.push('quit'); app.emit('before-quit'); };
  let fallback;
  const lifecycle = createAppLifecycle({ app, globalShortcut: { unregisterAll: () => calls.push('shortcuts') }, getWindows: () => windows, closePortal: () => calls.push('dispose-portal'), setTimer: fn => { fallback = fn; return fn; }, clearTimer: fn => calls.push(fn === fallback ? 'clear-fallback' : 'bad') });
  lifecycle.bindMainWindow(main);
  main.emit('close'); lifecycle.quit();
  assert.deepEqual(calls, ['shortcuts', 'dispose-portal', 'destroy-main', 'quit']);
  assert.equal(app.isQuitting, true);
  app.emit('will-quit'); assert.equal(calls.at(-1), 'clear-fallback');
});

test('正常退出未完成时有退出兜底，外部发起退出也会清理所属窗口', () => {
  const app = new EventEmitter();
  const calls = [];
  app.quit = () => calls.push('quit'); app.exit = code => calls.push(`exit-${code}`);
  let fallback;
  createAppLifecycle({ app, globalShortcut: { unregisterAll() {} }, getWindows: () => [], closePortal: () => calls.push('dispose'), setTimer: fn => { fallback = fn; return fn; } });
  app.emit('before-quit'); fallback();
  assert.deepEqual(calls, ['dispose', 'quit', 'exit-0']);
});
