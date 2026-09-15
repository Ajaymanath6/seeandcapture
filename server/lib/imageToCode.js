const { normalizePromptText } = require("./promptQuality");

const THEME_KEYS = [
  "textStrong",
  "textWeak",
  "strokeStrong",
  "strokeWeak",
  "bg",
];

const CSS_VAR_MAP = {
  textStrong: "--text-strong",
  textWeak: "--text-weak",
  strokeStrong: "--stroke-strong",
  strokeWeak: "--stroke-weak",
  bg: "--bg",
};

const DEFAULT_THEME = {
  textStrong: "#F8FAFC",
  textWeak: "#94A3B8",
  strokeStrong: "#E2E8F0",
  strokeWeak: "#334155",
  bg: "#0F172A",
};

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeHex(value) {
  const raw = String(value || "").trim();
  const m6 = raw.match(/^#?([0-9a-fA-F]{6})$/);
  if (m6) return `#${m6[1].toUpperCase()}`;
  const m3 = raw.match(/^#?([0-9a-fA-F]{3})$/);
  if (m3) {
    const [a, b, c] = m3[1].split("");
    return `#${(a + a + b + b + c + c).toUpperCase()}`;
  }
  return "";
}

/**
 * @param {unknown} raw
 * @returns {{
 *   textStrong: string,
 *   textWeak: string,
 *   strokeStrong: string,
 *   strokeWeak: string,
 *   bg: string,
 * }}
 */
function normalizeTheme(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = { ...DEFAULT_THEME };
  for (const key of THEME_KEYS) {
    const hex = normalizeHex(src[key]);
    if (hex) out[key] = hex;
  }
  return out;
}

function buildCodeInstruction(theme) {
  const t = normalizeTheme(theme);
  return `Study the attached screenshot/UI capture. Recreate it as a single self-contained HTML document (HTML + CSS only).

Return ONLY the HTML document (no markdown fences, no commentary). Prefer a card/layout/UI fragment matching the image; do not invent a full marketing site unless the image clearly is one.

Requirements:
- Semantic HTML structure (header/main/section/button/etc. as appropriate).
- Layout with flexbox and/or CSS grid.
- Transcribe visible text from the image accurately (OCR-from-vision); do not invent brand copy.
- Approximate icons with simple inline SVG or CSS shapes when needed.
- ALL colors MUST use only these CSS custom properties (map heading/strong text, body/muted text, strong borders, weak borders, and backgrounds accordingly):
  :root {
    --text-strong: ${t.textStrong};
    --text-weak: ${t.textWeak};
    --stroke-strong: ${t.strokeStrong};
    --stroke-weak: ${t.strokeWeak};
    --bg: ${t.bg};
  }
- Use var(--text-strong) for headings / primary labels.
- Use var(--text-weak) for body / secondary copy.
- Use var(--stroke-strong) / var(--stroke-weak) for borders and dividers.
- Use var(--bg) for page/card backgrounds (and layered surfaces via opacity if needed).
- Do not hard-code other hex/rgb colors for UI chrome.
- Include a minimal responsive viewport meta and a body style using --bg / --text-strong.
- Output a complete document starting with <!DOCTYPE html>.`;
}

/**
 * @param {string} raw
 * @returns {string}
 */
function parseCodeResponse(raw) {
  let text = normalizePromptText(raw);
  const fenced = text.match(/```(?:html|HTML)?\s*([\s\S]*?)```/);
  if (fenced) {
    text = fenced[1].trim();
  }
  text = text.trim();
  if (!text) {
    throw new Error("Model returned empty code");
  }
  if (!/<!DOCTYPE html>/i.test(text) && !/<html[\s>]/i.test(text)) {
    text = `<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Layout</title></head>\n<body>\n${text}\n</body>\n</html>`;
  }
  return text;
}

function buildRootBlock(theme) {
  const t = normalizeTheme(theme);
  return `:root {
  --text-strong: ${t.textStrong};
  --text-weak: ${t.textWeak};
  --stroke-strong: ${t.strokeStrong};
  --stroke-weak: ${t.strokeWeak};
  --bg: ${t.bg};
}`;
}

/**
 * Ensure theme CSS variables are present and match user hexes.
 * @param {string} html
 * @param {unknown} themeRaw
 * @returns {string}
 */
function applyThemeToCode(html, themeRaw) {
  const theme = normalizeTheme(themeRaw);
  const rootBlock = buildRootBlock(theme);
  let code = String(html || "");

  if (/:root\s*\{[\s\S]*?\}/.test(code)) {
    code = code.replace(/:root\s*\{[\s\S]*?\}/, rootBlock);
  } else if (/<\/head>/i.test(code)) {
    code = code.replace(
      /<\/head>/i,
      `<style>\n${rootBlock}\nbody{margin:0;background:var(--bg);color:var(--text-strong);font-family:system-ui,sans-serif;}\n</style>\n</head>`
    );
  } else if (/<body[\s>]/i.test(code)) {
    code = code.replace(
      /<body([\s>])/i,
      `<style>\n${rootBlock}\nbody{margin:0;background:var(--bg);color:var(--text-strong);font-family:system-ui,sans-serif;}\n</style>\n<body$1`
    );
  } else {
    code = `<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Layout</title><style>\n${rootBlock}\nbody{margin:0;background:var(--bg);color:var(--text-strong);font-family:system-ui,sans-serif;}\n</style></head><body>\n${code}\n</body></html>`;
  }

  // Force known var assignments if model scattered them
  for (const key of THEME_KEYS) {
    const cssVar = CSS_VAR_MAP[key];
    const hex = theme[key];
    const re = new RegExp(
      `(${cssVar.replace(/-/g, "\\-")}\\s*:\\s*)(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)`,
      "g"
    );
    code = code.replace(re, `$1${hex}`);
  }

  return code;
}

module.exports = {
  DEFAULT_THEME,
  THEME_KEYS,
  normalizeHex,
  normalizeTheme,
  buildCodeInstruction,
  parseCodeResponse,
  applyThemeToCode,
};
