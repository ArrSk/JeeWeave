import { availableModules, readModules, setModuleEnabled, isModuleEnabled, moduleKey } from './modules.mjs';

export function createModulesUI({ panel, storage, feedback, onChange, beforeChange = () => {}, isDeveloper = () => false, diagnostics = () => [], platformDiagnostics = null }) {
  const builtinModules=availableModules.filter(item=>!item.desktopOnly||typeof globalThis.window?.jeeWeaveDesktop?.assistant==='function');
  panel.innerHTML = `<div class="intro desktop-page-head"><div><h1 style="font-size:24px">插件管理</h1><p>按需开启内置功能，关闭会收起入口，已有资料会保留。</p></div></div><section class="panel desktop-modules-panel"><div class="panel-head"><div><h2>内置功能</h2><p>设置、总览与插件管理始终保留。</p></div><span id="desktop-modules-count" role="status"></span></div><div class="desktop-module-list">${builtinModules.map(item => `<label class="desktop-module-row" for="desktop-module-${item.id}"><span><strong>${item.name}</strong><small>${item.description}</small></span><span class="desktop-module-control"><span data-module-status="${item.id}"></span><input id="desktop-module-${item.id}" type="checkbox" role="switch" data-module="${item.id}" aria-label="启用${item.name}" /></span></label>`).join('')}</div><p class="desktop-module-note">功能开关会随本地 data 保存。重新开启后可继续使用原资料。</p></section><section class="panel desktop-unavailable-modules"><h2>尚未实现</h2><p>记账和第三方插件安装尚未实现，暂不可开启。</p></section>`;
  const diagnosticPanel=document.createElement('details');
  diagnosticPanel.className='panel desktop-plugin-diagnostics';diagnosticPanel.id='desktop-plugin-diagnostics';diagnosticPanel.hidden=true;
  diagnosticPanel.innerHTML='<summary>插件运行诊断</summary><div class="plugin-diagnostics-body"><div class="plugin-diagnostics-head"><p>只读状态。资源数仅包含宿主可计数的注册，不等于全部系统资源。</p><button type="button" class="secondary" data-refresh-diagnostics>刷新状态</button></div><p role="status" data-diagnostic-status></p><div data-diagnostic-rows></div><p data-platform-diagnostics></p><small>系统同步状态表示最近请求的处理情况，不代表已逐项检查 Windows 任务计划。</small></div>';
  const platformCopy=diagnosticPanel.querySelector('[data-platform-diagnostics]'),platformHint=diagnosticPanel.querySelector('small');diagnosticPanel.querySelector('[data-diagnostic-rows]').before(platformCopy,platformHint);
  panel.append(diagnosticPanel);
  const refreshButton=diagnosticPanel.querySelector('button');
  let diagnosticRevision=0;
  const localDiagnostics=()=>{
    const box=diagnosticPanel.querySelector('[data-diagnostic-rows]'),opened=new Map([...box.children].map(row=>[row.dataset.plugin,row.open]));box.replaceChildren();
    const names={workspace:'工作区',items:'事项',overview:'总览',settings:'设置',plugins:'插件管理',...Object.fromEntries(builtinModules.map(item=>[item.id,item.name]))};
    const states={running:'运行中',disabled:'已停用',blocked:'等待依赖',error:'启动失败',waiting:'待启动',stopped:'宿主已停止'};
    for(const row of diagnostics().sort((a,b)=>(a.id==='reminders'?-1:0)-(b.id==='reminders'?-1:0))){
      const item=document.createElement('details'),heading=document.createElement('summary'),list=document.createElement('dl');item.dataset.plugin=row.id;item.open=opened.has(row.id)?opened.get(row.id):row.id==='reminders';
      heading.textContent=(names[row.id]||row.id)+' · '+row.id+' · '+(states[row.status]||row.status);
      const resources=row.resourceCounts||{},badServices=(row.requiredServices||[]).filter(s=>!s.available).map(s=>s.id+' v'+s.version+'（当前'+(s.actualVersion??'无')+'）');
      const fields=[
        ['开关期望',row.expected?'开启':'关闭'],['实际状态',states[row.status]||row.status],
        ['提供服务',(row.providedServices||[]).map(s=>s.id+' v'+s.version).join('、')||'当前未提供'],
        ['依赖情况',[...(row.missingDependencies||[]),...badServices].join('、')||'无缺失或版本冲突'],
        ['资源计数','效果 '+(resources.effects||0)+' · 服务 '+(resources.services||0)+' · 命令 '+(resources.commands||0)+' · 作用域 '+(resources.scopes||0)],
        ['最近运行时错误',row.lastError?row.lastError.at+' · '+row.lastError.phase+' · '+row.lastError.message:'无记录']
      ];
      for(const [key,value]of fields){const term=document.createElement('dt'),description=document.createElement('dd');term.textContent=key;description.textContent=value;list.append(term,description);}
      item.append(heading,list);box.append(item);
    }
  };
  const refreshDiagnostics=async()=>{
    const revision=++diagnosticRevision,visible=Boolean(isDeveloper());
    diagnosticPanel.hidden=!visible;
    if(!visible){diagnosticPanel.open=false;diagnosticPanel.querySelector('[data-diagnostic-rows]').replaceChildren();diagnosticPanel.querySelector('[data-platform-diagnostics]').textContent='';diagnosticPanel.querySelector('[data-diagnostic-status]').textContent='';refreshButton.disabled=false;return;}
    localDiagnostics();
    if(!diagnosticPanel.open||panel.hidden||!platformDiagnostics)return;
    refreshButton.disabled=true;const status=diagnosticPanel.querySelector('[data-diagnostic-status]');
    status.textContent='正在读取提醒系统同步状态…';
    try{
      const state=await platformDiagnostics();
      if(revision!==diagnosticRevision||!isDeveloper())return;
      if(!state?.ok)throw Error(state?.message||'状态读取失败');
      const phase=state.pending?'正在处理 '+state.pending+' 项请求':state.appliedEnabled===state.desiredEnabled?(state.desiredEnabled?'注册请求已处理':'暂停请求已处理'):'尚未完成同步，可通过关闭/重开或提醒页重新注册后再查看';
      diagnosticPanel.querySelector('[data-platform-diagnostics]').textContent='提醒系统同步：'+phase+(state.lastError?'。最近平台错误：'+state.lastError.at+' · '+state.lastError.message:'');
      status.textContent='读取时间：'+new Date().toLocaleTimeString();
    }catch(error){if(revision===diagnosticRevision&&isDeveloper()){status.textContent='提醒系统状态读取失败：'+error.message;diagnosticPanel.querySelector('[data-platform-diagnostics]').textContent='';}}
    finally{if(revision===diagnosticRevision)refreshButton.disabled=false;}
  };
  diagnosticPanel.addEventListener('toggle',()=>{if(diagnosticPanel.open)void refreshDiagnostics();});
  refreshButton.onclick=refreshDiagnostics;
  const refresh = () => {
    const state = readModules(storage);
    for (const item of builtinModules) {
      const input = panel.querySelector(`[data-module="${item.id}"]`), blocked = item.requires && !state.enabled[item.requires];
      input.checked = item.id === 'plans' ? isModuleEnabled(state, 'items') : state.enabled[item.id]; input.disabled = Boolean(blocked); input.indeterminate = item.id === 'plans' && state.enabled.plans !== state.enabled.tasks;
      panel.querySelector(`[data-module-status="${item.id}"]`).textContent = blocked ? '需先开启课程表' : input.indeterminate ? '部分开启' : input.checked ? '已开启' : '已关闭';
    }
    void refreshDiagnostics();
    panel.querySelector('#desktop-modules-count').textContent = `${builtinModules.filter(item => item.id === 'plans' ? isModuleEnabled(state, 'items') : isModuleEnabled(state, item.id)).length} / ${builtinModules.length} 已开启`;
  };
  panel.addEventListener('change', event => {
    const input = event.target.closest('[data-module]'); if (!input) return;
    const previous=storage.getItem(moduleKey);let wrote=false;
    try {
      beforeChange(input.dataset.module, input.checked);
      const next = setModuleEnabled(storage, input.dataset.module === 'plans' ? 'items' : input.dataset.module, input.checked);
      wrote=true;
      onChange(next); refresh();
      feedback(`${builtinModules.find(item => item.id === input.dataset.module).name}已${input.checked ? '开启' : '关闭'}。${input.checked ? '原资料可继续使用。' : '已有资料仍然保留。'}`, 'success');
    } catch (error) {
      if(wrote)try{storage.setItem(moduleKey,previous||JSON.stringify(readModules({getItem:()=>null})));onChange(readModules(storage));}catch(rollback){feedback(`恢复插件状态失败：${rollback.message}`,'error');}
      refresh(); feedback(error.message, 'error');
    }
  });
  refresh();
  return { refresh };
}
