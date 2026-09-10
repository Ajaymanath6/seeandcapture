const MIN_PROMPT_CHARS = 80;

const PERSONA_MARKERS = [
  /\barrr\b/i,
  /\bmatey\b/i,
  /\bye be\b/i,
  /\baye\b/i,
  /\bpirates?\b/i,
  /\bahoy\b/i,
  /\bme hearties\b/i,
  /\bas an ai\b/i,
  /\bi cannot (see|view|access) (the )?image\b/i,
  /\bi'm unable to (see|view)\b/i,
  /\bsure[,!]?\s+(here|happy)\b/i,
  /\bhere(?:'s| is) (a |the )?(prompt|description)\b/i,
];

/**
 * Strip markdown fences and normalize whitespace edges.
 * @param {string} text
 * @returns {string}
 */
function normalizePromptText(text) {
  let out = String(text || "").trim();
  const fenced = /^```(?:\w+)?\s*([\s\S]*?)```$/m.exec(out);
  if (fenced) {
    out = fenced[1].trim();
  }
  out = out.replace(/^```(?:\w+)?\s*/m, "").replace(/\s*```$/m, "").trim();
  return out;
}

/**
 * @param {string} text
 * @returns {{ ok: true, prompt: string } | { ok: false, reason: string }}
 */
function assertPromptQuality(text) {
  const prompt = normalizePromptText(text);
  if (!prompt || prompt.length < MIN_PROMPT_CHARS) {
    return {
      ok: false,
      reason: `Prompt too short or empty (need ≥${MIN_PROMPT_CHARS} chars)`,
    };
  }
  for (const re of PERSONA_MARKERS) {
    if (re.test(prompt)) {
      return {
        ok: false,
        reason: "Prompt looks like chat/persona fluff, not a recreate prompt",
      };
    }
  }
  return { ok: true, prompt };
}

module.exports = {
  MIN_PROMPT_CHARS,
  normalizePromptText,
  assertPromptQuality,
};
