const MARGIN = 20;

const clamp01 = (v) => Math.min(1, Math.max(0, v));

// Room the window can travel along one axis inside the margins (negative = doesn't fit).
const travel = (available, length) => available - length - 2 * MARGIN;

function axisStart(start, available, length, rel) {
  const range = travel(available, length);
  if (range < 0) return start; // too big for the margins: pin to the edge so most of it stays visible
  return Math.round(start + MARGIN + rel * range);
}

function axisRel(start, available, length, pos) {
  const range = travel(available, length);
  if (range <= 0) return 0;
  return clamp01((pos - start - MARGIN) / range);
}

// Position is stored relative to the display, so relX = 1 keeps the right edge pinned
// as the clock grows, and the same spot carries over to a different-sized display.
function resolvePlacement(position, displays, size) {
  const display =
    (position.displayId !== null && displays.find((d) => d.id === position.displayId)) ||
    displays.find((d) => d.primary) ||
    displays[0];
  const wa = display.workArea;
  return {
    x: axisStart(wa.x, wa.width, size.width, position.relX),
    y: axisStart(wa.y, wa.height, size.height, position.relY),
    displayId: display.id,
  };
}

function relativeFromBounds(bounds, display) {
  const wa = display.workArea;
  return {
    displayId: display.id,
    relX: axisRel(wa.x, wa.width, bounds.width, bounds.x),
    relY: axisRel(wa.y, wa.height, bounds.height, bounds.y),
  };
}

module.exports = { MARGIN, resolvePlacement, relativeFromBounds };
