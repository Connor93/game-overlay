// Where each shortcut id lives in the settings: [section, field].
const SHORTCUT_FIELDS = {
  'clock.toggleLock': ['clock', 'shortcutToggleLock'],
  'clock.toggleHide': ['clock', 'shortcutToggleHide'],
  'meowdb.toggleActive': ['meowdb', 'shortcutToggleActive'],
  'meowdb.toggleHide': ['meowdb', 'shortcutToggleHide'],
};

function shortcutMapFromSettings(settings) {
  const map = {};
  for (const [id, [section, field]] of Object.entries(SHORTCUT_FIELDS)) map[id] = settings[section][field];
  return map;
}

function withAppliedShortcuts(settings, applied) {
  const next = { ...settings };
  for (const [id, accelerator] of Object.entries(applied)) {
    const [section, field] = SHORTCUT_FIELDS[id];
    next[section] = { ...next[section], [field]: accelerator };
  }
  return next;
}

module.exports = { SHORTCUT_FIELDS, shortcutMapFromSettings, withAppliedShortcuts };
