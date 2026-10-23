import { availableModules as builtinModules, readModules, setModuleEnabled, isModuleEnabled, moduleKey } from './modules.mjs';

export function createModulesUI({ panel, storage, feedback, onChange, beforeChange = () => {} }) {
  panel.innerHTML = `<div class="intro desktop-page-head"><div><h1 style="font-size:24px">插件管理</h1><p>按需开启内置功能，关闭会收起入口，已有资料会保留。</p></div></div><section class="panel desktop-modules-panel"><div class="panel-head"><div><h2>内置功能</h2><p>设置、总览与插件管理始终保留。</p></div><span id="desktop-modules-count" role="status"></span></div><div class="desktop-module-list">${builtinModules.map(item => `<label class="desktop-module-row" for="desktop-module-${item.id}"><span><strong>${item.name}</strong><small>${item.description}</small></span><span class="desktop-module-control"><span data-module-status="${item.id}"></span><input id="desktop-module-${item.id}" type="checkbox" role="switch" data-module="${item.id}" aria-label="启用${item.name}" /></span></label>`).join('')}</div><p class="desktop-module-note">功能开关会随本地 data 保存。重新开启后可继续使用原资料。</p></section><section class="panel desktop-unavailable-modules"><h2>尚未实现</h2><p>记账、外部 AI 和第三方插件安装尚未实现，暂不可开启。</p></section>`;
  const refresh = () => {
    const state = readModules(storage);
    for (const item of builtinModules) {
      const input = panel.querySelector(`[data-module="${item.id}"]`), blocked = item.requires && !state.enabled[item.requires];
      input.checked = item.id === 'plans' ? isModuleEnabled(state, 'items') : state.enabled[item.id]; input.disabled = Boolean(blocked); input.indeterminate = item.id === 'plans' && state.enabled.plans !== state.enabled.tasks;
      panel.querySelector(`[data-module-status="${item.id}"]`).textContent = blocked ? '需先开启课程表' : input.indeterminate ? '部分开启' : input.checked ? '已开启' : '已关闭';
    }
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
