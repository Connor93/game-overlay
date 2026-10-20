const os = require('os');
const fs = require('fs');
const path = require('path');
const { loadHistory, saveHistory, renameSession, deleteSession } = require('../src/main/exp/history-store');

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'exp-')), 'exp-sessions.json');
const sessions = [{ id: 'a', map: 'Over the Wall' }, { id: 'b', map: 'Unknown map' }];

test('missing file is an empty history', () => expect(loadHistory(tmp())).toEqual([]));
test('corrupt file is an empty history', () => {
  const f = tmp();
  fs.writeFileSync(f, '[{"id":');
  expect(loadHistory(f)).toEqual([]);
});
test('non-array or malformed entries are dropped', () => {
  const f = tmp();
  fs.writeFileSync(f, JSON.stringify([{ id: 'a', map: 'X' }, 5, { map: 'no id' }, null]));
  expect(loadHistory(f)).toEqual([{ id: 'a', map: 'X' }]);
});
test('save and load round-trip', () => {
  const f = tmp();
  expect(saveHistory(f, sessions)).toBe(true);
  expect(loadHistory(f)).toEqual(sessions);
});
test('rename is pure', () => {
  const next = renameSession(sessions, 'b', 'Slime Tree');
  expect(next[1].map).toBe('Slime Tree');
  expect(sessions[1].map).toBe('Unknown map');
});
test('delete is pure', () => {
  expect(deleteSession(sessions, 'a')).toEqual([{ id: 'b', map: 'Unknown map' }]);
  expect(sessions).toHaveLength(2);
});
