const { loginItemSettings } = require('../src/main/login-item');

test('installed app registers itself', () =>
  expect(loginItemSettings(true, {})).toEqual({ openAtLogin: true }));
test('Windows portable exe registers the real exe, not its temp copy', () =>
  expect(loginItemSettings(true, { PORTABLE_EXECUTABLE_FILE: 'D:\\Apps\\Overlay Clock.exe' }))
    .toEqual({ openAtLogin: true, path: 'D:\\Apps\\Overlay Clock.exe' }));
test('turning it off keeps the same path', () =>
  expect(loginItemSettings(false, { PORTABLE_EXECUTABLE_FILE: 'D:\\x.exe' })).toEqual({ openAtLogin: false, path: 'D:\\x.exe' }));
