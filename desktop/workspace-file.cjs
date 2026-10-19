const fs = require('node:fs');
const path = require('node:path');

function createWorkspaceFile(root, validate) {
  const file = path.join(root, 'workspace.json');
  const previous = path.join(root, 'workspace.previous.json');
  let current = fs.existsSync(file) ? validate(JSON.parse(fs.readFileSync(file, 'utf8'))) : null;
  function write(candidate, options = {}) {
    const next = validate(candidate);
    if (next.revision !== (current?.revision || 0)) throw new Error('数据已被更新，请重新打开应用后再试。');
    next.revision += 1; next.updatedAt = new Date().toISOString();
    if (current) next.createdAt = current.createdAt;
    const encoded = JSON.stringify(next, null, 2) + '\n';
    if (Buffer.byteLength(encoded) > 32 * 1024 * 1024) throw new Error('工作区超过 32 MiB，请先备份并整理网页原文。');
    if (current && options.restore) {
      const backups = path.join(root, 'backups'); fs.mkdirSync(backups, { recursive: true });
      fs.writeFileSync(path.join(backups, `before-restore-${Date.now()}-${current.revision}.json`), JSON.stringify(current, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
    }
    const temporary = `${file}.tmp`;
    const descriptor = fs.openSync(temporary, 'w');
    try { fs.writeFileSync(descriptor, encoded, 'utf8'); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
    if (current) {
      fs.writeFileSync(`${previous}.tmp`, JSON.stringify(current, null, 2) + '\n', 'utf8');
      fs.renameSync(`${previous}.tmp`, previous);
    }
    fs.renameSync(temporary, file);
    current = next;
    return JSON.parse(JSON.stringify(current));
  }
  return { read: () => current && JSON.parse(JSON.stringify(current)), write };
}
module.exports = { createWorkspaceFile };
