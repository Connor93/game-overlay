const path = require('path');
const { createWorker, PSM } = require('tesseract.js');

// The English model ships with the app (no download at runtime). Packaged, it lives outside the
// asar archive so the OCR worker can read it from disk.
function languageDir() {
  const dir = path.join(path.dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int');
  return dir.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`);
}

// Text recognition on PNG buffers. One worker, created on first use; jobs run one at a time
// because each sets its own recognition parameters.
function createOcr() {
  let worker = null;
  let queue = Promise.resolve();

  const getWorker = () => {
    if (!worker) worker = createWorker('eng', 1, { langPath: languageDir(), gzip: true, cacheMethod: 'none' });
    return worker;
  };
  const run = (job) => {
    const result = queue.then(async () => job(await getWorker()));
    queue = result.catch(() => {});
    return result;
  };

  return {
    // One line of text, optionally limited to some characters.
    recognizeLine: (png, { whitelist = '' } = {}) =>
      run(async (w) => {
        await w.setParameters({ tessedit_char_whitelist: whitelist, tessedit_pageseg_mode: PSM.SINGLE_LINE });
        return (await w.recognize(png)).data.text.trim();
      }),
    // A small block of text (e.g. the minimap's two name lines): each line with its confidence (0–100).
    recognizeLines: (png) =>
      run(async (w) => {
        await w.setParameters({ tessedit_char_whitelist: '', tessedit_pageseg_mode: PSM.AUTO });
        const { data } = await w.recognize(png, {}, { blocks: true });
        const lines = [];
        for (const block of data.blocks || [])
          for (const paragraph of block.paragraphs) for (const l of paragraph.lines) lines.push({ text: l.text.trim(), confidence: l.confidence });
        return lines;
      }),
    // Every word found, with its box and which line it's on.
    recognizeWords: (png) =>
      run(async (w) => {
        await w.setParameters({ tessedit_char_whitelist: '', tessedit_pageseg_mode: PSM.SPARSE_TEXT });
        const { data } = await w.recognize(png, {}, { blocks: true });
        const words = [];
        let line = 0;
        for (const block of data.blocks || [])
          for (const paragraph of block.paragraphs)
            for (const l of paragraph.lines) {
              for (const word of l.words) words.push({ text: word.text, bbox: word.bbox, line });
              line += 1;
            }
        return words;
      }),
    async terminate() {
      if (worker) await (await worker).terminate();
      worker = null;
    },
  };
}

module.exports = { createOcr };
