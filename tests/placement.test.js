const { resolvePlacement, positionFromBounds } = require('../src/main/placement');

const primary = { id: 1, primary: true, workArea: { x: 0, y: 25, width: 1440, height: 875 } };
const second = { id: 2, primary: false, workArea: { x: 1440, y: 0, width: 1920, height: 1080 } };
const size = { width: 400, height: 100 };
const topRight20 = { displayId: null, anchorX: 'right', offsetX: 20, anchorY: 'top', offsetY: 20 };

test('default is top-right of primary with 20px margins', () =>
  expect(resolvePlacement(topRight20, [primary, second], size)).toEqual({ x: 1020, y: 45, displayId: 1 }));

test('targets the chosen display', () =>
  expect(resolvePlacement({ displayId: 2, anchorX: 'left', offsetX: 20, anchorY: 'bottom', offsetY: 20 }, [primary, second], size))
    .toEqual({ x: 1460, y: 960, displayId: 2 }));

test('missing display falls back to primary, same corner and offset', () =>
  expect(resolvePlacement({ displayId: 99, anchorX: 'left', offsetX: 20, anchorY: 'bottom', offsetY: 20 }, [primary], size))
    .toEqual({ x: 20, y: 780, displayId: 1 }));

test('oversized window is pinned to work-area origin, not off-screen', () =>
  expect(resolvePlacement(topRight20, [primary], { width: 3000, height: 2000 })).toEqual({ x: 0, y: 25, displayId: 1 }));

test('offset larger than the screen is clamped on-screen', () =>
  expect(resolvePlacement({ ...topRight20, offsetX: 5000, offsetY: 5000 }, [primary], size)).toEqual({ x: 0, y: 800, displayId: 1 }));

test('anchored right, a wider clock grows leftward', () =>
  expect(resolvePlacement(topRight20, [primary], { width: 600, height: 100 }).x).toBe(1440 - 20 - 600));

// The reported bug: dropping the clock close to the corner then locking moved it down and left.
test('a clock dropped near the corner stays exactly where it was dropped', () => {
  const dropped = { x: 1440 - 400 - 4, y: 25 + 4, ...size };
  const pos = positionFromBounds(dropped, primary);
  expect(pos).toEqual({ displayId: 1, anchorX: 'right', offsetX: 4, anchorY: 'top', offsetY: 4 });
  expect(resolvePlacement(pos, [primary], size)).toEqual({ x: dropped.x, y: dropped.y, displayId: 1 });
});

test('flush against the bottom-left corner is allowed', () => {
  const dropped = { x: 0, y: 25 + 875 - 100, ...size };
  const pos = positionFromBounds(dropped, primary);
  expect(pos).toEqual({ displayId: 1, anchorX: 'left', offsetX: 0, anchorY: 'bottom', offsetY: 0 });
  expect(resolvePlacement(pos, [primary], size)).toEqual({ x: 0, y: 800, displayId: 1 });
});

test('positionFromBounds clamps a window dragged partly off-screen', () =>
  expect(positionFromBounds({ x: 5000, y: -50, ...size }, second))
    .toEqual({ displayId: 2, anchorX: 'right', offsetX: 0, anchorY: 'top', offsetY: 0 }));

const { clampSize } = require('../src/main/placement');

test('clampSize shrinks a saved size to fit a smaller screen', () =>
  expect(clampSize({ width: 2000, height: 1500 }, { x: 0, y: 0, width: 1280, height: 720 })).toEqual({ width: 1280, height: 720 }));
test('clampSize enforces the minimum', () =>
  expect(clampSize({ width: 100, height: 100 }, { x: 0, y: 0, width: 1920, height: 1080 })).toEqual({ width: 320, height: 300 }));
test('clampSize: a screen smaller than the minimum wins', () =>
  expect(clampSize({ width: 520, height: 700 }, { x: 0, y: 0, width: 300, height: 200 })).toEqual({ width: 300, height: 200 }));
