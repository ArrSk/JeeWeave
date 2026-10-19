const fs = require('node:fs');
const path = require('node:path');

// The whole data folder is the portable migration unit, including login sessions.
// Keep the previous development profile untouched during one-time migration.
function configureStorage(app, options = {}) {
  const override = options.root || process.env.JIWEI_DATA_DIR;
  const root = path.resolve(override || (app.isPackaged ? path.join(path.dirname(app.getPath('exe')), 'data') : path.join(__dirname, 'data')));
  const paths = {
    root,
    profile: path.join(root, 'profile'),
    cache: path.join(root, 'cache'),
    logs: path.join(root, 'logs'),
    crashes: path.join(root, 'logs', 'crashes'),
    captures: path.join(root, 'captures'),
    exports: path.join(root, 'exports'),
  };
  fs.mkdirSync(root, { recursive: true });
  const source = options.legacyProfile || (!app.isPackaged && !override ? app.getPath('userData') : null);
  if (source && path.resolve(source) !== paths.profile && !fs.existsSync(paths.profile) && fs.existsSync(source)) {
    const temporary = path.join(root, 'profile-migration');
    fs.mkdirSync(temporary, { recursive: true });
    const filter = value => {
      if (fs.lstatSync(value).isSymbolicLink()) throw new Error('旧资料含链接，请手动迁移并保留原资料。');
      return !/^(LOCK|Singleton.*|lockfile)$/.test(path.basename(value));
    };
    for (const name of ['Local Storage', 'Session Storage', 'IndexedDB', 'Network', 'Partitions', 'Preferences', 'Local State', 'Cookies']) {
      const item = path.join(source, name);
      if (fs.existsSync(item)) fs.cpSync(item, path.join(temporary, name), { recursive: true, filter });
    }
    fs.renameSync(temporary, paths.profile);
    for (const name of ['web-captures', 'course-captures']) {
      const item = path.join(source, name);
      if (fs.existsSync(item) && !fs.existsSync(path.join(paths.captures, name))) fs.cpSync(item, path.join(paths.captures, name), { recursive: true, filter });
    }
    fs.writeFileSync(path.join(root, 'profile-migration.json'), JSON.stringify({ version: 1, source, migratedAt: new Date().toISOString(), originalPreserved: true }, null, 2));
  }
  for (const folder of Object.values(paths)) fs.mkdirSync(folder, { recursive: true });
  fs.accessSync(root, fs.constants.W_OK);
  app.setPath('userData', paths.profile);
  app.setPath('sessionData', paths.profile);
  app.setPath('crashDumps', paths.crashes);
  app.setPath('downloads', paths.exports);
  app.setAppLogsPath(paths.logs);
  app.commandLine.appendSwitch('disk-cache-dir', paths.cache);
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ format: 'jiwei-desktop-data', layoutVersion: 1, workspace: 'workspace.json', previous: 'workspace.previous.json', profile: 'profile', captures: 'captures', exports: 'exports', cache: 'cache', logs: 'logs' }, null, 2) + '\n');
  return paths;
}

module.exports = { configureStorage };
