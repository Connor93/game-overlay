const fs = require('fs');

const isSession = (s) => typeof s === 'object' && s !== null && typeof s.id === 'string' && typeof s.map === 'string';

// Saved EXP sessions. Never throws: a missing or corrupt file is an empty history.
function loadHistory(filePath) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(data) ? data.filter(isSession) : [];
  } catch {
    return [];
  }
}

// Temp file + rename, so a crash mid-write can't corrupt the history.
function saveHistory(filePath, sessions) {
  const tmp = filePath + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(sessions, null, 2));
    fs.renameSync(tmp, filePath);
    return true;
  } catch (err) {
    console.error(`Could not save EXP history: ${err.message}`);
    return false;
  }
}

const renameSession = (sessions, id, map) => sessions.map((s) => (s.id === id ? { ...s, map } : s));
const deleteSession = (sessions, id) => sessions.filter((s) => s.id !== id);

module.exports = { loadHistory, saveHistory, renameSession, deleteSession };
