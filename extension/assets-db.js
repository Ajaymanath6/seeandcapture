/**
 * IndexedDB vault for image assets + fixed color palettes.
 * Exposed as window.SeeCaptureAssets
 */
(() => {
  const DB_NAME = "seeandcapture";
  const DB_VERSION = 2;
  const STORE = "assets";

  const FIXED_PALETTES = [
    {
      id: "palette-warm-earth",
      name: "Warm Earth",
      kind: "palette",
      colors: ["#8B4513", "#D2691E", "#F4A460", "#FFF8DC"],
      createdAt: 1,
    },
    {
      id: "palette-cool-ocean",
      name: "Cool Ocean",
      kind: "palette",
      colors: ["#0B3C5D", "#1CA9C9", "#7FDBFF", "#E8F7FC"],
      createdAt: 2,
    },
    {
      id: "palette-neon-night",
      name: "Neon Night",
      kind: "palette",
      colors: ["#0F0F1A", "#FF2E63", "#08D9D6", "#EAEAEA"],
      createdAt: 3,
    },
    {
      id: "palette-soft-pastel",
      name: "Soft Pastel",
      kind: "palette",
      colors: ["#F7C6C7", "#C9E4DE", "#F2E8CF", "#A2D2FF"],
      createdAt: 4,
    },
  ];

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("createdAt", "createdAt", { unique: false });
          store.createIndex("name", "name", { unique: false });
          store.createIndex("kind", "kind", { unique: false });
        } else {
          const tx = request.transaction;
          const store = tx.objectStore(STORE);
          if (!store.indexNames.contains("kind")) {
            store.createIndex("kind", "kind", { unique: false });
          }
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error || new Error("IndexedDB open failed"));
    });
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

  async function ensurePalettesSeeded() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      FIXED_PALETTES.forEach((palette) => {
        store.put({ ...palette });
      });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  }

  async function listAssets(kindFilter) {
    await ensurePalettesSeeded();
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const request = store.getAll();
      request.onsuccess = () => {
        let rows = request.result || [];
        // Migrate legacy "logo" → "image" in the returned view
        rows = rows.map((row) => {
          if (row.kind === "logo" || !row.kind) {
            return { ...row, kind: "image" };
          }
          return row;
        });
        if (kindFilter) {
          rows = rows.filter((r) => r.kind === kindFilter);
        }
        rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        db.close();
        resolve(rows);
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
  }

  async function saveAsset({ name, dataUrl, mime, kind, colors }) {
    const resolvedKind = kind === "palette" ? "palette" : "image";
    if (resolvedKind === "image" && !dataUrl) {
      throw new Error("dataUrl is required for image assets");
    }
    if (resolvedKind === "palette" && (!colors || colors.length < 1)) {
      throw new Error("colors are required for palette assets");
    }
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `asset-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const record = {
      id,
      name: (name || "asset").trim() || "asset",
      mime: mime || (resolvedKind === "palette" ? "palette/hex" : "image/png"),
      dataUrl: resolvedKind === "image" ? dataUrl : null,
      colors: resolvedKind === "palette" ? colors : null,
      kind: resolvedKind,
      createdAt: Date.now(),
    };
    await withStore("readwrite", (store) => {
      store.put(record);
    });
    return record;
  }

  async function deleteAsset(id) {
    if (String(id).startsWith("palette-")) {
      throw new Error("Built-in palettes cannot be deleted");
    }
    await withStore("readwrite", (store) => {
      store.delete(id);
    });
  }

  async function getAssetsByIds(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    await ensurePalettesSeeded();
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const results = [];
      let pending = ids.length;
      let failed = null;

      ids.forEach((id) => {
        const request = store.get(id);
        request.onsuccess = () => {
          if (request.result) {
            const row = request.result;
            results.push(
              row.kind === "logo" || !row.kind ? { ...row, kind: "image" } : row
            );
          }
          pending -= 1;
          if (pending === 0) {
            db.close();
            if (failed) reject(failed);
            else resolve(results);
          }
        };
        request.onerror = () => {
          failed = request.error;
          pending -= 1;
          if (pending === 0) {
            db.close();
            reject(failed);
          }
        };
      });
    });
  }

  window.SeeCaptureAssets = {
    FIXED_PALETTES,
    listAssets,
    saveAsset,
    deleteAsset,
    getAssetsByIds,
    ensurePalettesSeeded,
  };
})();
