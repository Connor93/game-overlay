// Finds the EXP bar and the minimap's map name on a screen frame and reads them.
// Positions are relative to the game area (found by skipping black bars) and scale with it, so
// any resolution, pillarboxing or window position works; a located spot only counts once the
// EXP there actually reads.

const img = require('./image');
const { parseMapName } = require('../../shared/exp/parse');
const { readExpNumbers, scaleForGameHeight } = require('./digits');

const LABEL_SEARCH_SCALES = [1, 1.5, 2];
const MAP_SCALE_TARGET = 4; // the map name reads best at about 4× its 100% size
const MAP_PADDING = 4; // pixels at 100% size

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
  // the reading OCR is surer of.
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
    return best && parseMapName(best.lines.map((l) => l.text));
  }

  // Fallback when the layout isn't the expected one: find the word "EXP" along the bottom and
  // read just to its right. (OCR word boxes are only reliable horizontally here: the box runs
  // down into the EXP gauge below the text.)
  async function findExpLabel(frame, game, u) {
    const strip = { x: game.x, y: game.y + game.height * 0.88, width: game.width, height: game.height * 0.12 };
    for (const scale of LABEL_SEARCH_SCALES) {
      const words = await ocr.recognizeWords(img.encodePng(img.scaleNearest(img.toGray(img.crop(frame, strip)), scale)));
      const label = words.find((w) => /^EXP/i.test(w.text));
      if (label) {
        const right = strip.x + label.bbox.x1 / scale;
        const bottom = strip.y + label.bbox.y1 / scale;
        return { x: right, y: bottom - 34 * u, width: REF.exp.width * u, height: REF.exp.height * u };
      }
    }
    return null;
  }

  async function locate(frame) {
    const game = img.findGameBounds(frame);
    if (!game) return null;
    const u = game.height / REF.height;
    const at = (r, x0) => ({ x: x0 + r.x * u, y: game.y + r.y * u, width: r.width * u, height: r.height * u });
    const centre = game.x + game.width / 2 - (REF.width / 2) * u;
    const regions = { exp: at(REF.exp, centre), map: at(REF.map, game.x), textHeight: REF.textHeight * u, scale: scaleForGameHeight(game.height) };
    if (await readExp(frame, regions)) return regions;
    const exp = await findExpLabel(frame, game, u);
    if (exp && (await readExp(frame, { ...regions, exp }))) return { ...regions, exp };
    return null;
  }

  return { locate, readExp, readMap };
}

module.exports = { createReader };
