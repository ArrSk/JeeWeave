// The plugin owns its button, dialog and settings. Mobile only adapts presentation.
export function installAssistant() {
  const copy=(node,text)=>{if(node&&node.textContent!==text)node.textContent=text;};
  const adapt=()=>{
    const button=document.querySelector('#desktop-assistant-open');
    const topbar=document.querySelector('.mobile-topbar');
    if(button&&topbar&&button.parentElement!==topbar){
      button.id='desktop-assistant-open';button.classList.add('mobile-assistant-trigger');
      button.setAttribute('aria-label','全局助手');
      topbar.insertBefore(button,document.querySelector('#mobile-search'));
    }
    const voice=document.querySelector('#desktop-assistant-dialog [data-voice]');
    if(voice)voice.title='手机系统语音输入';
    const hint=document.querySelector('#desktop-ai-settings .assistant-hint');
    if(hint)copy(hint,'默认 Flash-1017；密钥由 Android 系统加密保存在本机，不进入迁移包。浏览器预览不保存密钥。图片使用单独配置的视觉模型。');
    const help=document.querySelector('.assistant-help p');
    if(help&&help.textContent.includes('Windows'))help.textContent=help.textContent.replace('Windows听写','手机系统语音输入');
    const reminders=document.querySelector('.reminder-page-help .assistant-hint');
    if(reminders)copy(reminders,window.JeeWeaveNative?'定时提醒需要通知权限；短时提醒还需要准点权限。省电或强行停止可能延后，静默提示与长期注意无需通知权限。':'浏览器预览可体验提醒与今日展示，不发送系统通知。');
    const repair=document.querySelector('[data-repair]');
    if(repair&&!document.querySelector('#mobile-reminder-permission')){
      const permission=document.createElement('button');permission.id='mobile-reminder-permission';permission.className='secondary';permission.textContent='通知与准点权限';
      permission.onclick=async()=>{const result=await window.jeeWeaveDesktop.assistantRequest('reminder-permission');const status=document.querySelector('[data-page-reminder-status]');if(status)status.textContent=result.message||'请在系统中确认权限';};
      repair.after(permission);
    }
  };
  const observer=new MutationObserver(adapt);observer.observe(document.body,{childList:true,subtree:true});adapt();
}
