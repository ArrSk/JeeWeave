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
    const cards = [];
    for (const table of doc.querySelectorAll('table')) {
      const grid = [], origins = [];
      for (const [rowIndex, row] of [...table.rows].entries()) {
        grid[rowIndex] ||= []; let column = 0;
        for (const cell of row.cells) {
          while (grid[rowIndex][column]) column += 1;
          const entry = { cell, row: rowIndex, column }; origins.push(entry);
          for (let r = 0; r < Math.min(cell.rowSpan || 1, 100); r += 1) {
            grid[rowIndex + r] ||= [];
            for (let c = 0; c < Math.min(cell.colSpan || 1, 20); c += 1) grid[rowIndex + r][column + c] = entry;
          }
          column += cell.colSpan || 1;
        }
      }
      const days = new Map();
      for (const row of grid.slice(0, 6)) row?.forEach((entry, column) => {
        const match = clean(entry.cell.textContent).match(/^(?:星期|周)([一二三四五六日天1-7])/);
        if (match) days.set(column, /\d/.test(match[1]) ? Number(match[1]) : match[1] === '天' ? 7 : '一二三四五六日'.indexOf(match[1]) + 1);
      });
      if (days.size < 2) continue;
      for (const { cell, row, column } of origins) {
        const weekday = days.get(column); if (!weekday) continue;
        const selectors = '.timetable_con, .timetable_con1, .kbcontent';
        const blocks = [...cell.querySelectorAll(selectors)].filter(block => !block.querySelector(selectors));
        for (const block of blocks) {
          const title = clean(block.querySelector('.title')?.textContent);
          if (!title) continue;
          const labelled = label => clean([...block.querySelectorAll('[title]')].find(node => label.test(node.getAttribute('title') || ''))?.textContent);
          const metadata = clean(block.textContent);
          const periods = metadata.match(/(?:第\s*)?(\d{1,2})\s*[-~至到]\s*(\d{1,2})\s*节/) || metadata.match(/(?:第\s*)?(\d{1,2})\s*节/);
          const rowPeriod = clean(grid[row]?.find(entry => /^\d{1,2}$/.test(clean(entry.cell.textContent)))?.cell.textContent);
          const week = metadata.match(/((?:第\s*)?\d{1,2}(?:\s*[-~至到]\s*\d{1,2})?(?:\s*[,，、]\s*\d{1,2}(?:\s*[-~至到]\s*\d{1,2})?)*\s*(?:[单双]\s*)?周(?:\s*[（(]?\s*[单双]\s*[)）]?)?)/);
          cards.push({ title, weekday, periodStart: Number(periods?.[1] || rowPeriod), periodEnd: Number(periods?.[2] || periods?.[1] || (Number(rowPeriod) + Math.min(cell.rowSpan || 1, 30) - 1)), weekText: week?.[1] || '', teacher: labelled(/教师|老师/), location: labelled(/教室|地点/) });
        }
      }
    }
    return cards;
  }
  const candidates = documents.map(({ doc, frame }) => {
    // Keep the original live-text reader independent of optional grid/HTML work.
    // WebVPN pages can patch DOM methods; one failed table must not lose the list.
    let cards = [], html = '', text = '', warning;
    try { text = clean(doc.body?.innerText); } catch {}
    try { cards = cardsFrom(doc); } catch (error) { warning = `grid:${error.name}`; }
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
    return { frame, cards, text, html, warning, score: cards.length * 100 + listMatches * 80 + (/学生课表|课表信息/.test(text) ? 10 : 0), tableCount: doc.querySelectorAll('table').length };
  }).sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best?.score) return { ok: false, message: '没有找到课程。请先完成 WebVPN 和身份认证登录，再打开“学生课表查询”并选择学期。', blockedFrames };
  return { ok: true, text: best.text, sourceHtml: best.html, cards: best.cards, frame: best.frame, score: best.score, blockedFrames, warning: best.warning, candidates: candidates.map(({ frame, score, tableCount }) => ({ frame, score, tableCount })) };
}
module.exports = { readCoursePage };
