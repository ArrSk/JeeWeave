const fs=require('node:fs'),path=require('node:path');
const {powershell,psQuote}=require('./windows-shell.cjs');
function createAssistantPlatform({root,safeStorage,fetcher=fetch,platform=process.platform,enabled=()=>true}){
  const configFile=path.join(root,'assistant-secrets.bin');
  fs.mkdirSync(root,{recursive:true});
  const atomic=(file,data)=>{const temp=file+'.new';try{fs.writeFileSync(temp,data,{mode:0o600});fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}};
  const encrypt=async text=>{if(safeStorage.encryptStringAsync)return safeStorage.encryptStringAsync(text);if(!safeStorage.isEncryptionAvailable())throw Error('系统加密不可用，未保存密钥');return safeStorage.encryptString(text);};
  const decrypt=async bytes=>{if(!safeStorage.decryptStringAsync)return safeStorage.decryptString(bytes);const value=await safeStorage.decryptStringAsync(bytes);return typeof value==='string'?value:value.result;};
  const config=async()=>{
    const c=fs.existsSync(configFile)?JSON.parse(await decrypt(fs.readFileSync(configFile))):{textModel:'deepseek-flash',visionUrl:'',visionModel:''};
    if(c.draftModelVersion!==3){
      if(!c.textModel||['deepseek-v4-pro','deepseek-flash','deepseek-v4-flash','deepseek-chat','deepseek-reasoner','flash-1017'].includes(c.textModel))c.textModel='deepseek-flash';
      c.draftModelVersion=3;
    }
    if(c.textModel==='flash-1017')c.textModel='deepseek-flash';
    return c;
  };
  const endpoint=value=>{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.hash)throw Error('API 地址须为无账号密码的 HTTPS 地址');return u.href;};
  let queue=Promise.resolve(),parsing=false,activeRequest=null;
  const serial=job=>{const run=queue.then(()=>{assertEnabled('assistant');return job();});queue=run.catch(()=>{});return run;};
  const assertEnabled=id=>{if(!enabled(id))throw Error((id==='assistant'?'全局助手':'提醒')+'插件已关闭，请在插件管理中开启。');};
  async function handle(action,p={}){
    assertEnabled('assistant');
    if(action==='settings-get'){const c=await config();return {ok:true,textModel:c.textModel,visionUrl:c.visionUrl,visionModel:c.visionModel,textKeySaved:Boolean(c.textKey),visionKeySaved:Boolean(c.visionKey)};}
    if(action==='settings-save')return serial(async()=>{const c=await config();for(const k of ['textModel','textKey','visionUrl','visionModel','visionKey']){if(typeof p[k]!=='string'||p[k].length>4000)throw Error('设置字段无效');if(!k.endsWith('Key')||p[k].trim())c[k]=p[k].trim();}if(!c.textModel)throw Error('请填写文本模型');if(c.textModel==='flash-1017')c.textModel='deepseek-flash';if(c.visionUrl)c.visionUrl=endpoint(c.visionUrl);atomic(configFile,await encrypt(JSON.stringify(c)));return {ok:true};});
    if(action==='settings-clear')return serial(async()=>{if(fs.existsSync(configFile))fs.unlinkSync(configFile);return {ok:true};});
    if(action==='parse'){
      if(parsing)throw Error('上一条输入仍在处理');parsing=true;
      try {
        const {intentRequest,normalizeDraft,parseDraftContent,fallbackDraft}=await import('./assistant-core.mjs');
        if(typeof p.text!=='string'||p.text.length>4000||p.image&&(!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(p.image)||p.image.length>1024*1024))throw Error('输入格式或图片大小无效');
        const c=await config(),vision=Boolean(p.image),key=c[vision?'visionKey':'textKey'],model=c[vision?'visionModel':'textModel'];
        if(!key||!model)throw Error(vision?'请配置视觉模型和密钥':'请先配置 DeepSeek 密钥');
        const catalog=Array.isArray(p.catalog)?p.catalog:[];
        const body={...intentRequest(p.text,p.image,new Date(),catalog,Array.isArray(p.context)?p.context:[]),model,stream:false};if(!vision)body.thinking={type:'disabled'};
        const url=vision?endpoint(c.visionUrl):'https://api.deepseek.com/chat/completions';
        activeRequest=new AbortController();const signal=AbortSignal.any([activeRequest.signal,AbortSignal.timeout(60000)]);let tokens=0,usageKnown=true;
        const request=async payload=>{
          assertEnabled('assistant');
          const response=await fetcher(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify(payload),redirect:'error',signal});
          if(!response.ok)throw Error('API 返回 HTTP '+response.status+'，请检查密钥、模型或额度');
          let text='',size=0;const reader=response.body.getReader(),decoder=new TextDecoder();
          try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>128*1024){await reader.cancel();throw Error('API 响应过大');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
          assertEnabled('assistant');signal.throwIfAborted();
          let json;try{json=JSON.parse(text);}catch{throw Error('API响应无法解析，未执行任何操作');}
          if(typeof json.usage?.total_tokens==='number')tokens+=json.usage.total_tokens;else usageKnown=false;
          const choice=json.choices?.[0];if(!choice?.message)throw Error('API未返回模型消息，未执行任何操作');
          return {content:choice.message.content||'',finish:choice.finish_reason};
        };
        let reply=await request(body),intent,problem='',repaired=false,notice='';
        for(let attempt=0;attempt<2;attempt++){
          try{
            if(reply.finish!=='stop')throw Error(reply.finish==='length'?'模型回复达到输出长度上限':'模型回复未正常完成');
            intent=normalizeDraft(parseDraftContent(reply.content),p.text,Date.now(),catalog);
            break;
          }catch(error){problem=String(error.message).slice(0,240);}
          if(attempt===0){
            repaired=true;
            reply=await request({...body,max_tokens:3072,messages:[...body.messages,{role:'assistant',content:reply.content.slice(0,16000)},{role:'user',content:'程序校验未通过：'+problem+'。请仅修复返回格式，保持原需求、已知编号和关联目标不变。使用系统定义的draft/steps，公共命令必须action=call、name为目录名、args为数组；只能使用已注册命令。不要把原需求改写成笔记，不增加额外事项。只输出完整JSON。'}]});
          }
        }
        if(!intent){intent=fallbackDraft(p.text);notice='草稿校验未通过：'+problem+'。原输入已保留，未执行任何操作。';}
        else if(repaired)notice='已自动修正模型返回格式，请核对草稿后确认。';
        return {ok:true,intent,notice,model,repaired,tokens:usageKnown?tokens:null};
      }catch(error){assertEnabled('assistant');if(error.name==='TimeoutError'||error.name==='AbortError')throw Error('API 请求超时，请稍后再试');throw error;}finally{parsing=false;activeRequest=null;}
    }
    if(action==='voice'){
      if(platform!=='win32')throw Error('当前系统不支持 Windows 听写');
      await powershell('Add-Type -TypeDefinition '+psQuote('using System;using System.Runtime.InteropServices;public static class JeeWeaveKeys{[DllImport("user32.dll")]public static extern void keybd_event(byte k,byte s,uint f,UIntPtr e);}')+';[JeeWeaveKeys]::keybd_event(0x5B,0,0,[UIntPtr]::Zero);[JeeWeaveKeys]::keybd_event(0x48,0,0,[UIntPtr]::Zero);[JeeWeaveKeys]::keybd_event(0x48,0,2,[UIntPtr]::Zero);[JeeWeaveKeys]::keybd_event(0x5B,0,2,[UIntPtr]::Zero)');
      return {ok:true,message:'已请求 Windows 听写；若未弹出，请聚焦输入框后按 Win+H。'};
    }
    throw Error('不支持此助手操作');
  }
  return {handle,reconcile(){if(!enabled('assistant'))activeRequest?.abort();}};
}
module.exports={createAssistantPlatform};
