// Full reset/relaunch test uses only a fresh, explicitly isolated data directory.
const {spawn}=require('node:child_process');
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const output=path.resolve(__dirname,`../.cache/verification/reset-flow-${Date.now()}`),root=path.join(output,'data');fs.mkdirSync(root,{recursive:true});
const env={...process.env,JEEWEAVE_DATA_DIR:root,JEEWEAVE_RESET_EVIDENCE:output};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(process.execPath,[path.resolve(__dirname,'../../node_modules/electron/cli.js'),path.join(__dirname,'fixtures/reset-main.cjs')],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
child.stdout.on('data',chunk=>process.stdout.write(chunk));child.stderr.on('data',chunk=>process.stderr.write(chunk));
let ended=false;child.on('error',error=>{console.error(error);ended=true;});
child.on('exit',code=>{if(code!==0)ended=true;});
(async()=>{for(let i=0;i<450;i++){if(fs.existsSync(path.join(output,'complete.json'))){const receipt=JSON.parse(fs.readFileSync(path.join(output,'complete.json'),'utf8'));assert.equal(receipt.ok,true,receipt.error);console.log(`PASS: developer-only reset UI/IPC, cancel/stale/foreign rejection, full backup, real app.relaunch and blank workspace/profile. Evidence: ${output}`);return;}if(ended)throw Error('Reset process failed to start');await new Promise(r=>setTimeout(r,100));}throw Error('Reset/relaunch receipt missing: '+output);})().catch(error=>{console.error(error.stack);process.exitCode=1;});
