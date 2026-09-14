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

/**
 * Parse style JSON from vision model output.
 * @param {string} text
 * @returns {{ ok: true, title: string, tags: string[], description: string } | { ok: false, reason: string }}
 */
function parseStylePayload(text) {
  const raw = normalizePromptText(text);
  if (!raw) {
    return { ok: false, reason: "Empty style response" };
  }
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (_err) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch (_err2) {
        return { ok: false, reason: "Style response was not valid JSON" };
      }
    } else {
      return { ok: false, reason: "Style response was not valid JSON" };
    }
  }
  const title = String(parsed?.title || "").trim();
  const description = String(parsed?.description || "").trim();
  const tags = Array.isArray(parsed?.tags)
    ? parsed.tags
        .map((t) => String(t || "").trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];
  if (!title || title.length < 2) {
    return { ok: false, reason: "Style title missing" };
  }
  const checked = assertPromptQuality(description);
  if (!checked.ok) {
    return {
      ok: false,
      reason: checked.reason.replace(/Prompt/g, "Style description"),
    };
  }
  return {
    ok: true,
    title: title.slice(0, 80),
    tags,
    description: checked.prompt,
  };
}

module.exports = {
  MIN_PROMPT_CHARS,
  normalizePromptText,
  assertPromptQuality,
  parseStylePayload,
};
