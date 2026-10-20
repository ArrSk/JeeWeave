import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml } from './ui-text.mjs';

test('用户文字不能退出文本节点或带引号属性', () => {
  const value = escapeHtml(`"><img src=x onerror='alert(1)'> & 中文\n下一行`);
  assert.equal(value, '&quot;&gt;&lt;img src=x onerror=&#39;alert(1)&#39;&gt; &amp; 中文\n下一行');
  assert.doesNotMatch(value, /[<>"']/);
});

test('空值显示为空，保留零、布尔值与已经包含实体的原文', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(0), '0');
  assert.equal(escapeHtml(false), 'false');
  assert.equal(escapeHtml('&lt;课程&gt;'), '&amp;lt;课程&amp;gt;');
});
