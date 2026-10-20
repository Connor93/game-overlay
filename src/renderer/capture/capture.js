const api = window.captureApi;
let video = null;
let starting = null;

async function ensureStream() {
  if (video) return video;
  if (!starting) {
    starting = (async () => {
      // Main answers this request with the chosen screen (setDisplayMediaRequestHandler); no picker.
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const v = document.createElement('video');
      v.muted = true;
      v.srcObject = stream;
      await v.play();
      video = v;
      return v;
    })().catch((err) => {
      starting = null;
      throw err;
    });
  }
  return starting;
}

// request: { rects: Rect[] | null } — null means the whole frame (for locating).
api.onGrab(async (request) => {
  try {
    const v = await ensureStream();
    const width = v.videoWidth;
    const height = v.videoHeight;
    if (!width || !height) return;
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(v, 0, 0);
    const rects = request.rects || [{ x: 0, y: 0, width, height }];
    const parts = rects.map((r) => {
      const x = Math.max(0, Math.round(r.x));
      const y = Math.max(0, Math.round(r.y));
      const w = Math.max(1, Math.min(width - x, Math.round(r.width)));
      const h = Math.max(1, Math.min(height - y, Math.round(r.height)));
      const pixels = ctx.getImageData(x, y, w, h);
      return { x, y, width: w, height: h, data: pixels.data.buffer };
    });
    api.sendFrame({ id: request.id, width, height, parts });
  } catch (err) {
    api.sendError(String(err && err.message ? err.message : err));
  }
});
