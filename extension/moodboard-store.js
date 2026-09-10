/**
 * Extension-origin IndexedDB for moodboards (service worker).
 * Exposed as self.SeeCaptureMoodboardStore
 */
(() => {
  const DB_NAME = "seeandcapture";
  const DB_VERSION = 3;
  const STORE = "moodboards";

  const DEFAULT_SETTINGS = {
    gutter: 16,
    cornerRadius: 28,
    receiveFromWeb: false,
    gridTheme: "dark",
  };

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("assets")) {
          const assets = db.createObjectStore("assets", { keyPath: "id" });
          assets.createIndex("createdAt", "createdAt", { unique: false });
          assets.createIndex("name", "name", { unique: false });
          assets.createIndex("kind", "kind", { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("updatedAt", "updatedAt", { unique: false });
          store.createIndex("lastOpenedAt", "lastOpenedAt", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error || new Error("IndexedDB open failed"));
    });
  }

  function newId(prefix) {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async function withStore(mode, fn) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      let result;
      try {
        result = fn(store);
      } catch (err) {
        reject(err);
        return;
      }
      tx.oncomplete = () => {
        db.close();
        resolve(result);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error("IndexedDB transaction failed"));
      };
    });
  }

  async function listMoodboards() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const request = store.getAll();
      request.onsuccess = () => {
        const rows = (request.result || []).slice().sort((a, b) => {
          const aT = a.lastOpenedAt || a.updatedAt || 0;
          const bT = b.lastOpenedAt || b.updatedAt || 0;
          return bT - aT;
        });
        db.close();
        resolve(rows);
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
  }

  async function getMoodboard(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const request = store.get(id);
      request.onsuccess = () => {
        db.close();
        resolve(request.result || null);
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
  }

  async function getLastMoodboard() {
    const list = await listMoodboards();
    return list[0] || null;
  }

  async function createMoodboard(name) {
    const now = Date.now();
    const record = {
      id: newId("moodboard"),
      name: String(name || "").trim() || "Untitled moodboard",
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
      settings: { ...DEFAULT_SETTINGS },
      images: [],
    };
    await withStore("readwrite", (store) => {
      store.put(record);
    });
    return record;
  }

  async function addImage(boardId, dataUrl) {
    if (!dataUrl) throw new Error("Image is required");
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const request = store.get(boardId);
      request.onsuccess = () => {
        const board = request.result;
        if (!board) {
          reject(new Error("Moodboard not found"));
          return;
        }
        const image = {
          id: newId("mbimg"),
          dataUrl,
          addedAt: Date.now(),
        };
        board.images = Array.isArray(board.images) ? board.images : [];
        board.images.push(image);
        board.updatedAt = Date.now();
        board.lastOpenedAt = board.updatedAt;
        store.put(board);
        tx.oncomplete = () => {
          db.close();
          resolve(board);
        };
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  }

  async function updateSettings(boardId, settings) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const request = store.get(boardId);
      request.onsuccess = () => {
        const board = request.result;
        if (!board) {
          reject(new Error("Moodboard not found"));
          return;
        }
        board.settings = {
          ...DEFAULT_SETTINGS,
          ...(board.settings || {}),
          ...(settings || {}),
        };
        board.updatedAt = Date.now();
        store.put(board);
        tx.oncomplete = () => {
          db.close();
          resolve(board);
        };
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  }

  async function reorderImages(boardId, orderedIds) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const request = store.get(boardId);
      request.onsuccess = () => {
        const board = request.result;
        if (!board) {
          reject(new Error("Moodboard not found"));
          return;
        }
        const byId = new Map((board.images || []).map((img) => [img.id, img]));
        const next = [];
        (orderedIds || []).forEach((id) => {
          if (byId.has(id)) {
            next.push(byId.get(id));
            byId.delete(id);
          }
        });
        byId.forEach((img) => next.push(img));
        board.images = next;
        board.updatedAt = Date.now();
        store.put(board);
        tx.oncomplete = () => {
          db.close();
          resolve(board);
        };
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  }

  async function touchOpened(boardId) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const request = store.get(boardId);
      request.onsuccess = () => {
        const board = request.result;
        if (!board) {
          reject(new Error("Moodboard not found"));
          return;
        }
        board.lastOpenedAt = Date.now();
        store.put(board);
        tx.oncomplete = () => {
          db.close();
          resolve(board);
        };
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  }

  async function importBoards(boards) {
    const list = Array.isArray(boards) ? boards : [];
    if (!list.length) return [];
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      list.forEach((board) => {
        if (!board || !board.id) return;
        store.put({
          ...board,
          settings: {
            ...DEFAULT_SETTINGS,
            ...(board.settings || {}),
          },
          images: Array.isArray(board.images) ? board.images : [],
        });
      });
      tx.oncomplete = () => {
        db.close();
        resolve(list);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error("Import failed"));
      };
    });
  }

  self.SeeCaptureMoodboardStore = {
    DEFAULT_SETTINGS,
    listMoodboards,
    getMoodboard,
    getLastMoodboard,
    createMoodboard,
    addImage,
    updateSettings,
    reorderImages,
    touchOpened,
    importBoards,
  };
})();
