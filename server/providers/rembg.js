/**
 * Local rembg HTTP sidecar (BiRefNet / danielgatis/rembg).
 * POST {baseUrl}/api/remove with multipart file + model.
 */
const DEFAULT_REMBG_MODEL = "birefnet-general";
const DEFAULT_REMBG_URL = "";

function hasRembgUrl() {
  return Boolean(String(process.env.REMBG_URL || "").trim());
}

function resolveRembgUrl() {
  return String(process.env.REMBG_URL || DEFAULT_REMBG_URL)
    .trim()
    .replace(/\/+$/, "");
}

function resolveRembgModel() {
  return (
    String(process.env.REMBG_MODEL || "").trim() || DEFAULT_REMBG_MODEL
  );
}

function stripDataUrlPrefix(dataUrl) {
  return String(dataUrl || "").replace(/^data:[^;]+;base64,/, "");
}

function mimeFromDataUrl(dataUrl) {
  const m = String(dataUrl || "").match(/^data:([^;]+);base64,/i);
  return m?.[1] || "image/png";
}

function extFromMime(mime) {
  const map = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  return map[mime] || "png";
}

/**
 * @param {{ imageDataUrl: string, baseUrl?: string, model?: string }} args
 * @returns {Promise<string>} PNG data URL with alpha
 */
async function removeBackgroundWithRembg({ imageDataUrl, baseUrl, model }) {
  const root = String(baseUrl || resolveRembgUrl()).trim().replace(/\/+$/, "");
  if (!root) {
    throw new Error("REMBG_URL is not set");
  }
  if (!imageDataUrl || typeof imageDataUrl !== "string") {
    throw new Error("Invalid imageDataUrl");
  }

  const selectedModel = String(model || resolveRembgModel()).trim() ||
    DEFAULT_REMBG_MODEL;
  const bare = stripDataUrlPrefix(imageDataUrl);
  if (!bare) {
    throw new Error("imageDataUrl is required");
  }

  const mime = mimeFromDataUrl(imageDataUrl);
  const buffer = Buffer.from(bare, "base64");
  const blob = new Blob([buffer], { type: mime });
  const form = new FormData();
  form.append("file", blob, `image.${extFromMime(mime)}`);
  form.append("model", selectedModel);

  const url = `${root}/api/remove`;
  const response = await fetch(url, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    let detail = "";
    try {
      const errJson = await response.json();
      detail =
        errJson?.detail ||
        errJson?.message ||
        errJson?.error ||
        JSON.stringify(errJson).slice(0, 240);
    } catch (_) {
      detail = (await response.text().catch(() => "")).slice(0, 240);
    }
    throw new Error(
      detail
        ? `rembg error (${response.status}): ${detail}`
        : `rembg error (${response.status})`
    );
  }

  const contentType = String(response.headers.get("content-type") || "");
  if (contentType.includes("application/json")) {
    const payload = await response.json().catch(() => ({}));
    const maybe =
      payload?.image ||
      payload?.output ||
      payload?.result ||
      payload?.data;
    if (typeof maybe === "string" && maybe.startsWith("data:")) {
      return maybe;
    }
    if (typeof maybe === "string" && maybe.length > 32) {
      return `data:image/png;base64,${stripDataUrlPrefix(maybe)}`;
    }
    throw new Error("rembg returned JSON without an image");
  }

  const ab = await response.arrayBuffer();
  const out = Buffer.from(ab);
  if (out.length < 100) {
    throw new Error("rembg returned an empty or invalid image");
  }
  return `data:image/png;base64,${out.toString("base64")}`;
}

module.exports = {
  DEFAULT_REMBG_MODEL,
  hasRembgUrl,
  resolveRembgUrl,
  resolveRembgModel,
  removeBackgroundWithRembg,
};
