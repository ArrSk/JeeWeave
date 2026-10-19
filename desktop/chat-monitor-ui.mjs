import { today } from '../shared/packages/core/src/semester-calendar.mjs';
import { chatKey, readChat, saveChatSource, setChatSourceEnabled, importChatText, ingestChatEvents, reviewChatMessage } from './chat-monitor.mjs';
import { readModules, isModuleEnabled } from './modules.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
export function createChatMonitorUI({ panel, storage, bridge, feedback, onChange }) {
  panel.className = 'desktop-chat-panel'; panel.hidden = true;
  panel.innerHTML = `<div class="intro desktop-page-head"><div><h1>群消息</h1><p>筛选 QQ / 微信群通知，核对后加入待办。</p></div><button class="secondary" type="button" data-chat-example>导入示例</button></div>
    <section class="panel desktop-chat-connection"><div class="panel-head"><div><h2>消息接入</h2><p id="chat-connection-status" role="status">本机接收未开启</p></div><button id="chat-refresh" class="secondary" type="button">刷新收件箱</button></div><p>先添加账号与群白名单，再开启本机接收。QQ 需配置外部 OneBot 11 登录端；微信需独立桥接适配器，目前未内置登录。也可直接粘贴消息试用。</p><details id="chat-connect-options"><summary>本机接收设置</summary><div class="desktop-button-row"><label>端口<input id="chat-port" type="number" min="1024" max="65535" value="5274" /></label><button id="chat-start" class="primary" type="button">开启本机接收</button><button id="chat-stop" class="secondary" type="button">停止接收</button></div><p>仅接收本机连接，重启后需主动开启；不会回复群消息。</p><div id="chat-credentials" hidden><label>QQ 上报地址<input id="chat-onebot-url" readonly /></label><label>微信桥接地址<input id="chat-wechat-url" readonly /></label><label>接入密钥<input id="chat-token" type="password" readonly autocomplete="off" /></label><button id="chat-show-token" class="secondary" type="button">显示密钥</button><p>QQ 配置 HTTP 上报的 token/secret，微信桥接使用 Bearer 密钥。密钥仅保存在本机 data，业务 JSON 不含密钥。</p></div></details></section>
    <section class="panel desktop-chat-sources"><div class="panel-head"><h2>监测来源</h2><span id="chat-source-count"></span></div><div id="chat-source-list"></div><details id="chat-source-options"><summary>添加或编辑来源</summary><form id="chat-source-form" class="desktop-chat-form"><input name="id" type="hidden" /><label>来源名称<input name="name" required maxlength="200" placeholder="如：班级通知群" /></label><label>平台<select name="platform"><option value="qq">QQ</option><option value="wechat">微信</option></select></label><label>接入方式<select name="transport"><option value="manual">手动整理</option><option value="onebot11">OneBot 11 本机上报</option></select></label><label>接入账号标识<input name="accountId" maxlength="200" placeholder="登录端账号 ID；手动来源选填" /></label><label>群标识<input name="groupId" required maxlength="200" placeholder="群号或适配器提供的 room ID" /></label><label>包含关键词<input name="keywords" placeholder="如：作业,考试,报名；留空保留全部文本" /></label><label>排除关键词<input name="excluded" placeholder="逗号分隔，命中任意一个即忽略" /></label><div class="desktop-button-row"><button type="button" id="chat-source-cancel" class="secondary">取消编辑</button><button type="submit" class="primary">保存来源</button></div></form></details></section>
    <section class="panel"><details id="chat-paste-options"><summary>粘贴 QQ / 微信消息</summary><form id="chat-paste-form" class="desktop-chat-form"><label>手动来源<select name="sourceId" required></select></label><label>消息发送日期<input name="date" type="date" required value="${today()}" /></label><label class="desktop-chat-wide">原消息<textarea name="text" rows="5" required maxlength="16000" placeholder="粘贴一条完整通知；相对日期按消息发送日推算"></textarea></label><button type="submit" class="primary">筛选并整理</button></form></details></section>
    <section class="panel"><div class="panel-head"><div><h2>消息收件箱</h2><p id="chat-inbox-count" role="status"></p></div><button id="chat-clear-reviewed" class="secondary" type="button">清理已处理记录</button></div><div class="desktop-filter-buttons" id="chat-filters"><button type="button" data-chat-filter="pending" aria-pressed="true">待确认</button><button type="button" data-chat-filter="all" aria-pressed="false">全部消息</button></div><p>日期由本地规则建议，请核对；仅支持文本。不会自动更改课程或创建待办。</p><div id="chat-message-list"></div></section><p id="chat-error" role="alert" class="desktop-form-error" hidden></p>`;
  const q = selector => panel.querySelector(selector), form = q('#chat-source-form');
  let filter = 'pending', draining = false, drainAgain = false;
  const reviewValues = new Map();
  const enabled = module => isModuleEnabled(readModules(storage), module);
  const showError = error => { q('#chat-error').hidden = false; q('#chat-error').textContent = error.message || String(error); feedback(error.message || String(error), 'error'); };
  const success = message => { q('#chat-error').hidden = true; feedback(message, 'success'); };
  const call = async (action, value) => { if (!bridge?.chat) throw Error('请从桌面端启动以使用本机接收。'); const result = await bridge.chat(action, value); if (!result.ok) throw Error(result.message); return result.result; };
  const clearCredentials = () => { q('#chat-credentials').hidden = true; q('#chat-token').value = ''; q('#chat-token').type = 'password'; q('#chat-show-token').textContent = '显示密钥'; };
  const updateTransport = value => {
    const wechat = form.elements.platform.value === 'wechat';
    form.elements.transport.innerHTML = `<option value="manual">手动整理</option><option value="${wechat ? 'wechat-bridge' : 'onebot11'}">${wechat ? '微信本机桥接（适配器待配置）' : 'OneBot 11 本机上报'}</option>`;
    form.elements.transport.value = value || 'manual'; form.elements.accountId.required = form.elements.transport.value !== 'manual';
  };
  form.elements.platform.addEventListener('change', () => updateTransport());
  form.elements.transport.addEventListener('change', () => { form.elements.accountId.required = form.elements.transport.value !== 'manual'; });
  function render() {
    const active = document.activeElement, activeReview = active?.closest('[data-chat-review-id]');
    const focus = activeReview && { id: activeReview.dataset.chatReviewId, name: active.name, start: active.selectionStart, end: active.selectionEnd };
    panel.querySelectorAll('[data-chat-review-id]').forEach(form => reviewValues.set(form.dataset.chatReviewId, { title: form.elements.title.value, date: form.elements.date.value }));
    const state = readChat(storage);
    q('[data-chat-example]').hidden = storage.getItem('jiwei-desktop-developer-mode') !== 'true';
    q('#chat-source-count').textContent = `${state.sources.filter(s => s.enabled).length} / ${state.sources.length} 已启用`;
    q('#chat-source-list').innerHTML = state.sources.map(s => `<div class="desktop-chat-source"><div><strong>${escape(s.name)}</strong><p>${s.platform === 'qq' ? 'QQ' : '微信'} · ${s.transport === 'manual' ? '手动整理' : '本机上报'} · ${escape(s.groupId)} · ${s.enabled ? '已启用' : '已暂停'}</p><small>${s.keywords.length ? `包含：${escape(s.keywords.join('、'))}` : '保留全部文本'}${s.excluded.length ? `；排除：${escape(s.excluded.join('、'))}` : ''}</small></div><div class="desktop-button-row"><button class="secondary" type="button" data-chat-edit-source="${escape(s.id)}">编辑</button><button class="secondary" type="button" data-chat-toggle-source="${escape(s.id)}">${s.enabled ? '暂停' : '启用'}</button></div></div>`).join('') || '<p class="empty">添加来源后，可粘贴消息或配置本机接收。</p>';
    const previous = q('#chat-paste-form').elements.sourceId.value;
    q('#chat-paste-form').elements.sourceId.innerHTML = state.sources.filter(s => s.transport === 'manual' && s.enabled).map(s => `<option value="${escape(s.id)}">${escape(s.name)}</option>`).join('');
    if ([...q('#chat-paste-form').elements.sourceId.options].some(o => o.value === previous)) q('#chat-paste-form').elements.sourceId.value = previous;
    q('#chat-paste-form button').disabled = !q('#chat-paste-form').elements.sourceId.value;
    q('#chat-inbox-count').textContent = `${state.messages.filter(m => m.draft.status === 'pending').length} 条待确认 · 共 ${state.messages.length} / 500 条`;
    const messages = state.messages.filter(m => filter === 'all' || m.draft.status === 'pending');
    q('#chat-message-list').innerHTML = messages.map(m => {
      const source = state.sources.find(s => s.id === m.sourceId), index = state.messages.indexOf(m), pending = m.draft.status === 'pending';
      const draft = reviewValues.get(m.id) || m.draft;
      return `<details class="desktop-chat-message" ${pending ? 'open' : ''}><summary><strong>${escape(source.name)}</strong><span>${escape(m.senderName)} · ${escape(new Date(m.sentAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }))} · ${pending ? '待确认' : m.draft.status === 'added' ? '已加入待办' : '已忽略'}</span></summary><pre>${escape(m.text)}</pre>${pending ? `<form data-chat-review="${index}" data-chat-review-id="${escape(m.id)}" class="desktop-chat-review"><label>待办名称<input name="title" maxlength="160" required value="${escape(draft.title)}" /></label><label>截止日期（可留空）<input name="date" type="date" value="${escape(draft.date)}" /></label>${m.draft.dateInferred ? '<p>日期含推算结果，请结合原消息核对。</p>' : ''}<div class="desktop-button-row"><button type="button" class="secondary" data-chat-ignore="${index}">忽略</button><button type="submit" class="primary" ${enabled('tasks') ? '' : 'disabled'}>确认加入待办</button></div>${enabled('tasks') ? '' : '<p>请先在插件管理中开启待办。</p>'}</form>` : ''}</details>`;
    }).join('') || '<p class="empty">没有待确认消息。可添加手动来源并粘贴通知，或在配置登录适配器后开启本机接收。</p>';
    q('#chat-clear-reviewed').disabled = !state.messages.some(m => m.draft.status !== 'pending');
    if (focus) { const form = [...panel.querySelectorAll('[data-chat-review-id]')].find(form => form.dataset.chatReviewId === focus.id), input = form?.elements[focus.name]; if (input) { input.focus({ preventScroll: true }); if (typeof focus.start === 'number') input.setSelectionRange(focus.start, focus.end); } }
  }
  async function updateStatus() {
    if (!bridge?.chat) return;
    const status = await call('status');
    q('#chat-connection-status').textContent = status.running ? `本机接收已开启 · 端口 ${status.port} · 缓冲 ${status.pending} 条（不代表 QQ / 微信已登录）` : `本机接收未开启 · 缓冲 ${status.pending} 条`;
    q('#chat-start').disabled = status.running || !enabled('chat-monitor'); q('#chat-stop').disabled = !status.running; q('#chat-port').disabled = status.running;
    q('#chat-view-config').disabled = !status.running;
    if (status.running) q('#chat-port').value = status.port;
    if (!status.running) clearCredentials();
  }
  async function drain() {
    if (draining) { drainAgain = true; return; }
    if (!bridge?.chat || !enabled('chat-monitor')) return;
    draining = true;
    try {
      const events = await call('pending');
      if (events.length) { ingestChatEvents(storage, events); await call('ack', events.map(e => JSON.stringify([e.platform, e.accountId, e.groupId, e.externalId]))); render(); onChange(); }
      await updateStatus();
    } catch (error) { showError(error); } finally { draining = false; if (drainAgain) { drainAgain = false; drain(); } }
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    try { saveChatSource(storage, Object.fromEntries(new FormData(form)), form.elements.id.value || undefined); form.reset(); updateTransport(); q('#chat-source-options').open = false; render(); success('来源已保存；本机接收只保留匹配账号和群的文本。'); } catch (error) { showError(error); }
  });
  q('#chat-source-cancel').onclick = () => { form.reset(); updateTransport(); q('#chat-source-options').open = false; };
  q('#chat-paste-form').addEventListener('submit', event => {
    event.preventDefault(); const fields = event.target.elements;
    try { const result = importChatText(storage, fields.sourceId.value, fields.text.value, `${fields.date.value}T12:00:00+08:00`); if (result.added) fields.text.value = ''; render(); success(result.added ? '已整理到收件箱，请核对后加入待办。' : '消息重复或未命中规则，未新增记录。'); } catch (error) { showError(error); }
  });
  panel.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button) return;
    try {
      if (button.dataset.chatFilter) { filter = button.dataset.chatFilter; q('#chat-filters').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button))); render(); }
      if (button.dataset.chatEditSource) { const source = readChat(storage).sources.find(s => s.id === button.dataset.chatEditSource); form.reset(); form.elements.platform.value = source.platform; updateTransport(source.transport); for (const key of ['id', 'name', 'accountId', 'groupId']) form.elements[key].value = source[key]; for (const key of ['keywords', 'excluded']) form.elements[key].value = source[key].join(','); q('#chat-source-options').open = true; form.elements.name.focus(); }
      if (button.dataset.chatToggleSource) { const source = readChat(storage).sources.find(s => s.id === button.dataset.chatToggleSource); setChatSourceEnabled(storage, source.id, !source.enabled); render(); success(source.enabled ? '来源已暂停，已有消息保留。' : '来源已启用。'); }
      if (button.dataset.chatIgnore) { reviewChatMessage(storage, readChat(storage).messages[Number(button.dataset.chatIgnore)].id, { ignore: true }); render(); success('已忽略，可在全部消息中查看。'); }
    } catch (error) { showError(error); }
  });
  panel.addEventListener('submit', event => {
    const target = event.target.closest('[data-chat-review]'); if (!target) return; event.preventDefault();
    try { reviewChatMessage(storage, readChat(storage).messages[Number(target.dataset.chatReview)].id, Object.fromEntries(new FormData(target))); render(); onChange(); success('已加入待办，原消息保留作来源。'); } catch (error) { showError(error); }
  });
  q('#chat-start').onclick = async () => {
    q('#chat-start').disabled = true;
    try {
      const state = readChat(storage); if (!state.sources.some(s => s.enabled && s.transport !== 'manual')) throw Error('请先添加并启用一个本机上报来源，填写账号与群标识。');
      await call('start', Number(q('#chat-port').value)); const config = await call('credentials');
      q('#chat-onebot-url').value = config.onebotUrl; q('#chat-wechat-url').value = config.wechatUrl; q('#chat-token').value = config.token; q('#chat-credentials').hidden = false;
      await updateStatus(); await drain(); success('本机接收已开启；请将接入参数配置到外部登录适配器。');
    } catch (error) { showError(error); await updateStatus().catch(() => {}); }
  };
  q('#chat-stop').onclick = async () => { try { await call('stop'); await updateStatus(); success('已停止本机接收。'); } catch (error) { showError(error); } };
  const viewConfig = document.createElement('button'); viewConfig.id = 'chat-view-config'; viewConfig.className = 'secondary'; viewConfig.type = 'button'; viewConfig.textContent = '查看接入参数'; viewConfig.disabled = true;
  q('#chat-stop').after(viewConfig);
  viewConfig.onclick = async () => { try { const config = await call('credentials'); q('#chat-onebot-url').value = config.onebotUrl; q('#chat-wechat-url').value = config.wechatUrl; q('#chat-token').value = config.token; q('#chat-credentials').hidden = false; } catch (error) { showError(error); } };
  q('#chat-show-token').onclick = () => { const hidden = q('#chat-token').type === 'password'; q('#chat-token').type = hidden ? 'text' : 'password'; q('#chat-show-token').textContent = hidden ? '隐藏密钥' : '显示密钥'; };
  q('#chat-refresh').onclick = () => { render(); drain(); };
  q('#chat-clear-reviewed').onclick = () => { try { if (!confirm('清理已处理消息原文？已加入的待办及其来源证据会保留，待确认消息不变。')) return; const state = readChat(storage); state.messages = state.messages.filter(m => m.draft.status === 'pending'); storage.setItem(chatKey, JSON.stringify(state)); render(); success('已清理已处理消息。'); } catch (error) { showError(error); } };
  q('[data-chat-example]').onclick = () => {
    try {
      if (storage.getItem('jiwei-desktop-developer-mode') !== 'true') throw Error('请先开启开发者模式。');
      if (!enabled('chat-monitor')) throw Error('请先在插件管理中开启群消息。');
      for (const platform of ['qq', 'wechat']) {
        let source = readChat(storage).sources.find(s => s.groupId === `example-${platform}` && s.transport === 'manual');
        if (!source) source = saveChatSource(storage, { name: `${platform === 'qq' ? 'QQ' : '微信'}虚构示例群`, platform, transport: 'manual', groupId: `example-${platform}`, accountId: '', keywords: '提交,报名', excluded: '已取消' });
        importChatText(storage, source.id, platform === 'qq' ? '请在明天前提交实验报告，提交入口见班级通知。' : '活动报名截止 2026年11月1日，请确认后报名。', '2026-10-18T12:00:00+08:00');
      }
      render(); success('QQ / 微信虚构示例已加入收件箱，未连接真实账号。');
    } catch (error) { showError(error); }
  };
  bridge?.onChatAvailable?.(drain);
  render(); drain();
  return { refresh: () => { render(); drain(); updateStatus().catch(showError); }, hide: clearCredentials, reset: () => { reviewValues.clear(); panel.querySelectorAll('[data-chat-review-id]').forEach(form => form.removeAttribute('data-chat-review-id')); clearCredentials(); render(); } };
}
