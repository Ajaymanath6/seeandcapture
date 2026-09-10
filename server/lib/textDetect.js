const { normalizePromptText } = require("./promptQuality");

const DETECT_TEXT_INSTRUCTION = `Study the attached image. Extract every readable text block visible in the graphic (headlines, subheads, CTAs, labels, badges).

Return ONLY valid JSON (no markdown fences, no commentary) in this exact shape:
{"texts":[{"id":"t1","text":"...","role":"headline|subhead|cta|label|other"}]}

Rules:
- Neutral plain English values only; copy text exactly as shown (preserve casing/punctuation).
- Reading order: top-to-bottom, left-to-right.
- Skip tiny illegible watermarks if unreadable.
- Do not invent text that is not in the image.
- ids must be unique short strings (t1, t2, ...).`;

/**
 * @param {string} raw
 * @returns {{ texts: Array<{ id: string, text: string, role?: string }> }}
 */
function parseDetectTextResponse(raw) {
  const cleaned = normalizePromptText(raw);
  let jsonText = cleaned;
  const brace = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (brace >= 0 && end > brace) {
    jsonText = cleaned.slice(brace, end + 1);
  }
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (_err) {
    throw new Error("Detect-text model did not return valid JSON");
  }
  const list = Array.isArray(parsed?.texts) ? parsed.texts : [];
  const texts = [];
  list.forEach((item, index) => {
    const text = String(item?.text || "").trim();
    if (!text) return;
    const id = String(item?.id || `t${index + 1}`).trim() || `t${index + 1}`;
    const role = String(item?.role || "other").trim() || "other";
    texts.push({ id, text, role });
  });
  if (!texts.length) {
    throw new Error("No readable text detected in the image");
  }
  return { texts };
}

/**
 * @param {string} raw
 * @param {string[]} langs
 * @param {Array<{ id: string, text: string }>} sources
 */
function parseTranslateCopyResponse(raw, langs, sources) {
  const cleaned = normalizePromptText(raw);
  let jsonText = cleaned;
  const brace = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (brace >= 0 && end > brace) {
    jsonText = cleaned.slice(brace, end + 1);
  }
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (_err) {
    throw new Error("Translate-copy model did not return valid JSON");
  }
  const byLang = parsed?.translations && typeof parsed.translations === "object"
    ? parsed.translations
    : {};
  const out = {};
  for (const lang of langs) {
    const rows = Array.isArray(byLang[lang]) ? byLang[lang] : [];
    const map = {};
    rows.forEach((row) => {
      const id = String(row?.id || "").trim();
      const text = String(row?.text || "").trim();
      if (id && text) map[id] = text;
    });
    out[lang] = sources.map((src) => ({
      id: src.id,
      text: map[src.id] || src.text,
    }));
  }
  return { translations: out };
}

function buildTranslateInstruction({ texts, languages, style }) {
  const mode =
    style === "marketing"
      ? "Marketing adapt: localize idioms and shorten where needed for ads/CTAs while keeping intent."
      : "Literal translation: keep meaning close to the source wording.";
  return `Translate the following UI/ad copy strings into each target language.

Style: ${mode}

Source JSON:
${JSON.stringify({ texts }, null, 0)}

Target language codes: ${languages.join(", ")}

Return ONLY valid JSON (no markdown) shaped as:
{"translations":{"es":[{"id":"t1","text":"..."}],"de":[{"id":"t1","text":"..."}]}}

Include every source id for every language. No commentary.`;
}

function buildTextSwapUserPrompt(replacements, languageLabel) {
  const lines = (replacements || [])
    .filter((r) => r && r.from && r.to && String(r.from) !== String(r.to))
    .map((r) => `- Replace "${String(r.from)}" with "${String(r.to)}"`);
  const header = languageLabel
    ? `Localize on-image text for ${languageLabel}.`
    : "Swap on-image text as listed.";
  return (
    `${header}\n` +
    `Completely remove/erase the old glyphs (inpaint the background texture underneath), then render the new copy in the same place matching font style, weight, color, perspective, shadows, and lighting as closely as possible. Keep the rest of the graphic unchanged. Scale text to fit existing regions.\n\n` +
    (lines.length ? `Replacements:\n${lines.join("\n")}` : "No text changes.")
  );
}

module.exports = {
  DETECT_TEXT_INSTRUCTION,
  parseDetectTextResponse,
  parseTranslateCopyResponse,
  buildTranslateInstruction,
  buildTextSwapUserPrompt,
};
