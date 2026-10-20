const { isMeowdbUrl } = require('./settings-store');

// Sign-in providers meowdb might send people to; these stay inside the app so login works.
const OAUTH_HOSTS = [
  'accounts.google.com',
  'discord.com',
  'www.discord.com',
  'appleid.apple.com',
  'www.facebook.com',
  'id.twitch.tv',
  'twitter.com',
  'x.com',
  'api.twitter.com',
];

const ACTIVATE_GRACE_MS = 500;

// Only these may ever be granted to meowdb's page; everything else (clipboard reading, fullscreen,
// notifications, location, camera...) is refused.
const ALLOWED_PERMISSIONS = ['clipboard-sanitized-write'];

// Where a link from the panel should go: 'panel' (load in place), 'popup' (in-app window),
// 'external' (system browser), or 'deny'. Only web links ever reach the OS: other schemes
// (file:, ms-msdt:, search-ms:...) can launch programs.
function classifyNavigation(url, disposition) {
  if (isMeowdbUrl(url)) return 'panel';
  let host;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'deny';
    host = u.hostname;
  } catch {
    return 'deny';
  }
  if (OAUTH_HOSTS.includes(host)) return disposition === 'new-window' ? 'popup' : 'panel';
  return 'external';
}

// After one of our windows loses focus: drop the panel to passive unless focus went to another
// of our windows (Settings, a login popup) or we're still in the middle of activating.
function shouldDropToPassive({ active, ownWindowFocused, msSinceActivate }) {
  return active && !ownWindowFocused && msSinceActivate >= ACTIVATE_GRACE_MS;
}

const isPermissionAllowed = (permission) => ALLOWED_PERMISSIONS.includes(permission);

module.exports = { OAUTH_HOSTS, ACTIVATE_GRACE_MS, isMeowdbUrl, classifyNavigation, shouldDropToPassive, isPermissionAllowed };
