const FLUX_GENERATE_URL =
  "https://api.fluxapi.ai/api/v1/flux/kontext/generate";
const FLUX_STATUS_URL =
  "https://api.fluxapi.ai/api/v1/flux/kontext/record-info";
const CATBOX_UPLOAD_URL = "https://catbox.moe/user/api.php";

const DEFAULT_MODEL = "flux-kontext-pro";
const POLL_INTERVAL_MS = 2500;
const POLL_MAX_ATTEMPTS = 48;

/**
 * Edit an image with FluxAPI Flux Kontext (host image URL + async poll).
 * @param {{
 *   imageDataUrl: string,
 *   prompt: string,
 *   apiKey: string,
 *   model?: string,
 *   aspectRatio?: string | null,
 * }} args
 * @returns {Promise<string>} result image as data URL
 */
async function editWithFluxApi({
  imageDataUrl,
  prompt,
  apiKey,
  model,
  aspectRatio,
}) {
  if (!apiKey) {
    throw new Error("FLUXAPI_API_KEY is not set");
  }
  if (!imageDataUrl || typeof imageDataUrl !== "string") {
    throw new Error("Invalid imageDataUrl");
  }
  if (!prompt || typeof prompt !== "string") {
    throw new Error("prompt is required");
  }

  const selectedModel =
    model || process.env.FLUXAPI_MODEL || DEFAULT_MODEL;

  // FluxAPI needs a publicly reachable image URL (data URLs fail with "parameter error").
  const inputImage = await ensurePublicImageUrl(imageDataUrl);

  const body = {
    prompt,
    inputImage,
    model: selectedModel,
    outputFormat: "png",
    enableTranslation: true,
    promptUpsampling: false,
    safetyTolerance: 2,
  };
  if (aspectRatio && isSupportedAspectRatio(aspectRatio)) {
    body.aspectRatio = aspectRatio;
  }

  const createRes = await fetch(FLUX_GENERATE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const createPayload = await createRes.json().catch(() => ({}));
  if (!createRes.ok || createPayload?.code !== 200) {
    throw new Error(
      formatFluxError(createPayload, createRes.status, "create task")
    );
  }

  const taskId = createPayload?.data?.taskId;
  if (!taskId) {
    throw new Error("FluxAPI did not return a taskId");
  }

  const resultUrl = await pollFluxTask(taskId, apiKey);
  return urlToDataUrl(resultUrl);
}

async function ensurePublicImageUrl(imageDataUrl) {
  if (
    typeof imageDataUrl === "string" &&
    /^https?:\/\//i.test(imageDataUrl) &&
    !imageDataUrl.startsWith("data:")
  ) {
    return imageDataUrl;
  }
  return uploadDataUrlToCatbox(imageDataUrl);
}

async function uploadDataUrlToCatbox(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(String(dataUrl).trim());
  if (!match) {
    throw new Error("Invalid imageDataUrl for FluxAPI upload");
  }
  const mime = match[1] || "image/png";
  const buffer = Buffer.from(match[2], "base64");
  const ext = mime.includes("jpeg") || mime.includes("jpg") ? "jpg" : "png";
  const form = new FormData();
  form.append("reqtype", "fileupload");
  form.append(
    "fileToUpload",
    new Blob([buffer], { type: mime }),
    `capture.${ext}`
  );

  const res = await fetch(CATBOX_UPLOAD_URL, {
    method: "POST",
    body: form,
  });
  const text = (await res.text()).trim();
  if (!res.ok || !/^https?:\/\//i.test(text)) {
    throw new Error(
      `Could not host capture for FluxAPI (${res.status}): ${text.slice(0, 120)}`
    );
  }
  return text;
}

function isSupportedAspectRatio(value) {
  return ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"].includes(value);
}

async function pollFluxTask(taskId, apiKey) {
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt += 1) {
    const url = `${FLUX_STATUS_URL}?taskId=${encodeURIComponent(taskId)}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || payload?.code !== 200) {
      throw new Error(
        formatFluxError(payload, res.status, "poll task")
      );
    }

    const data = payload.data || {};
    const flag = Number(data.successFlag);
    if (flag === 1) {
      const resultUrl =
        data.response?.resultImageUrl ||
        data.response?.originImageUrl ||
        data.resultImageUrl;
      if (!resultUrl) {
        throw new Error("FluxAPI success without result image URL");
      }
      return resultUrl;
    }
    if (flag === 2 || flag === 3) {
      throw new Error(
        data.errorMessage ||
          `FluxAPI generation failed (flag=${flag}, code=${data.errorCode || "?"})`
      );
    }

    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(
    "FluxAPI timed out waiting for image result. Check credits at fluxapi.ai or try Eden/FAL."
  );
}

function formatFluxError(payload, status, phase) {
  const msg =
    payload?.msg ||
    payload?.message ||
    payload?.error ||
    (typeof payload === "string" ? payload : null);
  if (typeof msg === "string" && msg.trim()) {
    return `FluxAPI ${phase} failed: ${msg}`;
  }
  return `FluxAPI ${phase} failed (${status})`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function urlToDataUrl(url) {
  if (typeof url === "string" && url.startsWith("data:")) {
    return url;
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download FluxAPI result (${response.status})`);
  }
  const contentType = response.headers.get("content-type") || "image/png";
  const buffer = Buffer.from(await response.arrayBuffer());
  const mime = contentType.split(";")[0].trim() || "image/png";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

module.exports = {
  FLUX_GENERATE_URL,
  FLUX_STATUS_URL,
  editWithFluxApi,
};
