importScripts("moodboard-store.js");

const CONTEXT_MENU_ROOT = "see-and-capture-moodboard-root";
const CONTEXT_MENU_SELECT = "see-and-capture-select";
const RECEIVE_MENU_PREFIX = "sc-mb-receive-";
const MENU_TITLE_CAPTURE = "See && Capture";
const MENU_TITLE_MOODBOARD = "Add to moodboard";
const CONTENT_FILES = [
  "presets.js",
  "assets-db.js",
  "moodboard-db.js",
  "moodboard-ui.js",
  "blend.js",
  "payload.js",
  "preview-edit.js",
  "content.js",
];
const API_URL = "http://127.0.0.1:8787/api/edit";

const store = self.SeeCaptureMoodboardStore;

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

  return false;
});

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

async function srcUrlToDataUrl(srcUrl) {
  if (!srcUrl) throw new Error("No image URL");
  if (srcUrl.startsWith("data:image/")) return srcUrl;
  if (srcUrl.startsWith("blob:")) {
    throw new Error("Blob image URLs cannot be fetched from the extension");
  }
  const response = await fetch(srcUrl, { credentials: "omit" });
  if (!response.ok) {
    throw new Error(`Could not fetch image (${response.status})`);
  }
  const blob = await response.blob();
  if (!String(blob.type || "").startsWith("image/")) {
    throw new Error("Target was not an image");
  }
  return blobToDataUrl(blob);
}

async function addWebImageToBoard(boardId, info, tab) {
  const dataUrl = await srcUrlToDataUrl(info.srcUrl);
  await store.addImage(boardId, dataUrl);
  await syncReceiversFromStore();

  if (tab?.id) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: CONTENT_FILES,
      });
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
  const isReplace = message.presetId === "replace-with-asset";
  const body = {
    imageDataUrl: message.imageDataUrl,
    presetId: message.presetId,
    model: message.model || "eden",
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
    await chrome.scripting.executeScript({
      target: { tabId },
      files: CONTENT_FILES,
    });
    await chrome.tabs.sendMessage(tabId, { type: "START_CAPTURE" });
  } catch (err) {
    console.error("See & Capture: failed to start", err);
  }
}

async function openLastModal(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: CONTENT_FILES,
    });
    await chrome.tabs.sendMessage(tabId, { type: "OPEN_LAST_MODAL" });
  } catch (err) {
    console.error("See & Capture: failed to open modal", err);
  }
}
