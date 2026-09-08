const EDEN_V2_GENERATION_URL = "https://api.edenai.run/v2/image/generation";
const EDEN_V2_BG_REMOVAL_URL =
  "https://api.edenai.run/v2/image/background_removal";
const DEFAULT_PROVIDERS = "openai";
const DEFAULT_BG_PROVIDERS = "api4ai";
const DEFAULT_RESOLUTION = "1024x1024";
const MIN_VALID_IMAGE_BYTES = 2000;

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

module.exports = {
  EDEN_V2_GENERATION_URL,
  EDEN_V2_BG_REMOVAL_URL,
  editWithEden,
  removeBackgroundWithEden,
};
