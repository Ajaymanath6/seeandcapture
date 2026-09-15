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
      requestRemoveBg,
      requestGetStyle,
      onRestyleImage,
      buildShipPack,
      downloadShipPack,
      showToast,
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
    let detailSourceImage = null;
    let pendingVariationUrl = null;
    let selectedDetailHex = null;
    let detailBusy = false;
    let styleBusy = false;
    let styleExpanded = false;
    let stylePayload = null;
    let pointerDownOnTile = null;
    let selectMode = false;
    const selectedImageIds = new Set();
    /** @type {Map<string, string>} */
    const pendingCutouts = new Map();
    let batchBusy = false;
    /** @type {{ dataUrl: string, baseName: string }[]} */
    let shipPackQueue = [];
    const MAX_BATCH_REMBG = 12;
    const PASTE_QUEUE_URL = "http://127.0.0.1:8787/api/paste-queue";
    const PASTE_GAP_MS = 1200;

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
    const detailActions = document.createElement("div");
    detailActions.className = "sc-moodboard-detail-actions";
    const detailDeleteBtn = document.createElement("button");
    detailDeleteBtn.type = "button";
    detailDeleteBtn.className = "sc-preview-btn sc-moodboard-detail-delete";
    detailDeleteBtn.setAttribute("aria-label", "Remove from moodboard");
    detailDeleteBtn.title = "Remove from moodboard";
    if (materialIcon) {
      detailDeleteBtn.appendChild(materialIcon("delete"));
    } else {
      detailDeleteBtn.textContent = "⌫";
    }
    const detailRestyleBtn = document.createElement("button");
    detailRestyleBtn.type = "button";
    detailRestyleBtn.className = "sc-preview-btn sc-moodboard-detail-restyle";
    detailRestyleBtn.setAttribute("aria-label", "Restyle in See & Capture");
    detailRestyleBtn.title = "Restyle";
    if (materialIcon) {
      detailRestyleBtn.appendChild(materialIcon("auto_fix"));
      const restyleLabel = document.createElement("span");
      restyleLabel.textContent = "Restyle";
      detailRestyleBtn.appendChild(restyleLabel);
    } else {
      detailRestyleBtn.textContent = "Restyle";
    }
    detailActions.appendChild(detailDeleteBtn);
    detailActions.appendChild(detailRestyleBtn);
    detailHeroWrap.appendChild(detailHero);
    detailHeroWrap.appendChild(detailActions);
    window.SeeCapturePromptLibraryUI?.attachTiltHover?.(detailHeroWrap, {
      maxTilt: 6,
      scale: 1.02,
    });
    detailStage.appendChild(detailBlur);
    detailStage.appendChild(detailHeroWrap);

    const styleCard = document.createElement("div");
    styleCard.className = "sc-style-card is-hidden";
    styleCard.setAttribute("role", "region");
    styleCard.setAttribute("aria-label", "Extracted visual style");
    const styleCardInner = document.createElement("button");
    styleCardInner.type = "button";
    styleCardInner.className = "sc-style-card-inner";
    styleCardInner.setAttribute("aria-expanded", "false");
    const styleCardBody = document.createElement("div");
    styleCardBody.className = "sc-style-card-body";
    const styleCardTitle = document.createElement("div");
    styleCardTitle.className = "sc-style-card-title";
    const styleCardTags = document.createElement("div");
    styleCardTags.className = "sc-style-card-tags";
    const styleCardDesc = document.createElement("p");
    styleCardDesc.className = "sc-style-card-desc";
    styleCardBody.appendChild(styleCardTitle);
    styleCardBody.appendChild(styleCardTags);
    styleCardBody.appendChild(styleCardDesc);
    styleCardInner.appendChild(styleCardBody);
    const styleCardActions = document.createElement("div");
    styleCardActions.className = "sc-style-card-actions";
    const styleCopyBtn = document.createElement("button");
    styleCopyBtn.type = "button";
    styleCopyBtn.className = "sc-preview-btn sc-style-card-copy";
    styleCopyBtn.textContent = "Copy style";
    styleCardActions.appendChild(styleCopyBtn);
    styleCard.appendChild(styleCardInner);
    styleCard.appendChild(styleCardActions);
    detailStage.appendChild(styleCard);
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

    const selectModeToggle = makeToggle("Select for AI copy", false, (on) => {
      selectMode = on;
      if (!selectMode) {
        selectedImageIds.clear();
        if (pendingCutouts.size) clearPendingCutouts();
      }
      applyLayout();
      syncCopyAiUi();
    });

    const copyAiBtn = document.createElement("button");
    copyAiBtn.type = "button";
    copyAiBtn.className = "sc-moodboard-generate sc-moodboard-copy-ai";
    copyAiBtn.textContent = "Copy for AI (Sequential)";
    copyAiBtn.disabled = true;
    copyAiBtn.title =
      "Select images, then copy once. Paste repeatedly (⌘V / Ctrl+V) in any field — each image lands ~1.2s apart.";

    const rembgBatchBtn = document.createElement("button");
    rembgBatchBtn.type = "button";
    rembgBatchBtn.className =
      "sc-moodboard-generate sc-moodboard-rembg-batch is-hidden";
    rembgBatchBtn.textContent = "Remove BG";
    rembgBatchBtn.title = "Remove background from selected tiles";
    rembgBatchBtn.disabled = true;

    const batchCutoutActions = document.createElement("div");
    batchCutoutActions.className =
      "sc-moodboard-batch-cutout-actions is-hidden";
    const replaceAllCutoutsBtn = document.createElement("button");
    replaceAllCutoutsBtn.type = "button";
    replaceAllCutoutsBtn.className =
      "sc-moodboard-export sc-moodboard-batch-replace";
    replaceAllCutoutsBtn.textContent = "Replace all";
    replaceAllCutoutsBtn.title = "Overwrite selected tiles with cutouts";
    const saveAllCutoutsBtn = document.createElement("button");
    saveAllCutoutsBtn.type = "button";
    saveAllCutoutsBtn.className =
      "sc-moodboard-generate sc-moodboard-batch-save";
    saveAllCutoutsBtn.textContent = "Save all";
    saveAllCutoutsBtn.title = "Add cutouts as new tiles (keep originals)";
    const discardAllCutoutsBtn = document.createElement("button");
    discardAllCutoutsBtn.type = "button";
    discardAllCutoutsBtn.className =
      "sc-moodboard-export sc-moodboard-batch-discard";
    discardAllCutoutsBtn.textContent = "Discard";
    discardAllCutoutsBtn.title = "Discard pending cutouts";
    batchCutoutActions.appendChild(replaceAllCutoutsBtn);
    batchCutoutActions.appendChild(saveAllCutoutsBtn);
    batchCutoutActions.appendChild(discardAllCutoutsBtn);

    const boardShipPackBtn = document.createElement("button");
    boardShipPackBtn.type = "button";
    boardShipPackBtn.className =
      "sc-moodboard-export sc-moodboard-ship-pack is-hidden";
    boardShipPackBtn.textContent = "Ship pack";
    boardShipPackBtn.title =
      "Download transparent PNG + 1:1 / 4:5 / 16:9 / favicon sizes";

    boardSide.appendChild(sideHead);
    boardSide.appendChild(generateBtn);
    boardSide.appendChild(exportBtn);
    boardSide.appendChild(selectModeToggle.row);
    boardSide.appendChild(copyAiBtn);
    boardSide.appendChild(rembgBatchBtn);
    boardSide.appendChild(batchCutoutActions);
    boardSide.appendChild(boardShipPackBtn);
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

    const getStyleBtn = document.createElement("button");
    getStyleBtn.type = "button";
    getStyleBtn.className = "sc-moodboard-export sc-moodboard-get-style";
    getStyleBtn.textContent = "Get style";
    getStyleBtn.title =
      "Extract reusable visual style (texture, lighting, art direction)—not a remake prompt";
    getStyleBtn.disabled = typeof requestGetStyle !== "function";

    const variationActions = document.createElement("div");
    variationActions.className =
      "sc-moodboard-variation-actions is-hidden";
    const saveVariationBtn = document.createElement("button");
    saveVariationBtn.type = "button";
    saveVariationBtn.className =
      "sc-moodboard-generate sc-moodboard-variation-save";
    saveVariationBtn.textContent = "Save";
    saveVariationBtn.title = "Add this variation to the board";
    const replaceVariationBtn = document.createElement("button");
    replaceVariationBtn.type = "button";
    replaceVariationBtn.className =
      "sc-moodboard-export sc-moodboard-variation-replace";
    replaceVariationBtn.textContent = "Replace";
    replaceVariationBtn.title = "Replace the current board image";
    const discardVariationBtn = document.createElement("button");
    discardVariationBtn.type = "button";
    discardVariationBtn.className =
      "sc-moodboard-export sc-moodboard-variation-discard";
    discardVariationBtn.textContent = "Discard";
    discardVariationBtn.title = "Discard this variation preview";
    const removeBgVariationBtn = document.createElement("button");
    removeBgVariationBtn.type = "button";
    removeBgVariationBtn.className =
      "sc-moodboard-export sc-moodboard-variation-rembg";
    removeBgVariationBtn.textContent = "Remove BG";
    removeBgVariationBtn.title =
      "Remove background from this variation, then Save or Replace";
    variationActions.appendChild(saveVariationBtn);
    variationActions.appendChild(replaceVariationBtn);
    variationActions.appendChild(discardVariationBtn);
    variationActions.appendChild(removeBgVariationBtn);

    const detailShipPackBtn = document.createElement("button");
    detailShipPackBtn.type = "button";
    detailShipPackBtn.className =
      "sc-moodboard-export sc-moodboard-ship-pack is-hidden";
    detailShipPackBtn.textContent = "Ship pack";
    detailShipPackBtn.title =
      "Download transparent PNG + 1:1 / 4:5 / 16:9 / favicon sizes";

    const detailHint = document.createElement("p");
    detailHint.className = "sc-moodboard-hint";
    detailHint.textContent = "Variation keeps layout and shifts the color theme.";

    detailSide.appendChild(detailHead);
    detailSide.appendChild(detailThumb);
    detailSide.appendChild(colorsLabel);
    detailSide.appendChild(colorsRow);
    detailSide.appendChild(variationBtn);
    detailSide.appendChild(getStyleBtn);
    detailSide.appendChild(variationActions);
    detailSide.appendChild(detailShipPackBtn);
    detailSide.appendChild(detailHint);

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

    function syncCopyAiUi() {
      const n = selectedImageIds.size;
      copyAiBtn.disabled = !selectMode || n < 1 || batchBusy;
      copyAiBtn.textContent =
        n > 0
          ? `Copy ${n} for AI (Sequential)`
          : "Copy for AI (Sequential)";
      selectModeToggle.label.textContent = selectMode
        ? n
          ? `Select for AI · ${n} selected`
          : "Select for AI copy"
        : "Select for AI copy";
      grid.classList.toggle("is-select-mode", selectMode);
      syncBatchCutoutUi();
    }

    function syncBatchCutoutUi() {
      const n = selectedImageIds.size;
      const hasPending = pendingCutouts.size > 0;
      const showRembg =
        selectMode && n > 0 && typeof requestRemoveBg === "function";
      rembgBatchBtn.classList.toggle("is-hidden", !showRembg && !batchBusy);
      rembgBatchBtn.disabled = batchBusy || !showRembg;
      if (batchBusy) {
        rembgBatchBtn.textContent = rembgBatchBtn.dataset.progress || "Removing…";
      } else {
        rembgBatchBtn.textContent =
          n > 0 ? `Remove BG (${Math.min(n, MAX_BATCH_REMBG)})` : "Remove BG";
      }
      batchCutoutActions.classList.toggle("is-hidden", !hasPending);
      replaceAllCutoutsBtn.disabled = batchBusy || !hasPending;
      saveAllCutoutsBtn.disabled = batchBusy || !hasPending;
      discardAllCutoutsBtn.disabled = batchBusy || !hasPending;
      if (hasPending) {
        replaceAllCutoutsBtn.textContent = `Replace all (${pendingCutouts.size})`;
        saveAllCutoutsBtn.textContent = `Save all (${pendingCutouts.size})`;
        hint.textContent =
          "Cutouts ready · Replace overwrites tiles · Save adds new ones";
      }
      syncShipPackUi();
    }

    function syncShipPackUi() {
      const n = shipPackQueue.length;
      const canShip =
        n > 0 &&
        typeof buildShipPack === "function" &&
        typeof downloadShipPack === "function";
      boardShipPackBtn.classList.toggle("is-hidden", !canShip);
      detailShipPackBtn.classList.toggle("is-hidden", !canShip);
      boardShipPackBtn.disabled = batchBusy || detailBusy || !canShip;
      detailShipPackBtn.disabled = batchBusy || detailBusy || !canShip;
      const label =
        n > 1 ? `Ship pack (${n})` : "Ship pack";
      boardShipPackBtn.textContent = label;
      detailShipPackBtn.textContent = label;
    }

    function queueShipPack(dataUrl, baseName) {
      if (!dataUrl) return;
      shipPackQueue = [
        {
          dataUrl,
          baseName: String(baseName || "asset").slice(0, 40),
        },
      ];
      syncShipPackUi();
    }

    function queueShipPackMany(items) {
      shipPackQueue = (Array.isArray(items) ? items : []).filter(
        (item) => item && item.dataUrl
      );
      syncShipPackUi();
    }

    function clearPendingCutouts() {
      pendingCutouts.clear();
      syncBatchCutoutUi();
    }

    async function runBatchRemoveBg() {
      if (batchBusy || !selectMode) return;
      if (typeof requestRemoveBg !== "function") {
        alert("Remove BG is unavailable in this view.");
        return;
      }
      const images = (current.images || []).filter((img) =>
        selectedImageIds.has(img.id)
      );
      if (!images.length) return;
      if (images.length > MAX_BATCH_REMBG) {
        notifyToast(
          `Max ${MAX_BATCH_REMBG} at once`,
          `Using first ${MAX_BATCH_REMBG} selected`
        );
      }
      const slice = images.slice(0, MAX_BATCH_REMBG);
      batchBusy = true;
      pendingCutouts.clear();
      syncBatchCutoutUi();
      const errors = [];
      try {
        for (let i = 0; i < slice.length; i += 1) {
          const img = slice[i];
          rembgBatchBtn.dataset.progress = `Removing ${i + 1}/${slice.length}…`;
          syncBatchCutoutUi();
          try {
            const result = await requestRemoveBg(img.dataUrl);
            const url =
              typeof result === "string"
                ? result
                : result?.imageDataUrl || null;
            if (!url) throw new Error("No image returned");
            pendingCutouts.set(img.id, url);
          } catch (err) {
            errors.push(
              `${img.id}: ${err?.message || String(err)}`
            );
          }
        }
        if (!pendingCutouts.size) {
          throw new Error(
            errors[0] || "Remove BG failed for all selected images"
          );
        }
        notifyToast(
          `${pendingCutouts.size} cutout(s) ready`,
          errors.length
            ? `${errors.length} failed · Replace or Save all`
            : "Replace or Save all"
        );
      } catch (err) {
        console.error(err);
        notifyToast("Remove BG failed", err?.message || "Try again");
        alert(err?.message || "Could not remove backgrounds");
      } finally {
        batchBusy = false;
        delete rembgBatchBtn.dataset.progress;
        syncBatchCutoutUi();
      }
    }

    async function commitBatchCutouts(mode) {
      if (batchBusy || !pendingCutouts.size || !current?.id) return;
      batchBusy = true;
      syncBatchCutoutUi();
      const entries = [...pendingCutouts.entries()];
      const shipped = [];
      try {
        for (let i = 0; i < entries.length; i += 1) {
          const [imageId, dataUrl] = entries[i];
          if (mode === "replace") {
            current = await window.SeeCaptureMoodboards.updateImage(
              current.id,
              imageId,
              dataUrl
            );
            shipped.push({ dataUrl, baseName: `cutout-${i + 1}` });
          } else {
            current = await window.SeeCaptureMoodboards.addImage(
              current.id,
              dataUrl
            );
            shipped.push({ dataUrl, baseName: `cutout-${i + 1}` });
          }
        }
        onBoardUpdated?.(current);
        clearPendingCutouts();
        selectedImageIds.clear();
        queueShipPackMany(shipped);
        applyLayout();
        notifyToast(
          mode === "replace" ? "Replaced on board" : "Saved to board",
          "Ship pack ready"
        );
      } catch (err) {
        console.error(err);
        alert(err?.message || "Could not commit cutouts");
      } finally {
        batchBusy = false;
        syncBatchCutoutUi();
      }
    }

    async function runShipPackDownloads() {
      if (
        !shipPackQueue.length ||
        typeof buildShipPack !== "function" ||
        typeof downloadShipPack !== "function"
      ) {
        return;
      }
      const queue = [...shipPackQueue];
      boardShipPackBtn.disabled = true;
      detailShipPackBtn.disabled = true;
      try {
        for (let i = 0; i < queue.length; i += 1) {
          const item = queue[i];
          const label =
            queue.length > 1
              ? `Pack ${i + 1}/${queue.length}`
              : "Building pack…";
          boardShipPackBtn.textContent = label;
          detailShipPackBtn.textContent = label;
          notifyToast(label, item.baseName || "asset");
          const files = await buildShipPack(
            item.dataUrl,
            item.baseName || `asset-${i + 1}`
          );
          await downloadShipPack(files, (done, total) => {
            const t = `Download ${done}/${total}`;
            boardShipPackBtn.textContent = t;
            detailShipPackBtn.textContent = t;
          });
        }
        notifyToast("Ship pack done", `${queue.length} asset(s)`);
      } catch (err) {
        console.error(err);
        alert(err?.message || "Could not download ship pack");
      } finally {
        syncShipPackUi();
      }
    }

    function notifyToast(title, sub) {
      if (typeof showToast === "function") showToast(title, sub);
      else if (typeof opts?.showToast === "function") opts.showToast(title, sub);
    }

    async function copySelectedForAiSequential() {
      const images = current.images || [];
      const ordered = images.filter((img) => selectedImageIds.has(img.id));
      if (!ordered.length) return;
      copyAiBtn.disabled = true;
      try {
        const response = await fetch(PASTE_QUEUE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            delayMs: PASTE_GAP_MS,
            images: ordered.map((img) => ({
              id: img.id,
              dataUrl: img.dataUrl,
            })),
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || `Paste queue failed (${response.status})`);
        }
        const count = data.count || ordered.length;
        const gapSec = ((data.delayMs || PASTE_GAP_MS) / 1000).toFixed(1);
        notifyToast(
          `${count} ready`,
          `Paste repeatedly in any field · ~${gapSec}s apart`
        );
      } catch (err) {
        console.error(err);
        notifyToast(
          "Paste queue failed",
          err?.message || "Is the local server running?"
        );
        alert(
          err?.message ||
            "Could not start paste queue. Start the local server (port 8787), and on Linux install xclip or wl-clipboard."
        );
      } finally {
        syncCopyAiUi();
      }
    }

    function applyLayout() {
      const images = current.images || [];
      const total = images.length;
      const useBento = total > 0 && total <= 8;
      const count = useBento ? total : Math.max(total, 1);
      const variants = useBento ? variantCountFor(count || 1) : 1;
      if (useBento) {
        patternIndex = ((patternIndex % variants) + variants) % variants;
      }
      subtitle.textContent = selectMode
        ? `${total} image(s) · ${selectedImageIds.size} selected`
        : `${total} image(s)`;
      if (!total) {
        hint.textContent = "Add more captures to grow this bento grid.";
      } else if (selectMode) {
        hint.textContent = "Click tiles to select · order follows board order";
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
      grid.classList.toggle("is-select-mode", selectMode);
      previewActions.classList.toggle("is-hidden", total === 0 || selectMode);
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
        if (selectedImageIds.has(img.id)) tile.classList.add("is-selected");
        if (useBento) {
          tile.style.gridArea = AREA_KEYS[index] || "a";
        } else {
          tile.style.gridArea = "";
        }
        tile.draggable = !selectMode;
        tile.dataset.imageId = img.id;

        const picture = document.createElement("img");
        picture.src = img.dataUrl;
        picture.alt = "";
        picture.draggable = false;
        tile.appendChild(picture);

        if (selectMode) {
          const check = document.createElement("span");
          check.className = "sc-moodboard-tile-check";
          check.setAttribute("aria-hidden", "true");
          tile.appendChild(check);
        }

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
          if (selectMode) {
            e.preventDefault();
            return;
          }
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
          if (selectMode) return;
          e.preventDefault();
          tile.classList.add("is-drop");
        });
        tile.addEventListener("dragleave", () => {
          tile.classList.remove("is-drop");
        });
        tile.addEventListener("drop", async (e) => {
          if (selectMode) return;
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
          if (selectMode) {
            if (selectedImageIds.has(img.id)) selectedImageIds.delete(img.id);
            else selectedImageIds.add(img.id);
            tile.classList.toggle("is-selected", selectedImageIds.has(img.id));
            syncCopyAiUi();
            subtitle.textContent = `${(current.images || []).length} image(s) · ${selectedImageIds.size} selected`;
            return;
          }
          openImageDetail(img);
        });

        grid.appendChild(tile);
      });
      syncCopyAiUi();
    }

    function setDetailBusy(busy) {
      detailBusy = Boolean(busy);
      variationBtn.disabled = detailBusy || !selectedDetailHex;
      variationBtn.classList.toggle("is-busy", detailBusy);
      variationBtn.textContent = detailBusy
        ? "Generating…"
        : "+ Generate variation";
      saveVariationBtn.disabled = detailBusy || !pendingVariationUrl;
      replaceVariationBtn.disabled = detailBusy || !pendingVariationUrl;
      discardVariationBtn.disabled = detailBusy || !pendingVariationUrl;
      removeBgVariationBtn.disabled =
        detailBusy ||
        !pendingVariationUrl ||
        typeof requestRemoveBg !== "function";
      colorsRow
        .querySelectorAll(".sc-mb-color-dot")
        .forEach((el) => {
          el.disabled = detailBusy;
        });
    }

    function syncVariationActions() {
      const hasPending = Boolean(pendingVariationUrl);
      variationActions.classList.toggle("is-hidden", !hasPending);
      saveVariationBtn.disabled = detailBusy || !hasPending;
      replaceVariationBtn.disabled = detailBusy || !hasPending;
      discardVariationBtn.disabled = detailBusy || !hasPending;
      removeBgVariationBtn.disabled =
        detailBusy ||
        !hasPending ||
        typeof requestRemoveBg !== "function";
      if (hasPending) {
        detailHint.textContent =
          "Save / Replace / Discard · Remove BG strips the backdrop, then Save or Replace.";
      } else if (selectedDetailHex) {
        detailHint.textContent =
          "Variation keeps layout and shifts the color theme.";
      }
    }

    function applyDetailPreview(dataUrl) {
      if (!dataUrl) return;
      detailHero.src = dataUrl;
      detailThumb.src = dataUrl;
      detailBlur.style.backgroundImage = `url("${dataUrl}")`;
    }

    function clearPendingVariation() {
      pendingVariationUrl = null;
      syncVariationActions();
    }

    function formatStyleCopyText(payload) {
      if (!payload) return "";
      const tags = Array.isArray(payload.tags) ? payload.tags.join(", ") : "";
      return [
        payload.title || "Style",
        tags ? `Tags: ${tags}` : "",
        payload.description || "",
      ]
        .filter(Boolean)
        .join("\n\n");
    }

    function renderStyleCard(payload) {
      stylePayload = payload || null;
      if (!payload) {
        styleCard.classList.add("is-hidden");
        styleCard.classList.remove("is-expanded");
        styleExpanded = false;
        styleCardInner.setAttribute("aria-expanded", "false");
        return;
      }
      styleCardTitle.textContent = payload.title || "Style";
      styleCardTags.innerHTML = "";
      (payload.tags || []).forEach((tag) => {
        const chip = document.createElement("span");
        chip.className = "sc-style-card-tag";
        chip.textContent = tag;
        styleCardTags.appendChild(chip);
      });
      styleCardDesc.textContent = payload.description || "";
      styleCard.classList.remove("is-hidden");
      styleCard.classList.toggle("is-expanded", styleExpanded);
      styleCardInner.setAttribute(
        "aria-expanded",
        styleExpanded ? "true" : "false"
      );
    }

    function clearStyleCard() {
      stylePayload = null;
      styleExpanded = false;
      styleBusy = false;
      getStyleBtn.disabled = typeof requestGetStyle !== "function";
      getStyleBtn.textContent = "Get style";
      renderStyleCard(null);
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
      detailSourceImage = { ...img };
      pendingVariationUrl = null;
      selectedDetailHex = null;
      clearStyleCard();
      applyDetailPreview(img.dataUrl);
      canvas.classList.add("is-hidden");
      previewActions.classList.add("is-hidden");
      detailStage.classList.remove("is-hidden");
      boardSide.classList.add("is-hidden");
      detailSide.classList.remove("is-hidden");
      shell.classList.add("is-detail");
      colorsRow.innerHTML = "";
      colorsRow.textContent = "Extracting colors…";
      variationBtn.disabled = true;
      syncVariationActions();
      syncShipPackUi();
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
      detailSourceImage = null;
      pendingVariationUrl = null;
      selectedDetailHex = null;
      detailBusy = false;
      clearStyleCard();
      detailHero.removeAttribute("src");
      detailThumb.removeAttribute("src");
      detailBlur.style.backgroundImage = "";
      detailStage.classList.add("is-hidden");
      boardSide.classList.remove("is-hidden");
      detailSide.classList.add("is-hidden");
      shell.classList.remove("is-detail");
      canvas.classList.remove("is-hidden");
      syncVariationActions();
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
        if (openPreview) openPreview(dataUrl, { theme: gridTheme });
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
    detailDeleteBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (!detailImage?.id || detailBusy) return;
      if (!confirm("Remove this image from the moodboard?")) return;
      try {
        current = await window.SeeCaptureMoodboards.removeImage(
          current.id,
          detailImage.id
        );
        onBoardUpdated?.(current);
        closeImageDetail();
        applyLayout();
      } catch (err) {
        console.error(err);
        alert(err?.message || "Could not remove image");
      }
    });
    detailRestyleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (detailBusy) return;
      if (typeof onRestyleImage !== "function") {
        alert("Restyle is unavailable in this view.");
        return;
      }
      const sourceUrl =
        pendingVariationUrl ||
        detailHero.src ||
        detailSourceImage?.dataUrl ||
        detailImage?.dataUrl;
      if (!sourceUrl) return;
      onRestyleImage(sourceUrl);
    });
    detailRestyleBtn.disabled = typeof onRestyleImage !== "function";
    variationBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (detailBusy || !detailSourceImage?.dataUrl || !selectedDetailHex) {
        return;
      }
      if (!requestVariation) {
        alert("Variation is unavailable in this view.");
        return;
      }
      setDetailBusy(true);
      try {
        const sourceUrl = pendingVariationUrl || detailSourceImage.dataUrl;
        const data = await requestVariation({
          imageDataUrl: sourceUrl,
          hex: selectedDetailHex,
        });
        const nextUrl = data?.imageDataUrl;
        if (!nextUrl) throw new Error("No image returned.");
        pendingVariationUrl = nextUrl;
        applyDetailPreview(nextUrl);
        syncVariationActions();
        try {
          const hexes = extractColors ? await extractColors(nextUrl) : [];
          renderDetailColors(hexes);
        } catch (_err) {
          /* keep prior palette */
        }
        syncVariationActions();
      } catch (err) {
        console.error(err);
        alert(err?.message || "Could not generate variation.");
      } finally {
        setDetailBusy(false);
      }
    });

    getStyleBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (detailBusy || styleBusy) return;
      if (typeof requestGetStyle !== "function") {
        alert("Get style is unavailable in this view.");
        return;
      }
      const sourceUrl =
        pendingVariationUrl ||
        detailHero.src ||
        detailSourceImage?.dataUrl ||
        detailImage?.dataUrl;
      if (!sourceUrl) return;
      styleBusy = true;
      getStyleBtn.disabled = true;
      getStyleBtn.textContent = "Reading style…";
      try {
        const data = await requestGetStyle(sourceUrl);
        styleExpanded = false;
        renderStyleCard(data);
        notifyToast(data.title || "Style ready", "Tap the card to expand · Copy style");
      } catch (err) {
        console.error(err);
        alert(err?.message || "Could not extract style");
      } finally {
        styleBusy = false;
        getStyleBtn.disabled = typeof requestGetStyle !== "function";
        getStyleBtn.textContent = "Get style";
      }
    });

    styleCardInner.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!stylePayload) return;
      styleExpanded = !styleExpanded;
      styleCard.classList.toggle("is-expanded", styleExpanded);
      styleCardInner.setAttribute(
        "aria-expanded",
        styleExpanded ? "true" : "false"
      );
    });

    styleCopyBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const text = formatStyleCopyText(stylePayload);
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        styleCopyBtn.textContent = "Copied";
        notifyToast("Style copied", stylePayload?.title || "");
        setTimeout(() => {
          styleCopyBtn.textContent = "Copy style";
        }, 1200);
      } catch (_err) {
        alert("Could not copy automatically — select the text manually.");
      }
    });

    saveVariationBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (detailBusy || !pendingVariationUrl || !current?.id) return;
      setDetailBusy(true);
      try {
        const savedUrl = pendingVariationUrl;
        current = await window.SeeCaptureMoodboards.addImage(
          current.id,
          pendingVariationUrl
        );
        onBoardUpdated?.(current);
        const images = current.images || [];
        const newest = images[images.length - 1];
        clearPendingVariation();
        queueShipPack(savedUrl, "variation");
        applyLayout();
        if (newest) {
          await openImageDetail(newest);
        }
        syncShipPackUi();
      } catch (err) {
        console.error(err);
        alert(err?.message || "Could not save variation");
      } finally {
        setDetailBusy(false);
      }
    });

    replaceVariationBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (
        detailBusy ||
        !pendingVariationUrl ||
        !current?.id ||
        !detailImage?.id
      ) {
        return;
      }
      setDetailBusy(true);
      try {
        const savedUrl = pendingVariationUrl;
        current = await window.SeeCaptureMoodboards.updateImage(
          current.id,
          detailImage.id,
          pendingVariationUrl
        );
        onBoardUpdated?.(current);
        const updated = (current.images || []).find(
          (img) => img && img.id === detailImage.id
        );
        clearPendingVariation();
        queueShipPack(savedUrl, "variation");
        applyLayout();
        if (updated) {
          await openImageDetail(updated);
        }
        syncShipPackUi();
      } catch (err) {
        console.error(err);
        alert(err?.message || "Could not replace image");
      } finally {
        setDetailBusy(false);
      }
    });

    discardVariationBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (detailBusy || !pendingVariationUrl) return;
      clearPendingVariation();
      const originalUrl = detailSourceImage?.dataUrl || detailImage?.dataUrl;
      if (originalUrl) applyDetailPreview(originalUrl);
      detailHint.textContent =
        "Variation keeps layout and shifts the color theme.";
      if (originalUrl && extractColors) {
        extractColors(originalUrl)
          .then((hexes) => {
            if (!detailImage) return;
            renderDetailColors(hexes);
            syncVariationActions();
          })
          .catch(() => {});
      } else {
        syncVariationActions();
      }
    });

    removeBgVariationBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (detailBusy || !pendingVariationUrl) return;
      if (typeof requestRemoveBg !== "function") {
        alert("Remove BG is unavailable in this view.");
        return;
      }
      setDetailBusy(true);
      removeBgVariationBtn.textContent = "Removing…";
      try {
        const result = await requestRemoveBg(pendingVariationUrl);
        const nextUrl =
          typeof result === "string"
            ? result
            : result?.imageDataUrl || null;
        if (!nextUrl) throw new Error("No image returned.");
        pendingVariationUrl = nextUrl;
        applyDetailPreview(nextUrl);
        syncVariationActions();
        try {
          const hexes = extractColors ? await extractColors(nextUrl) : [];
          renderDetailColors(hexes);
        } catch (_err) {
          /* keep prior palette */
        }
        syncVariationActions();
        notifyToast("Background removed", "Save or Replace when ready");
      } catch (err) {
        console.error(err);
        alert(err?.message || "Could not remove background");
      } finally {
        removeBgVariationBtn.textContent = "Remove BG";
        setDetailBusy(false);
      }
    });

    copyAiBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      copySelectedForAiSequential();
    });
    rembgBatchBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      runBatchRemoveBg();
    });
    replaceAllCutoutsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      commitBatchCutouts("replace");
    });
    saveAllCutoutsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      commitBatchCutouts("save");
    });
    discardAllCutoutsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (batchBusy) return;
      clearPendingCutouts();
      notifyToast("Discarded", "Cutouts cleared");
      applyLayout();
    });
    boardShipPackBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      runShipPackDownloads();
    });
    detailShipPackBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      runShipPackDownloads();
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
      isDetailOpen: () => Boolean(detailImage),
      closeDetail: () => {
        if (detailImage) closeImageDetail();
      },
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
