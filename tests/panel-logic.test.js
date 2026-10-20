const { classifyNavigation, shouldDropToPassive, isPermissionAllowed } = require('../src/main/panel-logic');

test('meowdb links stay in the panel', () => expect(classifyNavigation('https://meowdb.com/item/1', 'default')).toBe('panel'));
test('other sites open externally', () => expect(classifyNavigation('https://reddit.com/r/Maplestory', 'foreground-tab')).toBe('external'));
test('lookalike hosts open externally', () => expect(classifyNavigation('https://meowdb.com.evil.io/', 'default')).toBe('external'));
test('non-web schemes are refused, never handed to the OS', () => {
  for (const url of ['mailto:a@b.c', 'ms-msdt:/id x', 'search-ms:query=x', 'file:///Applications/Calculator.app', 'javascript:alert(1)']) {
    expect(classifyNavigation(url, 'default')).toBe('deny');
    expect(classifyNavigation(url, 'new-window')).toBe('deny');
  }
});
test('plain http sites still open externally', () => expect(classifyNavigation('http://example.com/', 'foreground-tab')).toBe('external'));
test('OAuth popup opens as an in-app popup', () => expect(classifyNavigation('https://discord.com/oauth2/authorize?x', 'new-window')).toBe('popup'));
test('full-page OAuth redirect stays in the panel', () => expect(classifyNavigation('https://accounts.google.com/o/oauth2/auth', 'default')).toBe('panel'));

test('clicking the game while active drops to passive', () =>
  expect(shouldDropToPassive({ active: true, ownWindowFocused: false, msSinceActivate: 5000 })).toBe(true));
test('opening our own Settings or a login popup keeps it active', () =>
  expect(shouldDropToPassive({ active: true, ownWindowFocused: true, msSinceActivate: 5000 })).toBe(false));
test('blur during activation is ignored', () =>
  expect(shouldDropToPassive({ active: true, ownWindowFocused: false, msSinceActivate: 100 })).toBe(false));
test('already passive stays passive', () =>
  expect(shouldDropToPassive({ active: false, ownWindowFocused: false, msSinceActivate: 5000 })).toBe(false));

test('meowdb gets no permissions except writing to the clipboard', () => {
  expect(isPermissionAllowed('clipboard-sanitized-write')).toBe(true);
  for (const p of ['clipboard-read', 'fullscreen', 'notifications', 'geolocation', 'media', 'openExternal', 'midi', 'pointerLock']) {
    expect(isPermissionAllowed(p)).toBe(false);
  }
});
