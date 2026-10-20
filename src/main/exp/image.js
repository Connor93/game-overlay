// Small image helpers for preparing screen crops for OCR. Pure JavaScript on raw RGBA, so the
// app needs no native image library.
//
// Img = { width, height, data: Uint8ClampedArray (RGBA) }

const zlib = require('zlib');

const blank = (width, height, fill = 0) => ({ width, height, data: new Uint8ClampedArray(width * height * 4).fill(fill) });
const luminance = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

function crop(img, rect) {
  const x0 = Math.max(0, Math.round(rect.x));
  const y0 = Math.max(0, Math.round(rect.y));
  const width = Math.max(0, Math.min(img.width, Math.round(rect.x + rect.width)) - x0);
  const height = Math.max(0, Math.min(img.height, Math.round(rect.y + rect.height)) - y0);
  const out = blank(width, height);
  for (let y = 0; y < height; y++) {
    const from = ((y0 + y) * img.width + x0) * 4;
    out.data.set(img.data.subarray(from, from + width * 4), y * width * 4);
  }
  return out;
}

// Per-pixel map over RGB (alpha forced opaque).
function mapPixels(img, fn) {
  const out = blank(img.width, img.height);
  const s = img.data;
  const d = out.data;
  for (let i = 0; i < s.length; i += 4) {
    const [r, g, b] = fn(s, i);
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    d[i + 3] = 255;
  }
  return out;
}

const toGray = (img) => mapPixels(img, (s, i) => Array(3).fill(Math.round(luminance(s, i))));
const invert = (img) => mapPixels(img, (s, i) => [255 - s[i], 255 - s[i + 1], 255 - s[i + 2]]);
const threshold = (img, level) => mapPixels(img, (s, i) => Array(3).fill(luminance(s, i) >= level ? 255 : 0));

function scaleNearest(img, factor) {
  const width = Math.round(img.width * factor);
  const height = Math.round(img.height * factor);
  const out = blank(width, height);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(img.height - 1, Math.floor(y / factor));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(img.width - 1, Math.floor(x / factor));
      const si = (sy * img.width + sx) * 4;
      out.data.set(img.data.subarray(si, si + 4), (y * width + x) * 4);
    }
  }
  return out;
}

// Shrink by averaging each source block (factor < 1), like a screen at a lower resolution.
function scaleBox(img, factor) {
  const width = Math.max(1, Math.round(img.width * factor));
  const height = Math.max(1, Math.round(img.height * factor));
  const out = blank(width, height);
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y / factor);
    const y1 = Math.max(y0 + 1, Math.min(img.height, Math.floor((y + 1) / factor)));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x / factor);
      const x1 = Math.max(x0 + 1, Math.min(img.width, Math.floor((x + 1) / factor)));
      const sum = [0, 0, 0];
      for (let sy = y0; sy < y1; sy++)
        for (let sx = x0; sx < x1; sx++) {
          const si = (sy * img.width + sx) * 4;
          sum[0] += img.data[si];
          sum[1] += img.data[si + 1];
          sum[2] += img.data[si + 2];
        }
      const n = (y1 - y0) * (x1 - x0);
      out.data.set([sum[0] / n, sum[1] / n, sum[2] / n, 255].map(Math.round), (y * width + x) * 4);
    }
  }
  return out;
}

function pad(img, px, value = 255) {
  const out = blank(img.width + 2 * px, img.height + 2 * px, value);
  for (let y = 0; y < img.height; y++) {
    out.data.set(img.data.subarray(y * img.width * 4, (y + 1) * img.width * 4), ((y + px) * out.width + px) * 4);
  }
  return out;
}

// Paint a rectangle (e.g. to blank out our own overlay windows before measuring the game).
function fillRect(img, rect, value = 0) {
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(img.width, Math.ceil(rect.x + rect.width));
  const y1 = Math.min(img.height, Math.ceil(rect.y + rect.height));
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = value;
    }
  return img;
}

// The longest run of indexes whose count reaches `need`: [first, last], or null.
function longestRun(counts, need) {
  let best = null;
  let start = -1;
  for (let i = 0; i <= counts.length; i++) {
    const on = i < counts.length && counts[i] >= need;
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      if (!best || i - start > best[1] - best[0] + 1) best = [start, i - 1];
      start = -1;
    }
  }
  return best;
}

// The game area: the biggest block of non-black content. The game can be pillarboxed (black bars),
// and in full screen on a laptop the menu bar and window title bar stay above a black strip; both
// are cut off by the black around the game.
function findGameBounds(img, { minLuminance = 24, minShare = 0.02 } = {}) {
  const bright = (x, y) => luminance(img.data, (y * img.width + x) * 4) > minLuminance;
  const rows = new Uint32Array(img.height);
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) if (bright(x, y)) rows[y]++;
  const ys = longestRun(rows, Math.max(1, img.width * minShare));
  if (!ys) return null;
  const cols = new Uint32Array(img.width);
  for (let y = ys[0]; y <= ys[1]; y++) for (let x = 0; x < img.width; x++) if (bright(x, y)) cols[x]++;
  const xs = longestRun(cols, Math.max(1, (ys[1] - ys[0] + 1) * minShare));
  if (!xs) return null;
  return { x: xs[0], y: ys[0], width: xs[1] - xs[0] + 1, height: ys[1] - ys[0] + 1 };
}

// --- PNG (8-bit RGBA, no interlace) ---

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function encodePng(img) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(img.width, 0);
  header.writeUInt32BE(img.height, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit, RGBA
  const stride = img.width * 4;
  const raw = Buffer.alloc((stride + 1) * img.height);
  for (let y = 0; y < img.height; y++) raw.set(img.data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  return Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function decodePng(buf) {
  let pos = 8;
  let width;
  let height;
  let channels;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[12] !== 0) throw new Error('Only 8-bit non-interlaced PNGs are supported');
      channels = { 2: 3, 6: 4 }[data[9]];
      if (!channels) throw new Error('Only RGB/RGBA PNGs are supported');
    }
    if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);
  const out = blank(width, height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      out.data[o] = cur[x * channels];
      out.data[o + 1] = cur[x * channels + 1];
      out.data[o + 2] = cur[x * channels + 2];
      out.data[o + 3] = channels === 4 ? cur[x * channels + 3] : 255;
    }
    prev.set(cur);
  }
  return out;
}

module.exports = { crop, toGray, invert, threshold, scaleNearest, scaleBox, pad, fillRect, findGameBounds, encodePng, decodePng };
