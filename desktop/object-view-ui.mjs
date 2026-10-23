import { createCourseOverlay } from './course-overlay.mjs';
import { createPageMotion } from './page-motion.mjs';
import { objectTypes, refKey, nextObjectCourse } from './object-view.mjs';
import { describeItem, normalizeItem, isComplete, describeExecutionSlot } from './planning.mjs';
import { courseTimes } from './course-occurrences.mjs';
import { today } from '../shared/packages/core/src/semester-calendar.mjs';
import { escapeHtml as esc } from './ui-text.mjs';
export function createObjectUI({panel,main,objects:store,enabled,bindings,feedback,onOpenRecord,onAddItem,onChange}) {
  const listen = (target,...args) => bindings ? bindings.listen(target,...args) : target?.addEventListener(...args);
  const motion=createPageMotion(undefined,'desktop-object-change');
  let selected=null,filter='active',editing=null,refOptions=[];
  panel.className='desktop-page-panel desktop-objects-panel';panel.hidden=true;
  panel.innerHTML=`<div class="intro desktop-page-head"><div><h1>对象视图 <span class="desktop-beta-label">Beta</span></h1><p>从一门课、一个项目或主题出发，找齐相关的安排、事情和资料。</p></div><div class="desktop-page-actions"><button type="button" class="secondary" data-load-example="objects" id="desktop-demo-objects" hidden>导入示例</button><button type="button" class="primary" id="desktop-new-object">新建对象</button></div></div>
    <div class="desktop-object-workspace"><aside class="panel desktop-object-browser"><div class="desktop-object-filters"><button type="button" data-object-filter="active" aria-pressed="true">进行中</button><button type="button" data-object-filter="archived" aria-pressed="false">已归档</button></div><div id="desktop-object-list"></div></aside><section class="panel desktop-object-detail" id="desktop-object-detail" aria-live="polite"></section></div>`;
  const form=document.createElement('form');form.className='panel desktop-item-editor';form.id='desktop-object-form';form.hidden=true;
  form.innerHTML=`<div class="panel-head"><h2 id="desktop-object-form-title">新建对象</h2><button type="button" class="secondary" data-object-close>关闭</button></div><div class="desktop-item-fields"><label class="wide">对象名称<input name="title" maxlength="160" required placeholder="例如：本学期高等数学、课程项目" /></label><label class="wide">类型<select name="type">${Object.entries(objectTypes).map(([id,label])=>`<option value="${id}">${label}</option>`).join('')}</select></label><label class="wide">目标与背景<textarea name="purpose" maxlength="4000" rows="4" placeholder="为什么做、希望得到什么结果、需要保留哪些背景（可选）"></textarea></label><p class="wide desktop-section-copy">一个对象可以关联多条上课安排、多个事项与网页原文。同名内容不会自动合并。</p></div><p class="desktop-form-error" role="alert" hidden></p><div class="desktop-form-actions"><button type="button" class="secondary" data-object-close>取消</button><button type="submit" class="primary">保存对象</button></div>`;
  const linkForm=document.createElement('form');linkForm.id='desktop-object-link-form';linkForm.className='panel desktop-item-editor';linkForm.hidden=true;
  linkForm.innerHTML=`<div class="panel-head"><h2 id="desktop-object-link-title">关联已有内容</h2><button type="button" class="secondary" data-object-close>关闭</button></div><div class="desktop-item-fields"><label class="wide">内容类别<select name="collection"><option value="courseEntry">上课安排</option><option value="items">事项 / 计划</option><option value="capture">网页资料</option><option value="journalEntry">笔记</option></select></label><label class="wide">选择记录<select name="record" required></select></label><p id="desktop-object-link-copy" class="wide desktop-section-copy">只建立引用，保留原内容、日期和完成状态。一条记录只能有一个主归属，多个排课入口可以手动归于同一门课。</p></div><p class="desktop-form-error" role="alert" hidden></p><div class="desktop-form-actions"><button type="button" class="secondary" data-object-close>取消</button><button type="submit" class="primary">确认关联</button></div>`;
  panel.append(form,linkForm);
  const overlay=createCourseOverlay({bindings,surface:panel,main,panels:[form,linkForm],id:'desktop-object-dialog',fitViewport:true,onClose:()=>{editing=null;}});
  const error=(element,text='')=>{const p=element.querySelector('[role=alert]');p.textContent=text;p.hidden=!text;};
  const objects=()=>enabled('objects')?store.list():[];
  const actions=(entry,index)=>`<div class="desktop-object-record-actions">${entry.source?`<button type="button" class="secondary" data-object-record="${index}" ${enabled(entry.source.available)?'':'disabled'}>在原功能中打开</button>`:''}<button type="button" class="secondary" data-object-unlink="${index}">解除关联</button></div>`;
  const detail=panel.querySelector('#desktop-object-detail');let entries=[];
  function renderDetail() {
    const time=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
    const object=objects().find(o=>o.id===selected);
    if(!object){entries=[];detail.innerHTML='<div class="desktop-object-empty"><h2>围绕一件事看全貌</h2><p>新建课程、项目或主题，再关联已有上课安排、作业、计划和网页要求。原来的独立内容会继续保留。</p><button type="button" class="primary" data-object-create>新建第一个对象</button></div>';return;}
    const projected=store.detail(selected);entries=projected.entries;
    const section=(title,collection)=>{const rows=entries.map((entry,index)=>({entry,index})).filter(({entry})=>collection.includes(entry.ref.collection));return `<section class="desktop-object-section"><div class="desktop-section-head"><h3>${title}</h3><span>${rows.length} 项</span></div>${rows.length?rows.map(({entry,index})=>{
      const s=entry.source,r=s?.record;
      if(!r){const unavailable=['disabled','unavailable'].includes(entry.status);return `<article class="desktop-object-record"><strong>${unavailable?'原记录':esc(entry.title||'原记录')}</strong><p>${entry.status==='disabled'?'原功能已关闭，重新开启后可查看。':entry.status==='unavailable'?'来源服务暂不可用，请重新打开应用后重试。':'来源已移除，可以解除关联。'}关联与对象背景仍保留，其他内容不会删除。</p>${actions(entry,index)}</article>`;}
      let content='';
      if(entry.ref.collection==='courseEntry'){
        const days=['一','二','三','四','五','六','日'];
        const next=nextObjectCourse(s.table,r.id,today(),time);
        content=`<p>${esc(s.table.name)} · ${r.weekday?`周${days[r.weekday-1]} · 第 ${r.periodStart}–${r.periodEnd} 节`:'待安排课程'}<br />周次：${esc(r.weekText||(r.weeks||[]).join('、'))}<br />教师：${esc(r.teacher||'未填')} · 地点：${esc(r.location||'未填')}</p>${next?`<p class="desktop-object-next">下次：${esc(next.date)} ${esc(courseTimes(s.table,next).start)}–${esc(courseTimes(s.table,next).end)} · ${esc(next.location||'未填地点')}</p>`:'<p>当前没有可计算的后续课次，请核对学期起止与周次。</p>'}`;
      }else if(entry.ref.collection==='journalEntry'){
        content=`<p>${esc(r.date)} · 笔记</p><p class="desktop-object-note">${esc(r.body)}</p>`;
      }else if(entry.ref.collection==='capture'){
        content=`<p>${esc(r.url)}</p>${r.highlights?.length?`<ul>${r.highlights.map(h=>`<li>${esc(h)}</li>`).join('')}</ul>`:''}<details><summary>查看原文</summary><pre>${esc(r.text)}</pre></details>`;
      }else{
        const item=normalizeItem(r,entry.ref.collection),done=isComplete(item,today());
        content=`<p>${done?'已完成':'未完成'} · ${esc(describeItem(item))}</p>${item.executionSlots?.length?`<ul>${item.executionSlots.map(slot=>`<li>${esc(describeExecutionSlot(slot))}</li>`).join('')}</ul>`:''}${item.note?`<p class="desktop-object-note">${esc(item.note)}</p>`:''}${item.phases.length?`<ul>${item.phases.map(p=>`<li>${p.done?'已完成':'待推进'} · ${esc(p.title)}${p.startDate?`（${esc(p.startDate)} — ${esc(p.endDate)}）`:''}</li>`).join('')}</ul>`:''}${r.evidence?`<blockquote>${esc(r.evidence)}</blockquote>`:''}`;
      }
      return `<article class="desktop-object-record"><h4>${esc(r.title || (r.body || '').split(/\r?\n/)[0].slice(0,160))}</h4>${content}${!enabled(s.available)?'<p class="desktop-section-copy">原功能已关闭，内容和关联保留；重新开启后可编辑。</p>':''}${actions(entry,index)}</article>`;
    }).join(''):`<p class="desktop-section-copy">尚未关联${title}，可从“关联已有内容”选择。</p>`}</section>`;};
    detail.innerHTML=`<header class="desktop-object-heading"><span class="desktop-object-type">${objectTypes[object.type]}${object.status==='archived'?' · 已归档':''}</span><h2>${esc(object.title)}</h2><p class="desktop-object-purpose">${esc(object.purpose||'还没有填写目标与背景，可在编辑对象中补充。')}</p><div class="desktop-button-row"><button type="button" class="primary" data-object-link>关联已有内容</button><button type="button" class="secondary" data-object-add-item ${enabled('items')?'':'disabled'}>添加关联事项</button><button type="button" class="secondary" data-object-edit>编辑对象</button><button type="button" class="secondary" data-object-archive>${object.status==='archived'?'恢复对象':'归档对象'}</button></div></header>${section('上课安排',['courseEntry'])}${section('事项与计划',['task','plan'])}${section('网页资料与要求',['capture'])}${section('笔记',['journalEntry'])}<p class="desktop-object-scope">Beta 当前汇总以上已实现内容。记账、附件与复杂重复/阶段的独立执行安排仍待后续开发。</p>`;
  }
  function render() {
    const all=objects(),shown=all.filter(o=>o.status===filter);
    if(!shown.some(o=>o.id===selected))selected=shown[0]?.id||null;
    panel.querySelectorAll('[data-object-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.objectFilter===filter)));
    panel.querySelector('#desktop-object-list').innerHTML=shown.length?shown.map(o=>`<button type="button" class="desktop-object-choice" data-object-select="${esc(o.id)}" aria-pressed="${o.id===selected}"><span>${objectTypes[o.type]}</span><strong>${esc(o.title)}</strong><small>${store.detail(o.id).entries.length} 项关联</small></button>`).join(''):'<p class="empty">这里还没有对象。</p>';
    renderDetail();
  }
  const openForm=(object=null)=>{editing=object?.id||null;form.elements.title.value=object?.title||'';form.elements.type.value=object?.type||'course';form.elements.purpose.value=object?.purpose||'';form.querySelector('h2').textContent=object?'编辑对象':'新建对象';error(form);overlay.show(form,{labelledBy:'desktop-object-form-title',focus:form.elements.title});};
  const syncCandidates=()=>{
    const state=store.read(),collection=linkForm.elements.collection.value;
    refOptions=store.sources().filter(s=>enabled(s.available)&&(collection==='items'?['task','plan'].includes(s.ref.collection):s.ref.collection===collection));
    linkForm.elements.record.innerHTML=refOptions.length?refOptions.map((s,i)=>{const owner=state.links.find(l=>refKey(l.ref)===refKey(s.ref));return `<option value="${i}" ${owner?'disabled':''}>${esc(s.label)}${owner?' · 已有归属':''}</option>`;}).join(''):'<option value="">该类别暂无可关联记录</option>';
    const first=refOptions.findIndex(s=>!state.links.some(l=>refKey(l.ref)===refKey(s.ref)));linkForm.elements.record.value=first<0?'':String(first);
    linkForm.querySelector('[type=submit]').disabled=first<0;
  };
  listen(panel,'click',event=>{const b=event.target.closest('button');if(!b)return;try{
    if(b.id==='desktop-new-object'||b.hasAttribute('data-object-create'))openForm();
    else if(b.dataset.objectSelect){selected=b.dataset.objectSelect;render();motion(detail);}
    else if(b.dataset.objectFilter){filter=b.dataset.objectFilter;render();}
    else if(b.hasAttribute('data-object-edit'))openForm(objects().find(o=>o.id===selected));
    else if(b.hasAttribute('data-object-archive')){store.archive(selected);render();onChange();feedback('对象状态已更新，原事项和资料仍保留。','success');}
    else if(b.hasAttribute('data-object-link')){error(linkForm);syncCandidates();overlay.show(linkForm,{labelledBy:'desktop-object-link-title',focus:linkForm.elements.collection});}
    else if(b.hasAttribute('data-object-unlink')){store.unassign(selected,entries[Number(b.dataset.objectUnlink)].ref);render();onChange();feedback('已解除关联，原记录仍保留。','success');}
    else if(b.hasAttribute('data-object-record')){const entry=entries[Number(b.dataset.objectRecord)];if(entry?.source&&enabled(entry.source.available)){const latest=store.source(entry.ref);if(latest.status!=='found'){render();feedback('原记录状态已变化，请查看更新后的关联。','error');return;}onOpenRecord(entry.ref);}}
    else if(b.hasAttribute('data-object-add-item'))onAddItem(selected);
    else if(b.hasAttribute('data-object-close'))overlay.close();
  }catch(e){feedback(e.message,'error');}});
  listen(form,'submit',event=>{event.preventDefault();try{const object=store.save({title:form.elements.title.value,type:form.elements.type.value,purpose:form.elements.purpose.value},editing);selected=object.id;filter=object.status;overlay.close();render();onChange();feedback('对象已保存。','success');}catch(e){error(form,e.message);}});
  listen(linkForm.elements.collection,'change',syncCandidates);
  listen(linkForm,'submit',event=>{event.preventDefault();try{const source=refOptions[Number(linkForm.elements.record.value)];if(!source||linkForm.elements.record.value==='')throw Error('请选择可关联记录。');store.assign(selected,source.ref);overlay.close();render();onChange();feedback('关联已保存，原记录保持不变。','success');}catch(e){error(linkForm,e.message);}});
  return {render,open(id){const object=objects().find(o=>o.id===id);if(!object)throw Error('对象不存在或当前不可见。');selected=id;filter=object.status;render();},hide(){overlay.close({restoreFocus:false});}};
}
