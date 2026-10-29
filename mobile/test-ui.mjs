// Own the child process lifetime so Chromium releases its files before cleanup.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
const here=path.dirname(fileURLToPath(import.meta.url));
const base=path.join(here,'.cache','test-runs');fs.mkdirSync(base,{recursive:true});
const run=fs.mkdtempSync(path.join(base,'ui-'));
if(path.dirname(run)!==base)throw Error('Unsafe UI test directory');
let child,code=1;
try {
  const require=createRequire(import.meta.url);
  child=spawn(require('electron'),[path.join(here,'ui-test.cjs')],{stdio:'inherit',windowsHide:true,env:{...process.env,JEEWEAVE_UI_TEST_OUTPUT:run}});
  const stop=()=>child?.kill();
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  try {code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',exit=>resolve(exit??1));});}
  finally {process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
} finally {
  fs.rmSync(run,{recursive:true,force:true,maxRetries:20,retryDelay:150});
  console.log('UI test data removed.');
}
process.exitCode=code;
