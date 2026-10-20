const { eventToAccelerator } = require('../src/renderer/settings/accelerator');

const ev = (o) => ({ ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...o });

test('ctrl+alt+C', () => expect(eventToAccelerator(ev({ key: 'c', code: 'KeyC', ctrlKey: true, altKey: true }), 'darwin')).toBe('Control+Alt+C'));
test('cmd+shift+5 on mac', () => expect(eventToAccelerator(ev({ key: '%', code: 'Digit5', metaKey: true, shiftKey: true }), 'darwin')).toBe('Shift+Command+5'));
test('win key is Super on windows', () => expect(eventToAccelerator(ev({ key: 'h', code: 'KeyH', metaKey: true }), 'win32')).toBe('Super+H'));
test('modifier alone is null', () => expect(eventToAccelerator(ev({ key: 'Control', code: 'ControlLeft', ctrlKey: true }), 'darwin')).toBeNull());
test('bare key without modifier is null', () => expect(eventToAccelerator(ev({ key: 'c', code: 'KeyC' }), 'win32')).toBeNull());
test('F-keys allowed with modifier', () => expect(eventToAccelerator(ev({ key: 'F9', code: 'F9', altKey: true }), 'win32')).toBe('Alt+F9'));
test('arrow keys map to Electron names', () => expect(eventToAccelerator(ev({ key: 'ArrowUp', code: 'ArrowUp', ctrlKey: true }), 'win32')).toBe('Control+Up'));
