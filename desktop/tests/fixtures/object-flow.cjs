// Object beta and example visibility in the real, isolated workspace fixture.
const assert=require('node:assert/strict');
module.exports=async({run,click,disk,shot,window})=>{
  window.setSize(1280,900);
  await click('[data-view="objects"]');
  assert.equal(await run('document.querySelector(".main").dataset.activeView'),'objects');
  await click('#desktop-demo-objects');
  const sample=disk().data.objectView.objects.find(o=>o.example);assert.ok(sample);
  await click(`[data-object-select="${sample.id}"]`);
  assert.equal(await run('document.querySelector("#desktop-object-detail").textContent.includes("示例：完成课后练习")'),true);
  assert.equal(await run('document.querySelector("#desktop-object-detail").textContent.includes("第 1–2 节")'),true);
  await click('#desktop-dismiss-notice');await shot('object-beta-wide.png');
  // Create a real object and a real task without duplicating any collection.
  await click('#desktop-new-object');await run(`(()=>{const f=document.querySelector('#desktop-object-form');f.elements.title.value='对象Beta验证课程';f.elements.purpose.value='把课程安排、作业与原始要求放在一起。';f.requestSubmit();return true})()`);
  const object=disk().data.objectView.objects.find(o=>o.title==='对象Beta验证课程');assert.ok(object);
  const before=disk().data.tasks.length;
  await click('[data-object-add-item]');
  assert.equal(await run('document.querySelector("#desktop-plan-form [name=objectId]").value'),object.id);
  // The item service coordinates the same authoritative write for both owners.
  const fs = require('node:fs'), path = require('node:path'), rename = fs.renameSync;
  const workspacePath = path.join(process.env.JEEWEAVE_DATA_DIR, 'workspace.json');
  const unchanged = JSON.stringify(disk().data);
  try {
    fs.renameSync = (from, to) => { if (path.resolve(to) === path.resolve(workspacePath)) throw Error('simulated item disk full'); return rename(from, to); };
    await run(`(()=>{const f=document.querySelector('#desktop-plan-form');f.elements.title.value='对象Beta关联作业';f.elements.date.value='2026-10-25';f.requestSubmit();return true})()`);
    assert.equal(JSON.stringify(disk().data), unchanged, 'failed item save keeps both collections and relationships unchanged');
    assert.equal(await run('document.querySelector("#desktop-plan-dialog").open'), true);
    assert.equal(await run('document.querySelector("#desktop-plan-form [name=title]").value'), '对象Beta关联作业');
    assert.equal(await run('document.querySelector("#desktop-plan-form [role=alert]").hidden'), false);
  } finally { fs.renameSync = rename; }
  await run(`(()=>{const f=document.querySelector('#desktop-plan-form');f.elements.title.value='对象Beta关联作业';f.elements.date.value='2026-10-25';f.requestSubmit();return true})()`);
  const item=disk().data.tasks.find(t=>t.title==='对象Beta关联作业');assert.ok(item);assert.equal(disk().data.tasks.length,before+1);
  assert.ok(disk().data.objectView.links.some(l=>l.objectId===object.id&&l.ref.collection==='task'&&l.ref.id===item.id));
  await click(`[data-open-object="${object.id}"]`);
  assert.equal(await run('document.querySelector("#desktop-object-detail").textContent.includes("对象Beta关联作业")'),true);
  // Back to the original editor, then back to the context; identity is unchanged.
  await click('[data-object-record]');
  assert.equal(await run('document.querySelector("#desktop-plan-form [name=title]").value'),item.title);
  await click('#desktop-item-open-object');
  assert.equal(await run('document.querySelector("#desktop-object-detail h2").textContent'),object.title);
  await click('[data-object-record]');await run('document.querySelector("#desktop-plan-form [name=note]").value="保留原记录";document.querySelector("#desktop-plan-form").requestSubmit();true');
  assert.equal(disk().data.tasks.find(t=>t.id===item.id).createdAt,item.createdAt);
  await click(`[data-task-toggle="${item.id}"]`);await click(`[data-open-object="${object.id}"]`);
  assert.equal(await run('document.querySelector("#desktop-object-detail").textContent.includes("已完成")'),true);
  await click('[data-object-link]');
  await run('document.querySelector("#desktop-object-link-form [name=collection]").value="courseEntry";document.querySelector("#desktop-object-link-form [name=collection]").dispatchEvent(new Event("change"));true');
  assert.equal(await run('document.querySelector("#desktop-object-dialog").getBoundingClientRect().width'),820);
  await shot('object-beta-link-wide.png');
  await run('document.querySelector("#desktop-object-link-form").requestSubmit();true');
  const courseLink=disk().data.objectView.links.find(l=>l.objectId===object.id&&l.ref.collection==='courseEntry');assert.ok(courseLink);
  const originalCourse=disk().data.timetables.tables.find(t=>t.id===courseLink.ref.containerId).courses.find(c=>c.id===courseLink.ref.id);
  await run('document.querySelector(".desktop-object-section [data-object-record]").click();true');
  assert.equal(await run('document.querySelector("#desktop-course-editor [name=title]").value'),originalCourse.title);
  await click('#desktop-course-open-object');assert.equal(await run('document.querySelector("#desktop-object-detail h2").textContent'),object.title);
  // Transfer the sample resource explicitly, keeping a single original copy.
  await click(`[data-object-select="${sample.id}"]`);
  const captureLink=disk().data.objectView.links.find(l=>l.objectId===sample.id&&l.ref.collection==='capture');assert.ok(captureLink);
  const captureCount=disk().data.webCaptures.length;
  await run('document.querySelectorAll(".desktop-object-section")[2].querySelector("[data-object-unlink]").click();true');
  await click(`[data-object-select="${object.id}"]`);await click('[data-object-link]');
  await run('document.querySelector("#desktop-object-link-form [name=collection]").value="capture";document.querySelector("#desktop-object-link-form [name=collection]").dispatchEvent(new Event("change"));document.querySelector("#desktop-object-link-form").requestSubmit();true');
  assert.equal(disk().data.webCaptures.length,captureCount);assert.ok(disk().data.objectView.links.some(l=>l.objectId===object.id&&l.ref.collection==='capture'));
  await run('document.querySelectorAll(".desktop-object-section")[2].querySelector("[data-object-record]").click();true');
  // The extracted web service must keep both sides unchanged on disk failure.
  const captureRecord=disk().data.webCaptures.find(c=>c.id===captureLink.ref.id),captureDraft=captureRecord.drafts.find(d=>d.status==='pending');
  assert.ok(captureDraft);
  const draftForm=`[data-approve-draft="${captureDraft.id}"][data-capture="${captureRecord.id}"]`;
  const captureBefore=JSON.stringify(disk().data),taskCount=disk().data.tasks.length;
  try {
    fs.renameSync=(from,to)=>{if(path.resolve(to)===path.resolve(workspacePath))throw Error('simulated capture disk full');return rename(from,to);};
    await run(`(()=>{const f=document.querySelector(${JSON.stringify(draftForm)});f.elements.title.value='网页服务重试验证';f.elements.date.value='2026-10-25';f.elements.title.dispatchEvent(new Event('input',{bubbles:true}));f.requestSubmit();return true})()`);
    assert.equal(JSON.stringify(disk().data),captureBefore);
    assert.equal(await run(`document.querySelector(${JSON.stringify(draftForm)}).elements.title.value`),'网页服务重试验证');
    assert.equal(await run(`document.querySelector(${JSON.stringify(draftForm)}).querySelector('button').disabled`),false);
  } finally {fs.renameSync=rename;}
  await run(`document.querySelector(${JSON.stringify(draftForm)}).requestSubmit();true`);
  assert.equal(disk().data.tasks.length,taskCount+1);
  const approved=disk().data.webCaptures.find(c=>c.id===captureRecord.id).drafts.find(d=>d.id===captureDraft.id);
  assert.equal(approved.status,'added');assert.equal(disk().data.tasks.find(t=>t.id===approved.taskId).example,true);
  await run(`document.querySelector(${JSON.stringify(draftForm)}).requestSubmit();true`);
  assert.equal(disk().data.tasks.length,taskCount+1,'repeated draft confirmation never adds a second task');
  await click('#desktop-capture-open-object');assert.equal(await run('document.querySelector("#desktop-object-detail h2").textContent'),object.title);
  // Aggregation uses providers; turning them off keeps references but hides bodies.
  const sourcesBefore=JSON.stringify({tables:disk().data.timetables,tasks:disk().data.tasks,captures:disk().data.webCaptures,objects:disk().data.objectView});
  await click('[data-view="plugins"]');await click('#desktop-module-courses');await click('#desktop-module-plans');await click('#desktop-module-web-capture');
  await click('[data-view="objects"]');await click(`[data-object-select="${object.id}"]`);
  for(const index of [0,1,2]){
    assert.equal(await run(`document.querySelectorAll('.desktop-object-section')[${index}].textContent.includes('原功能已关闭')`),true);
    assert.equal(await run(`document.querySelectorAll('.desktop-object-section')[${index}].querySelectorAll('[data-object-record]').length`),0);
    assert.equal(await run(`document.querySelectorAll('.desktop-object-section')[${index}].textContent.includes('来源已移除')`),false);
  }
  assert.equal(await run(`document.querySelectorAll('.desktop-object-section')[0].textContent.includes(${JSON.stringify(originalCourse.title)})`),false);
  assert.equal(await run('document.querySelector("#desktop-object-detail").textContent.includes("保留原记录")'),false);
  assert.equal(await run(`document.querySelector('#desktop-object-detail').textContent.includes(${JSON.stringify(captureRecord.text)})`),false);
  assert.equal(JSON.stringify({tables:disk().data.timetables,tasks:disk().data.tasks,captures:disk().data.webCaptures,objects:disk().data.objectView}),sourcesBefore);
  await click('[data-object-link]');
  await run('document.querySelector("#desktop-object-link-form [name=collection]").value="courseEntry";document.querySelector("#desktop-object-link-form [name=collection]").dispatchEvent(new Event("change"));true');
  assert.equal(await run('document.querySelector("#desktop-object-link-form [type=submit]").disabled'),true);
  await run('document.querySelector("#desktop-object-link-form [name=collection]").value="items";document.querySelector("#desktop-object-link-form [name=collection]").dispatchEvent(new Event("change"));true');
  assert.equal(await run('document.querySelector("#desktop-object-link-form [type=submit]").disabled'),true);
  await click('#desktop-object-link-form [data-object-close]');
  await click('[data-view="plugins"]');await click('#desktop-module-courses');await click('#desktop-module-plans');await click('#desktop-module-web-capture');
  await click('[data-view="objects"]');await click(`[data-object-select="${object.id}"]`);
  assert.equal(await run('document.querySelector("#desktop-object-detail").textContent.includes("保留原记录")'),true);
  assert.equal(await run(`document.querySelector('#desktop-object-detail').textContent.includes(${JSON.stringify(captureRecord.text)})`),true);
  assert.equal(disk().data.objectView.links.filter(l=>l.objectId===object.id).length,3);
  await run('document.querySelectorAll(".desktop-object-section")[0].querySelector("[data-object-record]").click();true');
  assert.equal(await run('document.querySelector("#desktop-course-editor [name=title]").value'),originalCourse.title);
  await click('#desktop-course-open-object');assert.equal(await run('document.querySelector("#desktop-object-detail h2").textContent'),object.title);
  await click('[data-view="plugins"]');await click('#desktop-module-objects');
  assert.equal(await run('document.querySelector(".nav [data-view=objects]").hidden'),true);
  await click('[data-view="plans"]');await click(`[data-task-edit="${item.id}"]`);
  assert.equal(await run('document.querySelector("#desktop-plan-form [name=objectId]").closest("label").hidden'),true);
  await run('document.querySelector("#desktop-plan-form [name=note]").value="对象模块关闭时仍保留归属";document.querySelector("#desktop-plan-form").requestSubmit();true');
  assert.equal(disk().data.objectView.links.filter(l=>l.objectId===object.id).length,3);
  await click('[data-view="plugins"]');await click('#desktop-module-objects');await click('[data-view="objects"]');await click(`[data-object-select="${object.id}"]`);
  window.setSize(900,700);await run('document.querySelector(".main").scrollTop=0;true');await shot('object-beta-compact.png');
  assert.equal(await run('document.querySelector(".main").scrollWidth<=document.querySelector(".main").clientWidth+1'),true);
  // Closing developer mode hides imported samples everywhere, never deletes them.
  await click('[data-view="settings"]');await click('#desktop-developer-mode');
  assert.equal(disk().data.preferences.developerMode,false);
  const sampleCount=disk().data.tasks.filter(t=>t.example).length;assert.ok(sampleCount>0);
  await click('#desktop-load-all-examples');assert.equal(disk().data.tasks.filter(t=>t.example).length,sampleCount);
  await click('[data-view="objects"]');assert.equal(await run('document.querySelector("#desktop-object-list").textContent.includes("示例：")'),false);
  assert.equal(await run('document.querySelector("#desktop-object-detail").textContent.includes("示例课表")'),false);
  assert.equal(await run('document.querySelector("#desktop-object-detail").textContent.includes("来源已移除")'),false,'hidden sample links are not reported as deleted sources');
  await click('[data-view="plans"]');assert.equal(await run('document.querySelector("#desktop-plan-list").textContent.includes("示例：")'),false);
  assert.equal(await run('document.querySelector("#desktop-plan-list").textContent.includes("对象Beta关联作业")'),true);
  await click('[data-view="calendar"]');assert.equal(await run('document.querySelector("#desktop-calendar-grid").textContent.includes("示例：")'),false);
  await click('[data-view="web-capture"]');assert.equal(await run('document.querySelector("#desktop-web-history").textContent.includes("示例：")'),false);
  await click('[data-view="courses"]');assert.equal(await run('[...document.querySelectorAll("#desktop-semester-select option")].some(o=>o.textContent.includes("示例课表"))'),false);
  assert.ok(disk().data.objectView.objects.some(o=>o.id===sample.id));assert.equal(disk().data.tasks.filter(t=>t.example).length,sampleCount);
  await click('[data-view="settings"]');await click('#desktop-developer-mode');await click('[data-view="objects"]');
  assert.equal(await run('document.querySelector("#desktop-object-list").textContent.includes("示例：")'),true);
  // Archive hides the object from active grouping; its outstanding tasks survive.
  await click(`[data-object-select="${object.id}"]`);await click('[data-object-archive]');await click('[data-object-filter="archived"]');
  assert.equal(await run('document.querySelector("#desktop-object-detail h2").textContent'),object.title);
  assert.ok(disk().data.tasks.some(t=>t.id===item.id));await click('[data-object-archive]');
  // Restore the prior active example table for existing restart assertions.
  await click('[data-view="courses"]');await click('#desktop-open-course-settings');await click('#desktop-tab-semester');
  const table=disk().data.timetables.tables.find(t=>t.example);
  await run(`document.querySelector('#desktop-semester-select').value=${JSON.stringify(table.id)};document.querySelector('#desktop-semester-select').dispatchEvent(new Event('change'));true`);await click('#desktop-close-course-settings');
  console.log('PASS: object service aggregation, disabled providers hide bodies and keep references, grouping, linked task atomic save, original editor/back links, completion identity, archive, shared dialogs and all-view example hiding/restoration.');
};
