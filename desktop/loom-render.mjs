import { today } from '../shared/packages/core/src/semester-calendar.mjs';
import { courseTimes } from './course-occurrences.mjs';
import { completionDatesOnDate, deadlineOf, itemTimeParts } from './planning.mjs';
import { escapeHtml as esc } from './ui-text.mjs';

export const loomWindowStart = nowMin => nowMin > 300 ? 360 : 0;
export const loomY = (minute, nowMin, hour = 88) => (minute - loomWindowStart(nowMin)) * hour / 60;
const minuteOf = time => /^\d{2}:\d{2}$/.test(time || '') ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : null;
const hm = minute => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

// “此刻之后还有多久 / 接下来是什么”——页头的先兆句就靠这三个数。
export function loomOmen(rows, nowMin) {
  const next = rows.find(row => row.at !== null && row.at !== undefined && row.at >= nowMin);
  if (!next) return { html: `现在 <b>${hm(nowMin)}</b> · 今天余下的都走完了`, quiet: true };
  const gap = next.at - nowMin;
  if (gap <= 0) return { html: `现在 <b>${hm(nowMin)}</b> · 正在 <em>${esc(next.title)}</em>`, quiet: false };
  if (gap <= 60) return { html: `现在 <b>${hm(nowMin)}</b> · <em>${esc(next.title)}</em> 还有 <b>${gap}</b> 分钟`, quiet: false };
  const h = Math.floor(gap / 60), m = gap % 60;
  return {
    html: `现在 <b>${hm(nowMin)}</b> · 到 <b>${hm(next.at)}</b> 之前还空着` +
      (h ? ` <b>${h}</b> 小时` : '') + (m ? ` <b>${m}</b> 分` : ''),
    quiet: false
  };
}

export function loomTodayRows(model) {
  const items = model.scheduledItems.map(item => {
    const work = model.work?.find(w => w.ref.collection === item.kind && w.ref.id === item.id);
    const slots = work?.slots || [], deadline = deadlineOf(item), anchor = item.anchor;
    const time = slots.length ? itemTimeParts(slots[0].start) : anchor.type === 'absolute' ? itemTimeParts(anchor.start) : null;
    // 只有“真的有钟点”才落到时间轴上；纯截止不假装是一个时刻。
    const at = time ? (time.date < model.date ? 0 : minuteOf(time.time)) : null;
    const end = slots.length ? itemTimeParts(slots[0].end) : anchor.type === 'absolute' ? itemTimeParts(anchor.end) : null;
    const label = time && end
      ? `${time.date < model.date ? '00:00' : time.time}–${end.date > model.date ? '24:00' : end.time}${slots.length > 1 ? ' · +' + (slots.length - 1) + ' 段' : ''}`
      : at !== null ? hm(at)
      : anchor.type === 'deadline' ? `截止 ${hm(minuteOf(deadline?.time) ?? 23 * 60 + 59)}`
      : '未定时';
    const phases = Array.isArray(item.phases) ? item.phases : [];
    return {
      id: item.id, ref: { collection: item.kind, id: item.id }, kind: '事项',
      at, time: label,
      title: item.title,
      goal: item.goal || '',
      criteria: item.completionCriteria || '',
      note: item.note || '',
      where: item.location || '',
      object: work?.object?.title || '',
      stages: phases.length ? `${phases.filter(p => p.done).length}/${phases.length}` : '',
      slotCount: (work?.slots || []).length,
      source: item.courseOrigin ? {
        collection: 'courseEntry',
        id: item.courseOrigin.courseId,
        containerId: item.courseOrigin.tableId,
        date: item.courseOrigin.originalDate,
        title: item.courseOrigin.title
      } : null,
      dates: completionDatesOnDate(item, model.date)
    };
  });
  const courses = (model.courses?.entries || []).map(entry => {
    const times = courseTimes(model.courses.table, entry);
    return {
      id: `${entry.courseId}:${entry.originalDate}`,
      ref: { collection: 'courseEntry', id: entry.courseId, containerId: model.courses.table.id },
      originalDate: entry.originalDate, kind: '课程', at: minuteOf(times?.start),
      time: times ? `${times.start}–${times.end}` : '时间未配置',
      title: entry.title,
      goal: '', criteria: '',
      note: `${entry.teacher || '教师未填'} · 第 ${entry.periodStart}–${entry.periodEnd} 节${entry.status === 'cancelled' ? ' · 本次停课' : entry.status === 'moved' ? ' · 本次调出' : entry.isMovedIn ? ' · 本次调入' : ''}`,
      where: entry.location || '', object: model.courses.table.name,
      stages: '', slotCount: 0, source: null, dates: []
    };
  });
  return [...courses, ...items].sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity) || a.id.localeCompare(b.id));
}

// Presentation only: synchronous public queries and DOM layout, never business writes.
export function createLoomRenderer({ host, bindings }) {
  const view = document.createElement('div'); view.className = 'loom-today';
  let active = false, disposed = false, timer, frame, date = '', rows = [];
  const layout = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = 0; if (!active || disposed || document.hidden) return;
      const warp = view.querySelector('.loom-warp'); if (!warp) return;
      const now = Number(warp.dataset.now), start = loomWindowStart(now), hour = parseFloat(getComputedStyle(view).getPropertyValue('--hour')) || 88;
      let floor = -Infinity;
      warp.querySelectorAll('.loom-paper').forEach(el => {
        const top = Math.max(loomY(Math.max(start, Number(el.dataset.at)), now, hour), floor);
        el.style.top = top + 'px'; floor = top + el.offsetHeight + 11;
      });
      const windowBottom = loomY(start + 1080, now, hour);
      warp.style.height = Math.max(18 * hour + 48, Number.isFinite(floor) ? floor + 24 : 0) + 'px';
      warp.querySelectorAll('[data-min]').forEach(el => { el.style.top = loomY(+el.dataset.min, now, hour) + 'px'; });
      const nowMark = warp.querySelector('.loom-now-mark');
      if (nowMark) nowMark.style.top = Math.max(0, loomY(now, now, hour)) + 'px';
      // 先兆流光：从此刻往下 150 分钟那一段
      const omen = warp.querySelector('.loom-omen-line');
      if (omen) {
        const top = Math.max(0, loomY(Math.max(now, start), now, hour));
        const bottom = Math.min(windowBottom, loomY(Math.min(now + 150, start + 1080), now, hour));
        omen.style.top = top + 'px';
        omen.style.height = Math.max(24, bottom - top) + 'px';
      }
      // 日尾：最后一张纸条之下，到窗口底
      const tail = warp.querySelector('.loom-tail');
      if (tail) {
        const from = Math.max(Number.isFinite(floor) ? floor + 26 : 0, loomY(Math.max(now, start), now, hour) + 30);
        if (windowBottom - from < 40) { tail.remove(); }
        else { tail.style.top = from + 'px'; tail.style.height = (windowBottom - from) + 'px'; }
      }
    });
  };
  const layer = (label, text) => text ? `<p class="loom-slip-layer"><b>${label}</b>${esc(text)}</p>` : '';  const paper = (row, index) => {
    const past = row.at !== null && row.at !== undefined && row.at < Number(view.dataset.now || 0);
    const canComplete = row.kind === '事项' && row.dates.length === 1;
    const margin = [
      `<span class="loom-slip-time">${esc(row.time)}</span>`,
      row.where ? `<span class="loom-slip-where">${esc(row.where)}</span>` : '',
      row.object ? `<span class="loom-slip-obj">${esc(row.object)}</span>` : '',
      row.stages ? `<span class="loom-slip-stage">阶段 ${esc(row.stages)}</span>` : '',
      row.slotCount > 1 ? `<span class="loom-slip-stage">执行 ${row.slotCount} 段</span>` : '',
      row.source ? `<button type="button" class="loom-slip-source" data-loom-open-source="${esc(row.source.id)}" data-loom-source-table="${esc(row.source.containerId || '')}" data-loom-source-date="${esc(row.source.date || '')}">来自 ${esc(row.source.title || '这节课')}</button>` : ''
    ].filter(Boolean).join('');
    return `<li class="loom-paper ${row.kind === '事项' ? 'loom-slip' : 'loom-course-slip'}${past ? ' is-past' : ''}" data-id="${esc(row.id)}" data-collection="${row.ref.collection}" data-at="${row.at ?? 360}" data-row="${index}" style="--i:${index};--thread:var(${row.kind === '课程' ? '--t-indigo' : '--t-madder'})">` +
      `<span class="loom-slip-body"><span class="loom-slip-kind"><i></i>${row.kind}</span>` +
      `<h3 class="loom-slip-title"><button type="button" data-loom-paper-action="open">${esc(row.title)}</button></h3>` +
      layer('为什么', row.goal) + layer('怎样算好', row.criteria) +
      (row.note ? `<p class="loom-slip-note${row.goal || row.criteria ? ' is-quiet' : ''}">${esc(row.note)}</p>` : '') +
      `</span><span class="loom-slip-margin">${margin}</span>` +
      `<button class="loom-slip-knot" type="button" ${canComplete ? `data-today-item-complete="${esc(row.ref.id)}" data-kind="${esc(row.ref.collection)}" data-completion-date="${row.dates[0]}" data-render-date="${date}"` : ''} data-loom-paper-action="${canComplete ? 'complete' : 'open'}" aria-label="${canComplete ? '穿过：' : '打开：'}${esc(row.title)}"></button></li>`;
  };
  const render = () => {
    if (!active || disposed || document.hidden) return;
    const focused = view.contains(document.activeElement) ? { id: document.activeElement.closest('[data-id]')?.dataset.id, action: document.activeElement.dataset.loomPaperAction } : null;
    const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
    date = today(); const now = minuteOf(time), start = loomWindowStart(now), end = start + 1080;
    let model;
    try { model = host.client('today').query(date, time); rows = loomTodayRows(model); }
    catch (error) { rows = []; view.innerHTML = `<h1 tabindex="-1">今天</h1><p role="alert">无法读取今天：${esc(error.message)}。请稍后重试。</p>`; return; }
    const ticks = [];
    for (let m = start; m <= end; m += 30) {
      ticks.push(`<span class="loom-tick${m % 60 === 0 ? ' is-hour' : ''}" data-min="${m}"></span>`);
      if (m % 120 === 0 && m < end) ticks.push(`<span class="loom-tick-label${Math.abs(m - now) < 26 ? ' is-muted' : ''}" data-min="${m}"><b>${hm(m)}</b></span>`);
    }
    const omen = loomOmen(rows, now);
    const openCount = rows.filter(row => (row.at ?? Infinity) >= now).length;
    const tailText = openCount ? `还有 ${openCount} 件在下面` : '今天走到了这里';
    // 必须在生成纸条之前写入此刻，否则首帧会把所有纸条都判成“已过去”。
    view.dataset.now = String(now);
    view.innerHTML =
      `<header class="loom-day-head">` +
        `<h1 tabindex="-1">今天<span>${date}</span></h1>` +
        `<p class="loom-omen${omen.quiet ? ' is-quiet' : ''}">${omen.html}</p>` +
        `<div class="loom-head-acts">` +
          `<button type="button" data-loom-now>回到此刻</button>` +
          `<button type="button" data-loom-today-other>其他待处理事项 · ${model.otherItems.length}</button>` +
        `</div>` +
        `<span class="loom-day-stats">${rows.filter(r => r.kind === '课程').length} 次课 · ${model.scheduledItems.length} 项安排</span>` +
      `</header>` +
      Object.values(model.errors).map(message => `<p role="alert">${esc(message)}</p>`).join('') +
      (rows.length ? '' : '<p class="loom-empty">今天空着，正好留给自己。</p>') +
      `<div class="loom-completion-slot"></div>` +
      `<div class="loom-warp" data-now="${now}">` +
        `<div class="loom-warp-ticks" aria-hidden="true">${ticks.join('')}</div>` +
        `<div class="loom-omen-line" aria-hidden="true"></div>` +
        `<div class="loom-now-mark"><span class="loom-now-dot"></span><span class="loom-now-clock">${time}<i>此刻</i></span></div>` +
        `<ol class="loom-slips">${rows.map(paper).join('')}</ol>` +
        `<div class="loom-tail" aria-hidden="true"><span class="loom-tail-line"></span><span class="loom-tail-knot"></span><span class="loom-tail-say">${tailText}</span></div>` +
      `</div>`;
    if (focused) {
      const row = [...view.querySelectorAll('[data-id]')].find(el => el.dataset.id === focused.id);
      (row?.querySelector(`[data-loom-paper-action="${focused.action}"]`) || view.querySelector('h1')).focus({ preventScroll: true });
    }
    layout();
  };
  const observer = new ResizeObserver(layout);
  const setActive = page => {
    if (disposed) return;
    const next = Boolean(page);
    if (active && next && view.parentElement === page) { render(); return; }
    active = next; clearInterval(timer); timer = null; cancelAnimationFrame(frame); observer.disconnect();
    if (!next) { view.remove(); rows = []; return; }
    view.classList.toggle('is-paused', document.hidden || !document.hasFocus());
    page.prepend(view); render(); observer.observe(view);
    timer = setInterval(() => { if (document.hasFocus()) render(); }, 30000);
  };
  bindings.listen(document, 'visibilitychange', () => { view.classList.toggle('is-paused', document.hidden); if (!document.hidden) render(); });
  bindings.listen(window, 'blur', () => view.classList.add('is-paused'));
  bindings.listen(window, 'focus', () => { view.classList.toggle('is-paused', document.hidden); render(); });
  for (const event of ['items:committed', 'courses:committed', 'objects:committed']) bindings.effect(() => host.on(event, render));
  const dispose = () => { setActive(null); disposed = true; };
  bindings.onStop(dispose);
  return { setActive, render, resolve: index => active && date === today() ? rows[index] : null, date: () => date, dispose };
}
