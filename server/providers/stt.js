/**
 * Speech-to-text orchestration:
 * local OpenAI-compatible → direct OpenAI → OpenRouter fallbacks.
 */
const {
  transcribeAudioWithOpenRouter,
  DEFAULT_STT_MODEL,
  DEFAULT_STT_MODELS,
} = require("./openrouter");

const OPENAI_TRANSCRIBE_URL =
  "https://api.openai.com/v1/audio/transcriptions";
const DEFAULT_OPENAI_STT_MODEL = "whisper-1";
const DEFAULT_LOCAL_STT_MODEL = "whisper-base";

function hasLocalStt() {
  return Boolean(String(process.env.LOCAL_STT_URL || "").trim());
}

function hasOpenAiKey() {
  const key = String(process.env.OPENAI_API_KEY || "").trim();
  return Boolean(key && key !== "your_openai_key_goes_here");
}

function hasOpenRouterKey() {
  const key = String(process.env.OPENROUTER_API_KEY || "").trim();
  return Boolean(key && key !== "your_openrouter_key_goes_here");
}

function resolveSttBackend() {
  if (hasLocalStt()) return "local";
  if (hasOpenAiKey()) return "openai";
  if (hasOpenRouterKey()) return "openrouter";
  return null;
}

function resolveSttModel() {
  const backend = resolveSttBackend();
  if (backend === "local") {
    return (
      String(process.env.LOCAL_STT_MODEL || "").trim() ||
      DEFAULT_LOCAL_STT_MODEL
    );
  }
  if (backend === "openai") {
    return (
      String(process.env.OPENAI_STT_MODEL || "").trim() ||
      DEFAULT_OPENAI_STT_MODEL
    );
  }
  if (backend === "openrouter") {
    const preferred = String(process.env.OPENROUTER_STT_MODEL || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .find((id) => !/:free$/i.test(id));
    return preferred || DEFAULT_STT_MODEL;
  }
  return null;
}

function stripDataUrl(audioBase64) {
  return String(audioBase64 || "").replace(/^data:[^;]+;base64,/, "");
}

function normalizeFormat(format) {
  return String(format || "webm")
    .trim()
    .toLowerCase()
    .replace(/^\./, "");
}

function mimeForFormat(format) {
  const map = {
    webm: "audio/webm",
    wav: "audio/wav",
    mp3: "audio/mpeg",
    mpeg: "audio/mpeg",
    mp4: "audio/mp4",
    m4a: "audio/mp4",
    ogg: "audio/ogg",
    flac: "audio/flac",
    aac: "audio/aac",
  };
  return map[format] || `audio/${format}`;
}

function resolveTranscriptionUrl(baseUrl) {
  const raw = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  if (/\/audio\/transcriptions$/i.test(raw)) return raw;
  if (/\/v1$/i.test(raw)) return `${raw}/audio/transcriptions`;
  return `${raw}/v1/audio/transcriptions`;
}

/**
 * OpenAI-compatible multipart transcription (local or api.openai.com).
 */
async function transcribeMultipart({
  url,
  apiKey,
  model,
  audioBase64,
  format,
}) {
  const data = stripDataUrl(audioBase64);
  if (!data) throw new Error("audioBase64 is required");
  const audioFormat = normalizeFormat(format);
  if (!audioFormat) throw new Error("audio format is required");

  const buffer = Buffer.from(data, "base64");
  const blob = new Blob([buffer], { type: mimeForFormat(audioFormat) });
  const form = new FormData();
  form.append("file", blob, `audio.${audioFormat}`);
  form.append("model", model);

  const headers = {};
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: form,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    const msg =
      payload?.error?.message ||
      payload?.message ||
      `Transcription error (${response.status || 502})`;
    throw new Error(msg);
  }

  const text = String(payload?.text || "").trim();
  if (!text) {
    throw new Error("Transcription returned empty text");
  }
  return { text, model };
}

async function transcribeWithLocal({ audioBase64, format }) {
  const url = resolveTranscriptionUrl(process.env.LOCAL_STT_URL);
  if (!url) throw new Error("LOCAL_STT_URL is not set");
  const model =
    String(process.env.LOCAL_STT_MODEL || "").trim() ||
    DEFAULT_LOCAL_STT_MODEL;
  const result = await transcribeMultipart({
    url,
    apiKey: String(process.env.LOCAL_STT_API_KEY || "").trim() || undefined,
    model,
    audioBase64,
    format,
  });
  return { ...result, backend: "local" };
}

async function transcribeWithOpenAi({ audioBase64, format }) {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  const model =
    String(process.env.OPENAI_STT_MODEL || "").trim() ||
    DEFAULT_OPENAI_STT_MODEL;
  const result = await transcribeMultipart({
    url: OPENAI_TRANSCRIBE_URL,
    apiKey,
    model,
    audioBase64,
    format,
  });
  return { ...result, backend: "openai" };
}

async function transcribeWithOpenRouter({ audioBase64, format }) {
  const apiKey = String(process.env.OPENROUTER_API_KEY || "").trim();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");
  const result = await transcribeAudioWithOpenRouter({
    audioBase64,
    format,
    apiKey,
    model: process.env.OPENROUTER_STT_MODEL,
  });
  return { ...result, backend: "openrouter" };
}

/**
 * @param {{ audioBase64: string, format?: string }} args
 * @returns {Promise<{ text: string, model: string, backend: string }>}
 */
async function transcribeAudio({ audioBase64, format }) {
  const backend = resolveSttBackend();
  if (!backend) {
    throw new Error(
      "Speech-to-text needs LOCAL_STT_URL, OPENAI_API_KEY, or OPENROUTER_API_KEY in server/.env"
    );
  }
  if (backend === "local") {
    return transcribeWithLocal({ audioBase64, format });
  }
  if (backend === "openai") {
    return transcribeWithOpenAi({ audioBase64, format });
  }
  return transcribeWithOpenRouter({ audioBase64, format });
}

module.exports = {
  transcribeAudio,
  resolveSttBackend,
  resolveSttModel,
  hasLocalStt,
  hasOpenAiKey,
  hasOpenRouterKey,
  DEFAULT_STT_MODEL,
  DEFAULT_STT_MODELS,
  DEFAULT_OPENAI_STT_MODEL,
  DEFAULT_LOCAL_STT_MODEL,
};
