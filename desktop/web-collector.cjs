const fs = require('node:fs');
const path = require('node:path');
function stripHtml(value) {
  return String(value || '').replace(/<[^>]+>/g,' ').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,code)=>{ const point=code[0].toLowerCase()==='x'?parseInt(code.slice(1),16):Number(code); return point>0&&point<=0x10ffff?String.fromCodePoint(point):' '; }).replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#39;/g,"'").replace(/[\t \r]+/g,' ').trim();
}
function parsePublicHtml(html,url) {
  const title=stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '') || new URL(url).hostname;
  const clean=html.replace(/<(script|style|nav|footer|header|aside)\b[^>]*>[\s\S]*?<\/\1>/gi,'\n').replace(/<input\b[^>]*>/gi,'');
  const content=clean.match(/<(?:article|main)\b[^>]*>([\s\S]*?)<\/(?:article|main)>/i)?.[1] || clean.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || clean;
  const text=stripHtml(content.replace(/<\/?(?:p|div|li|h[1-6]|tr|br|section)\b[^>]*>/gi,'\n')).split('\n').map(line=>line.trim()).filter(Boolean).join('\n').slice(0,32000);
  const links=[...content.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(match=>{
    try { const href=new URL(match[1],url); return ['http:','https:'].includes(href.protocol)?{text:stripHtml(match[2]).slice(0,120),href:href.href}:null; } catch { return null; }
  }).filter(link=>link?.text).slice(0,20);
  return {title,text,links};
}
async function collectPublicPage(value,{root,fetcher=fetch}={}) {
  let requested;
  try { requested=new URL(value); if(!['http:','https:'].includes(requested.protocol)) throw new Error(); } catch { return {ok:false,message:'网页地址必须是 HTTP 或 HTTPS 地址。'}; }
  try {
    const response=await fetcher(requested.href,{redirect:'follow',signal:AbortSignal.timeout(15000)});
    if(!response.ok) return {ok:false,message:`网页返回了 ${response.status}。`};
    const type=response.headers?.get('content-type') || '';
    if(type && !/html|text\/plain/i.test(type)) return {ok:false,message:'请填写网页地址，当前返回的不是可读取的文本页面。'};
    const html=await response.text();
    if(html.length>2*1024*1024) return {ok:false,message:'网页内容超过 2 MB，请选择具体文章或通知页面。'};
    const url=response.url || requested.href;
    const parsed=parsePublicHtml(html,url);
    if(!parsed.text) return {ok:false,message:'没有读取到正文，当前仅支持无需登录的静态网页。'};
    const capturedAt=new Date().toISOString(), id=`${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const directory=path.join(root,id);
    fs.mkdirSync(directory,{recursive:true});
    fs.writeFileSync(path.join(directory,'page.html'),html,'utf8');
    fs.writeFileSync(path.join(directory,'capture.json'),JSON.stringify({url,...parsed,capturedAt},null,2),'utf8');
    return {ok:true,url,...parsed,capturedAt,directory};
  } catch(error) { return {ok:false,message:`网页抓取失败：${error?.message || String(error)}`}; }
}
module.exports={collectPublicPage,parsePublicHtml};
