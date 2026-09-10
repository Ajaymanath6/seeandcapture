/**
 * Moodboard bento viewer overlay.
 * Exposed as window.SeeCaptureMoodboardUI
 */
(() => {
  const AREA_KEYS = "abcdefgh".split("");

  function bentoVariants(count) {
    const n = Math.max(0, count);
    if (n <= 1) {
      return [{ columns: "1fr", rows: "1fr", areas: ["a"] }];
    }
    if (n === 2) {
      return [
        { columns: "1fr 1fr", rows: "1fr", areas: ["a b"] },
        { columns: "1.4fr 1fr", rows: "1fr", areas: ["a b"] },
        { columns: "1fr", rows: "1fr 1fr", areas: ["a", "b"] },
        { columns: "1fr 1.4fr", rows: "1fr", areas: ["a b"] },
      ];
    }
    if (n === 3) {
      return [
        { columns: "1.2fr 1fr", rows: "1fr 1fr", areas: ["a b", "a c"] },
        { columns: "1fr 1.2fr", rows: "1fr 1fr", areas: ["a b", "c b"] },
        { columns: "1fr 1fr 1fr", rows: "1fr", areas: ["a b c"] },
        { columns: "1fr", rows: "1.2fr 1fr 1fr", areas: ["a", "b", "c"] },
      ];
    }
    if (n === 4) {
      return [
        { columns: "1fr 1fr", rows: "1fr 1fr", areas: ["a b", "c d"] },
        {
          columns: "1.3fr 1fr",
          rows: "1fr 1fr 1fr",
          areas: ["a b", "a c", "d d"],
        },
        {
          columns: "1fr 1fr 1fr",
          rows: "1.2fr 1fr",
          areas: ["a a b", "c d d"],
        },
        { columns: "1fr 1.3fr", rows: "1fr 1fr", areas: ["a b", "c b"] },
      ];
    }
    if (n === 5) {
      return [
        {
          columns: "1.15fr 1fr 1fr",
          rows: "1fr 1fr",
          areas: ["a b c", "a d e"],
        },
        {
          columns: "1fr 1fr 1.15fr",
          rows: "1fr 1fr",
          areas: ["a b c", "d e c"],
        },
        {
          columns: "1fr 1fr",
          rows: "1.2fr 1fr 1fr",
          areas: ["a a", "b c", "d e"],
        },
        {
          columns: "1.2fr 1fr 1fr",
          rows: "1fr 1fr 1fr",
          areas: ["a b c", "a d e", "a d e"],
        },
      ];
    }
    if (n === 6) {
      return [
        {
          columns: "1fr 1fr 1fr",
          rows: "1fr 1fr",
          areas: ["a b c", "d e f"],
        },
        {
          columns: "1.3fr 1fr 1fr",
          rows: "1fr 1fr 1fr",
          areas: ["a b c", "a d e", "a f f"],
        },
        {
          columns: "1fr 1fr",
          rows: "1fr 1fr 1fr",
          areas: ["a b", "c d", "e f"],
        },
        {
          columns: "1fr 1.2fr 1fr",
          rows: "1.2fr 1fr",
          areas: ["a b c", "d b e"],
        },
      ];
    }
    if (n === 7) {
      return [
        {
          columns: "1.2fr 1fr 1fr",
          rows: "1fr 1fr 1fr",
          areas: ["a b c", "a d e", "f f g"],
        },
        {
          columns: "1fr 1fr 1fr",
          rows: "1.2fr 1fr 1fr",
          areas: ["a a b", "c d e", "f g g"],
        },
        {
          columns: "1fr 1.3fr 1fr",
          rows: "1fr 1fr 1fr",
          areas: ["a b c", "d b e", "f b g"],
        },
        {
          columns: "1fr 1fr 1fr 1fr",
          rows: "1.2fr 1fr",
          areas: ["a a b c", "d e f g"],
        },
      ];
    }
    return [
      {
        columns: "1fr 1fr 1fr 1fr",
        rows: "1fr 1fr",
        areas: ["a b c d", "e f g h"],
      },
      {
        columns: "1.3fr 1fr 1fr 1fr",
        rows: "1fr 1fr 1fr",
        areas: ["a b c d", "a e f g", "a e h h"],
      },
      {
        columns: "1fr 1fr 1fr",
        rows: "1fr 1fr 1fr",
        areas: ["a a b", "c d e", "f g h"],
      },
      {
        columns: "1fr 1.2fr 1fr 1fr",
        rows: "1.2fr 1fr",
        areas: ["a b c d", "e b f g"],
      },
    ];
  }

  function bentoTemplate(count, variant) {
    const list = bentoVariants(count);
    const idx = ((variant % list.length) + list.length) % list.length;
    return list[idx] || list[0];
  }

  function variantCountFor(count) {
    return bentoVariants(count).length;
  }

  function mountMoodboardViewer(opts) {
    const {
      shadowRoot,
      hostEl,
      embedded,
      board,
      onClose,
      onBack,
      onBoardUpdated,
      saveDataUrl,
      openPreview,
      materialIcon,
    } = opts;

    const mountParent = hostEl || shadowRoot;
    if (!mountParent || !board) return null;

    const existing =
      mountParent.querySelector?.(".sc-moodboard") ||
      shadowRoot?.querySelector?.(".sc-moodboard");
    if (existing) existing.remove();

    let current = structuredClone
      ? structuredClone(board)
      : JSON.parse(JSON.stringify(board));
    let gutter = Number(current.settings?.gutter) || 16;
    let cornerRadius = Number(current.settings?.cornerRadius) || 28;
    let patternIndex = Number(current.settings?.patternIndex) || 0;
    let dragFromId = null;

    const overlay = document.createElement("div");
    overlay.className = embedded
      ? "sc-moodboard is-embedded"
      : "sc-moodboard";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", current.name || "Moodboard");

    const shell = document.createElement("div");
    shell.className = "sc-moodboard-shell";

    const stage = document.createElement("div");
    stage.className = "sc-moodboard-stage";

    const canvas = document.createElement("div");
    canvas.className = "sc-moodboard-canvas";

    const grid = document.createElement("div");
    grid.className = "sc-moodboard-grid";

    const empty = document.createElement("div");
    empty.className = "sc-moodboard-empty";
    empty.textContent = "No images yet. Add captures from Save → moodboards.";

    const previewActions = document.createElement("div");
    previewActions.className = "sc-moodboard-preview-actions";
    const previewBtn = document.createElement("button");
    previewBtn.type = "button";
    previewBtn.className = "sc-preview-btn";
    previewBtn.textContent = "Preview";
    previewActions.appendChild(previewBtn);

    canvas.appendChild(grid);
    canvas.appendChild(empty);
    canvas.appendChild(previewActions);
    stage.appendChild(canvas);

    const side = document.createElement("aside");
    side.className = "sc-moodboard-side";

    const sideHead = document.createElement("div");
    sideHead.className = "sc-moodboard-side-head";
    const title = document.createElement("h3");
    title.className = "sc-moodboard-title";
    title.textContent = current.name || "Moodboard";
    const subtitle = document.createElement("p");
    subtitle.className = "sc-moodboard-sub";
    sideHead.appendChild(title);
    sideHead.appendChild(subtitle);

    const generateBtn = document.createElement("button");
    generateBtn.type = "button";
    generateBtn.className = "sc-moodboard-generate";
    generateBtn.textContent = "Generate";

    const exportBtn = document.createElement("button");
    exportBtn.type = "button";
    exportBtn.className = "sc-moodboard-export";
    if (materialIcon) {
      exportBtn.appendChild(materialIcon("download", "sc-btn-icon"));
    }
    const exportLabel = document.createElement("span");
    exportLabel.textContent = "Export PNG";
    exportBtn.appendChild(exportLabel);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "sc-moodboard-close";
    closeBtn.setAttribute("aria-label", "Close moodboard");
    if (materialIcon) {
      closeBtn.appendChild(materialIcon("close"));
    } else {
      closeBtn.textContent = "×";
    }

    function makeSlider(labelText, min, max, value, onInput) {
      const wrap = document.createElement("div");
      wrap.className = "sc-moodboard-slider";
      const row = document.createElement("div");
      row.className = "sc-moodboard-slider-row";
      const lab = document.createElement("span");
      lab.textContent = labelText;
      const val = document.createElement("span");
      val.className = "sc-moodboard-slider-val";
      val.textContent = `${value}px`;
      row.appendChild(lab);
      row.appendChild(val);
      const input = document.createElement("input");
      input.type = "range";
      input.min = String(min);
      input.max = String(max);
      input.value = String(value);
      input.addEventListener("input", () => {
        const next = Number(input.value);
        val.textContent = `${next}px`;
        onInput(next);
      });
      wrap.appendChild(row);
      wrap.appendChild(input);
      return wrap;
    }

    const gutterSlider = makeSlider("Gutter", 4, 48, gutter, (v) => {
      gutter = v;
      applyLayout();
      persistSettings();
    });
    const radiusSlider = makeSlider("Corner radius", 0, 64, cornerRadius, (v) => {
      cornerRadius = v;
      applyLayout();
      persistSettings();
    });

    let receiveFromWeb = Boolean(current.settings?.receiveFromWeb);
    let gridTheme =
      current.settings?.gridTheme === "light" ? "light" : "dark";

    function makeToggle(labelText, checked, onChange) {
      const row = document.createElement("label");
      row.className = "sc-moodboard-toggle";
      const text = document.createElement("span");
      text.className = "sc-moodboard-toggle-label";
      text.textContent = labelText;
      const switchEl = document.createElement("span");
      switchEl.className = "sc-moodboard-switch";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = checked;
      const track = document.createElement("span");
      track.className = "sc-moodboard-switch-track";
      const thumb = document.createElement("span");
      thumb.className = "sc-moodboard-switch-thumb";
      track.appendChild(thumb);
      switchEl.appendChild(input);
      switchEl.appendChild(track);
      row.appendChild(text);
      row.appendChild(switchEl);
      input.addEventListener("change", () => onChange(Boolean(input.checked)));
      return { row, input };
    }

    const receiveToggle = makeToggle(
      "Receive web images",
      receiveFromWeb,
      (on) => {
        receiveFromWeb = on;
        persistSettings();
      }
    );
    const themeToggle = makeToggle(
      "Dark grid",
      gridTheme === "dark",
      (on) => {
        gridTheme = on ? "dark" : "light";
        applyGridTheme();
        persistSettings();
      }
    );

    const hint = document.createElement("p");
    hint.className = "sc-moodboard-hint";

    side.appendChild(sideHead);
    side.appendChild(generateBtn);
    side.appendChild(exportBtn);
    side.appendChild(gutterSlider);
    side.appendChild(radiusSlider);
    side.appendChild(receiveToggle.row);
    side.appendChild(themeToggle.row);
    side.appendChild(hint);
    if (!embedded) {
      side.appendChild(closeBtn);
    }

    shell.appendChild(stage);
    shell.appendChild(side);
    overlay.appendChild(shell);
    mountParent.appendChild(overlay);

    function syncReceiverMenus() {
      try {
        chrome.runtime.sendMessage({
          type: "UPSERT_MOODBOARD_RECEIVER",
          board: {
            id: current.id,
            name: current.name || "Moodboard",
            receiveFromWeb,
          },
        });
      } catch (err) {
        console.error(err);
      }
    }

    function applyGridTheme() {
      stage.classList.toggle("is-grid-light", gridTheme === "light");
      canvas.classList.toggle("is-grid-light", gridTheme === "light");
      themeToggle.input.checked = gridTheme === "dark";
    }

    let persistTimer = null;
    function persistSettings() {
      clearTimeout(persistTimer);
      persistTimer = setTimeout(async () => {
        try {
          const api = window.SeeCaptureMoodboards;
          if (!api?.updateSettings) return;
          current = await api.updateSettings(current.id, {
            gutter,
            cornerRadius,
            patternIndex,
            receiveFromWeb,
            gridTheme,
          });
          onBoardUpdated?.(current);
          syncReceiverMenus();
        } catch (err) {
          console.error(err);
        }
      }, 250);
    }

    applyGridTheme();

    function applyLayout() {
      const images = current.images || [];
      const count = Math.min(images.length, 8);
      const variants = variantCountFor(count || 1);
      patternIndex = ((patternIndex % variants) + variants) % variants;
      subtitle.textContent = `${images.length} image(s)`;
      hint.textContent =
        images.length > 1
          ? `Drag to swap · Pattern ${patternIndex + 1}/${variants}`
          : "Add more captures to grow this bento grid.";

      empty.classList.toggle("is-hidden", images.length > 0);
      grid.classList.toggle("is-hidden", images.length === 0);
      previewActions.classList.toggle("is-hidden", images.length === 0);

      const tpl = bentoTemplate(count || 1, patternIndex);
      grid.style.gridTemplateColumns = tpl.columns;
      grid.style.gridTemplateRows = tpl.rows;
      grid.style.gridTemplateAreas = tpl.areas.map((r) => `"${r}"`).join(" ");
      grid.style.gap = `${gutter}px`;
      canvas.style.setProperty("--sc-mb-radius", `${cornerRadius}px`);
      canvas.style.setProperty("--sc-mb-gutter", `${gutter}px`);

      grid.innerHTML = "";
      images.slice(0, 8).forEach((img, index) => {
        const tile = document.createElement("div");
        tile.className = "sc-moodboard-tile";
        tile.style.gridArea = AREA_KEYS[index] || "a";
        tile.draggable = true;
        tile.dataset.imageId = img.id;

        const picture = document.createElement("img");
        picture.src = img.dataUrl;
        picture.alt = "";
        picture.draggable = false;
        tile.appendChild(picture);

        tile.addEventListener("dragstart", (e) => {
          dragFromId = img.id;
          tile.classList.add("is-dragging");
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", img.id);
        });
        tile.addEventListener("dragend", () => {
          dragFromId = null;
          tile.classList.remove("is-dragging");
          grid
            .querySelectorAll(".sc-moodboard-tile.is-drop")
            .forEach((el) => el.classList.remove("is-drop"));
        });
        tile.addEventListener("dragover", (e) => {
          e.preventDefault();
          tile.classList.add("is-drop");
        });
        tile.addEventListener("dragleave", () => {
          tile.classList.remove("is-drop");
        });
        tile.addEventListener("drop", async (e) => {
          e.preventDefault();
          tile.classList.remove("is-drop");
          const fromId = dragFromId || e.dataTransfer.getData("text/plain");
          const toId = img.id;
          if (!fromId || fromId === toId) return;
          const ids = (current.images || []).map((i) => i.id);
          const fromIdx = ids.indexOf(fromId);
          const toIdx = ids.indexOf(toId);
          if (fromIdx < 0 || toIdx < 0) return;
          const next = ids.slice();
          const tmp = next[fromIdx];
          next[fromIdx] = next[toIdx];
          next[toIdx] = tmp;
          try {
            current = await window.SeeCaptureMoodboards.reorderImages(
              current.id,
              next
            );
            onBoardUpdated?.(current);
            applyLayout();
          } catch (err) {
            console.error(err);
            alert(err?.message || "Could not reorder images");
          }
        });

        grid.appendChild(tile);
      });
    }

    function roundRect(ctx, x, y, w, h, r) {
      const radius = Math.max(0, Math.min(r, w / 2, h / 2));
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.arcTo(x + w, y, x + w, y + h, radius);
      ctx.arcTo(x + w, y + h, x, y + h, radius);
      ctx.arcTo(x, y + h, x, y, radius);
      ctx.arcTo(x, y, x + w, y, radius);
      ctx.closePath();
    }

    async function renderBentoDataUrl() {
      const images = (current.images || []).slice(0, 8);
      if (!images.length) {
        throw new Error("Nothing to render yet.");
      }
      const W = 1600;
      const H = 1000;
      const margin = 40;
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#141416";
      ctx.fillRect(0, 0, W, H);

      const tpl = bentoTemplate(images.length, patternIndex);
      const colFr = tpl.columns.split(/\s+/).map((x) => {
        const n = parseFloat(x);
        return Number.isFinite(n) ? n : 1;
      });
      const rowFr = tpl.rows.split(/\s+/).map((x) => {
        const n = parseFloat(x);
        return Number.isFinite(n) ? n : 1;
      });
      const areaRows = tpl.areas.map((r) => r.split(/\s+/));
      const innerW = W - margin * 2;
      const innerH = H - margin * 2;
      const colSum = colFr.reduce((a, b) => a + b, 0);
      const rowSum = rowFr.reduce((a, b) => a + b, 0);
      const usableW = innerW - gutter * (colFr.length - 1);
      const usableH = innerH - gutter * (rowFr.length - 1);
      const colWidths = colFr.map((f) => (usableW * f) / colSum);
      const rowHeights = rowFr.map((f) => (usableH * f) / rowSum);
      const xs = [];
      const ys = [];
      let cx = margin;
      colWidths.forEach((w) => {
        xs.push(cx);
        cx += w + gutter;
      });
      let cy = margin;
      rowHeights.forEach((h) => {
        ys.push(cy);
        cy += h + gutter;
      });

      const placed = new Map();
      areaRows.forEach((row, r) => {
        row.forEach((cell, cIdx) => {
          if (!placed.has(cell)) {
            placed.set(cell, { r0: r, r1: r, c0: cIdx, c1: cIdx });
          } else {
            const box = placed.get(cell);
            box.r1 = Math.max(box.r1, r);
            box.c1 = Math.max(box.c1, cIdx);
          }
        });
      });

      const loadImage = (src) =>
        new Promise((resolve, reject) => {
          const im = new Image();
          im.onload = () => resolve(im);
          im.onerror = () => reject(new Error("Image load failed"));
          im.src = src;
        });

      for (let i = 0; i < images.length; i += 1) {
        const key = AREA_KEYS[i];
        const box = placed.get(key);
        if (!box) continue;
        const x = xs[box.c0];
        const y = ys[box.r0];
        let w = 0;
        let h = 0;
        for (let col = box.c0; col <= box.c1; col += 1) {
          w += colWidths[col];
          if (col < box.c1) w += gutter;
        }
        for (let row = box.r0; row <= box.r1; row += 1) {
          h += rowHeights[row];
          if (row < box.r1) h += gutter;
        }
        const im = await loadImage(images[i].dataUrl);
        ctx.save();
        roundRect(ctx, x, y, w, h, cornerRadius);
        ctx.clip();
        const scale = Math.max(w / im.width, h / im.height);
        const dw = im.width * scale;
        const dh = im.height * scale;
        ctx.drawImage(im, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
        ctx.restore();
      }
      return c.toDataURL("image/png");
    }

    async function exportPng() {
      try {
        const dataUrl = await renderBentoDataUrl();
        if (saveDataUrl) await saveDataUrl(dataUrl);
        else {
          const a = document.createElement("a");
          a.href = dataUrl;
          a.download = `${(current.name || "moodboard").replace(/\s+/g, "-")}.png`;
          a.click();
        }
      } catch (err) {
        console.error(err);
        alert(err?.message || "Export failed");
      }
    }

    async function previewBento() {
      try {
        const dataUrl = await renderBentoDataUrl();
        if (openPreview) openPreview(dataUrl);
        else if (saveDataUrl) await saveDataUrl(dataUrl);
      } catch (err) {
        console.error(err);
        alert(err?.message || "Preview failed");
      }
    }

    function close() {
      window.removeEventListener("keydown", onKey, true);
      overlay.remove();
      (onBack || onClose)?.();
    }

    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };

    if (!embedded) {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close();
      });
    }
    shell.addEventListener("click", (e) => e.stopPropagation());
    if (!embedded) {
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        close();
      });
    }
    generateBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const images = current.images || [];
      const count = Math.min(images.length, 8) || 1;
      const total = variantCountFor(count);
      patternIndex = (patternIndex + 1) % total;
      applyLayout();
      persistSettings();
    });
    exportBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      exportPng();
    });
    previewBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      previewBento();
    });
    window.addEventListener("keydown", onKey, true);

    applyLayout();
    window.SeeCaptureMoodboards?.touchOpened?.(current.id).catch(() => {});

    return {
      close,
      refresh: (boardNext) => {
        current = boardNext;
        gutter = Number(current.settings?.gutter) || gutter;
        cornerRadius = Number(current.settings?.cornerRadius) || cornerRadius;
        patternIndex = Number(current.settings?.patternIndex) || patternIndex;
        receiveFromWeb = Boolean(current.settings?.receiveFromWeb);
        gridTheme =
          current.settings?.gridTheme === "light" ? "light" : "dark";
        receiveToggle.input.checked = receiveFromWeb;
        applyGridTheme();
        title.textContent = current.name || "Moodboard";
        applyLayout();
      },
      getBoardId: () => current.id,
    };
  }

  window.SeeCaptureMoodboardUI = {
    mountMoodboardViewer,
  };
})();
