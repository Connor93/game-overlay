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

// Where a link from the panel should go: 'panel' (load in place), 'popup' (in-app window), or 'external' (system browser).
function classifyNavigation(url, disposition) {
  if (isMeowdbUrl(url)) return 'panel';
  let host;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'external';
    host = u.hostname;
  } catch {
    return 'external';
  }
  if (OAUTH_HOSTS.includes(host)) return disposition === 'new-window' ? 'popup' : 'panel';
  return 'external';
}

// After one of our windows loses focus: drop the panel to passive unless focus went to another
// of our windows (Settings, a login popup) or we're still in the middle of activating.
function shouldDropToPassive({ active, ownWindowFocused, msSinceActivate }) {
  return active && !ownWindowFocused && msSinceActivate >= ACTIVATE_GRACE_MS;
}

module.exports = { OAUTH_HOSTS, isMeowdbUrl, classifyNavigation, shouldDropToPassive };
