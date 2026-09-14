importScripts("moodboard-store.js", "prompt-library-store.js");

const CONTEXT_MENU_ROOT = "see-and-capture-moodboard-root";
const CONTEXT_MENU_SELECT = "see-and-capture-select";
const RECEIVE_MENU_PREFIX = "sc-mb-receive-";
const MENU_TITLE_CAPTURE = "See && Capture";
const MENU_TITLE_MOODBOARD = "Add to moodboard";
const CONTENT_FILES = [
  "presets.js",
  "assets-db.js",
  "moodboard-db.js",
  "prompt-library-db.js",
  "prompt-library-ui.js",
  "moodboard-ui.js",
  "blend.js",
  "payload.js",
  "preview-edit.js",
  "content.js",
];
const API_URL = "http://127.0.0.1:8787/api/edit";
const OFFSCREEN_VOICE_URL = "offscreen-voice.html";
const MIC_PERMISSION_URL = "mic-permission.html";

const store = self.SeeCaptureMoodboardStore;
const promptStore = self.SeeCapturePromptLibraryStore;

chrome.runtime.onInstalled.addListener(() => {
  syncReceiversFromStore()
    .then(() => rebuildContextMenus())
    .catch((err) => console.error("See & Capture: menu rebuild failed", err));
});

chrome.runtime.onStartup.addListener(() => {
  syncReceiversFromStore()
    .then(() => rebuildContextMenus())
    .catch((err) => console.error("See & Capture: menu rebuild failed", err));
});

chrome.commands.onCommand.addListener((command, tab) => {
  const run = (tabId) => {
    if (command === "start-capture") startCapture(tabId);
    else if (command === "open-modal") openLastModal(tabId);
  };
  const tabId = tab?.id;
  if (tabId) {
    run(tabId);
    return;
  }
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const id = tabs?.[0]?.id;
    if (id) run(id);
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === CONTEXT_MENU_SELECT) {
    if (!tab?.id) return;
    startCapture(tab.id);
    return;
  }
  const menuId = String(info.menuItemId || "");
  if (menuId.startsWith(RECEIVE_MENU_PREFIX)) {
    const boardId = menuId.slice(RECEIVE_MENU_PREFIX.length);
    addWebImageToBoard(boardId, info, tab).catch((err) =>
      console.error("See & Capture: receive image failed", err)
    );
  }
});

chrome.action.onClicked.addListener((tab) => {
  if (!tab?.id) return;
  startCapture(tab.id);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "CAPTURE_TAB") {
    const windowId = sender.tab?.windowId;
    chrome.tabs
      .captureVisibleTab(windowId, { format: "png" })
      .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
      .catch((err) =>
        sendResponse({ ok: false, error: err?.message || String(err) })
      );
    return true;
  }

  if (message?.type === "EDIT_IMAGE") {
    editImageViaServer(message)
      .then((result) => sendResponse(result))
      .catch((err) =>
        sendResponse({ ok: false, error: err?.message || String(err) })
      );
    return true;
  }

  if (message?.type === "SAVE_RESULT") {
    const payload = {
      savedAt: Date.now(),
      presetId: message.presetId || null,
      captureDataUrl: message.captureDataUrl || null,
      resultDataUrl: message.resultDataUrl || null,
    };
    chrome.storage.local
      .set({ lastResult: payload })
      .then(() => sendResponse({ ok: true }))
      .catch((err) =>
        sendResponse({ ok: false, error: err?.message || String(err) })
      );
    return true;
  }

  if (message?.type === "SYNC_MOODBOARD_RECEIVE_MENUS") {
    const receivers = Array.isArray(message.receivers)
      ? message.receivers
      : null;
    (async () => {
      if (receivers) {
        await chrome.storage.local.set({ moodboardReceivers: receivers });
      } else {
        await syncReceiversFromStore();
      }
      await rebuildContextMenus();
      sendResponse({ ok: true });
    })().catch((err) =>
      sendResponse({ ok: false, error: err?.message || String(err) })
    );
    return true;
  }

  if (message?.type === "UPSERT_MOODBOARD_RECEIVER") {
    (async () => {
      await syncReceiversFromStore();
      await rebuildContextMenus();
      sendResponse({ ok: true });
    })().catch((err) =>
      sendResponse({ ok: false, error: err?.message || String(err) })
    );
    return true;
  }

  if (message?.type?.startsWith("MOODBOARD_")) {
    handleMoodboardMessage(message)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) =>
        sendResponse({ ok: false, error: err?.message || String(err) })
      );
    return true;
  }

  if (message?.type?.startsWith("PROMPT_LIBRARY_")) {
    handlePromptLibraryMessage(message)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) =>
        sendResponse({ ok: false, error: err?.message || String(err) })
      );
    return true;
  }

  if (message?.type === "VOICE_ENSURE_MIC") {
    ensureMicPermission()
      .then((result) => sendResponse(result))
      .catch((err) =>
        sendResponse({ ok: false, error: err?.message || String(err) })
      );
    return true;
  }

  if (message?.type === "VOICE_START") {
    startVoiceRecording()
      .then((result) => sendResponse(result))
      .catch((err) =>
        sendResponse({ ok: false, error: err?.message || String(err) })
      );
    return true;
  }

  if (message?.type === "VOICE_STOP") {
    stopVoiceRecording()
      .then((result) => sendResponse(result))
      .catch((err) =>
        sendResponse({ ok: false, error: err?.message || String(err) })
      );
    return true;
  }

  if (message?.type === "VOICE_CANCEL") {
    cancelVoiceRecording()
      .then((result) => sendResponse(result))
      .catch((err) =>
        sendResponse({ ok: false, error: err?.message || String(err) })
      );
    return true;
  }

  return false;
});

async function handlePromptLibraryMessage(message) {
  switch (message.type) {
    case "PROMPT_LIBRARY_LIST":
      return promptStore.listPrompts();
    case "PROMPT_LIBRARY_GET":
      return promptStore.getPrompt(message.id);
    case "PROMPT_LIBRARY_SAVE":
      return promptStore.savePrompt({
        prompt: message.prompt,
        imageDataUrl: message.imageDataUrl,
        modelId: message.modelId,
      });
    case "PROMPT_LIBRARY_REMOVE":
      return promptStore.removePrompt(message.id);
    default:
      throw new Error(`Unknown prompt library message: ${message.type}`);
  }
}

async function ensureVoiceOffscreen(opts) {
  const forceRecreate = Boolean(opts?.forceRecreate);
  const url = chrome.runtime.getURL(OFFSCREEN_VOICE_URL);

  async function hasOffscreen() {
    if (!chrome.runtime.getContexts) return false;
    const existing = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [url],
    });
    return Boolean(existing?.length);
  }

  if (forceRecreate) {
    try {
      await chrome.offscreen.closeDocument();
    } catch (_) {
      /* ignore */
    }
  } else if (await hasOffscreen()) {
    return;
  }

  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_VOICE_URL,
      reasons: ["USER_MEDIA"],
      justification: "Record microphone audio for prompt dictation",
    });
  } catch (err) {
    const msg = String(err?.message || err || "");
    if (!/already exists|Only a single offscreen/i.test(msg)) {
      throw err;
    }
  }

  for (let i = 0; i < 5; i += 1) {
    if (await hasOffscreen()) return;
    await new Promise((r) => setTimeout(r, 100 + i * 50));
  }
  if (!(await hasOffscreen())) {
    throw new Error("Voice offscreen document failed to start");
  }
}

function isPortClosedError(err) {
  const msg = String(err?.message || err || "");
  return /message port closed|receiving end does not exist|Could not establish connection/i.test(
    msg
  );
}

function sendOffscreenMessageOnce(type, payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type, target: "offscreen-voice", ...(payload || {}) },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response || { ok: false, error: "No response from offscreen" });
      }
    );
  });
}

async function sendOffscreenMessage(type, payload) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      if (attempt > 0) {
        await ensureVoiceOffscreen({ forceRecreate: attempt === 2 });
        await new Promise((r) => setTimeout(r, 120 * attempt));
      } else {
        await ensureVoiceOffscreen();
      }
      return await sendOffscreenMessageOnce(type, payload);
    } catch (err) {
      lastErr = err;
      if (!isPortClosedError(err) || attempt === 2) break;
    }
  }
  throw lastErr || new Error("Voice bridge failed");
}

async function openMicPermissionTab() {
  const url = chrome.runtime.getURL(MIC_PERMISSION_URL);
  const tabs = await chrome.tabs.query({ url });
  if (tabs?.[0]?.id) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    if (tabs[0].windowId != null) {
      await chrome.windows.update(tabs[0].windowId, { focused: true });
    }
    return tabs[0];
  }
  return chrome.tabs.create({ url, active: true });
}

async function ensureMicPermission() {
  try {
    await ensureVoiceOffscreen();
    const probe = await sendOffscreenMessage("VOICE_OFFSCREEN_PROBE");
    if (probe?.ok && probe.granted) {
      return { ok: true, granted: true };
    }
    if (probe?.denied) {
      await openMicPermissionTab();
      return {
        ok: true,
        granted: false,
        needsPermission: true,
      };
    }
    await openMicPermissionTab();
    return {
      ok: true,
      granted: false,
      needsPermission: true,
      error: probe?.error,
    };
  } catch (err) {
    if (isPortClosedError(err)) {
      try {
        await ensureVoiceOffscreen({ forceRecreate: true });
        const probe = await sendOffscreenMessage("VOICE_OFFSCREEN_PROBE");
        if (probe?.ok && probe.granted) {
          return { ok: true, granted: true };
        }
      } catch (_) {
        /* fall through */
      }
      await openMicPermissionTab();
      return {
        ok: true,
        granted: false,
        needsPermission: true,
        error:
          "Mic bridge not ready. Allow microphone on the See & Capture tab, then try again.",
      };
    }
    throw err;
  }
}

async function startVoiceRecording() {
  try {
    await ensureVoiceOffscreen();
    const started = await sendOffscreenMessage("VOICE_OFFSCREEN_START");
    if (started?.ok) {
      return { ok: true, recording: true };
    }
    if (started?.denied) {
      await openMicPermissionTab();
      return {
        ok: false,
        needsPermission: true,
        error:
          "Microphone permission needed. Allow mic on the See & Capture tab, then try again.",
      };
    }
    return {
      ok: false,
      error: started?.error || "Could not start voice recording",
    };
  } catch (err) {
    if (isPortClosedError(err)) {
      await openMicPermissionTab();
      return {
        ok: false,
        needsPermission: true,
        error:
          "Mic bridge not ready — allow mic on the See & Capture tab if opened, then try again.",
      };
    }
    return { ok: false, error: err?.message || "Could not start voice recording" };
  }
}

async function stopVoiceRecording() {
  try {
    await ensureVoiceOffscreen();
    const stopped = await sendOffscreenMessage("VOICE_OFFSCREEN_STOP");
    if (!stopped?.ok) {
      return {
        ok: false,
        error: stopped?.error || "Could not stop voice recording",
      };
    }
    return {
      ok: true,
      audioBase64: stopped.audioBase64 || "",
      format: stopped.format || "webm",
      empty: Boolean(stopped.empty),
    };
  } catch (err) {
    return {
      ok: false,
      error: isPortClosedError(err)
        ? "Mic bridge closed while stopping. Try recording again."
        : err?.message || "Could not stop voice recording",
    };
  }
}

async function cancelVoiceRecording() {
  try {
    await ensureVoiceOffscreen();
    await sendOffscreenMessage("VOICE_OFFSCREEN_CANCEL");
  } catch (_) {
    /* ignore */
  }
  return { ok: true, cancelled: true };
}

async function handleMoodboardMessage(message) {
  switch (message.type) {
    case "MOODBOARD_LIST":
      return store.listMoodboards();
    case "MOODBOARD_GET":
      return store.getMoodboard(message.id);
    case "MOODBOARD_GET_LAST":
      return store.getLastMoodboard();
    case "MOODBOARD_CREATE": {
      const created = await store.createMoodboard(message.name);
      await syncReceiversFromStore();
      await rebuildContextMenus();
      return created;
    }
    case "MOODBOARD_ADD_IMAGE": {
      const board = await store.addImage(message.boardId, message.dataUrl);
      await syncReceiversFromStore();
      await rebuildContextMenus();
      return board;
    }
    case "MOODBOARD_REMOVE_IMAGE": {
      const board = await store.removeImage(message.boardId, message.imageId);
      await syncReceiversFromStore();
      await rebuildContextMenus();
      return board;
    }
    case "MOODBOARD_UPDATE_IMAGE": {
      const board = await store.updateImage(
        message.boardId,
        message.imageId,
        message.dataUrl
      );
      await syncReceiversFromStore();
      await rebuildContextMenus();
      return board;
    }
    case "MOODBOARD_UPDATE_SETTINGS": {
      const board = await store.updateSettings(
        message.boardId,
        message.settings
      );
      await syncReceiversFromStore();
      await rebuildContextMenus();
      return board;
    }
    case "MOODBOARD_REORDER":
      return store.reorderImages(message.boardId, message.orderedIds);
    case "MOODBOARD_TOUCH":
      return store.touchOpened(message.boardId);
    case "MOODBOARD_IMPORT": {
      const imported = await store.importBoards(message.boards);
      await syncReceiversFromStore();
      await rebuildContextMenus();
      return imported;
    }
    default:
      throw new Error(`Unknown moodboard message: ${message.type}`);
  }
}

async function syncReceiversFromStore() {
  const boards = await store.listMoodboards();
  const receivers = boards
    .filter((b) => b?.settings?.receiveFromWeb && b.id)
    .map((b) => ({
      id: b.id,
      name: b.name || "Moodboard",
      receiveFromWeb: true,
    }));
  await chrome.storage.local.set({
    moodboardReceivers: receivers,
    moodboardMenuBoards: boards.map((b) => ({
      id: b.id,
      name: b.name || "Moodboard",
      receiveFromWeb: Boolean(b?.settings?.receiveFromWeb),
    })),
  });
  return receivers;
}

async function rebuildContextMenus() {
  await chrome.contextMenus.removeAll();

  const pageContexts = ["page", "selection", "image", "video", "link"];
  const data = await chrome.storage.local.get({ moodboardReceivers: [] });
  const receivers = Array.isArray(data.moodboardReceivers)
    ? data.moodboardReceivers
    : [];

  // Always a direct click — capture (no submenu).
  chrome.contextMenus.create({
    id: CONTEXT_MENU_SELECT,
    title: MENU_TITLE_CAPTURE,
    contexts: pageContexts,
  });

  // Moodboard submenu only when receive boards exist (image context).
  if (!receivers.length) return;

  chrome.contextMenus.create({
    id: CONTEXT_MENU_ROOT,
    title: MENU_TITLE_MOODBOARD,
    contexts: ["image"],
  });

  receivers.forEach((board) => {
    if (!board?.id) return;
    const name = String(board.name || "Moodboard").slice(0, 48);
    chrome.contextMenus.create({
      id: `${RECEIVE_MENU_PREFIX}${board.id}`,
      parentId: CONTEXT_MENU_ROOT,
      title: `Add image to ${name}`,
      contexts: ["image"],
    });
  });
}

async function blobToDataUrl(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + chunk)
    );
  }
  const mime = blob.type || "image/png";
  return `data:${mime};base64,${btoa(binary)}`;
}

async function ensureContentScripts(tabId) {
  if (!tabId) return;
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type: "SC_PING" });
    if (res?.ok) return;
  } catch (_err) {
    // Not injected yet.
  }
  await chrome.scripting.executeScript({
    target: { tabId },
    files: CONTENT_FILES,
  });
}

async function srcUrlToDataUrlFromTab(tabId, srcUrl) {
  if (!tabId) throw new Error("No tab for image fetch");
  await ensureContentScripts(tabId);
  const inject = {
    target: { tabId },
    func: async (url) => {
      const toDataUrl = (blob) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error("Could not read image"));
          reader.readAsDataURL(blob);
        });

      const tryFetch = async (credentials) => {
        const response = await fetch(url, {
          credentials,
          cache: "force-cache",
        });
        if (!response.ok) {
          throw new Error(`Could not fetch image (${response.status})`);
        }
        const blob = await response.blob();
        const type = String(blob.type || "");
        if (type && !type.startsWith("image/")) {
          throw new Error("Target was not an image");
        }
        return toDataUrl(blob);
      };

      try {
        return await tryFetch("include");
      } catch (_a) {
        try {
          return await tryFetch("omit");
        } catch (_b) {
          // Fall through to canvas / DOM img.
        }
      }

      const fromImageElement = (img) =>
        new Promise((resolve, reject) => {
          const draw = () => {
            try {
              const c = document.createElement("canvas");
              const w = img.naturalWidth || img.width;
              const h = img.naturalHeight || img.height;
              if (!w || !h) {
                reject(new Error("Image has no dimensions"));
                return;
              }
              c.width = w;
              c.height = h;
              c.getContext("2d").drawImage(img, 0, 0);
              resolve(c.toDataURL("image/png"));
            } catch (err) {
              reject(err);
            }
          };
          if (img.complete && (img.naturalWidth || img.width)) {
            draw();
            return;
          }
          img.addEventListener("load", draw, { once: true });
          img.addEventListener(
            "error",
            () => reject(new Error("Image load failed")),
            { once: true }
          );
        });

      const existing = Array.from(document.images || []).find(
        (el) => el.currentSrc === url || el.src === url
      );
      if (existing) {
        try {
          return await fromImageElement(existing);
        } catch (_err) {
          // Continue with a fresh Image.
        }
      }

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = url;
      return fromImageElement(img);
    },
    args: [srcUrl],
  };

  let results;
  try {
    results = await chrome.scripting.executeScript({
      ...inject,
      world: "MAIN",
    });
  } catch (_err) {
    results = await chrome.scripting.executeScript(inject);
  }
  const dataUrl = results?.[0]?.result;
  if (!dataUrl || typeof dataUrl !== "string") {
    throw new Error("Could not read image from page");
  }
  return dataUrl;
}

async function srcUrlToDataUrl(srcUrl, tabId) {
  if (!srcUrl) throw new Error("No image URL");
  if (srcUrl.startsWith("data:image/")) return srcUrl;
  if (srcUrl.startsWith("blob:")) {
    return srcUrlToDataUrlFromTab(tabId, srcUrl);
  }

  try {
    const response = await fetch(srcUrl, { credentials: "omit" });
    if (!response.ok) {
      throw new Error(`Could not fetch image (${response.status})`);
    }
    const blob = await response.blob();
    if (!String(blob.type || "").startsWith("image/")) {
      throw new Error("Target was not an image");
    }
    return blobToDataUrl(blob);
  } catch (err) {
    if (!tabId) throw err;
    return srcUrlToDataUrlFromTab(tabId, srcUrl);
  }
}

async function addWebImageToBoard(boardId, info, tab) {
  const dataUrl = await srcUrlToDataUrl(info.srcUrl, tab?.id);
  await store.addImage(boardId, dataUrl);
  await syncReceiversFromStore();

  if (tab?.id) {
    try {
      await ensureContentScripts(tab.id);
      await chrome.tabs.sendMessage(tab.id, {
        type: "MOODBOARD_BOARD_UPDATED",
        boardId,
      });
    } catch (err) {
      console.warn("See & Capture: board updated; reopen moodboard to refresh", err);
    }
  }
}

async function editImageViaServer(message) {
  const isReplace =
    message.presetId === "replace-with-asset" ||
    message.presetId === "mashup-hybrid";
  const body = {
    imageDataUrl: message.imageDataUrl,
    presetId: message.presetId,
    model: message.model || "auto",
    prompt: message.prompt || "",
    pageContext: message.pageContext || {},
    assets: Array.isArray(message.assets)
      ? message.assets.map((a) =>
          isReplace
            ? {
                id: a.id,
                name: a.name,
                kind: a.kind,
                dataUrl: a.dataUrl || null,
              }
            : {
                id: a.id,
                name: a.name,
                kind: a.kind,
                hasImage: Boolean(a.dataUrl),
              }
        )
      : [],
  };
  if (
    typeof message.aspectRatio === "string" &&
    message.aspectRatio.trim() &&
    message.aspectRatio.trim() !== "original"
  ) {
    body.aspectRatio = message.aspectRatio.trim();
  }

  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.imageDataUrl) {
    throw new Error(data.error || `Server error (${response.status})`);
  }

  return {
    ok: true,
    imageDataUrl: data.imageDataUrl,
    presetId: data.presetId,
  };
}

async function startCapture(tabId) {
  try {
    await ensureContentScripts(tabId);
    await chrome.tabs.sendMessage(tabId, { type: "START_CAPTURE" });
  } catch (err) {
    console.error("See & Capture: failed to start", err);
  }
}

async function openLastModal(tabId) {
  try {
    await ensureContentScripts(tabId);
    await chrome.tabs.sendMessage(tabId, { type: "OPEN_LAST_MODAL" });
  } catch (err) {
    console.error("See & Capture: failed to open modal", err);
  }
}
