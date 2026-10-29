import {localIntent,validateIntent,intentRequest} from './assistant-core.mjs';
export function installAssistant(native) {
  const request=(action,payload={})=>window.jeeWeaveDesktop.assistantRequest(action,payload);
  const icon=(path)=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">'+path+'</svg>';
  const button=document.createElement('button');button.type='button';button.id='mobile-assistant';button.ariaLabel='语音、图片与智能操作';
  button.innerHTML=icon('<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>');
  document.querySelector('.mobile-topbar').insertBefore(button,document.querySelector('#mobile-search'));
  const dialog=document.createElement('dialog');dialog.className='mobile-assistant-sheet';
  dialog.innerHTML='<form method="dialog" class="panel-head"><h2>帮我记下</h2><button aria-label="关闭助手">×</button></form><div class="assistant-content"><label class="sr-only" for="assistant-text">输入要求</label><textarea id="assistant-text" placeholder="说点什么，或拍下要做的事…" maxlength="4000" rows="4"></textarea><div class="assistant-tools"><button type="button" data-voice aria-label="语音输入"></button><button type="button" data-image aria-label="选择图片"></button><span data-image-state></span><button type="button" data-send aria-label="分析并预览操作"></button></div><p role="status" data-status></p><section data-preview hidden><p data-description></p><button type="button" class="primary" data-confirm>确认执行</button></section><details><summary>提醒</summary><p>短时提醒需准点权限；每日提醒可能受省电策略延后。系统强行停止后请重新打开应用。</p><form data-reminder><label>内容<input name="title" required maxlength="160" placeholder="带钥匙、关火、取快递…" /></label><label>提醒时间<input name="at" type="datetime-local" required /></label><label><input name="daily" type="checkbox" />每天这个时间</label><button class="primary">添加提醒</button></form><button type="button" data-permission>允许通知 / 准点提醒</button><ul data-reminders></ul></details><details><summary>API 设置</summary><p>只发送本次输入及所选图片。密钥只保存在此设备。</p><form data-settings><label>DeepSeek 模型<input name="textModel" value="deepseek-flash" required /></label><label>DeepSeek 密钥<input name="textKey" type="password" autocomplete="off" placeholder="留空保留已保存密钥" /></label><label>视觉 API 地址<input name="visionUrl" type="url" placeholder="https://…/chat/completions" /></label><label>视觉模型<input name="visionModel" /></label><label>视觉密钥<input name="visionKey" type="password" autocomplete="off" placeholder="留空保留" /></label><button class="primary">保存设置</button></form><button type="button" data-clear>清除 API 密钥</button></details></div>';
  document.body.append(dialog);
  dialog.querySelector('[data-voice]').innerHTML=icon('<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>');
  dialog.querySelector('[data-image]').innerHTML=icon('<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="2"/><path d="m3 17 5-5 4 4 4-6 5 7"/>');
  dialog.querySelector('[data-send]').innerHTML=icon('<path d="M12 20V4m-7 7 7-7 7 7"/>');
  const text=dialog.querySelector('textarea'),status=dialog.querySelector('[data-status]'),preview=dialog.querySelector('[data-preview]'),settings=dialog.querySelector('[data-settings]');
  let image='',intent=null,busy=false;
  const fail=error=>{status.textContent=error.message;};
  const run=async(action,p={})=>{const result=await request(action,p);if(!result.ok)throw Error(result.message||'操作失败');return result;};
  async function reminders(){const result=await run('reminders-list');const list=dialog.querySelector('[data-reminders]');list.replaceChildren();for(const row of result.rows){const li=document.createElement('li');li.textContent=row.title+' · '+new Date(row.at).toLocaleString()+(row.daily?' · 每天':'');const remove=document.createElement('button');remove.textContent='取消';remove.onclick=async()=>{try{await run('reminder-cancel',{id:row.id});await reminders();}catch(e){fail(e);}};li.append(remove);list.append(li);}}
  button.onclick=async()=>{dialog.showModal();text.focus();if(!native){status.textContent='电脑可体验面板；API、语音及系统提醒请使用更新后的 Android 安装版。';return;}try{const result=await run('assistant-settings-get');settings.elements.textModel.value=result.textModel;settings.elements.visionUrl.value=result.visionUrl;settings.elements.visionModel.value=result.visionModel;await reminders();}catch(e){fail(e);}};
  text.oninput=()=>{intent=null;preview.hidden=true;};
  dialog.querySelector('[data-voice]').onclick=async()=>{try{const result=await run('assistant-voice');if(!result.cancelled){text.value+=(text.value?'\n':'')+result.text;text.oninput();}}catch(e){fail(e);}};
  dialog.querySelector('[data-image]').onclick=async()=>{try{const result=await run('assistant-image');if(!result.cancelled){image=result.image;dialog.querySelector('[data-image-state]').textContent='图片已选 · 点击移除';text.oninput();}}catch(e){fail(e);}};
  dialog.querySelector('[data-image-state]').onclick=()=>{image='';dialog.querySelector('[data-image-state]').textContent='';text.oninput();};
  dialog.querySelector('[data-send]').onclick=async()=>{
    if(busy)return;busy=true;intent=null;preview.hidden=true;dialog.querySelector('[data-send]').disabled=true;
    try{
      intent=!image&&localIntent(text.value);
      if(!intent){status.textContent='正在分析…';const result=await run('assistant-parse',{request:intentRequest(text.value,image),vision:Boolean(image)});intent=validateIntent(JSON.parse(result.content));status.textContent='本次 '+(result.tokens??'未知')+' token';}
      else status.textContent='本地识别 · 0 token';
      dialog.querySelector('[data-description]').textContent=intent.action==='open'?'打开 '+({today:'今天',courses:'课表',plans:'事项',calendar:'日历',notes:'笔记',objects:'对象',settings:'设置'}[intent.view]):intent.action==='reminder'?intent.title+'\n'+new Date(intent.at).toLocaleString()+(intent.daily?' · 每天':''):({item:'新增事项：',event:'新增事件：',note:'保存笔记：',ask:''}[intent.action]||'')+intent.title+(intent.date?'\n'+intent.date+' '+intent.time+(intent.endTime?' — '+intent.endTime:''):'');preview.hidden=false;dialog.querySelector('[data-confirm]').hidden=intent.action==='ask';
    }catch(e){fail(e);}finally{busy=false;dialog.querySelector('[data-send]').disabled=false;}
  };
  dialog.querySelector('[data-confirm]').onclick=async()=>{
    if(!intent||busy)return;busy=true;dialog.querySelector('[data-confirm]').disabled=true;
    try{const current=validateIntent(intent);if(current.action==='reminder'){await run('reminder-add',current);await reminders();}else await window.jeeWeaveAssistantActions(current);
      if(current.action==='open')dialog.close();intent=null;preview.hidden=true;status.textContent='已完成';image='';text.value='';dialog.querySelector('[data-image-state]').textContent='';
    }catch(e){fail(e);}finally{busy=false;dialog.querySelector('[data-confirm]').disabled=false;}
  };
  settings.onsubmit=async e=>{e.preventDefault();try{await run('assistant-settings-save',Object.fromEntries(new FormData(settings)));settings.elements.textKey.value='';settings.elements.visionKey.value='';status.textContent='设置已保存';}catch(error){fail(error);}};
  dialog.querySelector('[data-clear]').onclick=async()=>{try{await run('assistant-settings-clear');status.textContent='密钥已清除';}catch(e){fail(e);}};
  dialog.querySelector('[data-permission]').onclick=async()=>{try{const result=await run('reminder-permission');status.textContent=result.message;}catch(e){fail(e);}};
  dialog.querySelector('[data-reminder]').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget;try{await run('reminder-add',validateIntent({action:'reminder',title:form.elements.title.value,at:new Date(form.elements.at.value).getTime(),daily:form.elements.daily.checked}));form.reset();await reminders();status.textContent='提醒已安排';}catch(error){fail(error);}};
}
