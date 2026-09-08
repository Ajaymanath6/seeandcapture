const { PNG } = require("pngjs");

/**
 * Local pixel edits so color transforms keep the exact captured image
 * (Eden text generation invents new scenes).
 * @param {{ imageDataUrl: string, mode: "local-green" | "local-grayscale" }} args
 * @returns {Promise<string>}
 */
async function editLocally({ imageDataUrl, mode }) {
  const { buffer, mime } = dataUrlToBuffer(imageDataUrl);
  if (!mime.includes("png")) {
    throw new Error("Local color edits currently require a PNG capture");
  }

  const png = PNG.sync.read(buffer);
  const { data, width, height } = png;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    if (mode === "local-grayscale") {
      const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
    } else if (mode === "local-green") {
      // Keep luminance, bias chroma toward green.
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      data[i] = clamp(luma * 0.35 + r * 0.2);
      data[i + 1] = clamp(luma * 0.55 + g * 0.55 + 28);
      data[i + 2] = clamp(luma * 0.35 + b * 0.2);
    } else {
      throw new Error(`Unknown local edit mode: ${mode}`);
    }
  }

  const out = PNG.sync.write(png, { colorType: 6 });
  return `data:image/png;base64,${out.toString("base64")}`;
}

function dataUrlToBuffer(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(String(dataUrl).trim());
  if (!match) {
    throw new Error("Invalid imageDataUrl");
  }
  return {
    mime: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

function clamp(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

module.exports = {
  editLocally,
};
