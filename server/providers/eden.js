const EDEN_V2_GENERATION_URL = "https://api.edenai.run/v2/image/generation";
const EDEN_V2_BG_REMOVAL_URL =
  "https://api.edenai.run/v2/image/background_removal";
const EDEN_V3_EDITS_URL = "https://api.edenai.run/v3/images/edits";
const EDEN_V3_CHAT_URL = "https://api.edenai.run/v3/chat/completions";
const DEFAULT_PROVIDERS = "openai";
const DEFAULT_BG_PROVIDERS = "api4ai";
const DEFAULT_RESOLUTION = "1024x1024";
const DEFAULT_EDIT_MODEL = "openai/gpt-image-1.5";
const DEFAULT_VISION_MODEL = "openai/gpt-4o-mini";
const MIN_VALID_IMAGE_BYTES = 2000;

const { PNG } = require("pngjs");

/**
 * Edit/transform via Eden AI v2 image generation (weak for true img2img).
 * Prefer local edits or background-removal for fidelity.
 */
async function editWithEden({ imageDataUrl, prompt, apiKey, providers }) {
  if (!apiKey) {
    throw new Error("EDEN_AI_API_KEY is not set");
  }
  if (!imageDataUrl || typeof imageDataUrl !== "string") {
    throw new Error("Invalid imageDataUrl");
  }

  const base64 = stripDataUrlPrefix(imageDataUrl);
  const selectedProviders =
    providers || process.env.EDEN_AI_PROVIDERS || DEFAULT_PROVIDERS;
  const resolution = process.env.EDEN_AI_RESOLUTION || DEFAULT_RESOLUTION;

  const response = await fetch(EDEN_V2_GENERATION_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      providers: selectedProviders,
      text: prompt,
      resolution,
      num_images: 1,
      file: base64,
      fallback_providers: "",
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(extractError(payload, response.status));
  }

  const imageBase64 = extractV2Image(payload);
  if (!imageBase64) {
    throw new Error(
      extractError(payload, response.status) ||
        "Eden AI response did not include an image"
    );
  }

  assertNotBlankStub(imageBase64);
  return `data:image/png;base64,${imageBase64}`;
}

/**
 * True background removal (keeps the captured subject).
 */
async function removeBackgroundWithEden({ imageDataUrl, apiKey, providers }) {
  if (!apiKey) {
    throw new Error("EDEN_AI_API_KEY is not set");
  }

  const base64 = stripDataUrlPrefix(imageDataUrl);
  const selectedProviders =
    providers ||
    process.env.EDEN_AI_BG_PROVIDERS ||
    DEFAULT_BG_PROVIDERS;

  const response = await fetch(EDEN_V2_BG_REMOVAL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      providers: selectedProviders,
      file: base64,
      response_as_dict: true,
      attributes_as_list: false,
      show_original_response: false,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(extractError(payload, response.status));
  }

  const image = extractBgRemovalImage(payload);
  if (!image) {
    throw new Error(
      extractError(payload, response.status) ||
        "Eden background removal did not return an image"
    );
  }

  if (image.startsWith("http://") || image.startsWith("https://")) {
    return await urlToDataUrl(image);
  }

  const bare = stripDataUrlPrefix(image);
  assertNotBlankStub(bare);
  return image.startsWith("data:") ? image : `data:image/png;base64,${bare}`;
}

/**
 * Replace main subject in the scene with the asset identity (AI swap).
 * Primary: Eden v3 multi-image edits. Fallback: dual-panel + v2 generation.
 */
async function replaceSubjectWithEden({
  sceneDataUrl,
  assetDataUrl,
  prompt,
  apiKey,
}) {
  if (!apiKey) {
    throw new Error("EDEN_AI_API_KEY is not set");
  }
  if (!sceneDataUrl || !assetDataUrl) {
    throw new Error("scene and asset images are required for replace");
  }

  const model = process.env.EDEN_AI_MODEL || DEFAULT_EDIT_MODEL;

  try {
    return await replaceViaV3Edits({
      sceneDataUrl,
      assetDataUrl,
      prompt,
      apiKey,
      model,
    });
  } catch (err) {
    console.warn(
      "Eden v3 replace failed, falling back to dual-panel v2:",
      err?.message || err
    );
    const dual = await buildDualPanelDataUrl(sceneDataUrl, assetDataUrl);
    const fallbackPrompt = `${prompt}\nThe left panel is the SCENE. The right panel is the REPLACEMENT SUBJECT reference. Output a single image of the left scene with the main subject replaced by the right reference.`;
    return editWithEden({
      imageDataUrl: dual,
      prompt: fallbackPrompt,
      apiKey,
    });
  }
}

async function replaceViaV3Edits({
  sceneDataUrl,
  assetDataUrl,
  prompt,
  apiKey,
  model,
}) {
  const response = await fetch(EDEN_V3_EDITS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      images: [
        { image_url: ensureDataUrl(sceneDataUrl) },
        { image_url: ensureDataUrl(assetDataUrl) },
      ],
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(extractError(payload, response.status));
  }

  const item = payload?.data?.[0];
  if (!item) {
    throw new Error("Eden v3 edits returned no image data");
  }

  if (item.b64_json) {
    const raw = String(item.b64_json);
    const bare = raw.startsWith("data:") ? stripDataUrlPrefix(raw) : raw;
    assertNotBlankStub(bare);
    return raw.startsWith("data:") ? raw : `data:image/png;base64,${bare}`;
  }

  if (item.url) {
    const dataUrl = await urlToDataUrl(item.url);
    assertNotBlankStub(stripDataUrlPrefix(dataUrl));
    return dataUrl;
  }

  throw new Error("Eden v3 edits had neither b64_json nor url");
}

async function buildDualPanelDataUrl(sceneDataUrl, assetDataUrl) {
  const left = await decodePng(sceneDataUrl);
  const right = await decodePng(assetDataUrl);

  const targetH = Math.max(left.height, right.height, 256);
  const leftW = Math.round((left.width / left.height) * targetH);
  const rightW = Math.round((right.width / right.height) * targetH);
  const gap = 8;
  const out = new PNG({ width: leftW + gap + rightW, height: targetH });

  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = 255;
    out.data[i + 1] = 255;
    out.data[i + 2] = 255;
    out.data[i + 3] = 255;
  }

  blitScaled(left, out, 0, 0, leftW, targetH);
  blitScaled(right, out, leftW + gap, 0, rightW, targetH);

  const buf = PNG.sync.write(out);
  return `data:image/png;base64,${buf.toString("base64")}`;
}

function decodePng(dataUrl) {
  const bare = stripDataUrlPrefix(dataUrl);
  const buffer = Buffer.from(bare, "base64");
  try {
    return PNG.sync.read(buffer);
  } catch (_err) {
    throw new Error(
      "Replace fallback requires PNG assets/captures. Re-save as PNG and try again."
    );
  }
}

function blitScaled(src, dest, dx, dy, dw, dh) {
  for (let y = 0; y < dh; y += 1) {
    const sy = Math.min(src.height - 1, Math.floor((y / dh) * src.height));
    for (let x = 0; x < dw; x += 1) {
      const sx = Math.min(src.width - 1, Math.floor((x / dw) * src.width));
      const si = (src.width * sy + sx) << 2;
      const di = (dest.width * (dy + y) + (dx + x)) << 2;
      dest.data[di] = src.data[si];
      dest.data[di + 1] = src.data[si + 1];
      dest.data[di + 2] = src.data[si + 2];
      dest.data[di + 3] = src.data[si + 3];
    }
  }
}

function ensureDataUrl(value) {
  if (String(value).startsWith("data:")) return value;
  return `data:image/png;base64,${stripDataUrlPrefix(value)}`;
}

function extractBgRemovalImage(payload) {
  if (!payload || typeof payload !== "object") return null;

  for (const value of Object.values(payload)) {
    if (!value || typeof value !== "object") continue;
    if (value.status && value.status !== "success") continue;

    if (typeof value.image_b64 === "string" && value.image_b64) {
      return value.image_b64;
    }
    if (typeof value.image === "string" && value.image) {
      return value.image;
    }
    if (typeof value.image_resource_url === "string" && value.image_resource_url) {
      return value.image_resource_url;
    }
    const nested = value.items?.[0];
    if (nested?.image) return nested.image;
    if (nested?.image_b64) return nested.image_b64;
    if (nested?.image_resource_url) return nested.image_resource_url;
  }

  return null;
}

function stripDataUrlPrefix(dataUrl) {
  const match = /^data:[^;]+;base64,(.+)$/s.exec(String(dataUrl).trim());
  return match ? match[1] : String(dataUrl).trim();
}

function extractV2Image(payload) {
  if (!payload || typeof payload !== "object") return null;

  for (const value of Object.values(payload)) {
    if (!value || typeof value !== "object") continue;
    if (value.status && value.status !== "success") continue;

    const fromItems = value.items?.[0]?.image;
    if (typeof fromItems === "string" && fromItems.length > 0) {
      return stripDataUrlPrefix(fromItems);
    }

    if (typeof value.image === "string" && value.image.length > 0) {
      return stripDataUrlPrefix(value.image);
    }
  }

  return null;
}

function extractError(payload, status) {
  if (!payload || typeof payload !== "object") {
    return `Eden AI error (${status})`;
  }

  if (typeof payload.error === "string") return payload.error;
  if (payload.error?.message) return payload.error.message;
  if (payload.message) return String(payload.message);

  for (const value of Object.values(payload)) {
    if (!value || typeof value !== "object") continue;
    if (value.status === "fail" || value.error) {
      return (
        value.error?.message ||
        value.error ||
        value.message ||
        `Eden provider failed (${status})`
      );
    }
  }

  return `Eden AI error (${status})`;
}

function assertNotBlankStub(base64) {
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length < MIN_VALID_IMAGE_BYTES) {
    throw new Error(
      "Eden AI returned an empty/blank image. Check your Eden billing and that image generation is enabled for your key."
    );
  }
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer.length >= 24) {
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    if (width <= 1 && height <= 1) {
      throw new Error(
        "Eden AI returned a blank 1x1 image stub. Try another Eden provider in EDEN_AI_PROVIDERS."
      );
    }
  }
}

async function urlToDataUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download Eden result (${response.status})`);
  }
  const contentType = response.headers.get("content-type") || "image/png";
  const buffer = Buffer.from(await response.arrayBuffer());
  const mime = contentType.split(";")[0].trim() || "image/png";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

/**
 * Vision→text via Eden OpenAI-compatible chat completions.
 * @param {{ imageDataUrl: string, apiKey: string, instruction: string, model?: string }} args
 * @returns {Promise<string>}
 */
async function describeImagePromptWithEden({
  imageDataUrl,
  apiKey,
  instruction,
  model,
}) {
  if (!apiKey) {
    throw new Error("EDEN_AI_API_KEY is not set");
  }
  if (!imageDataUrl || typeof imageDataUrl !== "string") {
    throw new Error("Invalid imageDataUrl");
  }
  const text =
    typeof instruction === "string" && instruction.trim()
      ? instruction.trim()
      : "Describe this image as a detailed image-generation prompt. Output only the prompt.";
  const selectedModel =
    model || process.env.EDEN_AI_VISION_MODEL || DEFAULT_VISION_MODEL;

  const response = await fetch(EDEN_V3_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: selectedModel,
      temperature: 0.4,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text },
            {
              type: "image_url",
              image_url: { url: ensureDataUrl(imageDataUrl) },
            },
          ],
        },
      ],
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(extractError(payload, response.status));
  }

  const content = payload?.choices?.[0]?.message?.content;
  const prompt =
    typeof content === "string"
      ? content.trim()
      : Array.isArray(content)
        ? content
            .map((part) => (typeof part === "string" ? part : part?.text || ""))
            .join(" ")
            .trim()
        : "";
  if (!prompt) {
    throw new Error(
      extractError(payload, response.status) ||
        "Eden AI response did not include prompt text"
    );
  }
  return prompt;
}

module.exports = {
  EDEN_V2_GENERATION_URL,
  EDEN_V2_BG_REMOVAL_URL,
  EDEN_V3_EDITS_URL,
  EDEN_V3_CHAT_URL,
  editWithEden,
  removeBackgroundWithEden,
  replaceSubjectWithEden,
  describeImagePromptWithEden,
};
