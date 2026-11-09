const fs = require('node:fs');
const path = require('node:path');

// Node 22 fs.cp mishandles non-ASCII Windows paths (silent skips or mojibake);
// copy entries explicitly so build and smoke tests behave like Node 24.
module.exports = function copyTree(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name), to = path.join(target, entry.name);
    const stat = fs.statSync(from);
    if (stat.isDirectory()) copyTree(from, to);
    else if (stat.isFile()) fs.copyFileSync(from, to);
    else throw new Error(`不支持复制非普通文件：${from}`);
  }
};
