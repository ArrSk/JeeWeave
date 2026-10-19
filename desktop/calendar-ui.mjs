import { today } from '../shared/packages/core/src/semester-calendar.mjs';
import { calendarPreferenceKey, normalizeCalendarPreferences, calendarRange, shiftCalendar, addDays, projectCalendar, calendarWeekLanes, timedCalendarSegments } from './calendar.mjs';
import { normalizeItem, describeItem, toggleItem } from './planning.mjs';
import { createPageMotion } from './page-motion.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const names = ['一', '二', '三', '四', '五', '六', '日'];
const keyOf = kind => `jiwei-desktop-${kind === 'task' ? 'tasks' : 'plans'}`;
const labelOf = entry => entry.type === 'deadline' ? `截止${entry.dueTime ? ` ${entry.dueTime}` : ''}` : entry.type === 'phase' ? '阶段' : entry.allDay ? '全天' : `${entry.startTime}–${entry.endTime}`;

export function createCalendarUI({ panel, storage, enabled, feedback, onEdit, onAdd, onChange }) {
  let preferences = normalizeCalendarPreferences(JSON.parse(storage.getItem(calendarPreferenceKey) || 'null'));
  let selectedDate = today(), cursor = selectedDate, selectedId = null, projection = { entries: [], floating: [] };
  const move = createPageMotion(undefined, 'desktop-calendar-view'), detailMotion = createPageMotion(undefined, 'desktop-calendar-detail');
  panel.className = 'desktop-page-panel desktop-calendar-panel'; panel.hidden = true;
  panel.innerHTML = `<div class="intro desktop-page-head"><div><h1>日历</h1><p>让执行区间与最后期限各有位置。</p></div><div class="desktop-page-actions"><button type="button" class="secondary" data-load-example="calendar" id="desktop-demo-calendar" hidden>导入示例</button><button type="button" class="secondary" data-cal-add="task">添加待办</button><button type="button" class="primary" data-cal-add="plan">添加计划</button></div></div>
    <div class="desktop-calendar-workspace"><section class="panel desktop-calendar-main" aria-label="事项日历"><header class="desktop-calendar-toolbar"><div><h2 id="desktop-calendar-heading"></h2><p id="desktop-calendar-summary" role="status" aria-live="polite"></p></div><div class="desktop-calendar-controls"><div class="desktop-view-switch" aria-label="日历视图">${[['month','月'],['week','周'],['day','日']].map(([id,title])=>`<button type="button" data-cal-view="${id}" aria-pressed="false">${title}</button>`).join('')}</div><div class="desktop-calendar-navigation"><button type="button" class="secondary icon-button" data-cal-step="-1" aria-label="上一段日期">‹</button><button type="button" class="secondary" data-cal-today>今天</button><button type="button" class="secondary icon-button" data-cal-step="1" aria-label="下一段日期">›</button><label class="sr-only" for="desktop-calendar-jump">跳转日期</label><input type="date" id="desktop-calendar-jump" /></div></div></header>
    <div class="desktop-calendar-filters" aria-label="显示内容">${[['plans','计划'],['tasks','待办'],['phases','阶段'],['completed','已完成']].map(([key,title])=>`<label><input type="checkbox" data-cal-filter="${key}" />${title}</label>`).join('')}<span><i class="cal-legend-plan"></i>执行区间 <i class="cal-legend-deadline"></i>截止</span></div>
    <div id="desktop-calendar-grid"></div><p class="desktop-calendar-footnote">${'跨日色条表示持续区间；圆点表示截止。具体时间以事项详情为准。'}</p></section>
    <aside class="desktop-calendar-aside" aria-label="所选日期与事项"><section class="panel"><h2 id="desktop-calendar-day-heading"></h2><div id="desktop-calendar-agenda"></div></section><section class="panel" id="desktop-calendar-detail"></section><section class="panel"><div class="panel-head"><h2>未安排日期</h2><span id="desktop-calendar-floating-count"></span></div><div id="desktop-calendar-floating"></div></section></aside></div>`;
  const grid = panel.querySelector('#desktop-calendar-grid'), agenda = panel.querySelector('#desktop-calendar-agenda'), detail = panel.querySelector('#desktop-calendar-detail');
  const read = kind => JSON.parse(storage.getItem(keyOf(kind)) || '[]').map(item => normalizeItem(item, kind));
  const items = () => ['plan','task'].filter(kind => enabled(kind === 'plan' ? 'plans' : 'tasks') && preferences.filters[kind === 'plan' ? 'plans' : 'tasks']).flatMap(read);
  const savePreferences = next => { storage.setItem(calendarPreferenceKey, JSON.stringify(next)); preferences = next; };
  const eventButton = (entry, attrs = '', extra = '') => `<button type="button" class="desktop-calendar-entry cal-${entry.type} cal-${entry.kind}${entry.done ? ' is-done' : ''}${entry.id === selectedId ? ' is-selected' : ''} ${extra}" data-cal-entry="${esc(entry.id)}" aria-pressed="${entry.id === selectedId}" ${attrs}><span class="desktop-calendar-entry-label">${esc(labelOf(entry))}</span><strong>${esc(entry.title)}</strong>${entry.type === 'phase' ? `<small>${esc(entry.parentTitle)}</small>` : ''}</button>`;
  const dateButton = date => `<button type="button" class="desktop-calendar-date ${date === today() ? 'is-today' : ''} ${date.slice(0,7) !== cursor.slice(0,7) ? 'is-other-month' : ''}" data-cal-date="${date}" aria-label="${date}" aria-pressed="${date === selectedDate}" ${date === today() ? 'aria-current="date"' : ''}>${Number(date.slice(8))}</button>`;
  const bars = (entries, start, count, compact=false, segments=calendarWeekLanes(entries, start, count)) => {
    const shown = compact ? segments.filter(s=>s.lane<2||s.entry.type==='deadline') : segments;
    const visibleLanes = [...new Set(shown.map(s=>s.lane))].sort((a,b)=>a-b);
    const rows = visibleLanes.length;
    return `<div class="desktop-calendar-bars" style="--cal-days:${count};grid-template-rows:repeat(${rows},auto)">${shown.map(s => eventButton(s.entry, `style="grid-column:${s.column+1}/span ${s.span};grid-row:${visibleLanes.indexOf(s.lane)+1}"`, `${s.continuesBefore ? 'continues-before' : ''} ${s.continuesAfter ? 'continues-after' : ''}`)).join('')}</div>`;
  };
  const renderGrid = range => {
    const entries = projection.entries;
    if (preferences.view === 'month') {
      grid.innerHTML = `<div class="desktop-calendar-weekdays">${names.map(n=>`<span>周${n}</span>`).join('')}</div><div class="desktop-calendar-month">${Array.from({length:6},(_,i)=>{
        const dates=range.days.slice(i*7,i*7+7), weekSegments=calendarWeekLanes(entries,range.days[i*7]);
        return `<section class="desktop-calendar-week" aria-label="${dates[0]} 至 ${dates[6]}"><div class="desktop-calendar-dates">${dates.map(date=>`<div class="${date===selectedDate?'is-selected-day':''}">${dateButton(date)}</div>`).join('')}</div>${bars(entries, dates[0],7,true,weekSegments)}<div class="desktop-calendar-more">${dates.map(date=>{const hidden=weekSegments.filter(s=>s.lane>=2&&s.entry.type!=='deadline'&&s.start<=date&&s.end>=date).length;return `<div>${hidden?`<button type="button" data-cal-date="${date}" aria-label="查看 ${date} 另外 ${hidden} 项安排">另 ${hidden} 项</button>`:''}</div>`;}).join('')}</div></section>`;
      }).join('')}</div>`;
    } else {
      const days=range.days, allDay=entries.filter(e=>e.allDay);
      grid.innerHTML = `<div class="desktop-calendar-time-scroll"><div class="desktop-calendar-time-content" style="--cal-days:${days.length}"><div class="desktop-calendar-time-head"><span>全天<br />与截止</span><div><div class="desktop-calendar-dates">${days.map((date,i)=>`<div><small>周${names[preferences.view==='day' ? (new Date(`${date}T12:00:00+08:00`).getUTCDay()+6)%7 : i]}</small>${dateButton(date)}</div>`).join('')}</div>${bars(allDay,range.start,days.length)}</div></div><div class="desktop-calendar-hours"><div class="desktop-calendar-hour-labels">${Array.from({length:24},(_,h)=>`<span style="top:${h*48}px">${String(h).padStart(2,'0')}:00</span>`).join('')}</div>${days.map(date=>`<div class="desktop-calendar-time-day ${date===selectedDate?'is-selected-day':''}" data-time-date="${date}" aria-label="${date} 的时段">${timedCalendarSegments(entries,date).map(s=>eventButton(s.entry,`style="top:${s.start*.8}px;height:${(s.displayEnd-s.start)*.8}px;left:calc(${s.lane/s.laneCount*100}% + 2px);width:calc(${100/s.laneCount}% - 4px)"`)).join('')}</div>`).join('')}</div></div></div><p class="desktop-calendar-time-note">北京时间 · 短事项按最小高度显示，准确起止时间见详情。</p>`;
    }
  };
  const renderAside = () => {
    const active = projection.entries.filter(e=>e.start<=selectedDate && e.end>=selectedDate);
    panel.querySelector('#desktop-calendar-day-heading').textContent = `${Number(selectedDate.slice(5,7))}月${Number(selectedDate.slice(8))}日`;
    agenda.innerHTML = active.length ? active.map(e=>eventButton(e)).join('') : '<p class="empty">这一天暂没有安排或截止事项。</p>';
    panel.querySelector('#desktop-calendar-floating-count').textContent=String(projection.floating.length);
    panel.querySelector('#desktop-calendar-floating').innerHTML = projection.floating.length ? projection.floating.map(item=>`<button type="button" class="desktop-calendar-floating-item" data-cal-floating="${esc(item.id)}" data-kind="${item.kind}"><span>${item.kind==='plan'?'计划':'待办'}</span><strong>${esc(item.title)}</strong></button>`).join('') : '<p class="empty">没有未安排日期的事项。</p>';
    renderDetail();
  };
  function renderDetail() {
    const entry=projection.entries.find(e=>e.id===selectedId);
    const floating=projection.floating.find(e=>JSON.stringify([e.kind,e.id,'floating'])===selectedId);
    const item=entry ? read(entry.kind).find(i=>i.id===entry.itemId) : floating;
    if(!item) { detail.innerHTML='<h2>事项详情</h2><p class="empty">选择色条或截止标记，查看完整内容、时间和阶段。</p>'; return; }
    const phases=item.phases || [];
    detail.innerHTML=`<div class="desktop-calendar-detail-type">${item.kind==='plan'?'计划':'待办'}${entry?.type==='phase'?' · 阶段':''}${item.example?' · 示例':''}</div><h2>${esc(entry?.title || item.title)}</h2>${entry?.type==='phase'?`<p>所属计划：${esc(item.title)}</p>`:''}<p class="desktop-calendar-detail-dates">${esc(describeItem(item))}</p>${entry&&!entry.allDay?`<p>北京时间 ${esc(entry.start)} ${esc(entry.startTime)} — ${esc(entry.endDate)} ${esc(entry.endTime)}</p>`:''}${item.deadline?`<p class="desktop-calendar-due">截止：${esc(item.deadline.date)} ${esc(item.deadline.time || '')}</p>`:''}${item.note?`<p class="desktop-calendar-note">${esc(item.note)}</p>`:''}${phases.length?`<h3>阶段进度</h3><div class="desktop-calendar-phase-list">${phases.map(p=>`<label><input type="checkbox" data-cal-phase="${esc(p.id)}" data-item="${esc(item.id)}" ${p.done?'checked':''} /><span>${esc(p.title)}<small>${p.startDate?`${esc(p.startDate)} — ${esc(p.endDate)}`:'未单独设日期'}</small></span></label>`).join('')}</div>`:''}<div class="desktop-button-row"><button type="button" class="secondary" data-cal-edit="${esc(item.id)}" data-kind="${item.kind}">编辑${item.kind==='plan'?'计划':'待办'}</button>${entry?.type!=='phase'&&(item.anchor.type!=='weekly'||entry?.occurrenceDate)?`<button type="button" class="secondary" data-cal-complete="${esc(item.id)}" data-kind="${item.kind}" data-occurrence="${esc(entry?.occurrenceDate || selectedDate)}">${(entry?.done ?? item.done)?'恢复未完成':'标记完成'}${item.anchor.type==='weekly'?'（本次）':''}</button>`:''}</div>`;
  }
  const refresh = ({ animate=false, direction=1, resetScroll=false }={}) => {
    const scroll=grid.querySelector('.desktop-calendar-time-scroll')?.scrollTop;
    const range=calendarRange(cursor,preferences.view);
    projection=projectCalendar(items(),range,preferences.filters);
    if(!projection.entries.some(e=>e.id===selectedId) && !projection.floating.some(e=>JSON.stringify([e.kind,e.id,'floating'])===selectedId)) selectedId=null;
    panel.querySelector('#desktop-calendar-heading').textContent=preferences.view==='month'?`${Number(cursor.slice(0,4))}年 ${Number(cursor.slice(5,7))}月`:preferences.view==='day'?cursor:`${range.start} — ${range.end}`;
    panel.querySelector('#desktop-calendar-summary').textContent=`${projection.entries.filter(e=>e.type==='schedule').length} 项安排 · ${projection.entries.filter(e=>e.type==='deadline').length} 项截止 · ${projection.entries.filter(e=>e.type==='phase').length} 个阶段`;
    panel.querySelector('#desktop-calendar-jump').value=selectedDate;
    for(const button of panel.querySelectorAll('[data-cal-view]')) { const active=button.dataset.calView===preferences.view;button.setAttribute('aria-pressed',String(active));button.classList.toggle('active',active); }
    for(const input of panel.querySelectorAll('[data-cal-filter]')) { input.checked=preferences.filters[input.dataset.calFilter]; input.disabled=['plans','tasks'].includes(input.dataset.calFilter)&&!enabled(input.dataset.calFilter); }
    for(const button of panel.querySelectorAll('[data-cal-add]')) button.hidden=!enabled(button.dataset.calAdd==='plan'?'plans':'tasks');
    renderGrid(range);renderAside();
    const timeScroll=grid.querySelector('.desktop-calendar-time-scroll');if(timeScroll) timeScroll.scrollTop=resetScroll?360:scroll ?? 360;
    if(animate)move(grid,direction);
  };
  const selectDate = (date, animate=true) => { selectedDate=date; selectedId=null; if(!calendarRange(cursor,preferences.view).days.includes(date))cursor=date;refresh();if(animate)detailMotion(agenda.parentElement); };
  panel.addEventListener('click', event=>{
    const button=event.target.closest('button'); if(!button)return;
    try {
      if(button.hasAttribute('data-cal-view')) {savePreferences({...preferences,view:button.dataset.calView});cursor=selectedDate;refresh({animate:true,resetScroll:true});}
      else if(button.hasAttribute('data-cal-step')) {const step=Number(button.dataset.calStep);cursor=shiftCalendar(cursor,step,preferences.view);selectedDate=cursor;selectedId=null;refresh({animate:true,direction:step,resetScroll:true});}
      else if(button.hasAttribute('data-cal-today')) {cursor=selectedDate=today();selectedId=null;refresh({animate:true,resetScroll:true});}
      else if(button.dataset.calDate)selectDate(button.dataset.calDate);
      else if(button.dataset.calEntry) {selectedId=button.dataset.calEntry;const entry=projection.entries.find(e=>e.id===selectedId);if(entry&&(selectedDate<entry.start||selectedDate>entry.end))selectedDate=entry.start<calendarRange(cursor,preferences.view).start?calendarRange(cursor,preferences.view).start:entry.start;renderAside();panel.querySelectorAll('[data-cal-entry]').forEach(b=>{const active=b.dataset.calEntry===selectedId;b.classList.toggle('is-selected',active);b.setAttribute('aria-pressed',String(active));});detailMotion(detail);}
      else if(button.dataset.calFloating){selectedId=JSON.stringify([button.dataset.kind,button.dataset.calFloating,'floating']);renderDetail();detailMotion(detail);}
      else if(button.dataset.calEdit)onEdit(button.dataset.kind,button.dataset.calEdit);
      else if(button.dataset.calAdd)onAdd(button.dataset.calAdd,selectedDate);
      else if(button.dataset.calComplete){const kind=button.dataset.kind,all=read(kind),item=all.find(i=>i.id===button.dataset.calComplete);if(!item)throw Error('此事项已不存在。');storage.setItem(keyOf(kind),JSON.stringify(all.map(i=>i.id===item.id?toggleItem(i,button.dataset.occurrence):i)));refresh();onChange();feedback('完成状态已更新。','success');}
    } catch(error){feedback(error.message,'error');}
  });
  panel.addEventListener('change',event=>{
    try {
      const input=event.target;
      if(input.dataset.calFilter){savePreferences({...preferences,filters:{...preferences.filters,[input.dataset.calFilter]:input.checked}});refresh({animate:true});}
      else if(input.id==='desktop-calendar-jump'&&input.value){cursor=selectedDate=input.value;selectedId=null;refresh({animate:true,resetScroll:true});}
      else if(input.dataset.calPhase){const all=read('plan'),at=new Date().toISOString();storage.setItem(keyOf('plan'),JSON.stringify(all.map(i=>i.id!==input.dataset.item?i:{...i,updatedAt:at,phases:i.phases.map(p=>p.id===input.dataset.calPhase?{...p,done:input.checked,updatedAt:at}:p)})));refresh();onChange();feedback('阶段进度已保存。','success');}
    } catch(error){refresh();feedback(error.message,'error');}
  });
  grid.addEventListener('keydown',event=>{
    const button=event.target.closest('[data-cal-date]');if(!button)return;
    const offset={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[event.key];
    if(offset==null&&!['Home','End','PageUp','PageDown'].includes(event.key))return;
    event.preventDefault();let date=button.dataset.calDate;
    if(offset!=null)date=addDays(date,offset);
    else if(event.key==='PageUp'||event.key==='PageDown')date=shiftCalendar(date,event.key==='PageUp'?-1:1,preferences.view);
    else {const week=calendarRange(date,'week');date=event.key==='Home'?week.start:week.end;}
    selectDate(date);grid.querySelector(`[data-cal-date="${date}"]`)?.focus();
  });
  return { refresh, reset:()=>{preferences=normalizeCalendarPreferences(JSON.parse(storage.getItem(calendarPreferenceKey)||'null'));cursor=selectedDate=today();selectedId=null;refresh();} };
}
