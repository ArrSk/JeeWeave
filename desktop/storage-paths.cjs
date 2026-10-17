const fs = require('node:fs');
const path = require('node:path');

// Keep the Chromium profile intact: it contains courses and login sessions,
// not just disposable cache. Development continues to use its existing profile.
function configureStorage(app) {
  if (!app.isPackaged) return null;
  const root = path.join(path.dirname(app.getPath('exe')), 'data');
  const paths = {
    root,
    profile: path.join(root, 'profile'),
    cache: path.join(root, 'cache'),
    logs: path.join(root, 'logs'),
    crashes: path.join(root, 'logs', 'crashes'),
    captures: path.join(root, 'captures'),
  };
  for (const folder of Object.values(paths)) fs.mkdirSync(folder, { recursive: true });
  fs.accessSync(root, fs.constants.W_OK);
  app.setPath('userData', paths.profile);
  app.setPath('sessionData', paths.profile);
  app.setPath('crashDumps', paths.crashes);
  app.setAppLogsPath(paths.logs);
  app.commandLine.appendSwitch('disk-cache-dir', paths.cache);
  return paths;
}

module.exports = { configureStorage };
