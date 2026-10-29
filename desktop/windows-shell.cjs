const {execFile}=require('node:child_process');
const psQuote=s=>"'"+s.replaceAll("'","''")+"'";
function powershell(code,{timeout=20000}={}){
  return new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-OutputFormat','Text','-EncodedCommand',Buffer.from("$ProgressPreference='SilentlyContinue';[Console]::OutputEncoding=[Text.Encoding]::UTF8;try { "+code+" } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }",'utf16le').toString('base64')],{windowsHide:true,timeout,maxBuffer:256*1024},(error,stdout,stderr)=>error?reject(Error('Windows 操作失败：'+String(stderr||error.message).slice(0,600))):resolve(stdout)));
}

module.exports={powershell,psQuote};
