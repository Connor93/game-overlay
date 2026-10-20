const clock = document.getElementById('clock');
let settings = null;
let lastSize = { width: 0, height: 0 };

function applyStyle(s) {
  const pad = 8 + s.outlineWidth; // keep the outline inside the measured box
  Object.assign(clock.style, {
    fontFamily: s.fontFamily,
    fontWeight: String(s.fontWeight),
    fontSize: `${s.fontSize}px`,
    color: s.color,
    webkitTextStroke: `${s.outlineWidth}px ${s.outlineColor}`,
    opacity: String(s.opacity),
    padding: `${pad}px ${pad + 4}px`,
  });
}

function reportSize() {
  const rect = clock.getBoundingClientRect();
  const size = { width: Math.ceil(rect.width), height: Math.ceil(rect.height) };
  if (size.width !== lastSize.width || size.height !== lastSize.height) {
    lastSize = size;
    window.overlayApi.sendSize(size);
  }
}

function tick() {
  if (!settings) return;
  const text = OverlayClock.formatTime(new Date(), settings);
  if (clock.textContent !== text) clock.textContent = text;
  reportSize();
}

window.overlayApi.onSettings((s) => {
  settings = s;
  applyStyle(s);
  tick();
  // Web fonts can finish loading after the first paint and change the width.
  document.fonts.ready.then(reportSize);
});

window.overlayApi.onLocked((locked) => document.body.classList.toggle('unlocked', !locked));

setInterval(tick, 250);
