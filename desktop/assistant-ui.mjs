import {localIntent,validateIntent,asDraft,fallbackDraft,runDraft} from './assistant-core.mjs';
export function installDesktopAssistant({bridge,execute,catalog=()=>[],context=()=>[],settingsPanel,navigateSettings=()=>{},canRemind=()=>true}) {
  const svg=body=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true">'+body+'</svg>';
  const star=svg('<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>');
  const open=document.createElement('button');open.id='desktop-assistant-open';open.type='button';open.className='desktop-assistant-open';open.innerHTML=star+'<span class="desktop-nav-label">全局助手</span>';open.title='文字、语音、图片与提醒';
  document.querySelector('.desktop-sidebar-tools').after(open);
  const dialog=document.createElement('dialog');dialog.className='desktop-assistant-dialog';dialog.id='desktop-assistant-dialog';
  dialog.innerHTML='<header><div><h2>全局助手</h2><p>说出想法，我来拟好安排。</p></div><button type="button" data-close aria-label="关闭助手">×</button></header><div class="desktop-assistant-body"><section class="assistant-compose"><label class="sr-only" for="desktop-assistant-input">输入操作要求</label><textarea id="desktop-assistant-input" rows="6" maxlength="4000" placeholder="10分钟后提醒我取快递&#10;明天下午2点到3点讨论项目&#10;记一笔：今天想到……"></textarea><div data-image-preview hidden><img alt="待发送的图片" /><button type="button" data-remove-image aria-label="移除图片">×</button></div><div class="assistant-input-tools"><button type="button" data-voice title="Windows 听写 · Win+H" aria-label="语音输入"></button><button type="button" data-image title="选择图片" aria-label="选择图片"></button><span>输入与匹配索引</span><button type="button" data-send class="primary">生成草稿</button></div><p data-status role="status" aria-live="polite"></p><section data-preview hidden><span data-action-label></span><h3 data-title></h3><p data-time></p><button type="button" class="primary" data-confirm>确认执行</button></section><details class="assistant-help"><summary>支持哪些操作？</summary><p>通过全局公共命令查询、创建、编辑、完成或归档各功能内容，也能打开设置、导入和批量编辑。先生成可编辑草稿；缺少的对象可建议新建，时间等推测会标出。删除仍需额外确认。只发送当前输入和少量相关资料（标题、编号、时间、课程配置和对象目的），不发送笔记全文或整份工作区。语音使用Windows听写；图片单独发送给你配置的视觉服务。简单倒计时本地识别，不消耗模型token。</p></details></section></div>';
  document.body.append(dialog);
  const settingsSection=document.createElement('section');settingsSection.className='desktop-settings-section assistant-settings-section';settingsSection.id='desktop-ai-settings';
  settingsSection.innerHTML='<h2>AI 与模型</h2><p data-config-status role="status"></p>';
  settingsSection.insertAdjacentHTML('beforeend',"<form data-config-form><label>DeepSeek 文本模型 · 默认 Flash-1017<input name=\"textModel\" required value=\"deepseek-flash\" /></label><label>DeepSeek 密钥<input name=\"textKey\" type=\"password\" autocomplete=\"off\" placeholder=\"留空保留已保存密钥\" /></label><label>视觉 API 地址<input type=\"url\" name=\"visionUrl\" placeholder=\"https://…/chat/completions\" /></label><label>视觉模型<input name=\"visionModel\" /></label><label>视觉密钥<input name=\"visionKey\" type=\"password\" autocomplete=\"off\" placeholder=\"留空保留\" /></label><button class=\"secondary\">保存设置</button></form><button type=\"button\" class=\"secondary\" data-clear>清除 API 配置</button><p class=\"assistant-hint\">默认使用 DeepSeek V4.1 Flash-1017（接口名称 deepseek-flash）；普通输出上限2048token，格式纠正最多一次；模型可自行更换。密钥由Windows加密保存在本机，不进入工作区导出。图片可包含个人信息，请核对后发送。</p>");
  settingsPanel.querySelector('.desktop-settings-panel').append(settingsSection);
  const settingsLink=document.createElement('button');settingsLink.type='button';settingsLink.className='secondary';settingsLink.textContent='API 与模型设置';
  settingsLink.onclick=()=>{dialog.close();navigateSettings();settingsSection.scrollIntoView({block:'start'});config.elements.textKey.focus();};
  dialog.querySelector('.assistant-compose').append(settingsLink);
  const q=selector=>dialog.querySelector(selector)||settingsSection.querySelector(selector),text=q('textarea'),config=q('[data-config-form]');
  q('[data-voice]').innerHTML=svg('<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>');
  q('[data-image]').innerHTML=svg('<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="2"/><path d="m3 17 5-5 4 4 4-6 5 7"/>');
  let intent=null,image='',busy=false,disposed=false,progress={results:[]};
  const status=message=>q('[data-status]').textContent=message;
  const configStatus=message=>q('[data-config-status]').textContent=message;
  const call=async(action,p={})=>{if(disposed)throw Error('全局助手插件已关闭');const value=await bridge.assistant(action,p);if(disposed)throw Error('全局助手插件已关闭');if(!value?.ok)throw Error(value?.message||'操作失败');return value;};
  const report=error=>status(error.message);
  const invalidate=()=>{intent=null;progress={results:[]};q('[data-preview]').hidden=true;};
  text.addEventListener('input',invalidate);
  const loadConfig=async()=>{try{const c=await call('settings-get');for(const name of ['textModel','visionUrl','visionModel'])config.elements[name].value=c[name]||'';config.elements.textKey.placeholder=c.textKeySaved?'密钥已保存；留空保留':'填入 DeepSeek 密钥';}catch(e){configStatus(e.message);}};
  open.onclick=()=>{dialog.showModal();text.focus();};
  const observer=new MutationObserver(()=>{if(!settingsPanel.hidden)loadConfig();});
  observer.observe(settingsPanel,{attributes:true,attributeFilter:['hidden']});loadConfig();
  q('[data-close]').onclick=()=>dialog.close();
  q('[data-voice]').onclick=async()=>{text.focus();try{status((await call('voice')).message);}catch(e){report(e);}};
  q('[data-image]').onclick=async()=>{try{const result=await call('image');if(result.cancelled)return;image=result.image;q('[data-image-preview]').hidden=false;q('[data-image-preview] img').src=image;invalidate();}catch(e){report(e);}};
  q('[data-remove-image]').onclick=()=>{image='';q('[data-image-preview]').hidden=true;q('[data-image-preview] img').removeAttribute('src');invalidate();};
  const stepLabels={item:'新增事项',event:'新增事件',note:'保存笔记',reminder:'安排提醒',open:'打开页面',call:'应用操作'};
  const describe=value=>{
    q('[data-action-label]').textContent='待确认 · '+value.steps.length+' 项安排';
    q('[data-title]').textContent=value.title;
    q('[data-time]').textContent='';
    let body=q('[data-draft-fields]');
    if(!body){body=document.createElement('div');body.dataset.draftFields='';q('[data-time]').before(body);}
    body.replaceChildren();
    if(value.assumptions.length){
      const box=document.createElement('div');box.className='assistant-assumptions';
      const heading=document.createElement('strong');heading.textContent='已为你补全';box.append(heading);
      const list=document.createElement('ul');
      for(const assumption of value.assumptions){const li=document.createElement('li');li.textContent=assumption;list.append(li);}
      box.append(list);body.append(box);
    }
    const labels={title:'名称 / 内容',purpose:'目的',completionCriteria:'完成标准',date:'日期',time:'开始时间',startTime:'开始时间',endTime:'结束时间',type:'类型',name:'名称',weekday:'星期（1–7）',periodStart:'开始节次',periodEnd:'结束节次',weeksText:'周次',teacher:'教师',location:'地点',totalWeeks:'总周数',startDate:'开始日期',note:'备注',goal:'目标',deadlineDate:'截止日期',deadlineTime:'截止时间',objectId:'所属对象',id:'记录',daily:'每天重复',mode:'提醒方式',view:'页面',at:'提醒时刻'};
    const choices={view:{today:'今天',courses:'课程表',plans:'事项',calendar:'日历',notes:'笔记',objects:'对象',settings:'设置'},mode:{timed:'定时提醒',silent:'静默提示',attention:'长期注意事项'}};
    value.steps.forEach((step,index)=>{
      const section=document.createElement('fieldset');section.className='assistant-draft-step';section.disabled=index<progress.results.length;
      const legend=document.createElement('legend');legend.textContent=(index<progress.results.length?'已完成 · ':'')+(index+1)+'. '+(step.title?.slice(0,60)||stepLabels[step.action]||'操作');section.append(legend);
      const grid=document.createElement('div');grid.className='assistant-draft-grid';section.append(grid);
      let count=0;
      const field=(holder,key,label=labels[key]||key)=>{
        const current=holder[key];if(current===null||current===undefined||typeof current==='object'||count++>=18)return;
        const row=document.createElement('label'),caption=document.createElement('span');caption.textContent=label;row.append(caption);
        let options=choices[key];
        if(key==='type')options=step.action==='call'&&step.name==='objects.save'?{course:'课程',project:'项目',general:'主题'}:step.name==='items.save'?{longterm:'长期事项',deadline:'截止事项',event:'事件',range:'阶段计划',weekly:'每周安排'}:null;
        const input=document.createElement(options?'select':key==='title'&&step.action==='note'?'textarea':'input');
        input.dataset.draftKey=key;
        if(options)for(const [value,text]of Object.entries(options)){const option=document.createElement('option');option.value=value;option.textContent=text;input.append(option);}
        const alias=typeof current==='string'&&/^@[0-7]\./.test(current);
        const identity=['id','containerId','objectId','kind','collection'].includes(key);
        if(input.tagName==='INPUT')input.type=typeof current==='boolean'?'checkbox':key==='at'?'datetime-local':typeof current==='number'?'number':/Date$/.test(key)||key==='date'?'date':/Time$/.test(key)||key==='time'?'time':'text';
        if(key==='at')input.value=new Date(Number(current)-new Date(current).getTimezoneOffset()*60000).toISOString().slice(0,16);
        else if(typeof current==='boolean')input.checked=current;else input.value=String(current);
        if(identity||alias){input.readOnly=true;input.title=alias?'确认后自动关联前面的新建内容':'已匹配的记录';input.value=alias?'关联第 '+(Number(current[1])+1)+' 项新建记录':context(text.value).find(row=>row.ref?.id===current)?.title||'已选记录';}
        else input.addEventListener('input',()=>{
          holder[key]=key==='at'?new Date(input.value).getTime():typeof current==='boolean'?input.checked:typeof current==='number'?Number(input.value):input.value;
          try{validateIntent(intent,progress.startedAt||Date.now());q('[data-confirm]').disabled=false;status('草稿已修改，确认后保存。');}catch(e){q('[data-confirm]').disabled=true;status(e.message);}
        });
        if(key==='title'||key==='purpose'||key==='note')row.className='assistant-draft-wide';
        row.append(input);grid.append(row);
      };
      if(step.action==='call'){
        const walk=(v,depth=0)=>{if(depth>3)return;for(const [k,child]of Object.entries(v)){if(child&&typeof child==='object')walk(child,depth+1);else field(v,k,/^\d+$/.test(k)?'参数 '+(Number(k)+1):labels[k]||k);}};
        walk(step.args);
      }else for(const key of Object.keys(step))if(key!=='action')field(step,key);
      body.append(section);
    });
    q('[data-confirm]').textContent=progress.results.length?'继续剩余安排':'确认并执行';
    q('[data-confirm]').hidden=false;q('[data-confirm]').disabled=false;q('[data-preview]').hidden=false;
  };
  const lockInput=value=>{text.disabled=value;for(const selector of ['[data-send]','[data-image]','[data-voice]','[data-remove-image]'])q(selector).disabled=value;};
  q('[data-send]').onclick=async()=>{
    if(busy)return;if(!text.value.trim()&&!image){status('写下想法，或选择图片。');text.focus();return;}
    busy=true;lockInput(true);invalidate();
    try{
      const local=canRemind()&&!image&&localIntent(text.value);
      if(local){intent=asDraft(local);status('本地草稿 · 0 token');}
      else {
        status('正在拟定安排…');
        try{const result=await call('parse',{text:text.value,image,catalog:catalog(),context:context(text.value)});intent=asDraft(result.intent);status(result.notice||((result.model||'模型')+' · '+(result.tokens===null?'用量未返回':result.tokens+' token')));}
        catch(e){intent=fallbackDraft(text.value);status(e.message+'。已保留为本地笔记草稿，可编辑或重新分析。');}
      }
      describe(intent);
    }catch(e){intent=fallbackDraft(text.value);describe(intent);status(e.message+'。已保留为本地笔记草稿，可修改后保存。');}finally{busy=false;lockInput(false);}
  };
  q('[data-confirm]').onclick=async()=>{
    if(disposed||!intent||busy)return;
    busy=true;lockInput(true);q('[data-confirm]').disabled=true;
    const current=intent;
    try{
      validateIntent(current,progress.startedAt||Date.now());
      if(current.steps.some(step=>step.action==='call'&&/\.(remove|deleteCourse|change)$/.test(step.name))&&!window.confirm('草稿含删除或状态变更，请确认已核对具体目标。'))return;
      for(const element of q('[data-draft-fields]').querySelectorAll('fieldset'))element.disabled=true;
      status('正在执行安排…');
      await runDraft(current,async step=>{
        if(disposed)throw Error('全局助手插件已关闭');
        const result=await execute(step);
        return result;
      },progress,()=>{status('已完成 '+progress.results.length+' / '+current.steps.length+' 项');});
      const outputs=progress.results.filter((result,index)=>result!==undefined&&current.steps[index].action==='call'&&/\.(list|get|detail|query|onDate|current|preferences)$/.test(current.steps[index].name));
      describe(current);q('[data-time]').textContent=outputs.length?JSON.stringify(outputs,null,2).slice(0,4000):'所有安排已完成。';
      intent=null;text.value='';image='';q('[data-image-preview]').hidden=true;q('[data-confirm]').hidden=true;status('已完成 '+current.steps.length+' 项安排');
      if(current.steps.some(step=>step.action==='open'||step.action==='call'&&/\.(open|new|edit|adjust|settings|import|batch|schedule|ai)$/.test(step.name)))dialog.close();
    }catch(e){
      describe(current);status('已完成 '+progress.results.length+' / '+current.steps.length+' 项。'+e.message+'；可以修改剩余草稿后继续。');
    }finally{busy=false;lockInput(false);q('[data-confirm]').disabled=false;}
  };
  config.onsubmit=async event=>{event.preventDefault();try{await call('settings-save',Object.fromEntries(new FormData(config)));config.elements.textKey.value='';config.elements.visionKey.value='';configStatus('API 配置已加密保存');}catch(e){configStatus(e.message);}};
  q('[data-clear]').onclick=async()=>{try{await call('settings-clear');config.reset();configStatus('API 配置已清除');}catch(e){configStatus(e.message);}};
  dialog.addEventListener('close',()=>{config.elements.textKey.value='';config.elements.visionKey.value='';open.focus();});
  return {open:()=>open.click(),openSettings:()=>settingsLink.click(),dispose:()=>{disposed=true;intent=null;image='';observer.disconnect();if(dialog.open)dialog.close();dialog.remove();settingsSection.remove();open.remove();}};
}
