import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
const {collectPublicPage,parsePublicHtml}=createRequire(import.meta.url)('./web-collector.cjs');
test('公开页面保留正文段落，移除导航脚本并正确解析来源链接',()=>{
  const html='<title>校园 &amp; 活动</title><body><nav>导航</nav><main><h1>活动通知</h1><p>请于 2026-10-20 前提交报名表。</p><p>地点：图书馆。</p><a href="../form">报名链接</a><a href="javascript:alert(1)">不安全链接</a><script>secretScript()</script></main><footer>页脚</footer></body>';
  const result=parsePublicHtml(html,'https://example.com/news/notice');
  assert.equal(result.title,'校园 & 活动');assert.match(result.text,/活动通知\n请于/);assert.doesNotMatch(result.text,/secretScript|导航|页脚/);
  assert.deepEqual(result.links,[{text:'报名链接',href:'https://example.com/form'}]);
});
test('抓取后保存可追溯原文与元数据，使用重定向后的真实来源',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'jiwei-web-test-'));
  const result=await collectPublicPage('https://example.com/start',{root,fetcher:async()=>({ok:true,url:'https://example.com/final',headers:new Headers({'content-type':'text/html'}),text:async()=>'<title>通知</title><p>请提交报名表。</p>'})});
  assert.equal(result.ok,true);assert.equal(result.url,'https://example.com/final');
  const saved=JSON.parse(fs.readFileSync(path.join(result.directory,'capture.json'),'utf8'));
  assert.equal(saved.url,result.url);assert.match(saved.text,/提交/);assert.equal(fs.existsSync(path.join(result.directory,'page.html')),true);
});
test('无效地址、HTTP 错误、非文本或无正文时不会报告保存成功',async()=>{
  assert.equal((await collectPublicPage('file:///secret')).ok,false);
  assert.match((await collectPublicPage('https://example.com',{fetcher:async()=>({ok:false,status:502})})).message,/502/);
  assert.equal((await collectPublicPage('https://example.com',{fetcher:async()=>({ok:true,headers:new Headers({'content-type':'image/png'})})})).ok,false);
  assert.equal((await collectPublicPage('https://example.com',{fetcher:async()=>({ok:true,headers:new Headers(),text:async()=>'<script>onlyScript()</script>'})})).ok,false);
});
