import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { emptyWorkspace, readWorkspaceBackup, prepareWorkspaceRestore } from '../desktop/workspace-format.mjs';
import { readMobileTransfer, transferFiles } from './dist/transfer.mjs';
const require=createRequire(import.meta.url),{createWorkspaceTransfer}=require('../desktop/workspace-transfer.cjs');
if(!process.env.JEEWEAVE_NATIVE_TEST_OUTPUT)throw Error('Run mobile/native-files-test.ps1 -WithDesktopRoundtrip for automatic fixture cleanup');
const output=path.resolve(process.env.JEEWEAVE_NATIVE_TEST_OUTPUT);

test('native attachment envelope imports into Desktop, retains IDs/content, and exports a mobile-compatible package',()=>{
  const native=JSON.parse(fs.readFileSync(path.join(output,'native-roundtrip.jiwei'),'utf8'));
  const workspace=emptyWorkspace();workspace.data.webCaptures=native.workspace.data.webCaptures.map(record=>({...record,drafts:[]}));workspace.data.extensions['jiwei-roundtrip-marker']='keep unknown extension';native.workspace=workspace;
  const source=path.join(output,'native-valid-workspace.jiwei');fs.writeFileSync(source,JSON.stringify(native));
  let current=emptyWorkspace();const root=fs.mkdtempSync(path.join(output,'desktop-attachment-roundtrip-'));
  const transfer=createWorkspaceTransfer({root,version:'0.3.0',read:()=>structuredClone(current),write:next=>{current={...structuredClone(next),revision:current.revision+1};return current;},readBackup:readWorkspaceBackup,prepare:prepareWorkspaceRestore});
  const preview=transfer.preview(source);assert.equal(preview.summary.files,2);assert.equal(current.data.webCaptures.length,0);
  const restored=transfer.commit(preview.token).workspace;assert.equal(restored.data.webCaptures[0].id,'stable-capture');assert.equal(restored.data.extensions['jiwei-roundtrip-marker'],'keep unknown extension');
  const text=fs.readFileSync(path.join(root,restored.data.webCaptures[0].directory,'page.txt'),'utf8');assert.match(text,/保留网页原文/);
  const destination=path.join(output,'desktop-returned.jiwei');transfer.export(destination);const exported=JSON.parse(fs.readFileSync(destination,'utf8'));
  const checked=readMobileTransfer(exported,emptyWorkspace());assert.equal(checked.data.webCaptures[0].id,'stable-capture');
  for(const file of transferFiles(exported))assert.equal(createHash('sha256').update(Buffer.from(file.base64,'base64')).digest('hex'),file.sha256);
  assert.equal(exported.files.length,2);
});
