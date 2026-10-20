// Turn OCR text from the game's status bar and minimap into numbers and names.

// The percentage is always two decimals and below 100, e.g. "68.10%". Matching it first also
// copes with OCR reading the "[" before it as a "1" ("27.589168.10%").
const PCT = /(\d{1,2})[.,](\d{2})%/;
// EXP is grouped in thousands ("1,027,589"); OCR often reads the commas as dots.
const EXP = /\d{1,3}(?:[.,]\d{3})*/;

function parseExpText(text) {
  if (typeof text !== 'string') return null;
  const pctMatch = PCT.exec(text);
  if (!pctMatch) return null;
  const expMatch = EXP.exec(text.slice(0, pctMatch.index));
  if (!expMatch) return null;
  return {
    exp: Number(expMatch[0].replace(/[.,]/g, '')),
    pct: Number(`${pctMatch[1]}.${pctMatch[2]}`),
  };
}

const HEADER = /mini\s*map|world/i;
const letters = (s) => (s.match(/[a-z]/gi) || []).length;
const trimEdges = (s) => s.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '');

// Minimap text lines → { street, map }. The minimap shows the street name above the map name.
function parseMapName(lines) {
  const names = lines.map((line) => trimEdges(String(line).trim())).filter((line) => !HEADER.test(line) && letters(line) >= 3);
  if (names.length === 0) return null;
  if (names.length === 1) return { street: null, map: names[0] };
  return { street: names[names.length - 2], map: names[names.length - 1] };
}

module.exports = { parseExpText, parseMapName };
