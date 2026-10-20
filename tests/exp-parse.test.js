const { parseExpText, parseMapName } = require('../src/shared/exp/parse');

test('parses the clean read', () => expect(parseExpText('27.589[68.10%]')).toEqual({ exp: 27589, pct: 68.1 }));
test('[ misread as 1 is handled', () => expect(parseExpText('27.589168.10%]')).toEqual({ exp: 27589, pct: 68.1 }));
test('commas and the EXP label', () => expect(parseExpText('EXP 1,027,589 [ 3.05%]')).toEqual({ exp: 1027589, pct: 3.05 }));
test('small numbers without separators', () => expect(parseExpText('589[1.45%]')).toEqual({ exp: 589, pct: 1.45 }));
test('a percentage written with a comma', () => expect(parseExpText('27,589[68,10%]')).toEqual({ exp: 27589, pct: 68.1 }));
test('garbage is null', () => {
  expect(parseExpText('Swordsman Harvy')).toBeNull();
  expect(parseExpText('')).toBeNull();
  expect(parseExpText('27.589[')).toBeNull();
});

test('map name from minimap lines', () =>
  expect(parseMapName(['mini map WORLD', 'Hidden Street', 'Over the Wall'])).toEqual({ street: 'Hidden Street', map: 'Over the Wall' }));
test('a single line is the map', () => expect(parseMapName(['Henesys'])).toEqual({ street: null, map: 'Henesys' }));
test('stray edge characters are trimmed', () =>
  expect(parseMapName(['| Hidden Street', 'Over the Wall .'])).toEqual({ street: 'Hidden Street', map: 'Over the Wall' }));
test('no map lines gives null', () => expect(parseMapName(['mini map', '', '~ ='])).toBeNull());
