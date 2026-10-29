// Native-side checks also apply when a caller bypasses renderer UI/services.
function createPlatformPermissions({isLocal,getWorkspace,onDisable=()=>{},onError=()=>{}}) {
  const epochs={'course-import':0,'web-capture':0,assistant:0,reminders:0};
  const enabled=(snapshot,id)=>{const flags=snapshot?.data?.preferences?.modules?.enabled||{};return flags[id]!==false&&(id!=='course-import'||flags.courses!==false);};
  const assert=(event,id)=>{if(!Object.hasOwn(epochs,id)||!isLocal(event))throw Error('此页面无权使用该平台能力。');if(!enabled(getWorkspace(),id))throw Error('该功能已关闭，请在插件管理中重新开启。');};
  return {
    begin(event,id){assert(event,id);const epoch=epochs[id];return()=>{assert(event,id);if(epochs[id]!==epoch)throw Error('操作已取消：功能或工作区已变化。');};},
    reconcile(before,next,restored=false){for(const id of Object.keys(epochs)){const was=enabled(before,id),now=enabled(next,id);if(was!==now||restored)epochs[id]++;if(was&&!now)try{onDisable(id);}catch(error){try{onError(error);}catch{}}}},
  };
}
module.exports={createPlatformPermissions};
