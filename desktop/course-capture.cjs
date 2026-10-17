const { readCoursePage } = require('./course-page.cjs');

// A private JS world shares the live DOM, without WebVPN's replaced globals and
// DOM prototypes. Never inject a button, change the remote page, or weaken CSP.
const CAPTURE_WORLD = 1004;
function readLiveCourseText() {
  const text = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
  const count = (text.match(/周数[:：]/g) || []).length;
  return count ? { ok: true, text, sourceHtml: '', cards: [], frame: '当前页面正文', score: count * 80, warning: 'live-text-fallback' } : { ok: false };
}
const script = includeFrames => `(() => { try { return (${readCoursePage.toString()})(${includeFrames}); } catch (error) { try { const fallback = (${readLiveCourseText.toString()})(); if (fallback.ok) return fallback; } catch {} return { ok: false, readError: error.name || 'Error' }; } })()`;
async function bounded(read) {
  let timer;
  try {
    return await Promise.race([read(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('CAPTURE_TIMEOUT')), 8000); })]);
  } finally { clearTimeout(timer); }
}
function sourceUrl(value) {
  try { const url = new URL(value); url.search = ''; url.hash = ''; return url.href; } catch { return ''; }
}

async function captureCurrentCoursePage(contents) {
  const attempts = [];
  let primary;
  try {
    primary = await bounded(() => contents.executeJavaScriptInIsolatedWorld(CAPTURE_WORLD, [{ code: script(true) }]));
    attempts.push({ mode: 'isolated', result: primary?.ok ? 'ok' : primary?.readError || 'empty' });
  } catch { attempts.push({ mode: 'isolated', result: 'execution-failed' }); }
  const candidates = primary?.ok ? [{ ...primary, url: sourceUrl(contents.getURL()) }] : [];
  // Read a cross-origin iframe in its own frame context using Electron's frame
  // API. The page itself receives no new permissions or cross-origin access.
  if (!primary?.ok || primary.blockedFrames) {
    const frames = contents.mainFrame.framesInSubtree.slice(0, 32);
    const results = await Promise.all(frames.map(async frame => {
      try {
        const result = await bounded(() => frame.executeJavaScript(script(false)));
        return { ...result, url: sourceUrl(frame.url) };
      } catch { return { ok: false, readError: 'frame-unavailable' }; }
    }));
    for (const result of results) {
      attempts.push({ mode: 'frame', result: result.ok ? 'ok' : result.readError || 'empty' });
      if (result.ok) candidates.push(result);
    }
  }
  candidates.sort((a, b) => (b.score || 0) - (a.score || 0));
  if (candidates.length) return { ...candidates[0], diagnostics: attempts };
  const failed = attempts.some(attempt => !['empty', 'ok'].includes(attempt.result));
  return { ok: false, diagnostics: attempts, message: failed
    ? '教务页面读取未完成，请等待页面加载后再点“抓取并导入”。读取状态：' + attempts.map(attempt => `${attempt.mode}/${attempt.result}`).join('，')
    : primary?.message || '没有找到课程。请在教务窗口打开“学生课表查询”，选择学期并查询后，再点“抓取并导入”。' };
}
module.exports = { captureCurrentCoursePage };
