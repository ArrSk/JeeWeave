import {validateReminder,remindersForDay} from './reminder-core.mjs';
export function installReminderUI({bridge,todayPanel,navigateReminders=()=>{},registerPage=()=>()=>{}}){
  const svg=body=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true">'+body+'</svg>';
  const reminderDialog=document.createElement('dialog');reminderDialog.id='desktop-reminder-dialog';reminderDialog.className='desktop-assistant-dialog desktop-reminder-dialog';
  reminderDialog.innerHTML='<header><h2>添加提醒</h2><button type="button" data-reminder-close aria-label="关闭提醒">×</button></header><div class="standalone-reminders"><p data-reminder-status role="status"></p></div>';
  reminderDialog.querySelector('.standalone-reminders').insertAdjacentHTML('beforeend',"<div data-reminder-panel><form data-reminder-form><label>记得什么<input name=\"title\" required maxlength=\"160\" placeholder=\"带钥匙、取快递、关火…\" /></label><label>什么时候<input name=\"at\" type=\"datetime-local\" required /></label><label class=\"assistant-check\"><input type=\"checkbox\" name=\"daily\" />每天这个时间</label><button type=\"submit\" class=\"secondary\">添加提醒</button></form><button type=\"button\" class=\"secondary\" data-repair>重新注册提醒</button><p class=\"assistant-hint\">交给Windows任务计划，退出几微后仍可触发。需保持电脑开机并登录；休眠或系统策略可能延迟。提醒窗口30秒后自动关闭。</p></div>");
  document.body.append(reminderDialog);
  const reminderOpen=document.createElement('button');reminderOpen.type='button';reminderOpen.id='desktop-reminders-open';reminderOpen.className='';
  reminderOpen.innerHTML=svg('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>')+'<span class="desktop-nav-label">提醒</span>';document.querySelector('.nav [data-view="calendar"]').after(reminderOpen);
  const reminderPage=document.createElement('section');reminderPage.id='desktop-reminders-page';reminderPage.className='desktop-page-panel';reminderPage.hidden=true;
  reminderPage.innerHTML='<div class="intro desktop-page-head"><div><h1>提醒</h1><p>定时通知、今日静默提示，以及需要长期留意的事。</p></div><button type="button" class="primary" data-add-reminder>添加提醒</button></div><section class="panel"><div class="panel-head reminder-page-filters"><div class="desktop-view-switch" data-reminder-filters aria-label="提醒类型"></div><span data-reminder-count></span></div><p data-page-reminder-status role="status"></p><div class="desktop-list" data-reminders></div></section><details class="reminder-page-help"><summary>定时通知说明</summary></details>';
  reminderPage.querySelector('.reminder-page-help').append(reminderDialog.querySelector('[data-repair]'),reminderDialog.querySelector('.assistant-hint'));
  reminderOpen.querySelector('svg').classList.add('desktop-icon');
  const unregisterPage=registerPage(reminderPage,reminderOpen);
  const editorForm=reminderDialog.querySelector('[data-reminder-form]');
  const typeLabel=document.createElement('label');typeLabel.textContent='类型';
  const type=document.createElement('select');type.name='mode';
  for(const [value,label]of [['timed','定时提醒'],['silent','静默提示'],['attention','长期注意事项']])type.add(new Option(label,value));
  typeLabel.append(type);editorForm.prepend(typeLabel);editorForm.querySelector('[type=submit]').className='primary';
  const dayLabel=document.createElement('label');dayLabel.textContent='显示日期';
  const dayInput=document.createElement('input');dayInput.type='date';dayInput.name='date';dayLabel.append(dayInput);editorForm.elements.at.closest('label').after(dayLabel);
  const emptyDate=()=>new Date().toLocaleDateString('sv-SE');
  dayInput.value=emptyDate();
  let filter='all',cachedRows=[];

  const q=selector=>reminderDialog.querySelector(selector)||reminderPage.querySelector(selector);
  let disposed=false;
  const reminderStatus=message=>{q('[data-reminder-status]').textContent=message;q('[data-page-reminder-status]').textContent=message;};
  const report=error=>reminderStatus(error.message);
  const call=async(action,p={})=>{if(disposed)throw Error('提醒插件已关闭');const value=await bridge.assistant(action,p);if(disposed)throw Error('提醒插件已关闭');if(!value?.ok)throw Error(value?.message||'操作失败');return value;};
  const todaySection=document.createElement('section');todaySection.className='panel desktop-today-reminders';todaySection.id='desktop-today-reminders';
  todaySection.innerHTML='<div class="panel-head"><h2>今日提醒</h2><button type="button" class="secondary">添加提醒</button></div><div data-today-reminders></div>';
  todayPanel.append(todaySection);

  const modeLabel=mode=>({timed:'定时提醒',silent:'静默提示',attention:'长期注意事项'}[mode||'timed']);
  function renderList(){
    const box=q('[data-reminders]');box.replaceChildren();
    const rows=cachedRows.filter(row=>filter==='archived'?row.archived:!row.archived&&(filter==='all'||(row.mode||'timed')===filter));
    q('[data-reminder-count]').textContent=rows.length+' 条';
    for(const row of rows){
      const line=document.createElement('article');line.className='desktop-list-item';const body=document.createElement('div'),title=document.createElement('strong'),when=document.createElement('small'),actions=document.createElement('div');actions.className='desktop-button-row';
      title.textContent=row.title;
      when.textContent=modeLabel(row.mode)+(row.archived?' · 已处理':row.mode==='attention'?' · 持续显示':row.mode==='silent'?' · '+row.date:row.delivered?' · 已提醒':row.daily?' · 每天 '+new Date(row.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):' · '+new Date(row.at).toLocaleString());
      body.append(title,when);
      if(row.mode==='silent'||row.mode==='attention'){
        const done=document.createElement('button');done.type='button';done.className='secondary';done.textContent=row.archived?'恢复':'已处理';
        done.onclick=async()=>{done.disabled=true;try{await call('reminder-state',{id:row.id,archived:!row.archived});await list();}catch(e){reminderStatus(e.message);done.disabled=false;}};actions.append(done);
      }
      const remove=document.createElement('button');remove.type='button';remove.className='secondary';remove.textContent=!row.mode||row.mode==='timed'?'取消':'移除';
      remove.onclick=async()=>{remove.disabled=true;try{await call('reminder-cancel',{id:row.id});await list();}catch(e){reminderStatus(e.message);remove.disabled=false;}};
      actions.append(remove);line.append(body,actions);box.append(line);
    }
    if(!rows.length){const empty=document.createElement('p');empty.className='empty';empty.textContent='这里还没有提醒';box.append(empty);}
    for(const button of q('[data-reminder-filters]').querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.filter===filter));
  }
  async function list(){const result=await call('reminders-list');cachedRows=result.rows;renderTodayReminders(cachedRows);renderList();}
  for(const [value,label]of [['all','全部'],['timed','定时'],['silent','静默'],['attention','长期注意'],['archived','已处理']]){
    const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.filter=value;button.onclick=()=>{filter=value;renderList();};q('[data-reminder-filters]').append(button);
  }
  const openReminders=async()=>{reminderDialog.showModal();q('[data-reminder-form]').elements.title.focus();try{await list();}catch(e){reminderStatus(e.message);}};
  reminderOpen.onclick=()=>{navigateReminders();list().catch(report);};
  q('[data-add-reminder]').onclick=openReminders;
  todaySection.querySelector('button').onclick=openReminders;
  q('[data-reminder-close]').onclick=()=>reminderDialog.close();
  const shortcuts=document.createElement('div');shortcuts.className='reminder-shortcuts';
  for(const minutes of [5,15,30]){const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent=minutes+'分钟后';b.onclick=()=>{const d=new Date(Date.now()+minutes*60000);const local=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);q('[data-reminder-form]').elements.at.value=local;q('[data-reminder-form]').elements.title.focus();};shortcuts.append(b);}
  const later=document.createElement('button');later.type='button';later.className='secondary';later.textContent='今天几点';later.onclick=()=>{const f=q('[data-reminder-form]').elements.at;const d=new Date();d.setHours(Math.min(23,d.getHours()+1),d.getHours()===23?59:0,0,0);f.value=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);f.focus();f.showPicker?.();};shortcuts.append(later);
  q('[data-reminder-form]').before(shortcuts);
  const syncMode=()=>{const mode=type.value;editorForm.elements.at.closest('label').hidden=mode!=='timed';editorForm.elements.at.required=mode==='timed';dayLabel.hidden=mode!=='silent';dayInput.required=mode==='silent';editorForm.elements.daily.closest('label').hidden=mode!=='timed';if(mode!=='timed')editorForm.elements.daily.checked=false;shortcuts.hidden=mode!=='timed';};
  type.onchange=syncMode;syncMode();

  const todayFolds=new Map();
  function renderTodayReminders(rows){
    const box=todaySection.querySelector('[data-today-reminders]');box.replaceChildren();const entries=remindersForDay(rows);
    for(const mode of ['timed','silent','attention']){
      const records=entries.filter(entry=>(entry.mode||'timed')===mode);if(!records.length)continue;
      const group=document.createElement('details');group.className='desktop-today-group';group.open=todayFolds.get(mode)??true;
      const heading=document.createElement('summary');heading.textContent=modeLabel(mode)+' · '+records.length;group.append(heading);group.addEventListener('toggle',()=>todayFolds.set(mode,group.open));
      for(const entry of records){const line=document.createElement('article');line.className='desktop-list-item';const time=document.createElement('small'),title=document.createElement('strong'),action=document.createElement('button'),body=document.createElement('div');
        time.textContent=mode==='attention'?'持续留意':mode==='silent'?'今天 · 静默显示':new Date(entry.todayAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})+(entry.delivered?' · 已提醒':entry.todayAt<Date.now()?' · 待投递':'')+(entry.daily?' · 每天':'');
        title.textContent=entry.title;body.append(title,time);action.className='secondary';action.type='button';action.textContent=mode==='timed'?'管理':'已处理';
        action.onclick=mode==='timed'?()=>{navigateReminders();list().catch(report);}:async()=>{try{await call('reminder-state',{id:entry.id,archived:true});await list();}catch(e){reminderStatus(e.message);}};
        line.append(body,action);group.append(line);
      }box.append(group);
    }
    if(!entries.length){const empty=document.createElement('p');empty.className='empty';empty.textContent='今天没有提醒或注意事项';box.append(empty);}
  }
  const refresh=()=>list().catch(error=>{reminderStatus(error.message);if(!todayPanel.hidden){const box=todaySection.querySelector('[data-today-reminders]');box.textContent='提醒读取失败：'+error.message;}});
  const observer=new MutationObserver(()=>{if(!todayPanel.hidden||!reminderPage.hidden)refresh();});
  observer.observe(reminderPage,{attributes:true,attributeFilter:['hidden']});
  observer.observe(todayPanel,{attributes:true,attributeFilter:['hidden']});
  const interval=setInterval(()=>{if(!todayPanel.hidden||!reminderPage.hidden||reminderDialog.open)refresh();},15000);
  refresh();
  q('[data-reminder-form]').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget;try{const value=validateReminder({action:'reminder',mode:type.value,title:form.elements.title.value,date:dayInput.value,at:type.value==='timed'?new Date(form.elements.at.value).getTime():undefined,daily:form.elements.daily.checked});await call('reminder-add',value);form.reset();dayInput.value=emptyDate();syncMode();await list();reminderDialog.close();reminderStatus('已保存');}catch(e){reminderStatus(e.message);}};
  q('[data-repair]').onclick=async()=>{try{const result=await call('reminder-repair');reminderStatus('已重新注册 '+result.count+' 条提醒');await list();}catch(e){reminderStatus(e.message);}};

  return {refresh,open:openReminders,dispose:()=>{disposed=true;clearInterval(interval);observer.disconnect();if(reminderDialog.open)reminderDialog.close();unregisterPage?.();reminderDialog.remove();reminderPage.remove();todaySection.remove();reminderOpen.remove();}};
}
