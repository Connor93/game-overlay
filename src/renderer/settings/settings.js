const api = window.settingsApi;
const $ = (id) => document.getElementById(id);
let settings = null;

// Stored fontFamily is CSS; the field shows just the family name.
const SYSTEM_FONT = '-apple-system, "Segoe UI", sans-serif';
const fontLabel = (css) => (css === SYSTEM_FONT ? '' : css.split(',')[0].trim().replace(/^["']|["']$/g, ''));
const fontCss = (label) => (label.trim() ? `"${label.trim().replace(/"/g, '')}", ${SYSTEM_FONT}` : SYSTEM_FONT);

// Show accelerators the way each OS writes them.
function prettyShortcut(accel) {
  if (api.platform !== 'darwin') return accel.replace(/\+/g, ' + ');
  const mac = { Control: '⌃', Alt: '⌥', Shift: '⇧', Command: '⌘' };
  return accel.split('+').map((k) => mac[k] || k).join('');
}

function render() {
  const s = settings;
  if (document.activeElement !== $('fontFamily')) $('fontFamily').value = fontLabel(s.fontFamily);
  $('bold').checked = s.fontWeight >= 600;
  $('fontSizeRange').value = s.fontSize;
  if (document.activeElement !== $('fontSize')) $('fontSize').value = s.fontSize;
  $('color').value = s.color;
  $('outlineColor').value = s.outlineColor;
  $('outlineWidth').value = s.outlineWidth;
  $('outlineWidthOut').textContent = `${s.outlineWidth}px`;
  $('opacity').value = Math.round(s.opacity * 100);
  $('opacityOut').textContent = `${Math.round(s.opacity * 100)}%`;
  $('showSeconds').checked = s.showSeconds;
  $('hour24').checked = !s.hour12;
  $('openAtLogin').checked = s.openAtLogin;
  for (const id of ['shortcutToggleLock', 'shortcutToggleHide']) {
    if (!$(id).classList.contains('recording')) $(id).textContent = prettyShortcut(s[id]);
  }
}

function renderDisplays(displays) {
  $('displayRow').hidden = displays.length < 2;
  const select = $('displayId');
  select.replaceChildren(...displays.map((d) => new Option(d.label, String(d.id))));
  const current = displays.find((d) => d.id === settings.position.displayId) || displays.find((d) => d.primary);
  if (current) select.value = String(current.id);
}

function renderShortcutErrors(errors) {
  for (const id of ['shortcutToggleLock', 'shortcutToggleHide']) {
    $(`${id}Error`).textContent = errors.includes(id) ? "Couldn't use that shortcut (in use or not allowed)" : '';
  }
}

function applyResult(result) {
  settings = result.settings;
  renderShortcutErrors(result.shortcutErrors);
  render();
}

async function update(patch) {
  try {
    applyResult(await api.update(patch));
  } catch (err) {
    console.error('Could not update settings', err);
  }
}

function bind() {
  $('fontFamily').addEventListener('input', (e) => update({ fontFamily: fontCss(e.target.value) }));
  // Reading installed fonts needs a user gesture, so load them the first time the field is clicked.
  let fontsLoaded = false;
  $('fontFamily').addEventListener('pointerdown', async () => {
    if (fontsLoaded || !window.queryLocalFonts) return;
    fontsLoaded = true;
    try {
      const families = [...new Set((await window.queryLocalFonts()).map((f) => f.family))].sort();
      $('fontList').replaceChildren(...families.map((f) => new Option(f)));
    } catch {
      // Permission denied or unsupported: the field still accepts any font name typed in.
    }
  });
  $('bold').addEventListener('change', (e) => update({ fontWeight: e.target.checked ? 700 : 400 }));
  $('fontSizeRange').addEventListener('input', (e) => update({ fontSize: Number(e.target.value) }));
  $('fontSize').addEventListener('input', (e) => {
    if (e.target.value !== '') update({ fontSize: Number(e.target.value) });
  });
  $('color').addEventListener('input', (e) => update({ color: e.target.value }));
  $('outlineColor').addEventListener('input', (e) => update({ outlineColor: e.target.value }));
  $('outlineWidth').addEventListener('input', (e) => update({ outlineWidth: Number(e.target.value) }));
  $('opacity').addEventListener('input', (e) => update({ opacity: Number(e.target.value) / 100 }));
  $('showSeconds').addEventListener('change', (e) => update({ showSeconds: e.target.checked }));
  $('hour24').addEventListener('change', (e) => update({ hour12: !e.target.checked }));
  $('openAtLogin').addEventListener('change', (e) => update({ openAtLogin: e.target.checked }));
  $('displayId').addEventListener('change', (e) => update({ position: { displayId: Number(e.target.value) } }));

  for (const id of ['shortcutToggleLock', 'shortcutToggleHide']) {
    const button = $(id);
    button.addEventListener('click', () => {
      button.classList.add('recording');
      button.textContent = 'Press keys…';
    });
    button.addEventListener('blur', () => {
      button.classList.remove('recording');
      render();
    });
    button.addEventListener('keydown', (e) => {
      if (!button.classList.contains('recording')) return;
      e.preventDefault();
      if (e.key === 'Escape') return button.blur();
      const accel = OverlayClock.eventToAccelerator(e, api.platform);
      if (!accel) return; // wait for a full combo
      button.classList.remove('recording');
      update({ [id]: accel });
      button.blur();
    });
  }

  $('reset').addEventListener('click', async () => {
    $('fontFamily').blur();
    applyResult(await api.reset());
  });
}

api.get().then(({ settings: s, shortcutErrors, displays }) => {
  applyResult({ settings: s, shortcutErrors });
  renderDisplays(displays);
  bind();
});
