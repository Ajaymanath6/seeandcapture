const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Prefer models that currently answer vision on the free tier. */
const DEFAULT_VISION_MODELS = [
  "nex-agi/nex-n2.5-mini:free",
  "nex-agi/nex-n2.5-pro:free",
  "dots-studio/dots-3-note-preview:free",
  "google/gemma-4-31b-it:free",
  "openrouter/free",
];

function visionModelList(preferred) {
  const fromEnv = String(
    preferred || process.env.OPENROUTER_VISION_MODEL || ""
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const ordered = [...fromEnv, ...DEFAULT_VISION_MODELS];
  return [...new Set(ordered)];
}

function formatOpenRouterError(payload, status) {
  const err = payload?.error;
  if (!err) return `OpenRouter error (${status})`;
  const raw = err.metadata?.raw;
  const msg = err.message || payload?.message || `OpenRouter error (${status})`;
  if (/user not found/i.test(String(msg))) {
    return (
      "OpenRouter key rejected (User not found). Use a normal Create Key from " +
      "https://openrouter.ai/keys — not a provisioning/management key, and not an expired key. " +
      "Paste it into server/.env as OPENROUTER_API_KEY=… then restart the server."
    );
  }
  if (typeof raw === "string" && raw.trim() && raw.trim() !== msg) {
    return `${msg}: ${raw.trim().slice(0, 240)}`;
  }
  if (status === 429) {
    return `${msg} (rate-limited — retry shortly or try another free model)`;
  }
  return msg;
}

/**
 * Vision→text via OpenRouter. Tries several free vision models until one works.
 * @param {{ imageDataUrl: string, apiKey: string, instruction: string, model?: string }} args
 * @returns {Promise<{ prompt: string, model: string }>}
 */
async function describeImagePromptWithOpenRouter({
  imageDataUrl,
  apiKey,
  instruction,
  model,
}) {
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }
  if (!imageDataUrl || typeof imageDataUrl !== "string") {
    throw new Error("Invalid imageDataUrl");
  }

  const text =
    typeof instruction === "string" && instruction.trim()
      ? instruction.trim()
      : "Describe this image as a detailed image-generation prompt. Output only the prompt.";
  const dataUrl = imageDataUrl.startsWith("data:")
    ? imageDataUrl
    : `data:image/png;base64,${imageDataUrl}`;

  const models = visionModelList(model);
  const errors = [];

  for (const selectedModel of models) {
    try {
      const response = await fetch(OPENROUTER_CHAT_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/seeandcapture",
          "X-Title": "See and Capture",
        },
        body: JSON.stringify({
          model: selectedModel,
          temperature: 0.3,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text },
                {
                  type: "image_url",
                  image_url: { url: dataUrl },
                },
              ],
            },
          ],
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.error) {
        throw new Error(
          formatOpenRouterError(payload, response.status || 502)
        );
      }

      const content = payload?.choices?.[0]?.message?.content;
      const prompt =
        typeof content === "string"
          ? content.trim()
          : Array.isArray(content)
            ? content
                .map((part) =>
                  typeof part === "string" ? part : part?.text || ""
                )
                .join(" ")
                .trim()
            : "";

      if (!prompt) {
        throw new Error("OpenRouter response did not include prompt text");
      }
      return { prompt, model: selectedModel };
    } catch (err) {
      errors.push(`${selectedModel}: ${err?.message || String(err)}`);
    }
  }

  throw new Error(errors.join(" | ") || "OpenRouter vision failed");
}

module.exports = {
  OPENROUTER_CHAT_URL,
  DEFAULT_VISION_MODELS,
  describeImagePromptWithOpenRouter,
};
