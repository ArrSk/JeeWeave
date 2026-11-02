import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLayout, readLayout, saveLayout, layoutKey, clampBarPosition } from './layout.mjs';
import { emptyWorkspace, validateWorkspace, workspaceFromStorage, workspaceStorageValue } from './workspace-format.mjs';
import { createWorkspaceService } from './workspace-service.mjs';

test('旧工作区默认文字侧栏，布局和悬浮位置可以完整备份恢复',()=>{
 const value=emptyWorkspace(),old=validateWorkspace(value);
 assert.equal(old.data.preferences.layout.layout,'sidebar');
 const next={schemaVersion:1,layout:'dock',particles:false,position:{x:.3,y:.8}};
 const map=new Map([[layoutKey,JSON.stringify(next)]]);
 const storage={get length(){return map.size},key:i=>[...map.keys()][i],getItem:key=>map.get(key)??null};
 const snapshot=workspaceFromStorage(storage);
 assert.deepEqual(snapshot.data.preferences.layout,next);
 assert.deepEqual(JSON.parse(workspaceStorageValue(validateWorkspace(JSON.parse(JSON.stringify(snapshot))),layoutKey)),next);
 assert.equal(snapshot.data.preferences.theme,'blue');assert.deepEqual(snapshot.data.tasks,[]);
});
test('布局参数在写入前校验；保存失败保留原设置，偏好接口拒绝业务访问',()=>{
 let text=JSON.stringify(normalizeLayout(null)),fail=false;
 const raw={getItem:()=>text,setItem:(key,value)=>{assert.equal(key,layoutKey);if(fail)throw Error('disk full');text=value;}};
 const storage=createWorkspaceService({storage:raw}).preferenceStorage();
 const value={schemaVersion:1,layout:'float',particles:true,position:{x:0,y:1}};
 saveLayout(storage,value);assert.deepEqual(readLayout(storage),value);fail=true;
 assert.throws(()=>saveLayout(storage,{...value,layout:'dock'}),/disk full/);assert.deepEqual(readLayout(storage),value);
 assert.throws(()=>storage.setItem('jiwei-desktop-tasks','[]'),/无权/);
 for(const bad of [{...value,schemaVersion:2},{...value,layout:'other'},{...value,particles:1},{...value,position:{x:NaN,y:0}},{...value,position:{x:2,y:0}},{...value,layout:'sidebar'}])assert.throws(()=>normalizeLayout(bad));
});
test('窗口缩小或拖到边缘时悬浮栏限制在可用区域内',()=>{
 assert.deepEqual(clampBarPosition({x:-300,y:2000},{width:900,height:600},{width:600,height:64}),{x:8,y:528});
 assert.deepEqual(clampBarPosition({x:100,y:100},{width:900,height:600},{width:66,height:500}),{x:100,y:92});
});
