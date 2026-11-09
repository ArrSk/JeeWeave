import {designIcon} from './design-icons.mjs';
import {today} from '../shared/packages/core/src/semester-calendar.mjs';
export function parseTimeText(value) {
  const text=String(value).trim().toLowerCase();if(!text)return '';
  const m=text.match(/^(\d{1,2})(?::?(\d{2}))?\s*([ap](?:m)?)?$/);if(!m)return null;
  let h=+m[1],min=+(m[2]||0);if(m[3]){if(h<1||h>12)return null;h=h%12+(m[3][0]==='p'?12:0);}
  return h<24&&min<60?String(h).padStart(2,'0')+':'+String(min).padStart(2,'0'):null;
}
export function shiftTime(value,delta) {const parsed=parseTimeText(value)||'00:00';const [h,m]=parsed.split(':').map(Number),total=((h*60+m+delta)%1440+1440)%1440;return String(Math.floor(total/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0');}
export const shiftDate=(value,delta)=>new Date(Date.parse((value||today())+'T12:00:00Z')+delta*86400000).toISOString().slice(0,10);

// Enhancement only. Names, source input elements and business event handlers are retained.
export function installDesignInputs({bindings}) {
  const enhanced=new WeakSet(),signatures=new WeakMap(),syncers=new Map(),writing=new WeakSet(),listeners=new Map();let serial=0,disposed=false,pickerSource=null,pickerButton=null,month='',selected='';
  const listen=(el,type,fn,options)=>{el.addEventListener(type,fn,options);if(!listeners.has(el))listeners.set(el,[]);listeners.get(el).push(()=>el.removeEventListener(type,fn,options));};
  const popup=document.createElement('div');popup.id='design-field-picker';popup.className='design-popover';popup.setAttribute('popover','auto');document.body.append(popup);
  const popupClose=()=>{if(popup.matches(':popover-open'))popup.hidePopover();};
  const emit=input=>{writing.add(input);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));writing.delete(input);};
  const labelOf=input=>(input.labels?.[0]?.textContent||input.getAttribute('aria-label')||input.name||'输入内容').trim().split('\n')[0].slice(0,60);
  const place=()=>{if(!pickerSource?.isConnected){popupClose();return;}const r=pickerSource.closest('.design-field').getBoundingClientRect(),w=286;popup.style.left=Math.max(12,Math.min(r.left,innerWidth-w-12))+'px';popup.style.top=Math.max(12,Math.min(r.bottom+7,innerHeight-popup.offsetHeight-12))+'px';};
  const commitDate=date=>{const input=pickerSource;if(!input||input.disabled)return;if((input.min&&date<input.min)||(input.max&&date>input.max))return;input.value=date;emit(input);popupClose();pickerButton?.focus({preventScroll:true});};
  const calendar=()=>{
    const first=month+'-01',weekday=(new Date(first+'T12:00:00Z').getUTCDay()+6)%7,start=shiftDate(first,-weekday);
    popup.innerHTML=`<div class="design-date-header"><button type="button" data-month="-1" aria-label="上个月">${designIcon('left')}</button><strong></strong><button type="button" data-month="1" aria-label="下个月">${designIcon('right')}</button></div><div class="design-date-grid" role="grid" aria-label="选择日期">${[...'一二三四五六日'].map(x=>`<small>${x}</small>`).join('')}${Array.from({length:42},(_,i)=>{const date=shiftDate(start,i),disabled=(pickerSource.min&&date<pickerSource.min)||(pickerSource.max&&date>pickerSource.max);return `<button type="button" data-picker-date="${date}" role="gridcell" aria-label="${date}" aria-selected="${date===selected}" tabindex="${date===selected?0:-1}" ${date===today()?'aria-current="date"':''} class="${date.slice(0,7)!==month?'other-month':''}" ${disabled?'disabled':''}>${+date.slice(-2)}</button>`;}).join('')}</div><div class="design-date-shortcuts"><button type="button" data-quick-date="0">今天</button><button type="button" data-quick-date="1">明天</button><button type="button" data-friday>本周五</button></div>`;
    popup.querySelector('strong').textContent=month.replace('-','年')+'月';
  };
  const openDate=(input,button)=>{if(input.disabled||input.readOnly)return;popupClose();(input.closest('dialog[open]')||document.body).append(popup);pickerSource=input;pickerButton=button;selected=input.value||today();month=selected.slice(0,7);calendar();popup.showPopover();place();(popup.querySelector(`[data-picker-date="${selected}"]:not(:disabled)`)||popup.querySelector('[data-picker-date]:not(:disabled)'))?.focus();};
  const openTime=(input,button)=>{if(input.disabled||input.readOnly)return;popupClose();(input.closest('dialog[open]')||document.body).append(popup);pickerSource=input;pickerButton=button;const [h,m]=(input.value||'09:00').split(':');popup.innerHTML=`<strong>选择时间</strong><div class="design-time-columns"><label>时<select data-hour size="5" aria-label="小时">${Array.from({length:24},(_,i)=>`<option value="${i}" ${+h===i?'selected':''}>${String(i).padStart(2,'0')}</option>`).join('')}</select></label><label>分<select data-minute size="5" aria-label="分钟">${Array.from({length:60},(_,i)=>`<option value="${i}" ${+m===i?'selected':''}>${String(i).padStart(2,'0')}</option>`).join('')}</select></label></div><button type="button" class="primary" data-time-confirm>确认时间</button>`;popup.showPopover();place();popup.querySelector('select').focus();};
  listen(popup,'click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.month){const d=new Date(month+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+ +b.dataset.month);month=d.toISOString().slice(0,7);calendar();place();}
    if(b.dataset.pickerDate)commitDate(b.dataset.pickerDate);
    if(b.dataset.quickDate!==undefined)commitDate(shiftDate(today(),+b.dataset.quickDate));
    if(b.hasAttribute('data-friday')){const day=(new Date(today()+'T12:00:00Z').getUTCDay()+6)%7;commitDate(shiftDate(today(),(4-day+7)%7));}
    if(b.hasAttribute('data-time-confirm')){pickerSource.setCustomValidity('');pickerSource.value=String(popup.querySelector('[data-hour]').value).padStart(2,'0')+':'+String(popup.querySelector('[data-minute]').value).padStart(2,'0');emit(pickerSource);syncers.get(pickerSource)?.();markError(pickerSource);popupClose();pickerButton?.focus();}
  });
  listen(popup,'keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();popupClose();pickerButton?.focus();return;}
    if(pickerSource?.type==='time'){if(e.key==='Enter'){e.preventDefault();popup.querySelector('[data-time-confirm]').click();}return;}
    const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[e.key];
    if(delta){e.preventDefault();selected=shiftDate(e.target.dataset.pickerDate||selected,delta);month=selected.slice(0,7);calendar();popup.querySelector(`[data-picker-date="${selected}"]`)?.focus();}
    if(e.key==='Enter'&&e.target.dataset.pickerDate){e.preventDefault();commitDate(e.target.dataset.pickerDate);}
    if(e.key==='Tab')popupClose();
  });
  const markError=input=>{
    if(input.disabled||input.closest('[hidden]')||input.validity.valid){input.removeAttribute('aria-invalid');input.closest('.design-field')?.querySelector('[data-design-proxy]')?.removeAttribute('aria-invalid');const old=document.getElementById(input.dataset.designError);if(old)old.hidden=true;return;}
    const id=input.dataset.designError||'design-error-'+(++serial);input.dataset.designError=id;
    let error=document.getElementById(id);if(!error){error=document.createElement('small');error.className='design-error';error.id=id;(input.closest('.design-field')||input).after(error);}
    error.hidden=false;error.textContent=input.validationMessage;input.setAttribute('aria-invalid','true');const refs=new Set((input.getAttribute('aria-describedby')||'').split(' ').filter(Boolean));refs.add(id);input.setAttribute('aria-describedby',[...refs].join(' '));const proxy=input.closest('.design-field')?.querySelector('[data-design-proxy]');if(proxy){proxy.setAttribute('aria-invalid','true');proxy.setAttribute('aria-describedby',id);}
  };
  const enhance=input=>{
    if(enhanced.has(input)||input.closest('#design-field-picker,.design-stepper,.design-tag-chips')||input.matches('[data-design-proxy]'))return;enhanced.add(input);
    if(input.type==='hidden'||['button','submit','file','color','radio'].includes(input.type))return;
    if(input.type==='checkbox'){
      if(input.matches('[id^=desktop-module-],#desktop-developer-mode,#desktop-particles-toggle,[data-module]')){input.setAttribute('role','switch');const sync=()=>input.setAttribute('aria-checked',input.indeterminate?'mixed':String(input.checked));listen(input,'change',sync);syncers.set(input,sync);sync();}return;
    }
    const field=document.createElement('span');field.className='design-field';input.before(field);field.append(input);
    if(!input.id)input.id='design-input-'+(++serial);
    if(input.required)input.setAttribute('aria-required','true');
    const label=input.labels?.[0];let caption=label?.querySelector('.design-field-caption');
    if(label&&field.parentElement===label&&!caption){caption=document.createElement('span');caption.className='design-field-caption';while(label.firstChild&&label.firstChild!==field)caption.append(label.firstChild);label.prepend(caption);}
    const requiredFlag=document.createElement('span');requiredFlag.className='design-required';requiredFlag.textContent=' *';requiredFlag.setAttribute('aria-hidden','true');requiredFlag.hidden=!input.required;caption?.append(requiredFlag);
    const baseSync=()=>{if(input.required)input.setAttribute('aria-required','true');else input.removeAttribute('aria-required');if(requiredFlag.hidden===input.required)requiredFlag.hidden=!input.required;};
    listen(input,'blur',()=>{if(!input.matches('[data-composing]'))markError(input);});
    if(input.type==='number'){
      field.classList.add('design-number');const steps=document.createElement('span');steps.className='design-stepper';steps.innerHTML=`<button type="button" data-step="1" tabindex="-1" aria-label="增加">${designIcon('left',12)}</button><button type="button" data-step="-1" tabindex="-1" aria-label="减少">${designIcon('right',12)}</button>`;field.append(steps);
      const step=n=>{try{n>0?input.stepUp(n):input.stepDown(-n);emit(input);}catch{markError(input);}};listen(steps,'click',e=>{const b=e.target.closest('[data-step]');if(b&&!input.disabled&&!input.readOnly){step(+b.dataset.step);input.focus();}});
      listen(input,'keydown',e=>{if(['ArrowUp','ArrowDown','PageUp','PageDown'].includes(e.key)){e.preventDefault();step((e.key.endsWith('Up')?1:-1)*(e.shiftKey||e.key.startsWith('Page')?10:1));}});
      syncers.set(input,()=>{baseSync();steps.querySelectorAll('button').forEach(b=>b.disabled=input.disabled||input.readOnly);});
    }else if(input.type==='date'||input.type==='time'){
      const b=document.createElement('button');b.type='button';b.className='design-picker-button';b.dataset.picker=input.type;b.innerHTML=designIcon(input.type==='date'?'calendar':'clock');b.setAttribute('aria-label','选择'+(input.type==='date'?'日期':'时间'));field.append(b);
      listen(b,'click',()=>input.type==='date'?openDate(input,b):openTime(input,b));
      if(input.type==='date'){listen(input,'keydown',e=>{if(e.key==='Enter'){e.preventDefault();openDate(input,b);}});syncers.set(input,()=>{baseSync();b.disabled=input.disabled||input.readOnly;});}
      else{
        const proxy=document.createElement('input');proxy.type='text';proxy.inputMode='text';proxy.dataset.designProxy='time';proxy.placeholder='09:30';proxy.setAttribute('aria-label',labelOf(input));field.insertBefore(proxy,input);input.classList.add('design-native-source');input.tabIndex=-1;input.setAttribute('aria-hidden','true');
        const sync=()=>{baseSync();proxy.disabled=input.disabled;proxy.readOnly=input.readOnly;proxy.value=input.value;proxy.setAttribute('aria-required',String(input.required));b.disabled=input.disabled||input.readOnly;};syncers.set(input,sync);sync();
        const commit=()=>{const parsed=parseTimeText(proxy.value);input.setCustomValidity(parsed===null?'请输入有效时间，例如 0930、09:30 或 9p。':'');if(parsed!==null){input.value=parsed;emit(input);}};
        listen(proxy,'input',e=>{if(!e.isComposing)commit();});listen(proxy,'compositionend',commit);listen(proxy,'blur',()=>{commit();if(input.validity.valid)proxy.value=input.value;markError(input);});
        listen(proxy,'keydown',e=>{if(e.isComposing)return;if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();proxy.value=shiftTime(proxy.value,(e.key==='ArrowUp'?1:-1)*(e.shiftKey?60:15));commit();}if(e.key==='Enter'){e.preventDefault();commit();openTime(input,b);}});
        listen(input,'focus',()=>proxy.focus());listen(input,'input',()=>{if(!writing.has(input))sync();});
      }
    }else if(input.matches('input[name=tags]')){
      const proxy=document.createElement('input');proxy.type='text';proxy.dataset.designProxy='tags';proxy.setAttribute('aria-label',labelOf(input));proxy.placeholder='输入标签，空格或回车确认';field.prepend(proxy);input.classList.add('design-native-source');input.tabIndex=-1;input.setAttribute('aria-hidden','true');
      const chips=document.createElement('span');chips.className='design-tag-chips';field.before(chips);
      const values=()=>[...new Set(input.value.split(/[\s,，#]+/).filter(Boolean))];
      const render=()=>{chips.replaceChildren();values().forEach((tag,i)=>{const button=document.createElement('button');button.type='button';button.setAttribute('aria-label','移除标签 '+tag);button.dataset.tagIndex=String(i);button.textContent=tag;button.insertAdjacentHTML('beforeend',designIcon('close',14));chips.append(button);});};
      const commit=()=>{const next=[...new Set([...values(),...proxy.value.split(/[\s,，#]+/).filter(Boolean)])];input.value=next.join(' ');proxy.value='';render();emit(input);};
      listen(proxy,'keydown',e=>{if(e.isComposing)return;if(['Enter',',','，',' '].includes(e.key)){e.preventDefault();commit();}if(e.key==='Backspace'&&!proxy.value){input.value=values().slice(0,-1).join(' ');render();emit(input);}if(e.key==='ArrowLeft'&&!proxy.value)chips.lastElementChild?.focus();});
      listen(proxy,'blur',commit);listen(chips,'click',e=>{const b=e.target.closest('[data-tag-index]');if(!b)return;input.value=values().filter((_,i)=>i!==+b.dataset.tagIndex).join(' ');render();emit(input);proxy.focus();});listen(chips,'keydown',e=>{if(e.key==='Delete')e.target.closest('button')?.click();});
      const sync=()=>{baseSync();proxy.disabled=input.disabled;render();};syncers.set(input,sync);sync();listen(input,'input',()=>{if(!writing.has(input))sync();});listen(input,'focus',()=>proxy.focus());
    }else{
      syncers.set(input,baseSync);
      if(input instanceof HTMLTextAreaElement&&input.maxLength>0){const counter=document.createElement('small');counter.className='design-counter';counter.hidden=true;field.after(counter);listen(input,'input',()=>{counter.hidden=input.value.length<=input.maxLength*.25;counter.textContent=input.value.length+' / '+input.maxLength;});}
    }
  };
  const weekdays=root=>root.querySelectorAll?.('.desktop-weekday-choices:not([data-design-weekdays])').forEach(group=>{
    group.dataset.designWeekdays='';const sources=[...group.querySelectorAll('input[type=checkbox]')];if(!sources.length)return;
    const buttons=document.createElement('span');buttons.className='design-weekday-buttons';buttons.setAttribute('role','group');buttons.setAttribute('aria-label','每周重复的星期');const help=document.createElement('small');help.className='design-weekday-help';
    sources.forEach((input,i)=>{input.closest('label').classList.add('design-weekday-source');const b=document.createElement('button');b.type='button';b.textContent='周'+[...'一二三四五六日'][i];b.dataset.weekdayIndex=String(i);b.tabIndex=i===0?0:-1;buttons.append(b);});group.append(buttons,help);
    const sync=()=>{sources.forEach((input,i)=>{buttons.children[i].setAttribute('aria-pressed',String(input.checked));buttons.children[i].disabled=input.disabled;});help.textContent='已选 '+sources.filter(i=>i.checked).length+' 天';};sources.forEach(input=>syncers.set(input,sync));
    listen(buttons,'click',e=>{const b=e.target.closest('button');if(!b)return;const input=sources[+b.dataset.weekdayIndex];input.checked=!input.checked;sync();emit(input);});
    listen(buttons,'keydown',e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const i=(+e.target.dataset.weekdayIndex+(e.key==='ArrowRight'?1:6))%7;[...buttons.children].forEach((b,n)=>b.tabIndex=n===i?0:-1);buttons.children[i].focus();});sync();
  });
  const scan=root=>{if(disposed||!root.querySelectorAll||root.closest?.('.design-page-snapshot,.design-overlay-snapshot'))return;if(root.matches?.('input,select,textarea'))enhance(root);root.querySelectorAll('input,select,textarea').forEach(enhance);weekdays(root);};
  const syncAll=()=>{for(const [el,cleanups]of listeners)if(el.nodeType===1&&!el.isConnected){cleanups.forEach(fn=>fn());listeners.delete(el);}for(const [input,sync]of syncers){if(!input.isConnected){syncers.delete(input);continue;}const signature=JSON.stringify([input.value,input.checked,input.disabled,input.required,input.readOnly,input.indeterminate]);if(signatures.get(input)!==signature&&!writing.has(input)&&document.activeElement!==input.closest('.design-field')?.querySelector('[data-design-proxy]')){signatures.set(input,signature);sync();}}if(pickerSource&&(!pickerSource.isConnected||pickerSource.disabled||pickerSource.closest('[hidden]')))popupClose();};
  const observer=new MutationObserver(records=>{for(const r of records)if(r.type==='childList')r.addedNodes.forEach(n=>{if(n.nodeType===1&&!n.closest?.('#design-field-picker'))scan(n);});syncAll();});
  scan(document.body);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','disabled','required']});
  listen(document,'compositionstart',e=>{if(e.target.matches('input,textarea'))e.target.dataset.composing='';});listen(document,'compositionend',e=>delete e.target.dataset.composing);
  listen(document,'invalid',e=>{if(!e.target.matches('input,select,textarea'))return;e.preventDefault();markError(e.target);const form=e.target.form;if(!form)return;const invalid=[...form.elements].filter(i=>i.willValidate&&!i.validity.valid);if(invalid[0]!==e.target)return;queueMicrotask(()=>{for(let p=e.target.parentElement;p;p=p.parentElement)if(p instanceof HTMLDetailsElement)p.open=true;const target=e.target.closest('.design-field')?.querySelector('[data-design-proxy]')||e.target;target.focus();target.scrollIntoView({block:'nearest'});});if(form.querySelectorAll('input,select,textarea').length>=6){let summary=form.querySelector('.design-validation-summary');if(!summary){summary=document.createElement('div');summary.className='design-validation-summary';summary.setAttribute('role','alert');summary.tabIndex=-1;form.prepend(summary);}summary.replaceChildren();invalid.forEach(input=>{const b=document.createElement('button');b.type='button';b.textContent=labelOf(input)+'：'+input.validationMessage;b.onclick=()=>input.focus();summary.append(b);});}},true);
  listen(document,'reset',e=>{queueMicrotask(()=>{e.target.querySelectorAll('input,select,textarea').forEach(i=>{i.removeAttribute('aria-invalid');i.setCustomValidity('');});e.target.querySelectorAll('.design-error').forEach(i=>i.hidden=true);e.target.querySelector('.design-validation-summary')?.remove();syncAll();});});
  listen(window,'resize',()=>{if(popup.matches(':popover-open'))place();});
  bindings.onStop(()=>{disposed=true;observer.disconnect();for(const cleanups of listeners.values())cleanups.forEach(fn=>fn());listeners.clear();syncers.clear();popup.remove();});
  return {sync:syncAll};
}
