const { resolvePlacement, relativeFromBounds } = require('../src/main/placement');

const primary = { id: 1, primary: true, workArea: { x: 0, y: 25, width: 1440, height: 875 } };
const second = { id: 2, primary: false, workArea: { x: 1440, y: 0, width: 1920, height: 1080 } };
const size = { width: 400, height: 100 };

test('default is top-right of primary with 20px margins', () =>
  expect(resolvePlacement({ displayId: null, relX: 1, relY: 0 }, [primary, second], size)).toEqual({ x: 1020, y: 45, displayId: 1 }));
test('targets the chosen display', () =>
  expect(resolvePlacement({ displayId: 2, relX: 0, relY: 1 }, [primary, second], size)).toEqual({ x: 1460, y: 960, displayId: 2 }));
test('missing display falls back to primary, same relative spot', () =>
  expect(resolvePlacement({ displayId: 99, relX: 0, relY: 1 }, [primary], size)).toEqual({ x: 20, y: 780, displayId: 1 }));
test('oversized window is pinned to work-area origin, not off-screen', () =>
  expect(resolvePlacement({ displayId: null, relX: 1, relY: 1 }, [primary], { width: 3000, height: 2000 })).toEqual({ x: 0, y: 25, displayId: 1 }));
test('relativeFromBounds inverts resolvePlacement', () => {
  const p = resolvePlacement({ displayId: 2, relX: 0.25, relY: 0.5 }, [primary, second], size);
  expect(relativeFromBounds({ x: p.x, y: p.y, ...size }, second)).toEqual({ displayId: 2, relX: 0.25, relY: 0.5 });
});
test('relativeFromBounds clamps a window dragged partly off-screen', () =>
  expect(relativeFromBounds({ x: 5000, y: -50, ...size }, second)).toEqual({ displayId: 2, relX: 1, relY: 0 }));
