import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';import {spawn} from 'node:child_process';
const here=path.dirname(fileURLToPath(import.meta.url)),base=path.resolve(here,'../.cache/test-runs');fs.mkdirSync(base,{recursive:true});
const root=fs.mkdtempSync(path.join(base,'assistant-check-'));const require=createRequire(import.meta.url);let child,code=1;
try{
  child=spawn(require('electron'),[path.join(here,'assistant-ui.cjs')],{env:{...process.env,JEEWEAVE_DATA_DIR:root},stdio:'inherit',windowsHide:true});
  const stop=()=>child?.kill();process.once('SIGINT',stop);process.once('SIGTERM',stop);
  try{code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',n=>resolve(n??1));});}finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
  if(code===0&&process.argv.includes('--review')&&process.stdin.isTTY){console.log('REVIEW_IMAGE='+path.join(root,'assistant-panel.png'));console.log('Press Enter to finish review and clean test files.');await new Promise(resolve=>{process.stdin.resume();process.stdin.once('data',resolve);});process.stdin.pause();}
}finally{
  const {createReminderPlatform}=require('../reminder-platform.cjs');const service=createReminderPlatform({root});
  for(const row of (await service.handle('reminders-list')).rows)await service.handle('reminder-cancel',{id:row.id});
  if(path.dirname(root)!==base)throw Error('Unsafe test cleanup path');fs.rmSync(root,{recursive:true,force:true,maxRetries:20,retryDelay:150});
  console.log('Desktop assistant test data and OS test tasks removed.');
}
process.exitCode=code;
