import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorkbenchHost } from './workbench-host.mjs';
test('版本化服务经接口调用，卸载与禁用撤销旧引用，重注册不激活旧代理', () => {
  let enabled = true;
  const host = createWorkbenchHost({ enabled: () => enabled });
  const revoke = host.provide('notes', { read: () => 'value' }); const service = host.use('notes');
  assert.equal(service.read(), 'value'); assert.throws(() => host.use('notes', 2), /版本/);
  assert.throws(() => host.provide('notes', {}), /重复/);
  enabled = false; assert.throws(() => service.read(), /关闭/); enabled = true;
  revoke(); host.provide('notes', { read: () => 'new' }); assert.throws(() => service.read(), /卸载/);
  assert.equal(host.use('notes').read(), 'new');
});
test('功能作用域统一释放命令、监听与服务，不重复释放，订阅错误不改变已提交结果', () => {
  const failures = [], host = createWorkbenchHost({ onError: error => failures.push(error.message) }), target = new EventTarget(), scope = host.scope('notes');
  let calls = 0;
  scope.listen(target, 'input', () => calls++); scope.provide('notes', { read: () => true }); scope.command('capture', () => calls++);
  scope.on('committed', () => { throw Error('observer'); }); scope.on('committed', () => calls++);
  host.emit('committed'); assert.deepEqual(failures, ['observer']); host.run('capture'); target.dispatchEvent(new Event('input')); assert.equal(calls, 3);
  scope.dispose(); scope.dispose(); host.emit('committed'); target.dispatchEvent(new Event('input')); assert.equal(calls, 3);
  assert.throws(() => host.run('capture'), /不可用/); assert.throws(() => host.use('notes'), /不可用/);
});
test('页面跳转先完成原页面保存，失败不切换，关闭功能不能通过命令或导航绕过', () => {
  let blocked = false, fail = false; const entered = [], host = createWorkbenchHost({ enabled: owner => owner !== 'notes' || !blocked });
  host.page('notes', { enter: () => entered.push('notes'), leave: () => { if (fail) throw Error('save failed'); } });
  host.page('today', { enter: () => entered.push('today') }); host.navigate('notes'); fail = true;
  assert.throws(() => host.navigate('today'), /save failed/); assert.equal(host.currentPage, 'notes'); assert.deepEqual(entered, ['notes']);
  fail = false; host.navigate('today'); blocked = true; assert.throws(() => host.navigate('notes'), /关闭/);
});

test('宿主关闭释放全部功能作用域，旧接口和新注册都不能继续工作', () => {
  const host = createWorkbenchHost(), target = new EventTarget(), scope = host.scope('notes'); let count = 0;
  scope.listen(target, 'input', () => count++); scope.provide('notes', { read: () => true }); const service = host.use('notes');
  host.dispose(); target.dispatchEvent(new Event('input')); assert.equal(count, 0);
  assert.throws(() => service.read(), /卸载/); assert.throws(() => host.scope('notes'), /关闭/);
});
