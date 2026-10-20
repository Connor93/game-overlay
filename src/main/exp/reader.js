// Finds the EXP bar and the minimap's map name on a screen frame and reads them.
// Positions are relative to the game area (found by skipping black bars) and scale with it, so
// any resolution, pillarboxing or window position works; a located spot only counts once the
// EXP there actually reads.

const img = require('./image');
const { parseMapName } = require('../../shared/exp/parse');
const { readExpNumbers, scaleForGameHeight, findBrackets } = require('./digits');

const MAP_SCALE_TARGET = 4; // the map name reads best at about 4× its 100% size
const MAP_PADDING = 4; // pixels at 100% size
const MAP_MIN_CONFIDENCE = 80; // OCR's line confidence: clean names read 87–95, clipped or stray text below
const LEFT_EDGE_TOLERANCE = 40; // the bracket's estimate of the left edge is good to about this

function medianGray(gray) {
  const values = [];
  for (let i = 0; i < gray.data.length; i += 4) values.push(gray.data[i]);
  return values.sort((a, b) => a - b)[values.length >> 1];
}

// The game's UI scales with the game area. Where things are on a 2560×1440 game (measured from the
// user's screenshot); other sizes scale from these. The status bar is centred along the bottom (a
// wider game shifts it), the minimap sits in the top-left corner.
const REF = {
  width: 2560,
  height: 1440,
  // The numbers after "EXP", with room to either side: the digit reader anchors on the green "["
  // and grows leftwards from it. Starts just right of the MP line's "]", ends before the Cash Shop.
  exp: { x: 1375, y: 1378, width: 230, height: 28 },
  expBracketX: 1477, // the "[" after the EXP number (1474–1480 on the user's two screens)
  map: { x: 88, y: 50, width: 170, height: 58 }, // street + map name in the minimap
  textHeight: 17,
};

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

function createReader(ocr) {
  // EXP numbers come from digit-shape matching (see digits.js); OCR misreads this pixel font.
  async function readExp(frame, regions) {
    return readExpNumbers(img.crop(frame, regions.exp), regions.scale);
  }

  // OCR sometimes drops a letter close to the crop's edge, and sometimes misreads small text once
  // given more room; so read it both ways (as is, and padded with its own background) and keep
  // the reading OCR is surer of. Not sure enough (a clipped name, the wrong spot) reads as no map.
  async function readMap(frame, regions) {
    if (!regions.map) return null;
    const u = regions.textHeight / REF.textHeight;
    const scale = clamp(Math.round(MAP_SCALE_TARGET / u), 2, 8);
    const gray = img.scaleNearest(img.toGray(img.crop(frame, regions.map)), scale);
    let best = null;
    for (const padding of [0, Math.round(MAP_PADDING * u * scale)]) {
      const lines = (await ocr.recognizeLines(img.encodePng(padding ? img.pad(gray, padding, medianGray(gray)) : gray))).filter((l) => l.text);
      const confidence = Math.min(...lines.map((l) => l.confidence));
      if (lines.length && (!best || confidence > best.confidence)) best = { lines, confidence };
    }
    if (!best || best.confidence < MAP_MIN_CONFIDENCE) return null;
    return parseMapName(best.lines.map((l) => l.text));
  }

  // The game's height (from its bounds) gives the scale and the status bar's row. Along that row,
  // the green bracket that reads as EXP places the status bar, which is centred in the game; with
  // the game's right edge that estimates its left edge too, where the minimap is. The measured left
  // edge is exact, so it wins unless it is clearly off: one of our panels hiding (blanked over) the
  // left of the game.
  async function locate(frame) {
    const game = img.findGameBounds(frame);
    if (!game) return null;
    const u = game.height / REF.height;
    const scale = scaleForGameHeight(game.height);
    const row = { x: game.x, y: game.y + REF.exp.y * u, width: game.width, height: REF.exp.height * u };
    for (const bracket of findBrackets(img.crop(frame, row), scale)) {
      const bracketX = row.x + bracket.x;
      const exp = { x: bracketX - (REF.expBracketX - REF.exp.x) * u, y: row.y, width: REF.exp.width * u, height: row.height };
      if (!(await readExp(frame, { exp, scale }))) continue;
      const centre = bracketX - (REF.expBracketX - REF.width / 2) * u;
      const estimate = 2 * centre - (game.x + game.width);
      const left = Math.abs(estimate - game.x) <= LEFT_EDGE_TOLERANCE * u ? game.x : estimate;
      const map = { x: left + REF.map.x * u, y: game.y + REF.map.y * u, width: REF.map.width * u, height: REF.map.height * u };
      return { exp, map, textHeight: REF.textHeight * u, scale };
    }
    return null;
  }

  return { locate, readExp, readMap };
}

module.exports = { createReader };
