/**
 * Moodboards RPC client (content script).
 * Persists via extension service worker IndexedDB.
 * Exposed as window.SeeCaptureMoodboards
 */
(() => {
  const DEFAULT_SETTINGS = {
    gutter: 16,
    cornerRadius: 28,
    receiveFromWeb: false,
  };

  function call(type, payload) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ type, ...(payload || {}) }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!response || response.ok === false) {
            reject(new Error(response?.error || "Moodboard request failed"));
            return;
          }
          resolve(response.result);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  async function listMoodboards() {
    return (await call("MOODBOARD_LIST")) || [];
  }

  async function getMoodboard(id) {
    return call("MOODBOARD_GET", { id });
  }

  async function getLastMoodboard() {
    return call("MOODBOARD_GET_LAST");
  }

  async function createMoodboard(name) {
    return call("MOODBOARD_CREATE", { name });
  }

  async function addImage(boardId, dataUrl) {
    return call("MOODBOARD_ADD_IMAGE", { boardId, dataUrl });
  }

  async function updateSettings(boardId, settings) {
    return call("MOODBOARD_UPDATE_SETTINGS", { boardId, settings });
  }

  async function reorderImages(boardId, orderedIds) {
    return call("MOODBOARD_REORDER", { boardId, orderedIds });
  }

  async function touchOpened(boardId) {
    return call("MOODBOARD_TOUCH", { boardId });
  }

  function readPageOriginMoodboards() {
    return new Promise((resolve) => {
      try {
        const request = indexedDB.open("seeandcapture");
        request.onerror = () => resolve([]);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains("moodboards")) {
            db.close();
            resolve([]);
            return;
          }
          const tx = db.transaction("moodboards", "readonly");
          const store = tx.objectStore("moodboards");
          const getAll = store.getAll();
          getAll.onsuccess = () => {
            const rows = getAll.result || [];
            db.close();
            resolve(rows);
          };
          getAll.onerror = () => {
            db.close();
            resolve([]);
          };
        };
      } catch (_err) {
        resolve([]);
      }
    });
  }

  async function migrateFromPageIfNeeded() {
    try {
      const flag = await chrome.storage.local.get({ moodboardMigrated: false });
      if (flag.moodboardMigrated) return;
      const existing = await listMoodboards();
      if (existing.length > 0) {
        await chrome.storage.local.set({ moodboardMigrated: true });
        return;
      }
      const pageBoards = await readPageOriginMoodboards();
      if (pageBoards.length) {
        await call("MOODBOARD_IMPORT", { boards: pageBoards });
      }
      await chrome.storage.local.set({ moodboardMigrated: true });
    } catch (err) {
      console.error("See & Capture: moodboard migrate failed", err);
    }
  }

  window.SeeCaptureMoodboards = {
    DEFAULT_SETTINGS,
    listMoodboards,
    getMoodboard,
    getLastMoodboard,
    createMoodboard,
    addImage,
    updateSettings,
    reorderImages,
    touchOpened,
    migrateFromPageIfNeeded,
  };

  migrateFromPageIfNeeded().catch(() => {});
})();
