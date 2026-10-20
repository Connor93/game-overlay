const api = window.settingsApi;
const $ = (id) => document.getElementById(id);
const $$ = (sel) => [...document.querySelectorAll(sel)];
let settings = null;
let defaults = null;

// Where each shortcut id lives in the settings (mirrors src/main/shortcut-fields.js).
const SHORTCUT_FIELDS = {
  'clock.toggleLock': ['clock', 'shortcutToggleLock'],
  'clock.toggleHide': ['clock', 'shortcutToggleHide'],
  'meowdb.toggleActive': ['meowdb', 'shortcutToggleActive'],
  'meowdb.toggleHide': ['meowdb', 'shortcutToggleHide'],
};

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

// data-bind="section.field" inputs; data-kind says how the stored value maps to the control.
const getPath = (bind) => bind.split('.').reduce((o, k) => o[k], settings);
const KINDS = {
  bold: { toInput: (v) => v >= 600, fromInput: (el) => (el.checked ? 700 : 400) },
  percent: { toInput: (v) => Math.round(v * 100), fromInput: (el) => Number(el.value) / 100 },
  inverse: { toInput: (v) => !v, fromInput: (el) => !el.checked },
};
function readInput(el) {
  const kind = KINDS[el.dataset.kind];
  if (kind) return kind.fromInput(el);
  if (el.type === 'checkbox') return el.checked;
  if (el.type === 'range' || el.type === 'number') return Number(el.value);
  return el.value;
}
function writeInput(el, value) {
  const kind = KINDS[el.dataset.kind];
  const v = kind ? kind.toInput(value) : value;
  if (el.type === 'checkbox') el.checked = v;
  else if (document.activeElement !== el || el.type !== 'number') el.value = v;
}

function render() {
  if (document.activeElement !== $('fontFamily')) $('fontFamily').value = fontLabel(settings.clock.fontFamily);
  for (const el of $$('[data-bind]')) writeInput(el, getPath(el.dataset.bind));
  for (const el of $$('[data-show]')) {
    const v = getPath(el.dataset.show);
    el.textContent = el.dataset.unit === '%' ? `${Math.round(v * 100)}%` : `${v}${el.dataset.unit || ''}`;
  }
  for (const button of $$('[data-shortcut-id]')) {
    const [section, field] = SHORTCUT_FIELDS[button.dataset.shortcutId];
    if (!button.classList.contains('recording')) button.textContent = prettyShortcut(settings[section][field]);
  }
}

function renderDisplays(displays) {
  $('displayRow').hidden = displays.length < 2;
  const select = $('displayId');
  select.replaceChildren(...displays.map((d) => new Option(d.label, String(d.id))));
  const current = displays.find((d) => d.id === settings.clock.position.displayId) || displays.find((d) => d.primary);
  if (current) select.value = String(current.id);
}

function renderShortcutErrors(errors) {
  for (const button of $$('[data-shortcut-id]')) {
    button.parentElement.querySelector('.error').textContent = errors.includes(button.dataset.shortcutId)
      ? "Couldn't use that shortcut (in use or not allowed)"
      : '';
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
  for (const el of $$('[data-bind]')) {
    const [section, field] = el.dataset.bind.split('.');
    el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
      if (el.type === 'number' && el.value === '') return;
      update({ [section]: { [field]: readInput(el) } });
    });
  }

  $('fontFamily').addEventListener('input', (e) => update({ clock: { fontFamily: fontCss(e.target.value) } }));
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
  $('displayId').addEventListener('change', (e) => update({ clock: { position: { displayId: Number(e.target.value) } } }));

  for (const button of $$('[data-shortcut-id]')) {
    const [section, field] = SHORTCUT_FIELDS[button.dataset.shortcutId];
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
      update({ [section]: { [field]: accel } });
      button.blur();
    });
  }

  $('resetPanelBounds').addEventListener('click', () =>
    update({ meowdb: { position: defaults.meowdb.position, size: defaults.meowdb.size } }),
  );

  for (const button of $$('[data-reset]')) {
    button.addEventListener('click', async () => {
      $('fontFamily').blur();
      applyResult(await api.reset(button.dataset.reset));
    });
  }
}

api.get().then(({ settings: s, defaults: d, shortcutErrors, displays }) => {
  defaults = d;
  applyResult({ settings: s, shortcutErrors });
  renderDisplays(displays);
  bind();
});
