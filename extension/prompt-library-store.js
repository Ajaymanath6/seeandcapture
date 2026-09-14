/**
 * Extension-origin IndexedDB for saved recreate prompts (service worker).
 * Exposed as self.SeeCapturePromptLibraryStore
 */
(() => {
  const DB_NAME = "seeandcapture";
  const DB_VERSION = 4;
  const STORE = "promptLibrary";

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
        if (!db.objectStoreNames.contains("moodboards")) {
          const moodboards = db.createObjectStore("moodboards", {
            keyPath: "id",
          });
          moodboards.createIndex("updatedAt", "updatedAt", { unique: false });
          moodboards.createIndex("lastOpenedAt", "lastOpenedAt", {
            unique: false,
          });
        }
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("updatedAt", "updatedAt", { unique: false });
          store.createIndex("createdAt", "createdAt", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error || new Error("IndexedDB open failed"));
    });
  }

  function newId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `prompt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async function listPrompts() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const request = store.getAll();
      request.onsuccess = () => {
        const rows = (request.result || []).slice().sort((a, b) => {
          return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
        });
        db.close();
        resolve(rows);
      };
      request.onerror = () => {
        db.close();
        reject(request.error || new Error("Failed to list prompts"));
      };
    });
  }

  async function getPrompt(id) {
    if (!id) return null;
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

  async function savePrompt({ prompt, imageDataUrl, modelId }) {
    const text = String(prompt || "").trim();
    if (!text) throw new Error("Prompt text is required");
    if (!imageDataUrl || typeof imageDataUrl !== "string") {
      throw new Error("imageDataUrl is required");
    }
    const now = Date.now();
    const row = {
      id: newId(),
      prompt: text,
      imageDataUrl,
      modelId: modelId ? String(modelId) : null,
      createdAt: now,
      updatedAt: now,
    };
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      store.put(row);
      tx.oncomplete = () => {
        db.close();
        resolve(row);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error("Failed to save prompt"));
      };
    });
  }

  async function removePrompt(id) {
    if (!id) throw new Error("id is required");
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      store.delete(id);
      tx.oncomplete = () => {
        db.close();
        resolve({ id, removed: true });
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error("Failed to remove prompt"));
      };
    });
  }

  self.SeeCapturePromptLibraryStore = {
    listPrompts,
    getPrompt,
    savePrompt,
    removePrompt,
  };
})();
