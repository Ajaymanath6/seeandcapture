(() => {
  const VOICE_MAX_MS = 60000;
  let mediaStream = null;
  let recorder = null;
  let chunks = [];
  let maxTimer = null;
  let usedMime = "audio/webm";

  function pickRecorderMimeType() {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ];
    for (const type of candidates) {
      if (
        typeof MediaRecorder !== "undefined" &&
        MediaRecorder.isTypeSupported?.(type)
      ) {
        return type;
      }
    }
    return "";
  }

  function mimeToFormat(mime) {
    const base = String(mime || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (base.includes("webm")) return "webm";
    if (base.includes("ogg")) return "ogg";
    if (base.includes("mp4") || base.includes("m4a")) return "m4a";
    if (base.includes("wav")) return "wav";
    if (base.includes("mpeg") || base.includes("mp3")) return "mp3";
    return "webm";
  }

  function clearMaxTimer() {
    if (maxTimer) {
      clearTimeout(maxTimer);
      maxTimer = null;
    }
  }

  function stopTracks() {
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch (_) {
          /* ignore */
        }
      });
      mediaStream = null;
    }
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        const comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(new Error("Failed to read audio"));
      reader.readAsDataURL(blob);
    });
  }

  async function probeMic() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return { ok: true, granted: true };
  }

  async function startRecording() {
    if (recorder && recorder.state === "recording") {
      return { ok: true, alreadyRecording: true };
    }
    clearMaxTimer();
    stopTracks();
    chunks = [];

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStream = stream;
    const mimeType = pickRecorderMimeType();
    recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
    usedMime = recorder.mimeType || mimeType || "audio/webm";

    recorder.addEventListener("dataavailable", (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    });

    recorder.start(250);
    maxTimer = setTimeout(() => {
      if (recorder && recorder.state === "recording") {
        try {
          recorder.stop();
        } catch (_) {
          /* ignore */
        }
      }
    }, VOICE_MAX_MS);

    return { ok: true, recording: true };
  }

  function stopRecording() {
    return new Promise((resolve) => {
      clearMaxTimer();
      const active = recorder;
      if (!active || active.state === "inactive") {
        stopTracks();
        recorder = null;
        resolve({
          ok: true,
          audioBase64: "",
          format: mimeToFormat(usedMime),
          empty: true,
        });
        return;
      }

      active.addEventListener(
        "stop",
        async () => {
          const blob = new Blob(chunks.slice(), { type: usedMime });
          chunks = [];
          stopTracks();
          recorder = null;
          try {
            if (!blob.size) {
              resolve({
                ok: true,
                audioBase64: "",
                format: mimeToFormat(usedMime),
                empty: true,
              });
              return;
            }
            const audioBase64 = await blobToBase64(blob);
            resolve({
              ok: true,
              audioBase64,
              format: mimeToFormat(usedMime),
              empty: false,
            });
          } catch (err) {
            resolve({
              ok: false,
              error: err?.message || "Failed to encode audio",
            });
          }
        },
        { once: true }
      );

      try {
        active.stop();
      } catch (err) {
        stopTracks();
        recorder = null;
        resolve({ ok: false, error: err?.message || "Could not stop recording" });
      }
    });
  }

  function cancelRecording() {
    clearMaxTimer();
    const active = recorder;
    recorder = null;
    chunks = [];
    if (active && active.state !== "inactive") {
      try {
        active.stop();
      } catch (_) {
        /* ignore */
      }
    }
    stopTracks();
    return { ok: true, cancelled: true };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.target && message.target !== "offscreen-voice") return false;
    if (!message?.type?.startsWith("VOICE_OFFSCREEN_")) return false;

    (async () => {
      try {
        if (message.type === "VOICE_OFFSCREEN_PROBE") {
          sendResponse(await probeMic());
          return;
        }
        if (message.type === "VOICE_OFFSCREEN_START") {
          sendResponse(await startRecording());
          return;
        }
        if (message.type === "VOICE_OFFSCREEN_STOP") {
          sendResponse(await stopRecording());
          return;
        }
        if (message.type === "VOICE_OFFSCREEN_CANCEL") {
          sendResponse(cancelRecording());
          return;
        }
        sendResponse({ ok: false, error: `Unknown: ${message.type}` });
      } catch (err) {
        const name = err?.name || "";
        const denied =
          name === "NotAllowedError" || name === "PermissionDeniedError";
        sendResponse({
          ok: false,
          denied,
          error: err?.message || String(err),
        });
      }
    })();

    return true;
  });
})();
