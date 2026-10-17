// The close button means exit, including remote views which can otherwise veto quit.
function createAppLifecycle({ app, globalShortcut, getWindows, closePortal, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let exiting = false;
  let fallback;
  function quit() {
    if (exiting) return;
    exiting = true;
    app.isQuitting = true;
    globalShortcut.unregisterAll();
    // Destroy only this instance's windows; never kill by the shared electron.exe name.
    closePortal();
    for (const window of getWindows()) if (window && !window.isDestroyed()) window.destroy();
    fallback = setTimer(() => app.exit(0), 1500);
    fallback?.unref?.();
    app.quit();
  }
  app.on('before-quit', quit);
  app.on('will-quit', () => { if (fallback) clearTimer(fallback); });
  return { quit, bindMainWindow: window => window.on('close', quit) };
}
module.exports = { createAppLifecycle };
