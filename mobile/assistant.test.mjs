import test from 'node:test';import assert from 'node:assert/strict';
import {validateIntent,localIntent,intentRequest} from './assistant-core.mjs';
test('local short reminders avoid API requests and validate future limits',()=>{
 const now=1700000000000;assert.deepEqual(localIntent('10分钟后提醒我取快递',now),{action:'reminder',title:'取快递',at:now+600000,daily:false});
 assert.equal(localIntent('随便聊聊',now),null);
 assert.throws(()=>validateIntent({action:'reminder',title:'x',at:now},now));
 assert.throws(()=>validateIntent({action:'reminder',title:'x',at:now+1000,daily:'false'},now));
});
test('intent allowlist rejects arbitrary execution, invalid dates and ambiguous timed events',()=>{
 assert.throws(()=>validateIntent({action:'eval',title:'x'}));assert.throws(()=>validateIntent({action:'open',view:'unknown'}));
 assert.throws(()=>validateIntent({action:'item',title:'x',date:'2026-02-30'}));
 assert.throws(()=>validateIntent({action:'event',title:'x',date:'2026-11-01',time:'18:00',endTime:'17:00'}));
 assert.equal(validateIntent({action:'event',title:'讨论',date:'2026-11-01',time:'14:00',endTime:'15:00'}).endTime,'15:00');
});
test('one-request protocol bounds output and never supplies workspace history',()=>{
 const req=intentRequest('记住带钥匙',null,new Date('2026-10-29T00:00:00Z'));
 assert.equal(req.max_tokens,512);assert.equal(req.messages.length,2);assert.equal(req.response_format.type,'json_object');
 assert.throws(()=>intentRequest('x'.repeat(4001)));
});
