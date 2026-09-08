const path = require("path");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, ".env") });

const { getPreset, listPresetMeta } = require("./prompts");
const { editWithNanoBanana } = require("./providers/gemini");
const { editWithFal } = require("./providers/fal");
const {
  editWithEden,
  removeBackgroundWithEden,
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

function preferredModel() {
  if (hasEdenKey()) return "eden";
  if (hasFalKey()) return "fal";
  if (hasGoogleKey()) return "nano-banana";
  return null;
}

function resolveModel(requested) {
  if (
    requested === "nano-banana" ||
    requested === "fal" ||
    requested === "eden"
  ) {
    return requested;
  }
  return preferredModel() || "eden";
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
    const { imageDataUrl, presetId, model } = req.body || {};
    console.log(
      `[edit] preset=${presetId} model=${model || "(auto)"} imageBytes≈${
        typeof imageDataUrl === "string" ? imageDataUrl.length : 0
      }`
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

    let resultDataUrl;
    let usedModel = resolveModel(model);

    // Preset mode wins: keeps the captured image instead of inventing a new scene.
    if (preset.mode === "local-green" || preset.mode === "local-grayscale") {
      resultDataUrl = await editLocally({
        imageDataUrl,
        mode: preset.mode,
      });
      usedModel = "local";
    } else if (preset.mode === "eden-background-removal") {
      if (!hasEdenKey()) {
        res.status(500).json({
          error:
            "EDEN_AI_API_KEY is missing. Add it to server/.env, then restart the server.",
        });
        return;
      }
      resultDataUrl = await removeBackgroundWithEden({
        imageDataUrl,
        apiKey: process.env.EDEN_AI_API_KEY,
      });
      usedModel = "eden-bg-removal";
    } else if (usedModel === "eden") {
      if (!hasEdenKey()) {
        res.status(500).json({
          error:
            "EDEN_AI_API_KEY is missing. Add it to server/.env (see .env.example), then restart the server.",
        });
        return;
      }
      resultDataUrl = await editWithEden({
        imageDataUrl,
        prompt: preset.prompt,
        apiKey: process.env.EDEN_AI_API_KEY,
      });
    } else if (usedModel === "fal") {
      if (!hasFalKey()) {
        res.status(500).json({
          error:
            "FAL_KEY is missing. Add it to server/.env (see .env.example), then restart the server.",
        });
        return;
      }
      resultDataUrl = await editWithFal({
        imageDataUrl,
        prompt: preset.prompt,
        apiKey: process.env.FAL_KEY,
      });
    } else if (usedModel === "nano-banana") {
      if (!hasGoogleKey()) {
        res.status(500).json({
          error:
            "GOOGLE_API_KEY is missing. Set it in server/.env (see .env.example).",
        });
        return;
      }
      resultDataUrl = await editWithNanoBanana({
        imageDataUrl,
        prompt: preset.prompt,
        apiKey: process.env.GOOGLE_API_KEY,
      });
    } else {
      res.status(400).json({
        error: `Unsupported model "${usedModel}".`,
      });
      return;
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

app.listen(PORT, HOST, () => {
  console.log(`See & Capture server listening on http://${HOST}:${PORT}`);
});
