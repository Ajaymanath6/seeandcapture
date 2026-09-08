/**
 * Sticker compositing + palette tint helpers.
 * Exposed as window.SeeCaptureBlend
 */
(() => {
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load blend image"));
      img.src = src;
    });
  }

  function hexToRgb(hex) {
    const raw = String(hex || "")
      .replace("#", "")
      .trim();
    if (raw.length !== 6) return { r: 0, g: 0, b: 0 };
    return {
      r: parseInt(raw.slice(0, 2), 16),
      g: parseInt(raw.slice(2, 4), 16),
      b: parseInt(raw.slice(4, 6), 16),
    };
  }

  function luminance(r, g, b) {
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  /**
   * Place image assets onto the capture (bottom-right stickers).
   */
  async function compositeAssetsOntoCapture(baseDataUrl, assets) {
    const imageAssets = (assets || []).filter(
      (a) => a && a.dataUrl && a.kind !== "palette"
    );
    if (imageAssets.length === 0) return baseDataUrl;

    const base = await loadImage(baseDataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = base.naturalWidth || base.width;
    canvas.height = base.naturalHeight || base.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable for blend");

    ctx.drawImage(base, 0, 0);

    for (let i = 0; i < imageAssets.length; i += 1) {
      const asset = imageAssets[i];
      const sticker = await loadImage(asset.dataUrl);

      const targetWidth = Math.max(24, Math.round(canvas.width * 0.32));
      const scale =
        targetWidth / Math.max(1, sticker.naturalWidth || sticker.width);
      const w = Math.round((sticker.naturalWidth || sticker.width) * scale);
      const h = Math.round((sticker.naturalHeight || sticker.height) * scale);

      const margin = Math.round(canvas.width * 0.04);
      const x = canvas.width - w - margin - i * Math.round(w * 0.18);
      const y = canvas.height - h - margin - i * Math.round(h * 0.12);

      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.28)";
      ctx.shadowBlur = Math.max(4, Math.round(Math.min(w, h) * 0.08));
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = Math.max(2, Math.round(h * 0.03));
      ctx.globalAlpha = 0.98;
      ctx.drawImage(sticker, x, y, w, h);
      ctx.restore();
    }

    return canvas.toDataURL("image/png");
  }

  /**
   * Recolor capture toward a 4-color palette (keeps shapes, maps by luminance).
   */
  async function applyPaletteToCapture(baseDataUrl, colors) {
    const palette = (colors || []).map(hexToRgb).filter(Boolean);
    if (palette.length === 0) return baseDataUrl;

    const base = await loadImage(baseDataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = base.naturalWidth || base.width;
    canvas.height = base.naturalHeight || base.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable for palette");

    ctx.drawImage(base, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const n = palette.length;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a === 0) continue;

      const lum = luminance(r, g, b) / 255;
      const idx = Math.min(n - 1, Math.floor(lum * n));
      const next = Math.min(n - 1, idx + 1);
      const t = lum * n - idx;
      const c0 = palette[idx];
      const c1 = palette[next];

      data[i] = Math.round(c0.r * (1 - t) + c1.r * t);
      data[i + 1] = Math.round(c0.g * (1 - t) + c1.g * t);
      data[i + 2] = Math.round(c0.b * (1 - t) + c1.b * t);
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL("image/png");
  }

  /**
   * Apply selected assets: palettes tint first, then image stickers on top.
   */
  async function applySelectedAssetsToCapture(baseDataUrl, assets) {
    let out = baseDataUrl;
    const list = assets || [];
    const palettes = list.filter((a) => a && a.kind === "palette" && a.colors);
    const images = list.filter((a) => a && a.kind !== "palette" && a.dataUrl);

    for (const palette of palettes) {
      out = await applyPaletteToCapture(out, palette.colors);
    }
    if (images.length > 0) {
      out = await compositeAssetsOntoCapture(out, images);
    }
    return out;
  }

  window.SeeCaptureBlend = {
    compositeAssetsOntoCapture,
    applyPaletteToCapture,
    applySelectedAssetsToCapture,
  };
})();
