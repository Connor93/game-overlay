// Position is stored as a distance from the nearest corner of the display's work area, so the
// clock can sit anywhere (flush to an edge included), a right-anchored clock grows leftward,
// and the same spot carries over to a different-sized display.

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

function axisStart(start, available, length, anchorAtEnd, offset) {
  const room = available - length;
  if (room < 0) return start; // too big for the screen: pin to the edge so most of it stays visible
  const o = clamp(offset, 0, room);
  return Math.round(anchorAtEnd ? start + room - o : start + o);
}

function resolvePlacement(position, displays, size) {
  const display =
    (position.displayId !== null && displays.find((d) => d.id === position.displayId)) ||
    displays.find((d) => d.primary) ||
    displays[0];
  const wa = display.workArea;
  return {
    x: axisStart(wa.x, wa.width, size.width, position.anchorX === 'right', position.offsetX),
    y: axisStart(wa.y, wa.height, size.height, position.anchorY === 'bottom', position.offsetY),
    displayId: display.id,
  };
}

// Anchor to whichever edge the window's center is closer to, measured in pixels from that edge.
function positionFromBounds(bounds, display) {
  const wa = display.workArea;
  const roomX = Math.max(0, wa.width - bounds.width);
  const roomY = Math.max(0, wa.height - bounds.height);
  const left = bounds.x - wa.x;
  const top = bounds.y - wa.y;
  const right = bounds.x + bounds.width / 2 > wa.x + wa.width / 2;
  const bottom = bounds.y + bounds.height / 2 > wa.y + wa.height / 2;
  return {
    displayId: display.id,
    anchorX: right ? 'right' : 'left',
    offsetX: Math.round(clamp(right ? roomX - left : left, 0, roomX)),
    anchorY: bottom ? 'bottom' : 'top',
    offsetY: Math.round(clamp(bottom ? roomY - top : top, 0, roomY)),
  };
}

const MIN_SIZE = { width: 320, height: 300 };

// Fit a saved window size to a work area: at least the minimum, at most the screen (the screen wins).
function clampSize(size, workArea, min = MIN_SIZE) {
  return {
    width: Math.min(workArea.width, Math.max(min.width, size.width)),
    height: Math.min(workArea.height, Math.max(min.height, size.height)),
  };
}

module.exports = { resolvePlacement, positionFromBounds, clampSize };
