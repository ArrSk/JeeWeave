const {execFile}=require('node:child_process');
const psQuote=s=>"'"+s.replaceAll("'","''")+"'";
function windowsFailure(error,stderr,timeout){
  if(error.killed||error.code==='ETIMEDOUT')return `Windows 操作超时（${Math.ceil(timeout/1000)} 秒）。请检查系统任务计划服务后重试。`;
  const detail=String(stderr||'').trim();
  return 'Windows 操作失败：'+(detail?detail.slice(0,600):`无法完成系统调用（${error.code||'unknown'}）。请检查本机权限后重试。`);
}
function powershell(code,{timeout=20000}={}){
  return new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-OutputFormat','Text','-EncodedCommand',Buffer.from("$ProgressPreference='SilentlyContinue';[Console]::OutputEncoding=[Text.Encoding]::UTF8;try { "+code+" } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }",'utf16le').toString('base64')],{windowsHide:true,timeout,maxBuffer:256*1024},(error,stdout,stderr)=>error?reject(Error(windowsFailure(error,stderr,timeout))):resolve(stdout)));
}

module.exports={powershell,psQuote,windowsFailure};
