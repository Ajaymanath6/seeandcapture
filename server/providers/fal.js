const { ensurePublicImageUrl } = require("./fluxapi");

const FAL_ENDPOINT = "https://fal.run/fal-ai/flux/dev/image-to-image";
const FAL_MULTI_ENDPOINT =
  "https://fal.run/fal-ai/flux-pro/kontext/max/multi";

/**
 * Edit an image with fal.ai Flux image-to-image.
 * @param {{ imageDataUrl: string, prompt: string, apiKey: string }} args
 * @returns {Promise<string>} result image as data URL
 */
async function editWithFal({ imageDataUrl, prompt, apiKey, strength }) {
  if (!apiKey) {
    throw new Error("FAL_KEY is not set");
  }
  if (!imageDataUrl || typeof imageDataUrl !== "string") {
    throw new Error("Invalid imageDataUrl");
  }

  const strengthValue =
    typeof strength === "number" && strength > 0 && strength <= 1
      ? strength
      : 0.85;

  const response = await fetch(FAL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_url: imageDataUrl,
      prompt,
      strength: strengthValue,
      num_inference_steps: 28,
      enable_safety_checker: true,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      payload?.detail ||
      payload?.error ||
      (typeof payload === "string" ? payload : null) ||
      `fal.ai error (${response.status})`;
    throw new Error(
      typeof message === "string" ? message : JSON.stringify(message)
    );
  }

  const imageUrl =
    payload?.images?.[0]?.url ||
    payload?.image?.url ||
    payload?.output?.images?.[0]?.url;

  if (!imageUrl) {
    throw new Error("fal.ai response did not include an image URL");
  }

  return await urlToDataUrl(imageUrl);
}

/**
 * True multi-reference mashup via FLUX.1 Kontext [max] multi.
 * image_urls[0] = Image 1 style/environment, image_urls[1] = Image 2 subject.
 * @param {{
 *   styleDataUrl: string,
 *   subjectDataUrl: string,
 *   prompt: string,
 *   apiKey: string,
 * }} args
 * @returns {Promise<string>} result image as data URL
 */
async function mashupWithFalMulti({
  styleDataUrl,
  subjectDataUrl,
  prompt,
  apiKey,
}) {
  if (!apiKey) {
    throw new Error("FAL_KEY is not set");
  }
  if (!styleDataUrl || !subjectDataUrl) {
    throw new Error("style and subject images are required for mashup");
  }
  if (!prompt || typeof prompt !== "string") {
    throw new Error("prompt is required");
  }

  let styleUrl;
  let subjectUrl;
  try {
    styleUrl = await ensurePublicImageUrl(styleDataUrl);
    subjectUrl = await ensurePublicImageUrl(subjectDataUrl);
  } catch (err) {
    console.warn(
      "[fal-multi] host failed, trying data URLs:",
      err?.message || err
    );
    styleUrl = styleDataUrl;
    subjectUrl = subjectDataUrl;
  }

  const styleHost = safeUrlHost(styleUrl);
  const subjectHost = safeUrlHost(subjectUrl);
  console.log(
    `[fal-multi] mashup image_urls=2 hosts=${styleHost},${subjectHost} promptLen=${prompt.length}`
  );

  const response = await fetch(FAL_MULTI_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      image_urls: [styleUrl, subjectUrl],
      num_images: 1,
      output_format: "png",
      guidance_scale: 3.5,
      safety_tolerance: "2",
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      payload?.detail ||
      payload?.error ||
      (typeof payload === "string" ? payload : null) ||
      `fal.ai multi error (${response.status})`;
    throw new Error(
      typeof message === "string" ? message : JSON.stringify(message)
    );
  }

  const imageUrl =
    payload?.images?.[0]?.url ||
    payload?.image?.url ||
    payload?.output?.images?.[0]?.url;

  if (!imageUrl) {
    throw new Error("fal.ai multi response did not include an image URL");
  }

  return await urlToDataUrl(imageUrl);
}

function safeUrlHost(url) {
  if (typeof url !== "string") return "?";
  if (url.startsWith("data:")) return "data";
  try {
    return new URL(url).host || "?";
  } catch (_err) {
    return "?";
  }
}

async function urlToDataUrl(url) {
  if (typeof url === "string" && url.startsWith("data:")) {
    return url;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download fal result (${response.status})`);
  }

  const contentType = response.headers.get("content-type") || "image/png";
  const buffer = Buffer.from(await response.arrayBuffer());
  const mime = contentType.split(";")[0].trim() || "image/png";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

module.exports = {
  FAL_ENDPOINT,
  FAL_MULTI_ENDPOINT,
  editWithFal,
  mashupWithFalMulti,
};
