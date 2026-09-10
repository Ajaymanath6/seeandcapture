const path = require("path");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, ".env") });

const { getPreset, listPresetMeta } = require("./prompts");
const { editWithNanoBanana } = require("./providers/gemini");
const { editWithFal } = require("./providers/fal");
const { editWithFluxApi } = require("./providers/fluxapi");
const {
  editWithEden,
  removeBackgroundWithEden,
  replaceSubjectWithEden,
} = require("./providers/eden");
const { editLocally } = require("./providers/localEdit");

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

app.use(express.json({ limit: "20mb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "seeandcapture-server",
    hasGoogleKey: hasGoogleKey(),
    hasFalKey: hasFalKey(),
    hasEdenKey: hasEdenKey(),
    preferredModel: preferredModel(),
  });
});

app.get("/api/presets", (_req, res) => {
  res.json({ presets: listPresetMeta() });
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
    } = req.body || {};

    const assetCount = Array.isArray(assets) ? assets.length : 0;
    const hasContext = Boolean(formatPageContext(pageContext));
    const userPrompt =
      typeof userPromptRaw === "string" ? userPromptRaw.trim() : "";

    console.log(
      `[edit] preset=${presetId} model=${model || "(auto)"} imageBytes≈${
        typeof imageDataUrl === "string" ? imageDataUrl.length : 0
      } assets=${assetCount} context=${hasContext}`
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
    if (preset.mode === "eden-custom-prompt") {
      if (!userPrompt) {
        res.status(400).json({
          error: "custom-prompt requires a prompt string",
        });
        return;
      }
      basePrompt = `${preset.prompt}\nUser request: ${userPrompt}`;
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
    } else if (preset.mode === "eden-replace-subject") {
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
      const assetDataUrl = assetUrl?.dataUrl || assetUrl?.imageDataUrl;
      if (!assetDataUrl) {
        res.status(400).json({
          error: "replace-with-asset requires a selected image asset dataUrl",
        });
        return;
      }
      resultDataUrl = await replaceSubjectWithEden({
        sceneDataUrl: imageDataUrl,
        assetDataUrl,
        prompt: promptWithContext,
        apiKey: process.env.EDEN_AI_API_KEY,
      });
      usedModel = "eden-replace-subject";
    } else {
      const ai = await runPromptEdit({
        imageDataUrl,
        prompt: promptWithContext,
        preferred: usedModel,
        isCustom: preset.mode === "eden-custom-prompt",
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

async function runPromptEdit({ imageDataUrl, prompt, preferred, isCustom }) {
  const order = [];
  const pushUnique = (id) => {
    if (id && !order.includes(id)) order.push(id);
  };
  pushUnique(preferred);
  pushUnique(hasFluxKey() ? "flux" : null);
  pushUnique(hasEdenKey() ? "eden" : null);
  pushUnique(hasFalKey() ? "fal" : null);
  pushUnique(hasGoogleKey() ? "nano-banana" : null);

  const errors = [];
  for (const id of order) {
    try {
      if (id === "flux") {
        if (!hasFluxKey()) continue;
        const image = await editWithFluxApi({
          imageDataUrl,
          prompt,
          apiKey: process.env.FLUXAPI_API_KEY,
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
