import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseTimeText,shiftTime,shiftDate} from './design-inputs.mjs';
test('时间简写支持24小时与12小时，并拒绝非法值',()=>{
 for(const [input,expected]of [['0930','09:30'],['930','09:30'],['9p','21:00'],['12am','00:00'],['12p','12:00'],['9:45','09:45'],['','']])assert.equal(parseTimeText(input),expected,input);
 for(const input of ['2400','09:60','25','0p','2026-01-01','abc'])assert.equal(parseTimeText(input),null,input);
});
test('时间与日期微调不受执行环境时区影响',()=>{
 assert.equal(shiftTime('23:45',15),'00:00');assert.equal(shiftTime('00:00',-60),'23:00');assert.equal(shiftDate('2026-12-31',1),'2027-01-01');assert.equal(shiftDate('2024-02-28',1),'2024-02-29');
});
