const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// A receive-only loopback bridge. Never launches clients or sends chat messages.
function createChatReceiver({ root, accept, notify = () => {} }) {
  let server, token, starting = false, generation = 0;
  const directory = path.join(root, 'integrations', 'chat');
  const queuePath = path.join(directory, 'pending.json');
  const keyPath = path.join(directory, 'receiver-key.json');
  const write = (file, value) => {
    fs.mkdirSync(directory, { recursive: true });
    const temp = file + '.tmp';
    const descriptor = fs.openSync(temp, 'w', 0o600);
    try { fs.writeFileSync(descriptor, JSON.stringify(value)); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
    fs.renameSync(temp, file);
  };
  const pending = () => {
    if (!fs.existsSync(queuePath)) return [];
    const value = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
    if (value.schemaVersion !== 1 || !Array.isArray(value.events) || value.events.length > 200) throw Error('群消息缓冲格式无效，请保留原文件后检查。');
    return value.events;
  };
  const status = () => ({ running: Boolean(server?.listening), port: server?.address()?.port || null, pending: pending().length });
  const equal = (a, b) => typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  async function start(port = 5274) {
    if (server?.listening) return status();
    if (starting) throw Error('接收器正在启动，请稍候。');
    if (!Number.isInteger(port) || port < 0 || port > 65535 || (port !== 0 && port < 1024)) throw Error('端口应为 1024–65535。');
    starting = true;
    const currentGeneration = ++generation;
    try {
      pending();
      if (fs.existsSync(keyPath)) {
        const value = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
        if (value.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(value.token)) throw Error('消息接入密钥格式无效，请保留文件后检查。');
        token = value.token;
      } else { token = crypto.randomBytes(32).toString('hex'); write(keyPath, { schemaVersion: 1, token }); }
      const candidate = http.createServer({ maxHeaderSize: 8192, requestTimeout: 10000, headersTimeout: 10000 }, (req, res) => {
        const reply = code => { if (!res.writableEnded) { res.writeHead(code, { 'Cache-Control': 'no-store', 'Connection': 'close' }); res.end(); } };
        if (req.method !== 'POST' || !['/onebot', '/wechat'].includes(req.url)) { reply(404); req.resume(); return; }
        // Browser-origin requests are not a configured local connector.
        if (req.headers.origin || !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) { reply(415); req.resume(); return; }
        let bytes = 0, chunks = [], oversized = false;
        req.setTimeout(10000, () => { reply(408); req.destroy(); });
        req.on('error', () => reply(400));
        req.on('data', chunk => {
          bytes += chunk.length;
          if (bytes > 128 * 1024) { oversized = true; chunks = []; reply(413); req.destroy(); } else if (!oversized) chunks.push(chunk);
        });
        req.on('end', () => {
          if (oversized) return;
          try {
            if (server !== candidate || !server.listening) { reply(503); return; }
            const raw = Buffer.concat(chunks);
            const signed = `sha1=${crypto.createHmac('sha1', token).update(raw).digest('hex')}`;
            if (!equal(req.headers.authorization, `Bearer ${token}`) && !(req.url === '/onebot' && equal(req.headers['x-signature'], signed))) { reply(401); return; }
            const payload = JSON.parse(raw.toString('utf8'));
            const event = accept(payload, req.url === '/onebot' ? 'onebot11' : 'wechat-bridge');
            if (!event) { reply(204); return; }
            const events = pending();
            const key = e => JSON.stringify([e.platform, e.accountId, e.groupId, e.externalId]);
            if (!events.some(e => key(e) === key(event))) {
              if (events.length >= 200) { reply(429); return; }
              write(queuePath, { schemaVersion: 1, events: [...events, event] });
            }
            reply(204); try { notify(); } catch { /* Durable queue is retried on the next UI refresh. */ }
          } catch (error) { reply(error instanceof SyntaxError ? 400 : error.code ? 503 : 422); }
        });
      });
      candidate.maxConnections = 8;
      try { await new Promise((resolve, reject) => { candidate.once('error', reject); candidate.listen(port, '127.0.0.1', resolve); }); }
      catch (error) { candidate.close(); throw error; }
      candidate.on('error', () => {});
      if (currentGeneration !== generation) { candidate.close(); candidate.closeAllConnections(); throw Error('本机接收启动已取消。'); }
      server = candidate; return status();
    } finally { starting = false; }
  }
  function stop() { generation++; const old = server; server = undefined; if (old) { old.close(); old.closeAllConnections(); } return { running: false, port: null }; }
  return { start, stop, status, pending, credentials: () => { if (!server?.listening) throw Error('请先开启本机接收。'); return { token, onebotUrl: `http://127.0.0.1:${server.address().port}/onebot`, wechatUrl: `http://127.0.0.1:${server.address().port}/wechat` }; }, ack: ids => {
    if (!Array.isArray(ids) || ids.length > 200 || ids.some(id => typeof id !== 'string')) throw Error('消息确认参数无效。');
    const selected = new Set(ids); write(queuePath, { schemaVersion: 1, events: pending().filter(e => !selected.has(JSON.stringify([e.platform, e.accountId, e.groupId, e.externalId]))) });
  } };
}
module.exports = { createChatReceiver };
