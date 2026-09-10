const MODEL_ID = "gemini-2.5-flash-image";
const TEXT_MODEL_ID = "gemini-2.5-flash";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

const DESCRIBE_PROMPT_INSTRUCTION = `Study the attached image carefully. Write ONE self-contained image-generation prompt that would recreate THIS exact image as closely as possible.

Rules:
- Neutral plain English only. No pirate talk, dialects, roleplay, personas, or chatty narration.
- Start with the main subject(s) (who/what), then pose/action, then setting/environment, then art style, lighting, camera/composition, materials, and color palette.
- Describe only what is actually visible. Do not invent objects, people, or scenery that are not in the image.
- Output only the prompt text itself—no title, markdown, labels, bullet lists, or commentary.`;

/**
 * Call Nano Banana (Gemini image model) with an input image + text prompt.
 * @param {{ imageDataUrl: string, prompt: string, apiKey: string }} args
 * @returns {Promise<string>} result image as data URL
 */
async function editWithNanoBanana({ imageDataUrl, prompt, apiKey }) {
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is not set");
  }

  const parsed = parseDataUrl(imageDataUrl);
  if (!parsed) {
    throw new Error("Invalid imageDataUrl; expected a data URL");
  }

  const url = `${API_BASE}/models/${MODEL_ID}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: parsed.mimeType,
              data: parsed.base64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      payload?.error?.message ||
      `Gemini API error (${response.status})`;
    throw new Error(message);
  }

  const imagePart = findInlineImage(payload);
  if (!imagePart) {
    const textHint = findText(payload);
    throw new Error(
      textHint
        ? `Model returned text instead of an image: ${textHint.slice(0, 240)}`
        : "Model response did not include an image"
    );
  }

  const mime = imagePart.mimeType || "image/png";
  return `data:${mime};base64,${imagePart.data}`;
}

/**
 * Vision→text: produce a recreate-style image prompt from a capture.
 * @param {{ imageDataUrl: string, apiKey: string }} args
 * @returns {Promise<string>}
 */
async function describeImagePrompt({ imageDataUrl, apiKey }) {
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is not set");
  }

  const parsed = parseDataUrl(imageDataUrl);
  if (!parsed) {
    throw new Error("Invalid imageDataUrl; expected a data URL");
  }

  const url = `${API_BASE}/models/${TEXT_MODEL_ID}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: DESCRIBE_PROMPT_INSTRUCTION },
          {
            inlineData: {
              mimeType: parsed.mimeType,
              data: parsed.base64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.4,
    },
  };

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const detail = err?.cause?.message || err?.message || String(err);
    throw new Error(
      `Gemini network error (${detail}). Fix GOOGLE_API_KEY or rely on OPENROUTER_API_KEY.`
    );
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      payload?.error?.message ||
      `Gemini API error (${response.status})`;
    throw new Error(message);
  }

  const text = findText(payload);
  if (!text) {
    throw new Error("Model did not return a prompt");
  }
  return text;
}

function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") return null;
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl.trim());
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

function findInlineImage(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  for (const part of parts) {
    const inline = part.inlineData || part.inline_data;
    if (inline?.data) {
      return {
        mimeType: inline.mimeType || inline.mime_type || "image/png",
        data: inline.data,
      };
    }
  }
  return null;
}

function findText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((p) => p.text)
    .filter(Boolean)
    .join(" ")
    .trim();
}

module.exports = {
  MODEL_ID,
  TEXT_MODEL_ID,
  DESCRIBE_PROMPT_INSTRUCTION,
  editWithNanoBanana,
  describeImagePrompt,
};
