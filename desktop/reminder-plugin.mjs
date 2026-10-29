import {installReminderUI} from './reminder-ui.mjs';
export function registerReminderPlugin(runtime,host,bridge){
  if(typeof bridge?.assistant!=='function')return;
  runtime.register({id:'reminders',version:'1.0.0',hostApiVersion:1,requires:['workspace'],servicesRequired:{workspace:1},provides:['reminders'],capabilities:['local-reminders','windows-tasks'],activate(scope){
    const actions={list:'reminders-list',add:'reminder-add',cancel:'reminder-cancel',state:'reminder-state',repair:'reminder-repair'};
    const request=async(action,payload={})=>{
      if(!Object.values(actions).includes(action))throw Error('不支持此提醒接口');
      const valid=runtime.ticket('reminders'),result=await bridge.assistant(action,payload);valid();
      if(!result?.ok)throw Error(result?.message||'提醒操作失败');
      if(action!=='reminders-list')host.emit('reminders:committed');return result;
    };
    const api={request,list:()=>request(actions.list),add:value=>request(actions.add,value),cancel:id=>request(actions.cancel,{id}),state:(id,archived)=>request(actions.state,{id,archived}),repair:()=>request(actions.repair)};
    scope.provide('reminders',api);
    for(const name of Object.keys(actions))scope.command('reminders.'+name,(...args)=>api[name](...args));
  }});
}
export function mountReminderPlugin({runtime,host,todayPanel,navigateReminders,registerPage}){
  runtime.bindings('reminders').effect(()=>{
    const scope=host.scope('reminders'),api=host.client('reminders');
    const ui=installReminderUI({bridge:{assistant:(...args)=>api.request(...args)},todayPanel,navigateReminders,registerPage});
    scope.command('reminders.open',()=>navigateReminders());
    scope.on('reminders:committed',()=>ui.refresh());
    return()=>{ui.dispose();scope.dispose();};
  });
}
