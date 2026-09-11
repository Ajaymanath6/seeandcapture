const FAL_ENDPOINT = "https://fal.run/fal-ai/flux/dev/image-to-image";

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
  editWithFal,
};
