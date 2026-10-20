const api = window.expApi;
const $ = (id) => document.getElementById(id);

const HINTS = {
  locating: 'Looking for the EXP bar…',
  'cant-find': "Can't find the EXP bar. Is the game on screen?",
  'cant-read': "Can't read the EXP bar right now",
  reading: 'Reading the EXP bar… (not sure of the numbers yet)',
  covered: 'Part of the game is covered by a panel',
  'no-permission': 'Allow Screen Recording for Game Overlay',
};
const STATUS = { tracking: 'Tracking', paused: 'Paused (no EXP)', idle: 'Not tracking' };

const fmt = (n) => (n === null || n === undefined ? '—' : Math.round(n).toLocaleString());
const fmtRate = (n) => (n >= 10000 ? `${(n / 1000).toFixed(1)}k` : fmt(n));
function fmtDuration(ms) {
  if (ms === null || ms === undefined) return '—';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
const fmtTime = (t) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const pctRange = (s) => (s.startLevelPct === null ? '' : `${s.startLevelPct.toFixed(2)}% → ${s.endLevelPct.toFixed(2)}%${s.levelUps ? ` (+${s.levelUps} lv)` : ''}`);
function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function renderLive(state) {
  $('map').textContent = state.map || 'Unknown map';
  $('sub').textContent = [state.street, state.pct !== null && state.pct !== undefined ? `${state.pct.toFixed(2)}%` : null].filter(Boolean).join(' · ');
  const stats = state.stats;
  $('rate').textContent = stats ? fmt(stats.expPerHour) : '—';
  $('duration').textContent = stats ? fmtDuration(stats.durationMs) : '—';
  $('gained').textContent = stats ? fmt(stats.gainedExp ?? null) : '—';
  $('toLevel').textContent = stats && stats.timeToLevelMs !== null ? `~${fmtDuration(stats.timeToLevelMs)}` : '—';
  $('recent').textContent = stats ? `${fmtRate(stats.last5mPerHour)}/h` : '—';
  const waiting = state.status === 'idle' && state.autoStartArmed ? 'Waiting for steady EXP' : STATUS[state.status];
  $('status').replaceChildren(el('span', { className: `dot ${state.status}` }), waiting);
  $('hint').hidden = !state.hint;
  $('hint').textContent = HINTS[state.hint] || '';
  $('permission').hidden = state.hint !== 'no-permission';
  $('nameForm').hidden = !state.needsMapName;
  $('startStop').textContent = state.status === 'idle' ? 'Start session' : 'Stop session';
  $('startStop').classList.toggle('stop', state.status !== 'idle');
}

function renderHistory(state) {
  const showSessions = Boolean(state.openMap);
  $('mapList').hidden = showSessions;
  $('sessionList').hidden = !showSessions;
  if (!showSessions) {
    $('mapList').replaceChildren(
      ...(state.history.length
        ? state.history.map((row) => {
            const r = el('div', { className: 'row' }, [
              el('b', { textContent: row.map }),
              el('span', { textContent: `${fmtRate(row.best.expPerHour)}/h · ${row.count} session${row.count === 1 ? '' : 's'}` }),
            ]);
            r.addEventListener('click', () => api.openMap(row.map));
            return r;
          })
        : [el('div', { className: 'empty', textContent: 'No saved sessions yet.' })]),
    );
    return;
  }
  $('openMapTitle').textContent = state.openMap;
  $('sessions').replaceChildren(
    ...state.mapSessions.map((s) => {
      const rate = s.trainingMs >= 10000 ? Math.round((s.gainedExp / s.trainingMs) * 3600000) : 0;
      const rename = el('button', { className: 'small', textContent: 'Rename' });
      const del = el('button', { className: 'small', textContent: 'Delete' });
      rename.addEventListener('click', () => {
        const input = el('input', { value: s.map, className: 'rename' });
        // Done (Enter) or cancelled (Esc): let go of focus so the list refreshes again.
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && input.value.trim()) {
            api.renameSession(s.id, input.value.trim());
            input.blur();
          }
          if (e.key === 'Escape') {
            input.blur();
            input.replaceWith(rename);
          }
        });
        rename.replaceWith(input);
        input.focus();
      });
      // Two clicks to delete, so a stray click can't lose a session.
      del.addEventListener('click', () => {
        if (del.dataset.armed) api.deleteSession(s.id);
        del.dataset.armed = '1';
        del.textContent = 'Confirm';
      });
      return el('div', { className: 'session' }, [
        el('div', { className: 'line' }, [el('b', { textContent: `${fmtRate(rate)}/h` }), el('span', { className: 'meta', textContent: fmtTime(s.startedAt) })]),
        el('div', { className: 'meta', textContent: `${fmtDuration(s.trainingMs)} · ${fmt(s.gainedExp)} EXP · ${pctRange(s)}` }),
        el('div', { className: 'actions' }, [rename, del]),
      ]);
    }),
  );
}

let lastTab = null;
window.panelApi.onState((state) => {
  for (const button of document.querySelectorAll('.tab')) button.classList.toggle('on', button.dataset.tab === state.tab);
  $('live').hidden = state.tab !== 'live';
  $('history').hidden = state.tab !== 'history';
  renderLive(state);
  // Don't rebuild History under the user's cursor every tick while they're renaming.
  if (state.tab === 'history' && !(lastTab === 'history' && document.activeElement && document.activeElement.classList.contains('rename'))) {
    renderHistory(state);
  }
  lastTab = state.tab;
});

for (const button of document.querySelectorAll('.tab')) button.addEventListener('click', () => api.setTab(button.dataset.tab));
$('startStop').addEventListener('click', () => api.startStop());
$('permission').addEventListener('click', () => api.openPermissionSettings());
$('back').addEventListener('click', () => api.openMap(null));
$('nameForm').addEventListener('submit', (e) => {
  e.preventDefault();
  if ($('mapName').value.trim()) api.nameMap($('mapName').value.trim());
  $('mapName').value = '';
});
