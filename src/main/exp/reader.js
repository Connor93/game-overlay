// Finds the EXP bar and the minimap's map name on a screen frame and reads them.
// Positions are relative to the game area (found by skipping black bars) and scale with it, so
// any resolution, pillarboxing or window position works; a located spot only counts once the
// EXP there actually reads.

const img = require('./image');
const { parseExpText, parseMapName } = require('../../shared/exp/parse');
const { readExpNumbers } = require('./digits');

const EXP_WHITELIST = '0123456789,.[]%';
const TARGET_TEXT_PX = 60; // upscale crops until text is about this tall
const EXP_VARIANTS = [{ threshold: 110 }, { threshold: 130 }, { threshold: null }];
const VOTES_NEEDED = 2;
const LABEL_SEARCH_SCALES = [1, 1.5, 2];
const MAP_SCALE_TARGET = 4; // the map name reads best at about 4× its 100% size

// The game's UI scales with the game area. Where things are on a 1440-pixel-tall game
// (measured from the user's screenshot); other sizes scale from these.
const REF = {
  height: 1440,
  exp: { x: 1398, y: 1378, width: 160, height: 28 }, // the numbers after "EXP"
  map: { x: 88, y: 50, width: 170, height: 58 }, // street + map name in the minimap
  textHeight: 17,
};

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

function createReader(ocr) {
  // Read the EXP numbers. Two independent methods must agree — OCR (itself voting across several
  // preprocessing variants) and digit-shape matching: better no reading than a wrong one.
  async function readExp(frame, regions) {
    const crop = img.crop(frame, regions.exp);
    const shapes = readExpNumbers(crop);
    if (!shapes) return null;
    const ocrReading = await readExpOcr(crop, regions.textHeight);
    return ocrReading && ocrReading.exp === shapes.exp && ocrReading.pct === shapes.pct ? ocrReading : null;
  }

  async function readExpOcr(crop, textHeight) {
    const scale = clamp(Math.round(TARGET_TEXT_PX / textHeight), 2, 8);
    const base = img.invert(img.toGray(img.scaleNearest(crop, scale)));
    const votes = new Map();
    for (const variant of EXP_VARIANTS) {
      const prepared = img.pad(variant.threshold ? img.threshold(base, variant.threshold) : base, 20);
      const reading = parseExpText(await ocr.recognizeLine(img.encodePng(prepared), { whitelist: EXP_WHITELIST }));
      if (!reading) continue;
      const key = `${reading.exp}|${reading.pct}`;
      const count = (votes.get(key) || 0) + 1;
      votes.set(key, count);
      if (count >= VOTES_NEEDED) return reading;
    }
    return null;
  }

  async function readMap(frame, regions) {
    if (!regions.map) return null;
    const scale = clamp(Math.round(MAP_SCALE_TARGET * (REF.textHeight / regions.textHeight)), 2, 8);
    const text = await ocr.recognizeBlock(img.encodePng(img.scaleNearest(img.toGray(img.crop(frame, regions.map)), scale)));
    return parseMapName(text.split('\n'));
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
        return { x: right + 3 * u, y: bottom - 34 * u, width: REF.exp.width * u, height: REF.exp.height * u };
      }
    }
    return null;
  }

  async function locate(frame) {
    const game = img.findGameBounds(frame);
    if (!game) return null;
    const u = game.height / REF.height;
    const at = (r) => ({ x: game.x + r.x * u, y: game.y + r.y * u, width: r.width * u, height: r.height * u });
    const regions = { exp: at(REF.exp), map: at(REF.map), textHeight: REF.textHeight * u };
    if (await readExp(frame, regions)) return regions;
    const exp = await findExpLabel(frame, game, u);
    if (exp && (await readExp(frame, { ...regions, exp }))) return { ...regions, exp };
    return null;
  }

  return { locate, readExp, readMap };
}

module.exports = { createReader };
