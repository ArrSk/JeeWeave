import { escapeHtml as esc } from './ui-text.mjs';
import { head, rowEntry } from './loom-pages.mjs';

// 涟漪 / 舆图 / 夜场的「今天」摆位。只重排已经取到的真实记录，
// 打开与完成仍用经纬纸条同一批属性，交给 skeleton-runtime 的既有处理器。
const untimed = row => row.at === null || row.at === undefined;

// 完成只在「同一天一次做完」的事项上出现，和纸条版式同一判断，不另立规则。
const mark = (row, date) => row.kind === '事项' && row.dates.length === 1
  ? `<button type="button" class="loom-leg-mark" data-today-item-complete="${esc(row.ref.id)}" data-kind="${esc(row.ref.collection)}" data-completion-date="${row.dates[0]}" data-render-date="${date}" aria-label="完成：${esc(row.title)}"></button>`
  : '';
const chips = row => [
  row.where ? esc(row.where) : '',
  row.object ? esc(row.object) : '',
  row.stages ? `阶段 ${esc(row.stages)}` : '',
  row.slotCount > 1 ? `执行 ${row.slotCount} 段` : '',
  row.source ? `来自 ${esc(row.source.title || '这节课')}` : ''
].filter(Boolean);

// 一条“腿”：时刻、标题、批注、标记。三种布局共用记录契约。
// 摆位可以换（打开/换幕），但去处由布局决定，不各写一套跳转。
const openEntry = row => `<button type="button" class="loom-leg-open" data-loom-paper-action="open"><strong>${esc(row.title)}</strong></button>`;
const cueEntry = row => `<button type="button" class="loom-leg-open" data-loom-stage-cue="${esc(row.id)}"><strong>${esc(row.title)}</strong></button>`;
const leg = (row, index, date, when, entry = openEntry) => `<li class="loom-leg${untimed(row) ? ' is-untimed' : ''}${row.kind === '课程' ? ' is-course' : ''}" data-id="${esc(row.id)}" data-collection="${row.ref.collection}" data-row="${index}" data-loom-move="${row.move || ''}" style="--i:${index}">` +
  `<span class="loom-leg-when">${when ? when(row) : esc(row.time)}</span>` +
  `<span class="loom-leg-body">${entry(row)}` +
  (row.note ? `<small class="loom-leg-note">${esc(row.note)}</small>` : '') +
  (chips(row).length ? `<span class="loom-leg-chips">${chips(row).map(text => `<i>${text}</i>`).join('')}</span>` : '') +
  `</span>${mark(row, date)}</li>`;

const band = (label, list, render) => list.length ? `<section class="loom-band-group"><h2 class="loom-band-title">${label}<b>${list.length}</b></h2><ol class="loom-legs">${list.map(render).join('')}</ol></section>` : '';

// 舆图的页头是一张图廓：题名、说明、统计各占一行，边框替它承重，不额外套卡片。
export function atlasCartouche(title, sub, options = {}) {
  const { date = '', stats = '', right = '' } = options;
  return `<header class="loom-atlas-cartouche">` +
    `<h1 tabindex="-1">${title}<span>${esc(date)}</span></h1>` +
    `<p class="loom-atlas-sub">${sub}</p>` +
    (right ? `<div class="loom-head-acts">${right}</div>` : '') +
    `<div class="loom-atlas-stats">${stats}</div>` +
  `</header>`;
}
// 图廓下方的三个数：还剩几处、今天一共几处、此刻在哪儿。
const atlasStats = (open, total, time) =>
  `<span>未走完 <b>${open}</b></span><span>全长 <b>${total}</b> 处</span><span>当前 <b>${esc(time)}</b></span>`;

export function atlasToday(ctx) {
  const { date, time, now, rows, model } = ctx;
  const timed = rows.filter(row => !untimed(row)), free = rows.filter(untimed);
  const past = timed.filter(row => row.at < now), ahead = timed.filter(row => row.at >= now);
  const near = ahead.filter(row => row.at <= now + 240), later = ahead.filter(row => row.at > now + 240);
  const render = row => leg(row, rows.indexOf(row), date);
  const next = ahead[0];
  return atlasCartouche('今天的<em>路线</em>',
    `此刻你在 ${esc(time)}。${next ? `下一处里程碑是「${esc(next.title)}」。` : '今天余下的路都走过了。'}`,
    { date, stats: atlasStats(ahead.length + free.length, rows.length, time),
      right: '<button type="button" data-loom-scale>比例尺</button><button type="button" data-loom-now>回到此刻</button>' }) + ctx.alerts +
    `<div class="loom-atlas-route">` +
    band('已经走过', past, render) + band('此刻前后', near, render) + band('再往前', later, render) +
    band('还没上路', free, render) +
    `</div>` +
    (model.otherItems?.length ? `<p class="loom-note">另有 ${model.otherItems.length} 项不在今天这条线上。<button type="button" class="loom-inline-action" data-loom-today-other>展开</button></p>` : '');
}

export function rippleToday(ctx) {
  const { date, now, rows, omen, model } = ctx;
  const depth = row => untimed(row) ? 'is-far' : row.at < now ? 'is-past' : row.at <= now + 90 ? 'is-near' : row.at <= now + 300 ? 'is-mid' : 'is-far';
  const render = (row, index) => `<li class="loom-ripple-row ${depth(row)}" data-id="${esc(row.id)}" data-collection="${row.ref.collection}" data-row="${index}" data-loom-move="${row.move || ''}" style="--i:${index}">` +
    `<span class="loom-ripple-time">${esc(untimed(row) ? '未定时' : row.time)}</span>` +
    `<span class="loom-ripple-body"><button type="button" class="loom-ripple-open" data-loom-paper-action="open">${esc(row.title)}</button>` +
    (row.note ? `<small>${esc(row.note)}</small>` : '') + `</span>${mark(row, date)}</li>`;
  const timed = rows.filter(row => !untimed(row));
  const groups = [
    ['已经流过去', timed.filter(row => row.at < now)],
    ['此刻附近', timed.filter(row => row.at >= now && row.at <= now + 180)],
    ['稍晚', timed.filter(row => row.at > now + 180)],
    ['还没落形', rows.filter(untimed)]
  ].filter(group => group[1].length);
  // 尺度条的说明：涟漪这一套把「远近」当深浅读，说明就写在同一批真实计数之后。
  const note = `<p class="loom-rp-note">今天落到水面 ${rows.length} 条 · 深浅按离此刻的远近读</p>`;
  const stream = groups.map(([label, list]) =>
    `<section class="loom-rp-group"><h2 class="loom-rp-title">${label}<b>${list.length}</b></h2>` +
    `<ol class="loom-ripple-rows">${list.map(row => render(row, rows.indexOf(row))).join('')}</ol></section>`).join('');
  return head('今天的水面', omen.html, { date, meta: `${rows.length} 条近处有形，远处只留水光`, right: '<button type="button" data-loom-now>回到此刻</button>' }) + ctx.alerts + note +
    (rows.length ? `<div class="loom-rp-stream">${stream}</div>`
      : `<p class="loom-empty loom-rp-empty"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12c3-4 6-4 9 0s6 4 9 0"/><path d="M3 17c3-3 6-3 9 0s6 3 9 0" opacity=".5"/></svg>今天还没有落到水面上的安排。</p>`) +
    (model.otherItems?.length ? `<p class="loom-note">另有 ${model.otherItems.length} 项不在今天的水面上。<button type="button" class="loom-inline-action" data-loom-today-other>展开</button></p>` : '');
}

// 夜场的幕线只画 06:00–24:00：此刻落在台上的光里哪儿，是读法，不是判断。
const pitStart = 6 * 60, pitEnd = 24 * 60;
export const stagePitRatio = minute => Math.max(0, Math.min(1, (minute - pitStart) / (pitEnd - pitStart)));
// 第 N 场按 ISO 周号算，和 core 的周次口径一致：周一为界，含本年第一个周四的那一周是第 1 周。
export function stageWeekAct(isoDate) {
  const [year, month, day] = String(isoDate).split('-').map(Number);
  if (!year || !month || !day) return 1;
  const thursday = new Date(Date.UTC(year, month - 1, day));
  thursday.setUTCDate(thursday.getUTCDate() + 3 - ((thursday.getUTCDay() + 6) % 7));
  const first = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((thursday - first) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
}
// 换幕优先，其次才是此刻：候场点过谁，谁就是主角；没点过仍按下一个未到的是主角。
export const stageLead = (rows, cueId, now) =>
  rows.find(row => row.id === cueId) || rows.find(row => !untimed(row) && row.at >= now) || rows.slice().reverse().find(row => !untimed(row)) || rows[0] || null;

export function stageToday(ctx) {
  const { date, now, rows, cue = '', light = false } = ctx;
  const lead = stageLead(rows, cue, now);
  const rest = rows.filter(row => row !== lead);
  const index = lead ? rows.indexOf(lead) : -1;
  const pit = `<div class="loom-stage-pit"><div class="loom-pit-track" aria-hidden="true">` +
    [6, 9, 12, 15, 18, 21, 24].map(hour => `<span class="loom-pit-time" style="left:${stagePitRatio(hour * 60) * 100}%">${String(hour).padStart(2, '0')}:00</span>`).join('') +
    `<i class="loom-pit-now" style="left:${stagePitRatio(now) * 100}%"></i></div></div>`;
  return head('台上', lead ? `<b>${esc(lead.title)}</b>` : '此刻台上没有事', {
    date, meta: `第 ${stageWeekAct(date)} 场 · ${rows.length} 项今天的事`,
    right: `<button type="button" data-loom-stage-light aria-pressed="${light}">${light ? '暖光' : '冷光'}</button><button type="button" data-loom-now>回到此刻</button>`
  }) + ctx.alerts + pit +
    (lead ? `<article class="loom-stage-lead${untimed(lead) ? ' is-untimed' : ''}" data-id="${esc(lead.id)}" data-collection="${lead.ref.collection}" data-row="${index}" data-loom-move="${lead.move || ''}" style="--i:${index}">` +
      `<span class="loom-stage-when">${esc(untimed(lead) ? '未定时' : lead.time)}</span>` +
      `<h2 class="loom-stage-title"><button type="button" data-loom-paper-action="open">${esc(lead.title)}</button></h2>` +
      (lead.goal ? `<p class="loom-stage-why"><b>为什么</b>${esc(lead.goal)}</p>` : '') +
      (lead.criteria ? `<p class="loom-stage-why"><b>怎样算好</b>${esc(lead.criteria)}</p>` : '') +
      (lead.note ? `<p class="loom-stage-note">${esc(lead.note)}</p>` : '') +
      (chips(lead).length ? `<span class="loom-leg-chips">${chips(lead).map(text => `<i>${text}</i>`).join('')}</span>` : '') +
      mark(lead, date) + `</article>` +
      `<div class="loom-stage-acts"><button type="button" data-loom-new="note">记一笔</button>` +
      // 看对象仍走对象全貌那条公共命令，不在这里复制业务。
      (lead.objectId ? `<button type="button" data-loom-stage-object="${esc(lead.objectId)}">看对象</button>` : '') + `</div>` : '') +
    band('候场', rest, (row, offset) => leg(row, rows.indexOf(row), date, null, cueEntry));
}

export const loomLayoutToday = (layout, ctx) => layout === 'atlas' ? atlasToday(ctx) : layout === 'ripple' ? rippleToday(ctx) : layout === 'stage' ? stageToday(ctx) : null;

// 舆图的「地块」图层：对象是疆域，边上数字是它牵着的安排。
// 悬停或聚焦一块地，脚注补出它没铺在面上的完成标准；地块下面接一段今天的路线。
export function atlasFields(groups, options = {}) {
  const blocks = groups.flatMap(group => group.items.map(item => ({ ...item, groupTitle: group.title })));
  const slips = options.todayRows || [];
  const summary = slips.slice(0, 4);
  return (options.head || '') + (blocks.length ? `<div class="loom-atlas-fields">` + blocks.map((item, index) =>
    `<button type="button" class="loom-atlas-field" data-loom-row-open="${esc(item.id)}" style="--i:${index}">` +
      `<span class="loom-atlas-kind"><i></i>${esc(item.kind || '对象')}</span>` +
      `<strong>${esc(item.title)}</strong>` +
      `<small>${esc(item.lines?.[0] || '还没有写目的')}</small>` +
      `<span class="loom-atlas-foot">${(item.margin || []).map(text => `<i>${esc(text)}</i>`).join('')}</span>` +
      `<span class="loom-atlas-annot">${esc(item.lines?.[1] ? `完成标准：${item.lines[1]}` : '还没有写完成标准')}</span>` +
    `</button>`).join('') + `</div>`
    : '<p class="loom-empty">还没有对象。</p>') +
    (summary.length ? band('从这些地里穿出来的路', summary, row => leg(row, slips.indexOf(row), options.date)) : '');
}

/* ── 页面级摆位：涟漪与舆图各有各的读法，数据仍是同一批分组 ───── */

const tagText = item => (item.margin || []).filter(Boolean).join(' · ');

// 涟漪的一周：七条水道并着流，今天那条泛着光。
export function rippleCourses(ctx) {
  const { columns, weekday, date, table, total } = ctx;
  return head('本周的水道', `七条水道并着流，今天那条<b>泛着光</b>`,
    { date, meta: `${total} 节课 · ${table?.name || '当前课表'}`, right: '<button type="button" data-loom-new="course">添加课程</button>' }) +
    `<div class="loom-ripple-week">` + columns.map(column =>
      `<div class="loom-rp-col${column.index === weekday ? ' is-today' : ''}">` +
        `<h2 class="loom-rp-day">${esc(column.name)}<b>${column.items.length || ''}</b></h2>` +
        `<ol class="loom-rp-list">` + column.items.map((item, index) =>
          `<li class="loom-rp-slot" style="--i:${index}"><span class="loom-rp-dot" aria-hidden="true"></span>${rowEntry({ ...item, course: { id: item.id, table: item.containerId || '' } })}</li>`).join('') +
        `</ol>` + (column.items.length ? '' : '<p class="loom-col-empty">空着</p>') + `</div>`).join('') + `</div>`;
}

// 涟漪的分组列表：点、题、注、尾标，静置时只有水纹那根发丝线。
export function rippleGroups(groups, options = {}) {
  const body = groups.filter(group => group.items.length).map(group =>
    `<section class="loom-rp-group">` +
      `<h2 class="loom-rp-title">${esc(group.title)}<b>${group.items.length}</b></h2>` +
      `<ol class="loom-rp-rows">` + group.items.map((item, index) =>
        `<li class="loom-rp-row${item.done ? ' is-done' : ''}${item.past ? ' is-past' : ''}" data-loom-row="${esc(item.id)}" style="--i:${index}">` +
          `<span class="loom-rp-dot" aria-hidden="true"></span>` +
          `<span class="loom-rp-main"><span class="loom-rp-entry">${rowEntry(item)}</span>` +
            (item.lines || []).filter(Boolean).map(line => `<small>${esc(line)}</small>`).join('') +
          `</span>` +
          `<span class="loom-rp-tag">${esc(item.kind || '')}${tagText(item) ? `<small>${esc(tagText(item))}</small>` : ''}</span>` +
        `</li>`).join('') +
      `</ol></section>`).join('');
  return `<div class="loom-rp-body">${body || `<p class="loom-empty">${esc(options.empty || '这里还空着。')}</p>`}</div>`;
}

// 舆图的「界标」：一条界桩线，每件事是线上的一块碑。
export function atlasMarks(groups, options = {}) {
  const body = groups.filter(group => group.items.length).map(group =>
    `<section class="loom-mark-group">` +
      `<h2 class="loom-mark-title">${esc(group.title)}<b>${group.items.length}</b></h2>` +
      `<ol class="loom-marks">` + group.items.map((item, index) =>
        `<li class="loom-mark${item.done ? ' is-done' : ''}" data-loom-row="${esc(item.id)}" style="--i:${index}">` +
          `<i class="loom-mark-post" aria-hidden="true"></i>` +
          `<span class="loom-mark-body"><span class="loom-mark-kind">${esc(item.kind || '')}</span>` +
            `<h3 class="loom-mark-name">${rowEntry(item)}</h3>` +
            (item.lines || []).filter(Boolean).map(line => `<p class="loom-mark-note">${esc(line)}</p>`).join('') +
          `</span>` +
          (tagText(item) ? `<span class="loom-mark-side">${esc(tagText(item))}</span>` : '') +
        `</li>`).join('') +
      `</ol></section>`).join('');
  return `<div class="loom-mark-ribbon">${body || `<p class="loom-empty">${esc(options.empty || '这里还空着。')}</p>`}</div>`;
}
