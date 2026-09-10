const { PNG } = require("pngjs");

const DEFAULT_MAX_EDGE = 1280;

/**
 * Shrink large PNG captures before vision calls. Non-PNG / undecodable → passthrough.
 * @param {string} dataUrl
 * @param {number} [maxEdge]
 * @returns {string}
 */
function downscaleImageDataUrl(dataUrl, maxEdge = DEFAULT_MAX_EDGE) {
  if (!dataUrl || typeof dataUrl !== "string") return dataUrl;
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl.trim());
  if (!match) return dataUrl;

  const mime = String(match[1] || "").toLowerCase();
  const buffer = Buffer.from(match[2], "base64");
  const looksPng =
    mime.includes("png") ||
    (buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47);

  if (!looksPng) return dataUrl;

  let png;
  try {
    png = PNG.sync.read(buffer);
  } catch (_err) {
    return dataUrl;
  }

  const { width, height } = png;
  const edge = Math.max(width, height);
  if (!edge || edge <= maxEdge) {
    return `data:image/png;base64,${buffer.toString("base64")}`;
  }

  const scale = maxEdge / edge;
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const out = new PNG({ width: w, height: h });

  for (let y = 0; y < h; y += 1) {
    const sy = Math.min(height - 1, Math.floor(y / scale));
    for (let x = 0; x < w; x += 1) {
      const sx = Math.min(width - 1, Math.floor(x / scale));
      const si = (width * sy + sx) << 2;
      const di = (w * y + x) << 2;
      out.data[di] = png.data[si];
      out.data[di + 1] = png.data[si + 1];
      out.data[di + 2] = png.data[si + 2];
      out.data[di + 3] = png.data[si + 3];
    }
  }

  const outBuf = PNG.sync.write(out);
  return `data:image/png;base64,${outBuf.toString("base64")}`;
}

module.exports = {
  DEFAULT_MAX_EDGE,
  downscaleImageDataUrl,
};
