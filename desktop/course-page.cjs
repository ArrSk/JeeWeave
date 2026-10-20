// Runs inside the remote page. Return data in memory; never save page captures.
function readCoursePage(includeFrames = true) {
  const documents = [], seen = new Set();
  let blockedFrames = 0;
  function visit(doc, frame, depth = 0) {
    if (!doc || seen.has(doc) || depth > 4) return;
    seen.add(doc); documents.push({ doc, frame });
    if (!includeFrames) return;
    for (const iframe of doc.querySelectorAll('iframe')) {
      try { if (iframe.contentDocument) visit(iframe.contentDocument, iframe.id || iframe.name || '嵌套页面', depth + 1); else blockedFrames += 1; } catch { blockedFrames += 1; }
    }
  }
  visit(document, '主页面');
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  function cardsFrom(doc) {
    const cards = [], listCards = [];
    let listRecordCount = 0;
    const dayOf = value => {
      const match = clean(value).match(/^(?:星期|周)([一二三四五六日天1-7])/);
      return !match ? 0 : /\d/.test(match[1]) ? Number(match[1]) : match[1] === '天' ? 7 : '一二三四五六日'.indexOf(match[1]) + 1;
    };
    const selectors = '.timetable_con, .timetable_con1, .kbcontent';
    const blocksIn = cell => [...cell.querySelectorAll(selectors)].filter(block => !block.querySelector(selectors));
    for (const table of doc.querySelectorAll('table')) {
      const grid = [], origins = [];
      for (const [rowIndex, row] of [...table.rows].entries()) {
        grid[rowIndex] ||= []; let column = 0;
        for (const cell of row.cells) {
          while (grid[rowIndex][column]) column += 1;
          const entry = { cell, row: rowIndex, column }; origins.push(entry);
          const rowSpan = cell.rowSpan === 0 ? row.parentElement.rows.length - row.sectionRowIndex : cell.rowSpan || 1;
          for (let r = 0; r < Math.min(rowSpan, 100); r += 1) {
            grid[rowIndex + r] ||= [];
            for (let c = 0; c < Math.min(cell.colSpan || 1, 20); c += 1) grid[rowIndex + r][column + c] = entry;
          }
          column += cell.colSpan || 1;
        }
      }
      const listHeader = grid.find(row => row?.some(entry => clean(entry.cell.textContent) === '课表信息') && row.some(entry => clean(entry.cell.textContent) === '节次'));
      if (listHeader) {
        const dayColumn = listHeader.findIndex(entry => clean(entry.cell.textContent) === '星期');
        const periodColumn = listHeader.findIndex(entry => clean(entry.cell.textContent) === '节次');
        const contentColumn = listHeader.findIndex(entry => clean(entry.cell.textContent) === '课表信息');
        const visited = new Set();
        for (const row of grid) {
          const cell = row?.[contentColumn]?.cell;
          if (!cell || visited.has(cell) || !/周数[:：]/.test(cell.textContent)) continue;
          visited.add(cell);
          const blocks = blocksIn(cell); if (!blocks.length) blocks.push(cell);
          for (const block of blocks) {
            listRecordCount += 1;
            const metadata = clean(block.textContent);
            const title = clean(block.querySelector('.title')?.textContent) || clean(metadata.split(/周数[:：]/)[0]);
            const periods = clean(row[periodColumn]?.cell.textContent).match(/^(\d{1,2})(?:\s*[-~至到]\s*(\d{1,2}))?$/);
            listCards.push({ title, weekday: dayOf(row[dayColumn]?.cell.textContent), periodStart: Number(periods?.[1]), periodEnd: Number(periods?.[2] || periods?.[1]),
              weekText: clean(metadata.match(/周数[:：]\s*(.*?)(?=校区\s*[:：]|上课地点\s*[:：]|$)/)?.[1]),
              teacher: clean(metadata.match(/教师\s*[:：]\s*(.*?)(?=学分\s*[:：]|课程性质\s*[:：]|$)/)?.[1]),
              location: clean(metadata.match(/上课地点\s*[:：]\s*(.*?)(?=教师\s*[:：]|$)/)?.[1]) });
          }
        }
        continue;
      }
      const days = new Map();
      for (const row of grid.slice(0, 6)) row?.forEach((entry, column) => {
        const match = clean(entry.cell.textContent).match(/^(?:星期|周)([一二三四五六日天1-7])/);
        if (match) days.set(column, /\d/.test(match[1]) ? Number(match[1]) : match[1] === '天' ? 7 : '一二三四五六日'.indexOf(match[1]) + 1);
      });
      if (days.size < 2) continue;
      for (const { cell, row, column } of origins) {
        const weekday = days.get(column); if (!weekday) continue;
        const blocks = blocksIn(cell);
        for (const block of blocks) {
          const title = clean(block.querySelector('.title')?.textContent);
          if (!title) continue;
          const labelled = label => {
            const node = [...block.querySelectorAll('[title]')].find(node => label.test(node.getAttribute('title') || ''));
            // Zhengfang uses an empty tooltip icon followed by sibling font text.
            return clean(node?.textContent) || clean(node?.closest('p')?.textContent);
          };
          const metadata = clean(block.textContent);
          const periods = metadata.match(/(?:第\s*)?(\d{1,2})\s*[-~至到]\s*(\d{1,2})\s*节/) || metadata.match(/(?:第\s*)?(\d{1,2})\s*节/);
          const rowPeriod = clean(grid[row]?.find(entry => /^\d{1,2}$/.test(clean(entry.cell.textContent)))?.cell.textContent);
          const week = metadata.match(/((?:第\s*)?\d{1,2}(?:\s*[-~至到]\s*\d{1,2})?(?:\s*[,，、]\s*\d{1,2}(?:\s*[-~至到]\s*\d{1,2})?)*\s*(?:[单双]\s*)?周(?:\s*[（(]?\s*[单双]\s*[)）]?)?)/);
          const labelledWeeks = labelled(/节\/周|周数/).replace(/^.*?节\s*[)）]?\s*/, '').replace(/^周数[:：]\s*/, '');
          cards.push({ title, weekday, periodStart: Number(periods?.[1] || rowPeriod), periodEnd: Number(periods?.[2] || periods?.[1] || (Number(rowPeriod) + Math.min(cell.rowSpan || 1, 30) - 1)), weekText: labelledWeeks || week?.[1] || '', teacher: labelled(/教师|老师/), location: labelled(/教室|地点/) });
        }
      }
    }
    return { cards, listCards, listRecordCount };
  }
  const candidates = documents.map(({ doc, frame }) => {
    // Keep the original live-text reader independent of optional grid/HTML work.
    // WebVPN pages can patch DOM methods; one failed table must not lose the list.
    let cards = [], listCards = [], listRecordCount = 0, html = '', text = '', warning;
    try { text = clean(doc.body?.innerText); } catch {}
    try { ({ cards, listCards, listRecordCount } = cardsFrom(doc)); } catch (error) { warning = `grid:${error.name}`; }
    try {
      const clone = doc.documentElement?.cloneNode(true);
      clone?.querySelectorAll('script,style,link,meta,base,iframe').forEach(node => node.remove());
      clone?.querySelectorAll('input,textarea,select').forEach(node => node.remove());
      clone?.querySelectorAll('br,td,th,tr,div,p,li,span').forEach(node => node.append(doc.createTextNode(' ')));
      const flattened = clean(clone?.textContent);
      if ((flattened.match(/周数[:：]/g) || []).length >= (text.match(/周数[:：]/g) || []).length) text = flattened || text;
      html = clone?.outerHTML || '';
    } catch (error) { warning = warning || `html:${error.name}`; }
    const listMatches = (text.match(/周数[:：]/g) || []).length;
    return { frame, cards, listCards, listRecordCount, text, html, warning, score: Math.max(cards.length, listCards.length) * 100 + listMatches * 80 + (/学生课表|课表信息/.test(text) ? 10 : 0), tableCount: doc.querySelectorAll('table').length };
  }).sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best?.score) return { ok: false, message: '没有找到课程。请先完成 WebVPN 和身份认证登录，再打开“学生课表查询”并选择学期。', blockedFrames };
  return { ok: true, text: best.text, sourceHtml: best.html, cards: best.cards, listCards: best.listCards, listRecordCount: best.listRecordCount, frame: best.frame, score: best.score, blockedFrames, warning: best.warning, candidates: candidates.map(({ frame, score, tableCount }) => ({ frame, score, tableCount })) };
}
module.exports = { readCoursePage };
