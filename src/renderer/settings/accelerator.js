// UMD: CommonJS for tests, global OverlayClock for the sandboxed settings window.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OverlayClock = Object.assign(root.OverlayClock || {}, factory());
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // KeyboardEvent.code → Electron accelerator key name, for codes that don't follow a pattern.
  const NAMED = {
    Space: 'Space', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete',
    Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
    ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
    Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
    Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backquote: '`',
  };

  function keyName(code) {
    let m;
    if ((m = /^Key([A-Z])$/.exec(code))) return m[1];
    if ((m = /^Digit([0-9])$/.exec(code))) return m[1];
    if ((m = /^Numpad([0-9])$/.exec(code))) return `num${m[1]}`;
    if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
    return NAMED[code] || null;
  }

  // Turn a keydown into an Electron accelerator; null until a full combo (modifier + key) is pressed.
  function eventToAccelerator(e, platform) {
    const key = keyName(e.code);
    if (!key) return null;
    const mods = [];
    if (e.ctrlKey) mods.push('Control');
    if (e.altKey) mods.push('Alt');
    if (e.shiftKey) mods.push('Shift');
    if (e.metaKey) mods.push(platform === 'darwin' ? 'Command' : 'Super');
    if (mods.length === 0) return null;
    return [...mods, key].join('+');
  }

  return { eventToAccelerator };
});
