// Development-only static preview. No routes read or write Desktop/Android user files.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const mime = {'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.json':'application/json'};
export const previewAddresses = port => [...new Set(Object.entries(os.networkInterfaces()).filter(([name])=>!/loopback|vethernet|docker|wsl/i.test(name)).flatMap(([,rows])=>rows.filter(r=>r.family==='IPv4'&&!r.internal).map(r=>'http://'+r.address+':'+port+'/')))];

export function createPreviewServer({root=path.join(here,'dist'),port=4175,host='0.0.0.0'}={}) {
  const base = path.resolve(root);
  const server = http.createServer((req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}
    let pathname;
    try {pathname=decodeURIComponent(new URL(req.url,'http://preview.local').pathname);} catch {res.writeHead(400);res.end();return;}
    if(pathname==='/') {res.writeHead(302,{Location:'/desktop/prototype.html'});res.end();return;}
    if(pathname==='/__preview') {
      res.setHeader('Content-Type','application/json; charset=utf-8');
      res.end(req.method==='HEAD'?'':JSON.stringify({app:'JeeWeave mobile preview',port:server.address().port,addresses:previewAddresses(server.address().port)}));return;
    }
    const file=path.resolve(base,'.'+pathname), relative=path.relative(base,file);
    if(relative.startsWith('..')||path.isAbsolute(relative)||pathname.includes('\\')||pathname.includes('\0')||pathname.split('/').some(part=>part.startsWith('.'))||!mime[path.extname(file)]){res.writeHead(404);res.end();return;}
    try {
      const real=fs.realpathSync(file),rel=path.relative(base,real);
      if(rel.startsWith('..')||path.isAbsolute(rel)||!fs.statSync(real).isFile())throw Error('outside preview');
      res.setHeader('Content-Type',mime[path.extname(real)]);
      if(req.method==='HEAD'){res.end();return;}
      const stream=fs.createReadStream(real);stream.on('error',()=>res.destroy());stream.pipe(res);
    } catch {res.writeHead(404);res.end();}
  });
  return new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(port,host,()=>{server.removeListener('error',reject);resolve(server);});
  });
}

async function main() {
  const port=Number(process.env.JEEWEAVE_PREVIEW_PORT||4175);
  if(!Number.isInteger(port)||port<1024||port>65535)throw Error('预览端口需在 1024–65535 之间。');
  // Repeat launches focus the existing window rather than replacing files it is using.
  try {
    const running=await fetch('http://127.0.0.1:'+port+'/__preview',{signal:AbortSignal.timeout(700)}).then(r=>r.json());
    if(running.app==='JeeWeave mobile preview') {
      console.log('手机预览已在运行：\n'+running.addresses.join('\n'));
      if(!process.argv.includes('--server-only')) openWindow(port);
      return;
    }
  } catch {}
  await import('./prepare.mjs');
  const server=await createPreviewServer({port});
  const urls=previewAddresses(port);
  console.log('\nJeeWeave · 手机预览\n电脑：http://127.0.0.1:'+port+'/');
  console.log('手机连接同一 Wi-Fi，浏览器输入下面任一局域网地址：\n'+(urls.join('\n')||'未发现局域网地址，请先连接 Wi-Fi。'));
  console.log('\n初次体验：目录 → 设置 → 开发者模式 → 导入示例。\n资料只保存在当前设备的预览浏览器；电脑与手机不会自动同步。\n关闭手机预览窗口会停止服务；仅服务模式按 Ctrl+C 停止。\n');
  const close=()=>{server.close();server.closeAllConnections();};
  let child;
  process.on('SIGINT',()=>{child?.kill();close();});
  process.on('SIGTERM',()=>{child?.kill();close();});
  if(!process.argv.includes('--server-only')) {
    child=openWindow(port);child.once('exit',close);child.once('error',close);
  }
}
function openWindow(port) {
  const require=createRequire(import.meta.url);
  const child=spawn(require('electron'),[path.join(here,'preview-window.cjs'),String(port)],{stdio:'inherit',windowsHide:true});
  child.on('error',error=>console.error('预览窗口启动失败：'+error.message));
  return child;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch(error=>{
  console.error(error.code==='EADDRINUSE'?'4175 端口已被其他程序占用。关闭占用程序，或设置 JEEWEAVE_PREVIEW_PORT 后重试。':error.message);
  process.exitCode=1;
});
