const { normalizePromptText } = require("./promptQuality");

const FONT_STYLES = new Set(["serif", "sans", "script", "display", "mono"]);
const WEIGHTS = new Set(["light", "regular", "medium", "bold", "black"]);
const SIZE_HINTS = new Set(["xl", "lg", "md", "sm"]);
const ROLES = new Set([
  "headline",
  "subhead",
  "body",
  "cta",
  "label",
  "other",
]);

const DETECT_TEXT_INSTRUCTION = `Study the attached image. Extract every readable text block AND every logo/icon/mark visible in the graphic.

Return ONLY valid JSON (no markdown fences, no commentary) in this exact shape:
{"texts":[{"id":"t1","text":"...","role":"headline|subhead|body|cta|label|other","fontStyle":"serif|sans|script|display|mono","fontFamily":"best-guess family name","weight":"light|regular|medium|bold|black","sizeHint":"xl|lg|md|sm","color":"#RRGGBB","hasShadow":false,"notes":"optional short typography note"}],"icons":[{"id":"i1","description":"short name of the mark","style":"flat|outlined|filled|3d|other"}]}

Rules:
- Copy text EXACTLY as shown (preserve casing, punctuation, line breaks within a block as spaces).
- Reading order: top-to-bottom, left-to-right.
- role: headline = largest hero title; subhead = secondary title; body = paragraph/supporting copy; cta = button/link; label = badge/tag; other = anything else.
- fontStyle / weight / sizeHint / color: describe the ACTUAL look of THAT block. Different blocks often use different fonts—report each accurately.
- fontFamily: best-guess typeface name or close match (e.g. "Inter", "Helvetica Neue", "Roboto", "Georgia", "unknown geometric sans"). Prefer a real family name when recognizable; otherwise a short descriptive guess. Never leave empty—use "unknown sans" / "unknown serif" etc.
- hasShadow: true ONLY if that block clearly has a drop shadow, soft halo, glow, or blur underlay in the source. Flat crisp marketing type = false.
- color: approximate hex of the glyph fill (not the background). Use #RRGGBB.
- notes: brief cues only when useful (e.g. "all caps", "condensed", "italic", "outlined"). Empty string if none.
- icons: logos, brand marks, pictograms (not decorative background patterns). description = short human label (e.g. "stylized X mark", "Twitter bird"). style = visual treatment.
- Skip tiny illegible watermarks if unreadable.
- Do not invent text or icons that are not in the image.
- ids must be unique short strings (t1, t2, … / i1, i2, …).`;

/**
 * @param {unknown} value
 * @param {Set<string>} allowed
 * @param {string} fallback
 */
function pickEnum(value, allowed, fallback) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  return allowed.has(key) ? key : fallback;
}

/**
 * @param {unknown} value
 */
function normalizeHexColor(value) {
  const raw = String(value || "").trim();
  const m = raw.match(/^#?([0-9a-fA-F]{6})$/);
  if (m) return `#${m[1].toUpperCase()}`;
  const short = raw.match(/^#?([0-9a-fA-F]{3})$/);
  if (short) {
    const [a, b, c] = short[1].split("");
    return `#${(a + a + b + b + c + c).toUpperCase()}`;
  }
  return "";
}

/**
 * @param {unknown} value
 */
function parseHasShadow(value) {
  if (typeof value === "boolean") return value;
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (["true", "1", "yes", "y"].includes(raw)) return true;
  return false;
}

/**
 * @param {string} raw
 * @returns {{ texts: Array<{
 *   id: string,
 *   text: string,
 *   role: string,
 *   fontStyle: string,
 *   fontFamily: string,
 *   weight: string,
 *   sizeHint: string,
 *   color: string,
 *   hasShadow: boolean,
 *   notes: string,
 * }>, icons: Array<{ id: string, description: string, style: string }> }}
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
    const role = pickEnum(item?.role, ROLES, "other");
    const fontStyle = pickEnum(item?.fontStyle, FONT_STYLES, "sans");
    const weight = pickEnum(item?.weight, WEIGHTS, "regular");
    const sizeHint = pickEnum(item?.sizeHint, SIZE_HINTS, "md");
    const color = normalizeHexColor(item?.color);
    const hasShadow = parseHasShadow(item?.hasShadow);
    let fontFamily = String(item?.fontFamily || "")
      .trim()
      .slice(0, 80);
    if (!fontFamily) {
      fontFamily = `unknown ${fontStyle}`;
    }
    const notes = String(item?.notes || "")
      .trim()
      .slice(0, 120);
    texts.push({
      id,
      text,
      role,
      fontStyle,
      fontFamily,
      weight,
      sizeHint,
      color,
      hasShadow,
      notes,
    });
  });
  if (!texts.length) {
    throw new Error("No readable text detected in the image");
  }

  const iconList = Array.isArray(parsed?.icons) ? parsed.icons : [];
  const icons = [];
  iconList.forEach((item, index) => {
    const description = String(item?.description || item?.name || "")
      .trim()
      .slice(0, 120);
    if (!description) return;
    const id = String(item?.id || `i${index + 1}`).trim() || `i${index + 1}`;
    const style = String(item?.style || "other")
      .trim()
      .toLowerCase()
      .slice(0, 40) || "other";
    icons.push({ id, description, style });
  });

  return { texts, icons };
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
  const byLang =
    parsed?.translations && typeof parsed.translations === "object"
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

/**
 * @param {Array<{ from?: string, to?: string, role?: string, fontStyle?: string, fontFamily?: string, weight?: string, sizeHint?: string, color?: string, hasShadow?: boolean, notes?: string }>} block
 */
function formatTypographyCue(block) {
  if (!block) return "";
  const shadow =
    block.hasShadow === true
      ? "shadow=yes"
      : block.hasShadow === false
        ? "shadow=no"
        : "";
  const bits = [
    block.role ? `role=${block.role}` : "",
    block.fontFamily ? `family=${block.fontFamily}` : "",
    block.fontStyle ? `font=${block.fontStyle}` : "",
    block.weight ? `weight=${block.weight}` : "",
    block.sizeHint ? `size=${block.sizeHint}` : "",
    block.color ? `color=${block.color}` : "",
    shadow,
    block.notes ? `notes=${block.notes}` : "",
  ].filter(Boolean);
  return bits.length ? ` [${bits.join(", ")}]` : "";
}

/**
 * Build prompt to erase all listed strings and recover a clean background plate.
 * @param {Array<{ from?: string, text?: string }>} texts
 */
function buildTextEraseUserPrompt(texts) {
  const lines = (texts || [])
    .map((t) => String(t?.from || t?.text || "").trim())
    .filter(Boolean)
    .map((t) => `- Erase exactly: "${t}"`);
  return (
    `Remove ALL listed on-image text from this graphic.\n` +
    `Completely erase/inpaint the glyphs and restore the natural background texture, color, and lighting underneath. ` +
    `Do not paint replacement words. Leave those regions blank of lettering.\n` +
    `Erase cleanly: no residual blur rings, soft halos, ghost outlines, or shadow smudges where the text was.\n` +
    `HARD CONSTRAINT: Keep the rest of the graphic pixel-identical—same photo, layout, illustrations, colors, icons, and framing. ` +
    `Do not invent a new scene or crop.\n\n` +
    (lines.length ? `Text to remove:\n${lines.join("\n")}` : "Remove all visible lettering.")
  );
}

/**
 * @param {Array<{ from?: string, to?: string, role?: string, fontStyle?: string, fontFamily?: string, weight?: string, sizeHint?: string, color?: string, hasShadow?: boolean, notes?: string }>} replacements
 * @param {string|null} languageLabel
 * @param {{ fromCleanPlate?: boolean }} opts
 */
function buildTextSwapUserPrompt(replacements, languageLabel, opts = {}) {
  const fromCleanPlate = Boolean(opts.fromCleanPlate);
  const lines = (replacements || [])
    .filter((r) => r && r.from && r.to && String(r.from) !== String(r.to))
    .map((r) => {
      const cue = formatTypographyCue(r);
      return `- Replace "${String(r.from)}" with "${String(r.to)}"${cue}`;
    });
  const header = languageLabel
    ? `Localize on-image text for ${languageLabel}.`
    : "Swap on-image text as listed.";
  const plateNote = fromCleanPlate
    ? `The attached image is a CLEAN PLATE (background with original lettering already removed). ` +
      `Paint ONLY the new copy into the correct regions—do not re-introduce old glyphs. `
    : `Completely remove/erase the old glyphs (inpaint the background texture underneath), then render the new copy. `;
  return (
    `${header}\n` +
    plateNote +
    `Match each line's typography from the cues (font family, style, weight, size, color, perspective). ` +
    `Paint CRISP single-layer glyphs with a solid fill only. ` +
    `HARD CONSTRAINT: Do NOT add drop shadows, outer glow, soft halo, blur underlay, double-offset layers, or embossed/debossed fake depth ` +
    `unless that line's cue explicitly says shadow=yes. If shadow=no or shadow is omitted, render flat sharp type. ` +
    `Keep logos/icons and the rest of the graphic unchanged. Scale text to fit existing regions. ` +
    `Do not replace the entire image. Do not invent a new photo, scene, or background.\n\n` +
    (lines.length ? `Replacements:\n${lines.join("\n")}` : "No text changes.")
  );
}

module.exports = {
  DETECT_TEXT_INSTRUCTION,
  parseDetectTextResponse,
  parseTranslateCopyResponse,
  buildTranslateInstruction,
  buildTextSwapUserPrompt,
  buildTextEraseUserPrompt,
};
