const fs = require('fs');
const { ElectronBlocker } = require('@ghostery/adblocker-electron');

// Filter lists are cached on disk so blocking works offline; refresh them weekly.
const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Ad and tracker blocking (EasyList and friends) for one session, switchable at runtime.
function createAdBlocker(session, cachePath) {
  let loading = null;
  let enabled = false;
  let blocking = false;

  function load() {
    if (!loading) {
      try {
        if (Date.now() - fs.statSync(cachePath).mtimeMs > MAX_CACHE_AGE_MS) fs.rmSync(cachePath);
      } catch {
        // no cache yet
      }
      loading = ElectronBlocker.fromPrebuiltAdsAndTracking(fetch, {
        path: cachePath,
        read: fs.promises.readFile,
        write: fs.promises.writeFile,
      }).catch((err) => {
        console.error(`Ad blocking unavailable: ${err.message}`);
        loading = null; // try again next time it's switched on
        return null;
      });
    }
    return loading;
  }

  // Resolves once the session matches the requested state (or loading the lists failed).
  async function setEnabled(on) {
    enabled = on;
    if (!on && !blocking) return;
    const blocker = await load();
    if (!blocker || enabled === blocking) return; // a later call already settled it
    if (enabled) blocker.enableBlockingInSession(session);
    else blocker.disableBlockingInSession(session);
    blocking = enabled;
  }

  return { setEnabled };
}

module.exports = { createAdBlocker };
