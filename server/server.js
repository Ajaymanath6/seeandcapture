const path = require("path");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, ".env") });

const { getPreset, listPresetMeta } = require("./prompts");
const { editWithNanoBanana, describeImagePrompt, generateTextWithGemini, DESCRIBE_PROMPT_INSTRUCTION } = require("./providers/gemini");
const { editWithFal } = require("./providers/fal");
const { editWithFluxApi } = require("./providers/fluxapi");
const {
  editWithEden,
  removeBackgroundWithEden,
  replaceSubjectWithEden,
  describeImagePromptWithEden,
} = require("./providers/eden");
const { describeImagePromptWithOpenRouter } = require("./providers/openrouter");
const { editLocally } = require("./providers/localEdit");
const { downscaleImageDataUrl } = require("./lib/downscaleImage");
const { assertPromptQuality } = require("./lib/promptQuality");
const {
  DETECT_TEXT_INSTRUCTION,
  parseDetectTextResponse,
  parseTranslateCopyResponse,
  buildTranslateInstruction,
  buildTextSwapUserPrompt,
} = require("./lib/textDetect");
const {
  PASTE_GAP_MS,
  enqueuePasteQueue,
  getPasteQueueStatus,
} = require("./paste-queue");

const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || "127.0.0.1";
const app = express();

function hasGoogleKey() {
  return Boolean(
    process.env.GOOGLE_API_KEY &&
      process.env.GOOGLE_API_KEY !== "your_key_goes_here"
  );
}

function hasFalKey() {
  return Boolean(
    process.env.FAL_KEY && process.env.FAL_KEY !== "your_fal_key_goes_here"
  );
}

function hasEdenKey() {
  return Boolean(
    process.env.EDEN_AI_API_KEY &&
      process.env.EDEN_AI_API_KEY !== "your_eden_ai_key_goes_here"
  );
}

function hasFluxKey() {
  return Boolean(
    process.env.FLUXAPI_API_KEY &&
      process.env.FLUXAPI_API_KEY !== "your_fluxapi_key_goes_here"
  );
}

function hasOpenRouterKey() {
  return Boolean(
    process.env.OPENROUTER_API_KEY &&
      process.env.OPENROUTER_API_KEY !== "your_openrouter_key_goes_here"
  );
}

function preferredModel() {
  if (hasFluxKey()) return "flux";
  if (hasEdenKey()) return "eden";
  if (hasFalKey()) return "fal";
  if (hasGoogleKey()) return "nano-banana";
  return null;
}

function resolveModel(requested) {
  if (
    requested === "nano-banana" ||
    requested === "fal" ||
    requested === "eden" ||
    requested === "flux"
  ) {
    return requested;
  }
  return preferredModel() || "eden";
}

function formatPageContext(pageContext) {
  if (!pageContext || typeof pageContext !== "object") return "";
  const title = String(pageContext.pageTitle || "").trim();
  const meta = String(pageContext.metaDescription || "").trim();
  const text = String(pageContext.surroundingText || "").trim();
  if (!title && !meta && !text) return "";
  const parts = [];
  if (title) parts.push(`Page Title: ${title}`);
  if (meta) parts.push(`Meta: ${meta}`);
  if (text) parts.push(`Nearby text: ${text}`);
  return `Context: [${parts.join(" | ")}]`;
}

function withContextPrompt(basePrompt, pageContext) {
  const ctx = formatPageContext(pageContext);
  if (!ctx) return basePrompt;
  return `${ctx}\n${basePrompt}`;
}

app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(express.json({ limit: "40mb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "seeandcapture-server",
    hasGoogleKey: hasGoogleKey(),
    hasFalKey: hasFalKey(),
    hasEdenKey: hasEdenKey(),
    hasOpenRouterKey: hasOpenRouterKey(),
    preferredModel: preferredModel(),
  });
});

app.get("/api/presets", (_req, res) => {
  res.json({ presets: listPresetMeta() });
});

app.post("/api/paste-queue", async (req, res) => {
  try {
    const { images, delayMs } = req.body || {};
    const result = await enqueuePasteQueue({ images, delayMs });
    res.status(202).json(result);
  } catch (err) {
    console.error("[paste-queue]", err?.message || err);
    res.status(400).json({ error: err?.message || "Paste queue failed" });
  }
});

app.get("/api/paste-queue/status", (_req, res) => {
  res.json({ ok: true, ...getPasteQueueStatus(), defaultDelayMs: PASTE_GAP_MS });
});

app.post("/api/detect-text", async (req, res) => {
  try {
    const { imageDataUrl } = req.body || {};
    if (!imageDataUrl || typeof imageDataUrl !== "string") {
      res.status(400).json({ error: "imageDataUrl is required" });
      return;
    }
    if (!hasGoogleKey() && !hasOpenRouterKey() && !hasEdenKey()) {
      res.status(500).json({
        error:
          "No vision provider configured. Set GOOGLE_API_KEY, OPENROUTER_API_KEY, or EDEN_AI_API_KEY.",
      });
      return;
    }

    const scaled = downscaleImageDataUrl(imageDataUrl);
    const errors = [];

    async function tryDetect(label, modelId, runner) {
      try {
        const raw = await runner();
        const text = typeof raw === "string" ? raw : raw?.prompt || raw?.text;
        const usedModel =
          typeof raw === "object" && raw?.model ? raw.model : modelId;
        const parsed = parseDetectTextResponse(text);
        console.log(`[detect-text] ok via ${label} count=${parsed.texts.length}`);
        res.json({ texts: parsed.texts, model: usedModel });
        return true;
      } catch (err) {
        console.warn(`[detect-text] ${label} failed:`, err?.message || err);
        errors.push(`${label}: ${err?.message || String(err)}`);
        return false;
      }
    }

    if (hasGoogleKey()) {
      const ok = await tryDetect("Gemini", "gemini-2.5-flash", () =>
        describeImagePrompt({
          imageDataUrl: scaled,
          apiKey: process.env.GOOGLE_API_KEY,
          instruction: DETECT_TEXT_INSTRUCTION,
        })
      );
      if (ok) return;
    }
    if (hasOpenRouterKey()) {
      const ok = await tryDetect("OpenRouter", "openrouter", () =>
        describeImagePromptWithOpenRouter({
          imageDataUrl: scaled,
          apiKey: process.env.OPENROUTER_API_KEY,
          instruction: DETECT_TEXT_INSTRUCTION,
        })
      );
      if (ok) return;
    }
    if (hasEdenKey()) {
      const ok = await tryDetect("Eden", "eden-vision", () =>
        describeImagePromptWithEden({
          imageDataUrl: scaled,
          apiKey: process.env.EDEN_AI_API_KEY,
          instruction: DETECT_TEXT_INSTRUCTION,
        })
      );
      if (ok) return;
    }

    res.status(502).json({
      error: errors.join(" | ") || "Detect text failed",
    });
  } catch (err) {
    console.error("POST /api/detect-text failed:", err);
    res.status(502).json({ error: err?.message || "Detect text failed" });
  }
});

app.post("/api/translate-copy", async (req, res) => {
  try {
    const { texts, languages, style } = req.body || {};
    if (!Array.isArray(texts) || !texts.length) {
      res.status(400).json({ error: "texts array is required" });
      return;
    }
    if (!Array.isArray(languages) || !languages.length) {
      res.status(400).json({ error: "languages array is required" });
      return;
    }
    if (!hasGoogleKey() && !hasOpenRouterKey()) {
      res.status(500).json({
        error:
          "No text LLM configured. Set GOOGLE_API_KEY or OPENROUTER_API_KEY.",
      });
      return;
    }

    const sources = texts.map((t, i) => ({
      id: String(t?.id || `t${i + 1}`),
      text: String(t?.text || "").trim(),
    })).filter((t) => t.text);

    const instruction = buildTranslateInstruction({
      texts: sources,
      languages: languages.map((l) => String(l).toLowerCase()),
      style: style === "marketing" ? "marketing" : "literal",
    });

    let raw;
    let usedModel = "gemini-2.5-flash";
    if (hasGoogleKey()) {
      raw = await generateTextWithGemini({
        prompt: instruction,
        apiKey: process.env.GOOGLE_API_KEY,
      });
    } else {
      const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model:
            process.env.OPENROUTER_TEXT_MODEL ||
            process.env.OPENROUTER_VISION_MODEL ||
            "google/gemma-3-27b-it:free",
          messages: [{ role: "user", content: instruction }],
        }),
      });
      const orPayload = await orRes.json().catch(() => ({}));
      if (!orRes.ok) {
        throw new Error(
          orPayload?.error?.message || `OpenRouter text failed (${orRes.status})`
        );
      }
      raw = orPayload?.choices?.[0]?.message?.content || "";
      usedModel = orPayload?.model || "openrouter-text";
    }

    const parsed = parseTranslateCopyResponse(
      raw,
      languages.map((l) => String(l).toLowerCase()),
      sources
    );
    res.json({ translations: parsed.translations, model: usedModel });
  } catch (err) {
    console.error("POST /api/translate-copy failed:", err);
    res.status(502).json({ error: err?.message || "Translate failed" });
  }
});

app.post("/api/get-prompt", async (req, res) => {
  try {
    const { imageDataUrl } = req.body || {};
    if (!imageDataUrl || typeof imageDataUrl !== "string") {
      res.status(400).json({ error: "imageDataUrl is required" });
      return;
    }
    if (!hasGoogleKey() && !hasOpenRouterKey() && !hasEdenKey()) {
      res.status(500).json({
        error:
          "No vision provider configured. Set GOOGLE_API_KEY, OPENROUTER_API_KEY (free), or EDEN_AI_API_KEY in server/.env, then restart.",
      });
      return;
    }

    const scaled = downscaleImageDataUrl(imageDataUrl);
    console.log(
      `[get-prompt] imageBytes≈${imageDataUrl.length} scaledBytes≈${scaled.length}`
    );

    const errors = [];

    async function tryProvider(label, modelId, runner) {
      try {
        const raw = await runner();
        const text = typeof raw === "string" ? raw : raw?.prompt;
        const usedModel =
          typeof raw === "object" && raw?.model ? raw.model : modelId;
        const checked = assertPromptQuality(text);
        if (!checked.ok) {
          throw new Error(checked.reason);
        }
        console.log(`[get-prompt] ok via ${label} (${usedModel})`);
        res.json({ prompt: checked.prompt, model: usedModel });
        return true;
      } catch (err) {
        console.warn(`[get-prompt] ${label} failed:`, err?.message || err);
        errors.push(`${label}: ${err?.message || String(err)}`);
        return false;
      }
    }

    if (hasGoogleKey()) {
      const ok = await tryProvider("Gemini", "gemini-2.5-flash", () =>
        describeImagePrompt({
          imageDataUrl: scaled,
          apiKey: process.env.GOOGLE_API_KEY,
        })
      );
      if (ok) return;
    }

    if (hasOpenRouterKey()) {
      const ok = await tryProvider("OpenRouter", "openrouter", () =>
        describeImagePromptWithOpenRouter({
          imageDataUrl: scaled,
          apiKey: process.env.OPENROUTER_API_KEY,
          instruction: DESCRIBE_PROMPT_INSTRUCTION,
        })
      );
      if (ok) return;
    }

    if (hasEdenKey()) {
      const ok = await tryProvider("Eden", "eden-vision", () =>
        describeImagePromptWithEden({
          imageDataUrl: scaled,
          apiKey: process.env.EDEN_AI_API_KEY,
          instruction: DESCRIBE_PROMPT_INSTRUCTION,
        })
      );
      if (ok) return;
    }

    res.status(502).json({
      error:
        errors.join(" | ") ||
        "Could not generate a usable recreate prompt. Check GOOGLE_API_KEY or add a free OPENROUTER_API_KEY.",
    });
  } catch (err) {
    console.error("POST /api/get-prompt failed:", err);
    res.status(502).json({
      error: err?.message || "Could not generate prompt",
    });
  }
});

app.post("/api/edit", async (req, res) => {
  try {
    const {
      imageDataUrl,
      presetId,
      model,
      pageContext,
      assets,
      prompt: userPromptRaw,
      aspectRatio: aspectRatioRaw,
      subjectDataUrl: subjectDataUrlRaw,
    } = req.body || {};

    const assetCount = Array.isArray(assets) ? assets.length : 0;
    const hasContext = Boolean(formatPageContext(pageContext));
    const userPrompt =
      typeof userPromptRaw === "string" ? userPromptRaw.trim() : "";
    const aspectRatio =
      typeof aspectRatioRaw === "string" &&
      aspectRatioRaw.trim() &&
      aspectRatioRaw.trim() !== "original"
        ? aspectRatioRaw.trim()
        : null;
    const topLevelSubject =
      typeof subjectDataUrlRaw === "string" && subjectDataUrlRaw.trim()
        ? subjectDataUrlRaw.trim()
        : null;

    console.log(
      `[edit] preset=${presetId} model=${model || "(auto)"} imageBytes≈${
        typeof imageDataUrl === "string" ? imageDataUrl.length : 0
      } assets=${assetCount} subjectBytes≈${
        topLevelSubject ? topLevelSubject.length : 0
      } context=${hasContext} aspect=${aspectRatio || "original"}`
    );

    if (!imageDataUrl || typeof imageDataUrl !== "string") {
      res.status(400).json({ error: "imageDataUrl is required" });
      return;
    }
    if (!presetId || typeof presetId !== "string") {
      res.status(400).json({ error: "presetId is required" });
      return;
    }

    const preset = getPreset(presetId);
    if (!preset) {
      res.status(400).json({ error: `Unknown presetId: ${presetId}` });
      return;
    }

    // Client already sticker-composited when assets were selected.
    // Empty pageContext/assets are ignored — same behavior as before.
    let resultDataUrl;
    let usedModel = resolveModel(model);
    let basePrompt = preset.prompt;
    let editImageDataUrl = imageDataUrl;
    const isTextSwap = preset.mode === "text-swap";
    const isCustomPrompt = preset.mode === "eden-custom-prompt";
    const isSimilarVariant = preset.mode === "similar-variant";
    if (isSimilarVariant) {
      basePrompt = preset.prompt;
      try {
        editImageDataUrl = downscaleImageDataUrl(imageDataUrl);
      } catch (err) {
        console.warn(
          "[edit] similar-variant downscale failed:",
          err?.message || err
        );
        editImageDataUrl = imageDataUrl;
      }
    } else if (isCustomPrompt) {
      if (!userPrompt) {
        res.status(400).json({
          error: "custom-prompt requires a prompt string",
        });
        return;
      }
      basePrompt =
        `${preset.prompt}\n\n` +
        `Requested edit (apply only this change; keep everything else identical):\n` +
        `${userPrompt}`;
      try {
        editImageDataUrl = downscaleImageDataUrl(imageDataUrl);
      } catch (err) {
        console.warn(
          "[edit] custom-prompt downscale failed:",
          err?.message || err
        );
        editImageDataUrl = imageDataUrl;
      }
    } else if (isTextSwap) {
      const replacements = Array.isArray(req.body?.replacements)
        ? req.body.replacements
        : [];
      if (!replacements.length && !userPrompt) {
        res.status(400).json({
          error: "text-swap requires replacements or a prompt",
        });
        return;
      }
      const languageLabel =
        typeof req.body?.languageLabel === "string"
          ? req.body.languageLabel.trim()
          : "";
      const swapBody = replacements.length
        ? buildTextSwapUserPrompt(replacements, languageLabel || null)
        : userPrompt;
      basePrompt = `${preset.prompt}\n\n${swapBody}`;
      try {
        editImageDataUrl = downscaleImageDataUrl(imageDataUrl);
      } catch (err) {
        console.warn("[edit] text-swap downscale failed:", err?.message || err);
        editImageDataUrl = imageDataUrl;
      }
    }
    const promptWithContext = withContextPrompt(basePrompt, pageContext);

    if (preset.mode === "local-green" || preset.mode === "local-grayscale") {
      resultDataUrl = await editLocally({
        imageDataUrl,
        mode: preset.mode,
      });
      usedModel = "local";
    } else if (preset.mode === "eden-background-removal") {
      resultDataUrl = await runRemoveBackground(imageDataUrl);
      usedModel = hasFluxKey() ? "flux-bg-removal" : "eden-bg-removal";
    } else if (
      preset.mode === "eden-replace-subject" ||
      preset.mode === "mashup-hybrid"
    ) {
      if (!hasEdenKey()) {
        res.status(500).json({
          error:
            "EDEN_AI_API_KEY is missing. Add it to server/.env, then restart the server.",
        });
        return;
      }
      const assetUrl =
        Array.isArray(assets) &&
        assets.find((a) => a && (a.dataUrl || a.imageDataUrl));
      const assetDataUrl =
        topLevelSubject ||
        assetUrl?.dataUrl ||
        assetUrl?.imageDataUrl ||
        null;
      if (!assetDataUrl) {
        res.status(400).json({
          error:
            preset.mode === "mashup-hybrid"
              ? "mashup-hybrid requires a subject image dataUrl"
              : "replace-with-asset requires a selected image asset dataUrl",
        });
        return;
      }

      let subjectDataUrl = assetDataUrl;
      if (preset.mode === "mashup-hybrid") {
        try {
          subjectDataUrl = await runRemoveBackground(assetDataUrl);
        } catch (err) {
          console.warn(
            "[edit] mashup rembg failed, using original subject:",
            err?.message || err
          );
        }
        if (userPrompt) {
          basePrompt = `${preset.prompt}\n\nAdditional direction:\n${userPrompt}`;
        }
      }

      resultDataUrl = await replaceSubjectWithEden({
        sceneDataUrl: imageDataUrl,
        assetDataUrl: subjectDataUrl,
        prompt:
          preset.mode === "mashup-hybrid" && userPrompt
            ? `${preset.prompt}\n\nAdditional direction:\n${userPrompt}`
            : promptWithContext,
        apiKey: process.env.EDEN_AI_API_KEY,
      });
      usedModel =
        preset.mode === "mashup-hybrid"
          ? "mashup-hybrid"
          : "eden-replace-subject";
    } else {
      const ai = await runPromptEdit({
        imageDataUrl: editImageDataUrl,
        prompt: promptWithContext,
        preferred: usedModel,
        isCustom: isCustomPrompt || isSimilarVariant,
        aspectRatio,
        skipEden: isTextSwap || isCustomPrompt || isSimilarVariant,
        enableTranslation:
          isTextSwap || isCustomPrompt || isSimilarVariant ? false : true,
        falStrength: isSimilarVariant
          ? 0.3
          : isTextSwap
            ? 0.35
            : isCustomPrompt
              ? 0.45
              : null,
      });
      resultDataUrl = ai.imageDataUrl;
      usedModel = ai.model;
    }

    res.json({
      imageDataUrl: resultDataUrl,
      presetId: preset.id,
      model: usedModel,
      prompt: preset.prompt,
    });
  } catch (err) {
    console.error("POST /api/edit failed:", err);
    res.status(502).json({
      error: err?.message || "Image edit failed",
    });
  }
});

async function runRemoveBackground(imageDataUrl) {
  const errors = [];
  if (hasFluxKey()) {
    try {
      return await editWithFluxApi({
        imageDataUrl,
        prompt:
          "Remove the background from this image. Keep the main subject sharp and unchanged on a transparent or clean background.",
        apiKey: process.env.FLUXAPI_API_KEY,
      });
    } catch (err) {
      console.warn("[edit] Flux remove-bg failed, trying Eden:", err?.message);
      errors.push(err?.message || String(err));
    }
  }
  if (hasEdenKey()) {
    return removeBackgroundWithEden({
      imageDataUrl,
      apiKey: process.env.EDEN_AI_API_KEY,
    });
  }
  throw new Error(
    errors[0] ||
      "No remove-background provider configured. Set FLUXAPI_API_KEY or EDEN_AI_API_KEY."
  );
}

async function runPromptEdit({
  imageDataUrl,
  prompt,
  preferred,
  isCustom,
  aspectRatio,
  skipEden = false,
  enableTranslation = true,
  falStrength = null,
}) {
  const order = [];
  const pushUnique = (id) => {
    if (id && !order.includes(id)) order.push(id);
  };
  // Text-swap must never use Eden v2 generation (it invents new photos).
  const preferredOk =
    preferred === "flux" ||
    preferred === "fal" ||
    preferred === "nano-banana" ||
    (preferred === "eden" && !skipEden);
  pushUnique(preferredOk ? preferred : null);
  pushUnique(hasFluxKey() ? "flux" : null);
  pushUnique(hasFalKey() ? "fal" : null);
  pushUnique(hasGoogleKey() ? "nano-banana" : null);
  if (!skipEden) pushUnique(hasEdenKey() ? "eden" : null);

  const errors = [];
  for (const id of order) {
    try {
      if (id === "flux") {
        if (!hasFluxKey()) continue;
        const image = await editWithFluxApi({
          imageDataUrl,
          prompt,
          apiKey: process.env.FLUXAPI_API_KEY,
          aspectRatio,
          enableTranslation,
        });
        return {
          imageDataUrl: image,
          model: isCustom ? "flux-custom-prompt" : "flux",
        };
      }
      if (id === "eden") {
        if (!hasEdenKey()) continue;
        const image = await editWithEden({
          imageDataUrl,
          prompt,
          apiKey: process.env.EDEN_AI_API_KEY,
        });
        return {
          imageDataUrl: image,
          model: isCustom ? "eden-custom-prompt" : "eden",
        };
      }
      if (id === "fal") {
        if (!hasFalKey()) continue;
        const image = await editWithFal({
          imageDataUrl,
          prompt,
          apiKey: process.env.FAL_KEY,
          strength: falStrength,
        });
        return { imageDataUrl: image, model: "fal" };
      }
      if (id === "nano-banana") {
        if (!hasGoogleKey()) continue;
        const image = await editWithNanoBanana({
          imageDataUrl,
          prompt,
          apiKey: process.env.GOOGLE_API_KEY,
        });
        return { imageDataUrl: image, model: "nano-banana" };
      }
    } catch (err) {
      console.warn(`[edit] provider ${id} failed:`, err?.message || err);
      errors.push(`${id}: ${err?.message || String(err)}`);
    }
  }

  throw new Error(
    errors.length
      ? `All image providers failed. ${errors.join(" | ")}`
      : "No image provider API key is configured in server/.env"
  );
}

app.listen(PORT, HOST, () => {
  console.log(`See & Capture server listening on http://${HOST}:${PORT}`);
});
