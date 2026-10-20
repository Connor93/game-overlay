const { shortcutMapFromSettings, withAppliedShortcuts } = require('../src/main/shortcut-fields');
const { DEFAULT_SETTINGS } = require('../src/shared/defaults');

test('maps settings sections to shortcut ids', () =>
  expect(shortcutMapFromSettings(DEFAULT_SETTINGS)).toEqual({
    'clock.toggleLock': 'Control+Alt+C',
    'clock.toggleHide': 'Control+Alt+H',
    'meowdb.toggleActive': 'Control+Alt+M',
    'meowdb.toggleHide': 'Control+Alt+N',
    'exp.toggleActive': 'Control+Alt+E',
    'exp.toggleHide': 'Control+Alt+R',
    'exp.startStop': 'Control+Alt+S',
  }));

test('withAppliedShortcuts writes accelerators back without mutating', () => {
  const s = withAppliedShortcuts(DEFAULT_SETTINGS, { 'meowdb.toggleActive': 'Control+Alt+K' });
  expect(s.meowdb.shortcutToggleActive).toBe('Control+Alt+K');
  expect(s.clock).toBe(DEFAULT_SETTINGS.clock);
  expect(DEFAULT_SETTINGS.meowdb.shortcutToggleActive).toBe('Control+Alt+M');
});
