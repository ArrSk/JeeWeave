import {installDesktopAssistant} from './assistant-ui.mjs';
import {validateIntent as validateAssistantIntent} from './assistant-core.mjs';
export function createAssistantActions(host,onChange=()=>{}){
  return async value => {
    const intent=validateAssistantIntent(value);
    if(intent.action==='call'){
      if(!host.inventory().commands.includes(intent.name))throw Error('该公共命令未注册或功能已关闭');
      const result=await host.run(intent.name,...intent.args);
      if(result?.ok===false)throw Error(result.message||'原功能未能完成操作');
      if(/\.(save|create|remove|toggle|setPhase|select|saveCourse|deleteCourse|archive|assign|unassign|change|collect|savePreferences|set)$/.test(intent.name)){onChange();}
      return result;
    }
    if (intent.action === 'reminder') {const result=await host.client('reminders').add(intent);return result.row;}
    if (intent.action === 'open') { host.navigate(intent.view); return; }
    if (intent.action === 'item' || intent.action === 'event') {
      const saved=host.client('items').save({kind:'task',type:intent.action==='event'?'event':intent.date?'deadline':'longterm',title:intent.title,date:intent.date,startTime:intent.time,endTime:intent.endTime,timed:intent.action==='event',phases:[]});
      host.navigate('plans'); return saved;
    }
    if (intent.action === 'note') {
      const journal=host.client('journal');
      if (journal.draft()) throw Error('已有笔记草稿，请先保存或放弃后再试。');
      const draft=journal.start();
      const saved=journal.saveDraft({...draft,body:intent.title},draft.revision);
      const published=journal.publish(saved.revision);host.navigate('notes');return published;
    }
    throw Error('不支持此操作');
  };
}

function assistantData(host){
    const signatures={'reminders.add':'[{mode:timed|silent|attention,title,at?:毫秒,date?:YYYY-MM-DD,daily?:boolean}]','reminders.cancel':'[提醒id]','reminders.state':'[提醒id,archived:boolean]','today.query':'[YYYY-MM-DD,HH:mm]','overview.query':'[]','courses.onDate':'[YYYY-MM-DD,HH:mm]','plugins.set':'[模块id,true|false]','settings.theme':'[设置中已存在的主题id]','objects.assign':'[对象id,ref:{collection,id,containerId?}]','objects.unassign':'[对象id,ref]','objects.archive':'[对象id]','objects.save':'[{title,type:course|project|general,purpose?},对象id?]','items.save':'[fields:{title,type:longterm|deadline|event|range|weekly,date:日期或每周起始日期,weekdays?:[1..7],until?,timed?:boolean,startTime?,endTime?,phases?},options?:{objectId?,ref?:{collection:task|plan,id}}]','items.get':'[ref:{collection:task|plan,id}]','items.remove':'[ref:{collection:task|plan,id}]','items.toggle':'[ref:{collection:task|plan,id},date?:YYYY-MM-DD]','courses.create':'[{name,totalWeeks,startDate?}]','courses.select':'[课表id]','courses.remove':'[课表id]','courses.saveCourse':'[{title,weekday:1..7,periodStart,periodEnd,weeksText,teacher?,location?},options?:{id?}]','search.query':'[{text,collection?,objectId?}]','journal.change':'[笔记id,archive|unarchive|trash|restore|purge]','calendar.savePreferences':'[视图筛选配置]','records.open':'[ref:{collection,id,containerId?}]','items.edit':'[task|plan,id?,date?,type?]','courses.edit':'[课程id,date?,课表id?]','courses.adjust':'[课程id,date,课表id?]'};
    const catalog=()=>host.inventory().commands.map(name=>({name,args:signatures[name]||(/\.(open|new|settings|import|batch|schedule|openFolder|export|preferences|current)$/.test(name)?'[]':/\.list$/.test(name)?'[]':'[原功能参数；已有目标用真实编号，缺少新对象可先创建]')}));
    const context=text=>{try{
      const aliases={'高数':'高等数学','线代':'线性代数','大物':'大学物理','大英':'大学英语'};const expanded=text+' '+Object.entries(aliases).filter(([short])=>text.includes(short)).map(([,full])=>full).join(' ');
      const query=host.client('search'),direct=query.query({text}).results||[];
      const candidates=direct.length?direct:(query.query({text:''}).results||[]).filter(row=>{
        const title=row.title||'';if(title.length>1&&expanded.includes(title))return true;
        let hits=0;for(let i=0;i<title.length-1;i++)if(expanded.includes(title.slice(i,i+2)))hits++;return hits>=2;
      });
      const selected=candidates.sort((a,b)=>(a.ref.collection==='object'?-2:a.ref.collection==='courseEntry'?-1:0)-(b.ref.collection==='object'?-2:b.ref.collection==='courseEntry'?-1:0)).slice(0,8).map(row=>{
        let details={};
        try{const found=row.ref.collection==='object'?{status:'found',record:host.client('objects').get(row.ref.id)}:host.client('records').inspect(row.ref);if(found.status==='found'){
          for(const key of ['type','purpose','date','startTime','endTime','weekday','periodStart','periodEnd','weekText','teacher','location'])if(found.record?.[key]!==undefined)details[key]=typeof found.record[key]==='string'?found.record[key].slice(0,180):found.record[key];
          if(row.ref.collection==='courseEntry')details.objectId=host.client('objects').context(row.ref).owner||'';
        }}catch{}
        return {title:row.title,ref:row.ref,...details};
      });
      try{const table=host.client('courses').current();selected.push({currentTable:{id:table.id,name:table.name,totalWeeks:table.totalWeeks,startDate:table.startDate,periods:table.schedule?.length}});}catch{}
      selected.push({features:{reminders:host.inventory().services.some(s=>s.id==='reminders')}});
      return selected;
    }catch{return [];}};
    return {catalog,context};
}
export function registerAssistantPlugin(runtime,host,bridge){
  if(typeof bridge?.assistant!=='function')return;
  runtime.register({id:'assistant',version:'1.0.0',hostApiVersion:1,requires:['workspace'],servicesRequired:{workspace:1},optional:['courses','items','objects','notes','reminders'],provides:['assistant'],capabilities:['ai-parser','system-dictation','image-picker'],activate(scope){
    const data=assistantData(host);
    const execute=createAssistantActions(host,()=>host.emit('assistant:executed'));
    scope.provide('assistant',{...data,execute,async request(action,payload={}){
      if(!['settings-get','settings-save','settings-clear','parse','voice','image'].includes(action))throw Error('不支持此助手接口');
      const valid=runtime.ticket('assistant'),result=await bridge.assistant(action,payload);valid();return result;
    }});
  }});
}
export function mountAssistantPlugin({runtime,host,settingsPanel,navigateSettings}){
  runtime.bindings('assistant').effect(()=>{
    const scope=host.scope('assistant'),api=host.client('assistant');
    const ui=installDesktopAssistant({bridge:{assistant:(...args)=>api.request(...args)},execute:intent=>api.execute(intent),catalog:()=>api.catalog(),context:text=>api.context(text),settingsPanel,navigateSettings,canRemind:()=>host.inventory().services.some(s=>s.id==='reminders')});
    scope.command('assistant.open',()=>ui.open());scope.command('settings.ai',()=>ui.openSettings());
    return()=>{ui.dispose();scope.dispose();};
  });
}
