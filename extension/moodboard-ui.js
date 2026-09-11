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

  function denseColumns(count) {
    const n = Math.max(1, count);
    if (n <= 9) return 3;
    if (n <= 12) return 4;
    if (n <= 20) return 5;
    return Math.min(6, Math.ceil(Math.sqrt(n)));
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
      extractColors,
      requestVariation,
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
    let detailImage = null;
    let selectedDetailHex = null;
    let detailBusy = false;
    let pointerDownOnTile = null;

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

    const detailStage = document.createElement("div");
    detailStage.className = "sc-moodboard-detail is-hidden";
    const detailBlur = document.createElement("div");
    detailBlur.className = "sc-moodboard-detail-blur";
    const detailHeroWrap = document.createElement("div");
    detailHeroWrap.className = "sc-moodboard-detail-hero";
    const detailHero = document.createElement("img");
    detailHero.alt = "Selected image";
    detailHeroWrap.appendChild(detailHero);
    detailStage.appendChild(detailBlur);
    detailStage.appendChild(detailHeroWrap);
    stage.appendChild(detailStage);

    const side = document.createElement("aside");
    side.className = "sc-moodboard-side";

    const boardSide = document.createElement("div");
    boardSide.className = "sc-moodboard-side-board";

    const detailSide = document.createElement("div");
    detailSide.className = "sc-moodboard-side-detail is-hidden";

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
      return { row, input, label: text };
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
      gridTheme === "light" ? "Light grid" : "Dark grid",
      gridTheme === "dark",
      (on) => {
        gridTheme = on ? "dark" : "light";
        applyGridTheme();
        persistSettings();
      }
    );

    const hint = document.createElement("p");
    hint.className = "sc-moodboard-hint";

    boardSide.appendChild(sideHead);
    boardSide.appendChild(generateBtn);
    boardSide.appendChild(exportBtn);
    boardSide.appendChild(gutterSlider);
    boardSide.appendChild(radiusSlider);
    boardSide.appendChild(receiveToggle.row);
    boardSide.appendChild(themeToggle.row);
    boardSide.appendChild(hint);
    if (!embedded) {
      boardSide.appendChild(closeBtn);
    }

    const detailHead = document.createElement("div");
    detailHead.className = "sc-moodboard-side-head";
    const detailTitle = document.createElement("h3");
    detailTitle.className = "sc-moodboard-title";
    detailTitle.textContent = "Details";
    const detailSub = document.createElement("p");
    detailSub.className = "sc-moodboard-sub";
    detailSub.textContent = "Select a color, then generate a variation";
    detailHead.appendChild(detailTitle);
    detailHead.appendChild(detailSub);

    const detailThumb = document.createElement("img");
    detailThumb.className = "sc-moodboard-detail-thumb";
    detailThumb.alt = "";

    const colorsLabel = document.createElement("p");
    colorsLabel.className = "sc-moodboard-detail-label";
    colorsLabel.textContent = "Colors";

    const colorsRow = document.createElement("div");
    colorsRow.className = "sc-moodboard-detail-colors";

    const variationBtn = document.createElement("button");
    variationBtn.type = "button";
    variationBtn.className = "sc-moodboard-generate sc-moodboard-variation-btn";
    variationBtn.textContent = "+ Generate variation";
    variationBtn.disabled = true;

    const detailBackBtn = document.createElement("button");
    detailBackBtn.type = "button";
    detailBackBtn.className = "sc-moodboard-export";
    detailBackBtn.textContent = "Back to board";

    const detailHint = document.createElement("p");
    detailHint.className = "sc-moodboard-hint";
    detailHint.textContent = "Variation keeps layout and shifts the color theme.";

    detailSide.appendChild(detailHead);
    detailSide.appendChild(detailThumb);
    detailSide.appendChild(colorsLabel);
    detailSide.appendChild(colorsRow);
    detailSide.appendChild(variationBtn);
    detailSide.appendChild(detailHint);
    detailSide.appendChild(detailBackBtn);

    side.appendChild(boardSide);
    side.appendChild(detailSide);

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
      const isLight = gridTheme === "light";
      shell.classList.toggle("is-grid-light", isLight);
      stage.classList.toggle("is-grid-light", isLight);
      canvas.classList.toggle("is-grid-light", isLight);
      side.classList.toggle("is-grid-light", isLight);
      themeToggle.input.checked = gridTheme === "dark";
      themeToggle.label.textContent =
        gridTheme === "light" ? "Light grid" : "Dark grid";
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
      const total = images.length;
      const useBento = total > 0 && total <= 8;
      const count = useBento ? total : Math.max(total, 1);
      const variants = useBento ? variantCountFor(count || 1) : 1;
      if (useBento) {
        patternIndex = ((patternIndex % variants) + variants) % variants;
      }
      subtitle.textContent = `${total} image(s)`;
      if (!total) {
        hint.textContent = "Add more captures to grow this bento grid.";
      } else if (useBento) {
        hint.textContent =
          total > 1
            ? `Drag to swap · Pattern ${patternIndex + 1}/${variants}`
            : "Add more captures to grow this bento grid.";
      } else {
        hint.textContent = `All ${total} images · Drag to swap · Dense grid`;
      }

      empty.classList.toggle("is-hidden", total > 0);
      grid.classList.toggle("is-hidden", total === 0);
      grid.classList.toggle("is-dense", total > 8);
      previewActions.classList.toggle("is-hidden", total === 0);
      generateBtn.disabled = total > 8;
      generateBtn.title =
        total > 8
          ? "Pattern variants are for boards with up to 8 images"
          : "Cycle bento layout";

      if (useBento) {
        const tpl = bentoTemplate(count || 1, patternIndex);
        grid.style.gridTemplateColumns = tpl.columns;
        grid.style.gridTemplateRows = tpl.rows;
        grid.style.gridTemplateAreas = tpl.areas.map((r) => `"${r}"`).join(" ");
      } else {
        const cols = denseColumns(total);
        grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
        grid.style.gridTemplateRows = "";
        grid.style.gridTemplateAreas = "";
      }
      grid.style.gap = `${gutter}px`;
      canvas.style.setProperty("--sc-mb-radius", `${cornerRadius}px`);
      canvas.style.setProperty("--sc-mb-gutter", `${gutter}px`);

      grid.innerHTML = "";
      images.forEach((img, index) => {
        const tile = document.createElement("div");
        tile.className = "sc-moodboard-tile";
        if (useBento) {
          tile.style.gridArea = AREA_KEYS[index] || "a";
        } else {
          tile.style.gridArea = "";
        }
        tile.draggable = true;
        tile.dataset.imageId = img.id;

        const picture = document.createElement("img");
        picture.src = img.dataUrl;
        picture.alt = "";
        picture.draggable = false;
        tile.appendChild(picture);

        tile.addEventListener("pointerdown", (e) => {
          if (e.button !== 0) return;
          pointerDownOnTile = {
            imageId: img.id,
            x: e.clientX,
            y: e.clientY,
            dragged: false,
          };
        });
        tile.addEventListener("dragstart", (e) => {
          if (pointerDownOnTile?.imageId === img.id) {
            pointerDownOnTile.dragged = true;
          }
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
        tile.addEventListener("click", (e) => {
          const down = pointerDownOnTile;
          pointerDownOnTile = null;
          if (!down || down.imageId !== img.id) return;
          const moved =
            down.dragged ||
            Math.abs(e.clientX - down.x) > 6 ||
            Math.abs(e.clientY - down.y) > 6;
          if (moved) return;
          e.preventDefault();
          e.stopPropagation();
          openImageDetail(img);
        });

        grid.appendChild(tile);
      });
    }

    function setDetailBusy(busy) {
      detailBusy = Boolean(busy);
      variationBtn.disabled = detailBusy || !selectedDetailHex;
      variationBtn.classList.toggle("is-busy", detailBusy);
      variationBtn.textContent = detailBusy
        ? "Generating…"
        : "+ Generate variation";
      colorsRow
        .querySelectorAll(".sc-mb-color-dot")
        .forEach((el) => {
          el.disabled = detailBusy;
        });
    }

    function renderDetailColors(hexes) {
      colorsRow.innerHTML = "";
      const list = Array.isArray(hexes) ? hexes : [];
      selectedDetailHex = list[0] || null;
      list.forEach((hex) => {
        const dot = document.createElement("button");
        dot.type = "button";
        dot.className = "sc-mb-color-dot";
        dot.style.background = hex;
        dot.title = hex;
        dot.setAttribute("aria-label", `Select color ${hex}`);
        if (hex === selectedDetailHex) dot.classList.add("is-selected");
        dot.addEventListener("click", (e) => {
          e.stopPropagation();
          if (detailBusy) return;
          selectedDetailHex = hex;
          colorsRow
            .querySelectorAll(".sc-mb-color-dot")
            .forEach((el) => el.classList.remove("is-selected"));
          dot.classList.add("is-selected");
          variationBtn.disabled = !selectedDetailHex || detailBusy;
        });
        colorsRow.appendChild(dot);
      });
      variationBtn.disabled = !selectedDetailHex || detailBusy;
      if (!list.length) {
        detailHint.textContent = "No colors found for this image.";
      } else {
        detailHint.textContent =
          "Variation keeps layout and shifts the color theme.";
      }
    }

    async function openImageDetail(img) {
      if (!img?.dataUrl) return;
      detailImage = img;
      selectedDetailHex = null;
      detailHero.src = img.dataUrl;
      detailThumb.src = img.dataUrl;
      detailBlur.style.backgroundImage = `url("${img.dataUrl}")`;
      canvas.classList.add("is-hidden");
      previewActions.classList.add("is-hidden");
      detailStage.classList.remove("is-hidden");
      boardSide.classList.add("is-hidden");
      detailSide.classList.remove("is-hidden");
      shell.classList.add("is-detail");
      colorsRow.innerHTML = "";
      colorsRow.textContent = "Extracting colors…";
      variationBtn.disabled = true;
      try {
        const hexes = extractColors
          ? await extractColors(img.dataUrl)
          : [];
        if (detailImage?.id !== img.id) return;
        colorsRow.textContent = "";
        renderDetailColors(hexes);
      } catch (err) {
        console.error(err);
        if (detailImage?.id !== img.id) return;
        colorsRow.textContent = "";
        renderDetailColors([]);
        detailHint.textContent =
          err?.message || "Could not extract colors from this image.";
      }
    }

    function closeImageDetail() {
      detailImage = null;
      selectedDetailHex = null;
      detailBusy = false;
      detailHero.removeAttribute("src");
      detailThumb.removeAttribute("src");
      detailBlur.style.backgroundImage = "";
      detailStage.classList.add("is-hidden");
      boardSide.classList.remove("is-hidden");
      detailSide.classList.add("is-hidden");
      shell.classList.remove("is-detail");
      canvas.classList.remove("is-hidden");
      setDetailBusy(false);
      applyLayout();
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
      const images = current.images || [];
      if (!images.length) {
        throw new Error("Nothing to render yet.");
      }
      const useBento = images.length <= 8;
      const cols = useBento ? null : denseColumns(images.length);
      const rows = useBento
        ? null
        : Math.max(1, Math.ceil(images.length / cols));
      const W = 1600;
      const H = useBento
        ? 1000
        : Math.max(1000, Math.round(1600 * (rows / cols) * 0.85));
      const margin = 40;
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const ctx = c.getContext("2d");
      ctx.fillStyle = gridTheme === "light" ? "#f7fafc" : "#0e0e10";
      ctx.fillRect(0, 0, W, H);

      const loadImage = (src) =>
        new Promise((resolve, reject) => {
          const im = new Image();
          im.onload = () => resolve(im);
          im.onerror = () => reject(new Error("Image load failed"));
          im.src = src;
        });

      const drawCover = async (imgRec, x, y, w, h) => {
        const im = await loadImage(imgRec.dataUrl);
        ctx.save();
        roundRect(ctx, x, y, w, h, cornerRadius);
        ctx.clip();
        const scale = Math.max(w / im.width, h / im.height);
        const dw = im.width * scale;
        const dh = im.height * scale;
        ctx.drawImage(im, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
        ctx.restore();
      };

      if (!useBento) {
        const innerW = W - margin * 2;
        const innerH = H - margin * 2;
        const cellW = (innerW - gutter * (cols - 1)) / cols;
        const cellH = (innerH - gutter * (rows - 1)) / rows;
        for (let i = 0; i < images.length; i += 1) {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const x = margin + col * (cellW + gutter);
          const y = margin + row * (cellH + gutter);
          await drawCover(images[i], x, y, cellW, cellH);
        }
        return c.toDataURL("image/png");
      }

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
        await drawCover(images[i], x, y, w, h);
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
        if (detailImage) {
          closeImageDetail();
          return;
        }
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
    detailBackBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeImageDetail();
    });
    variationBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (detailBusy || !detailImage?.dataUrl || !selectedDetailHex) return;
      if (!requestVariation) {
        alert("Variation is unavailable in this view.");
        return;
      }
      setDetailBusy(true);
      try {
        const data = await requestVariation({
          imageDataUrl: detailHero.src || detailImage.dataUrl,
          hex: selectedDetailHex,
        });
        const nextUrl = data?.imageDataUrl;
        if (!nextUrl) throw new Error("No image returned.");
        detailHero.src = nextUrl;
        detailThumb.src = nextUrl;
        detailBlur.style.backgroundImage = `url("${nextUrl}")`;
        detailImage = { ...detailImage, dataUrl: nextUrl };
        try {
          const hexes = extractColors ? await extractColors(nextUrl) : [];
          renderDetailColors(hexes);
        } catch (_err) {
          /* keep prior palette */
        }
      } catch (err) {
        console.error(err);
        alert(err?.message || "Could not generate variation.");
      } finally {
        setDetailBusy(false);
      }
    });
    generateBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const images = current.images || [];
      if (images.length > 8) {
        applyLayout();
        return;
      }
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
