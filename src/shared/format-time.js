// UMD: CommonJS for main/tests, global OverlayClock for sandboxed renderers.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OverlayClock = Object.assign(root.OverlayClock || {}, factory());
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const pad = (n) => String(n).padStart(2, '0');

  // Built by hand rather than toLocaleTimeString so output never varies by OS locale.
  function formatTime(date, { showSeconds, hour12 }) {
    const h = date.getHours();
    const hours = hour12 ? (h % 12 || 12) : h;
    let text = `${pad(hours)}:${pad(date.getMinutes())}`;
    if (showSeconds) text += `:${pad(date.getSeconds())}`;
    if (hour12) text += h < 12 ? ' AM' : ' PM';
    return text;
  }

  return { formatTime };
});
