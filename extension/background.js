const CONTEXT_MENU_ID = "see-and-capture-select";
const CONTENT_FILES = ["presets.js", "content.js"];
const API_URL = "http://127.0.0.1:8787/api/edit";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: "See & Capture — select area",
      contexts: ["page", "selection", "image", "video", "link"],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !tab?.id) return;
  startCapture(tab.id);
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

  return false;
});

async function editImageViaServer({ imageDataUrl, presetId, model }) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imageDataUrl,
      presetId,
      model: model || "eden",
    }),
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
