import test from 'node:test';
import assert from 'node:assert/strict';
import { createMobileBridge } from './dist/native-bridge.mjs';
import { readMobileTransfer, transferFiles } from './dist/transfer.mjs';
import { createHash } from 'node:crypto';
import { emptyWorkspace } from '../desktop/workspace-format.mjs';
const memory = () => { const values = new Map(); return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) }; };

test('mobile preview commits whole workspaces, rejects stale writes and keeps a restore backup', async () => {
  const cache = memory(), bridge = createMobileBridge(null, cache), initial = emptyWorkspace();
  assert.equal((await bridge.readWorkspace()).workspace, null);
  const first = bridge.writeWorkspace(initial); assert.equal(first.workspace.revision, 1);
  assert.equal(bridge.writeWorkspace(initial).ok, false);
  const restored = structuredClone(first.workspace); restored.data.extensions['jiwei-test'] = '保留';
  assert.equal(bridge.writeWorkspace(restored, { restore: true }).workspace.revision, 2);
  assert.equal(JSON.parse(cache.getItem('jeeweave-android-preview-workspace-before-import')).revision, 1);
  assert.equal((await bridge.readWorkspace()).workspace.data.extensions['jiwei-test'], '保留');
});

test('mobile transfer preserves desktop identities and unknown fields; validates attachment envelopes and versions', () => {
  const data = emptyWorkspace(); data.data.tasks.push({ id: 'stable-task', kind: 'task', title: '迁入的事项', type: 'undated', done: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  data.data.extensions['jiwei-future'] = '{"keep":true}';
  const envelope = { format: 'jeeweave-desktop-transfer', packageVersion: 1, workspace: data, files: [] };
  const restored = readMobileTransfer(envelope, emptyWorkspace());
  assert.equal(restored.data.tasks[0].id, 'stable-task'); assert.equal(restored.data.extensions['jiwei-future'], '{"keep":true}');
  assert.throws(() => readMobileTransfer({ ...envelope, packageVersion: 2 }), /格式暂不支持/);
  const content = Buffer.from('网页原文'), file = {path:'captures/web-captures/sample/page.txt',base64:content.toString('base64'),sha256:createHash('sha256').update(content).digest('hex')};
  assert.equal(transferFiles({...envelope,files:[file]}).length,1);
  for(const path of ['captures/web-captures/../bad','captures/web-captures/CON.txt','/outside','captures/web-captures/a\\b'])assert.throws(()=>transferFiles({...envelope,files:[{...file,path}]}),/路径/);
  assert.throws(()=>transferFiles({...envelope,files:[file,{...file,path:file.path.toUpperCase()}]}),/路径/);
  assert.throws(()=>transferFiles({...envelope,files:[{...file,base64:'?'}]}),/编码/);
  assert.throws(() => readMobileTransfer({ ...data, schemaVersion: 2 }), /不支持/);
});

test('system file preview does not commit until confirmed and rejects a changed revision', async () => {
  let current = emptyWorkspace(), reads = 0, writes = 0, input = emptyWorkspace();
  const native = { readWorkspace: () => JSON.stringify({ ok: true, workspace: current }), writeWorkspace: text => { writes++; current = JSON.parse(text); current.revision++; return JSON.stringify({ ok: true, workspace: current }); }, request(id) { reads++; queueMicrotask(() => bridge.resolve(id, { ok: true, text: JSON.stringify(input) })); } };
  const bridge = createMobileBridge(native);
  let preview = await bridge.transferWorkspace('preview-file'); assert.equal(writes, 0); assert.equal(reads, 1);
  current.revision++;
  await assert.rejects(bridge.transferWorkspace('commit', preview.token), /资料已变化/); assert.equal(writes, 0);
  preview = await bridge.transferWorkspace('preview-file');
  const saved = await bridge.transferWorkspace('commit', preview.token); assert.equal(saved.ok, true); assert.equal(writes, 1);
  await assert.rejects(bridge.transferWorkspace('commit', preview.token), /预览已失效/);
  preview = await bridge.transferWorkspace('preview-file'); await bridge.transferWorkspace('cancel');
  await assert.rejects(bridge.transferWorkspace('commit', preview.token), /预览已失效/);
});

test('LAN preview serves generated assets, rejects private paths and mutating methods', async () => {
  const {createPreviewServer}=await import('./preview.mjs');
  const {mkdtempSync,writeFileSync,rmSync}=await import('node:fs');
  const {tmpdir}=await import('node:os');const path=await import('node:path');
  const base=mkdtempSync(path.join(tmpdir(),'jeeweave-preview-'));
  writeFileSync(path.join(base,'sample.mjs'),'export const sample=1;');
  const server=await createPreviewServer({root:base,port:0,host:'127.0.0.1'});
  const url='http://127.0.0.1:'+server.address().port;
  try {
    const asset=await fetch(url+'/sample.mjs');assert.equal(asset.status,200);assert.match(asset.headers.get('content-type'),/javascript/);
    assert.equal(asset.headers.get('cache-control'),'no-store');
    assert.equal((await fetch(url+'/sample.mjs',{method:'POST'})).status,405);
    for(const bad of ['/desktop/data/workspace.json','/.git/config','/%2e%2e%2fpackage.json','/%5c..%5cpackage.json','/%00bad.js','/%ZZ'])
      assert.ok([400,404].includes((await fetch(url+bad)).status),bad);
    assert.equal((await fetch(url+'/__preview').then(r=>r.json())).app,'JeeWeave mobile preview');
  } finally {
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));rmSync(base,{recursive:true,force:true});
  }
});
