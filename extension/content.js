(() => {
  if (window.__SEE_AND_CAPTURE_LOADED__) {
    return;
  }
  window.__SEE_AND_CAPTURE_LOADED__ = true;

  const HOST_ID = "see-and-capture-host";

  let capturing = false;
  let modalOpen = false;
  let activeHost = null;
  let shadowRoot = null;
  let croppedDataUrl = null;
  let resultDataUrl = null;
  let inFlight = false;
  let pageContext = {};
  let contextEnabled = false;
  let selectedAssetIds = [];
  let assetsTab = "images"; // images | palettes
  let assetsListEl = null;
  let variantsEl = null;
  let variantsHintEl = null;
  let variantsSectionRef = null;
  let footerRef = null;
  let rightWrapRef = null;
  let globalOptionsRef = null;

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "START_CAPTURE") {
      beginCapture();
    }
  });

  function beginCapture() {
    if (capturing || modalOpen) return;
    capturing = true;
    ensureHost();
    showCaptureOverlay();
  }

  function ensureHost() {
    let host = document.getElementById(HOST_ID);
    if (host && !shadowRoot) {
      host.remove();
      host = null;
    }
    if (!host) {
      host = document.createElement("div");
      host.id = HOST_ID;
      host.style.all = "initial";
      host.style.position = "fixed";
      host.style.inset = "0";
      host.style.zIndex = "2147483647";
      document.documentElement.appendChild(host);
      shadowRoot = host.attachShadow({ mode: "closed" });
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = chrome.runtime.getURL("content.css");
      shadowRoot.appendChild(link);
    }
    activeHost = host;
  }

  function clearShadowUi() {
    if (!shadowRoot) return;
    [...shadowRoot.children].forEach((el) => {
      if (el.tagName !== "LINK") el.remove();
    });
  }

  function teardownHost() {
    clearShadowUi();
    if (activeHost) {
      activeHost.remove();
      activeHost = null;
      shadowRoot = null;
    }
    capturing = false;
    modalOpen = false;
    croppedDataUrl = null;
    resultDataUrl = null;
    inFlight = false;
    pageContext = {};
    contextEnabled = false;
    selectedAssetIds = [];
    assetsTab = "images";
    assetsListEl = null;
    variantsEl = null;
    variantsHintEl = null;
    rightWrapRef = null;
    globalOptionsRef = null;
  }

  function showCaptureOverlay() {
    clearShadowUi();

    const hint = document.createElement("div");
    hint.className = "sc-hint";
    hint.textContent = "Drag to select an area · Esc to cancel";

    const overlay = document.createElement("div");
    overlay.className = "sc-overlay";

    const selection = document.createElement("div");
    selection.className = "sc-selection";
    selection.style.display = "none";
    overlay.appendChild(selection);

    shadowRoot.appendChild(hint);
    shadowRoot.appendChild(overlay);

    let startX = 0;
    let startY = 0;
    let dragging = false;

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        cleanupListeners();
        teardownHost();
      }
    };

    const onMouseDown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      selection.style.display = "block";
      updateSelection(startX, startY, startX, startY);
    };

    const onMouseMove = (e) => {
      if (!dragging) return;
      updateSelection(startX, startY, e.clientX, e.clientY);
    };

    const onMouseUp = async (e) => {
      if (!dragging) return;
      dragging = false;
      const rect = normalizeRect(startX, startY, e.clientX, e.clientY);
      cleanupListeners();

      if (rect.width < 8 || rect.height < 8) {
        teardownHost();
        return;
      }

      try {
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        if (window.SeeCapturePayload?.extractDOMContext) {
          pageContext = window.SeeCapturePayload.extractDOMContext(cx, cy);
        } else {
          pageContext = {};
        }

        hint.textContent = "Capturing…";
        overlay.style.cursor = "wait";
        const dataUrl = await requestTabCapture();
        croppedDataUrl = await cropDataUrl(dataUrl, rect);
        capturing = false;
        showModal(croppedDataUrl);
      } catch (err) {
        console.error(err);
        alert(
          "See & Capture could not capture this tab.\n" +
            (err?.message || String(err))
        );
        teardownHost();
      }
    };

    function updateSelection(x1, y1, x2, y2) {
      const r = normalizeRect(x1, y1, x2, y2);
      selection.style.left = `${r.left}px`;
      selection.style.top = `${r.top}px`;
      selection.style.width = `${r.width}px`;
      selection.style.height = `${r.height}px`;
    }

    function cleanupListeners() {
      window.removeEventListener("keydown", onKeyDown, true);
      overlay.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove, true);
      window.removeEventListener("mouseup", onMouseUp, true);
    }

    window.addEventListener("keydown", onKeyDown, true);
    overlay.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove, true);
    window.addEventListener("mouseup", onMouseUp, true);
  }

  function normalizeRect(x1, y1, x2, y2) {
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);
    return { left, top, width, height };
  }

  function requestTabCapture() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "CAPTURE_TAB" }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response?.ok || !response.dataUrl) {
          reject(new Error(response?.error || "Capture failed"));
          return;
        }
        resolve(response.dataUrl);
      });
    });
  }

  function cropDataUrl(dataUrl, cssRect) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const dpr = window.devicePixelRatio || 1;
        const sx = Math.round(cssRect.left * dpr);
        const sy = Math.round(cssRect.top * dpr);
        const sw = Math.round(cssRect.width * dpr);
        const sh = Math.round(cssRect.height * dpr);

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, sw);
        canvas.height = Math.max(1, sh);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas unavailable"));
          return;
        }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => reject(new Error("Failed to load screenshot"));
      img.src = dataUrl;
    });
  }

  function showModal(captureDataUrl) {
    modalOpen = true;
    resultDataUrl = null;
    selectedAssetIds = [];
    contextEnabled = false;
    assetsTab = "images";
    clearShadowUi();

    const root = document.createElement("div");
    root.className = "sc-root";

    const modal = document.createElement("div");
    modal.className = "sc-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-label", "See & Capture");

    const header = document.createElement("div");
    header.className = "sc-header";

    const title = document.createElement("h2");
    title.className = "sc-title";
    title.textContent = "See & Capture";

    const contextLabel = document.createElement("label");
    contextLabel.className = "sc-context-toggle";
    const contextCheck = document.createElement("input");
    contextCheck.type = "checkbox";
    contextCheck.checked = false;
    contextCheck.addEventListener("change", () => {
      contextEnabled = Boolean(contextCheck.checked);
    });
    const contextText = document.createElement("span");
    contextText.textContent = "Use page text";
    const contextTip = document.createElement("button");
    contextTip.type = "button";
    contextTip.className = "sc-context-tip";
    contextTip.setAttribute("aria-label", "About Use page text");
    contextTip.textContent = "ⓘ";
    const tipBubble = document.createElement("span");
    tipBubble.className = "sc-context-tip-bubble";
    tipBubble.setAttribute("role", "tooltip");
    tipBubble.textContent =
      "When on, we read the page title and nearby words so AI knows what you cropped. Off = image only.";
    contextTip.appendChild(tipBubble);
    contextLabel.appendChild(contextCheck);
    contextLabel.appendChild(contextText);
    contextLabel.appendChild(contextTip);

    const saveWrap = document.createElement("div");
    saveWrap.className = "sc-save-wrap";
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "sc-save-btn";
    saveBtn.innerHTML =
      '<span>Select folder to save</span><span class="sc-save-caret">▾</span>';
    saveBtn.addEventListener("click", () => saveImageToComputer(saveBtn));
    saveWrap.appendChild(saveBtn);

    const closeBtn = document.createElement("button");
    closeBtn.className = "sc-close";
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", () => teardownHost());

    header.appendChild(title);
    header.appendChild(contextLabel);
    header.appendChild(saveWrap);
    header.appendChild(closeBtn);

    const body = document.createElement("div");
    body.className = "sc-body";

    const left = document.createElement("div");
    left.className = "sc-pane";
    const leftLabel = document.createElement("p");
    leftLabel.className = "sc-pane-label";
    leftLabel.textContent = "Capture";
    const leftWrap = document.createElement("div");
    leftWrap.className = "sc-image-wrap";
    const leftImg = document.createElement("img");
    leftImg.alt = "Captured region";
    leftImg.src = captureDataUrl;
    leftWrap.appendChild(leftImg);
    left.appendChild(leftLabel);
    left.appendChild(leftWrap);

    const right = document.createElement("div");
    right.className = "sc-pane";
    const rightLabel = document.createElement("p");
    rightLabel.className = "sc-pane-label";
    rightLabel.textContent = "Result";
    const rightWrap = document.createElement("div");
    rightWrap.className = "sc-image-wrap is-result";
    rightWrapRef = rightWrap;
    const placeholder = document.createElement("div");
    placeholder.className = "sc-placeholder";
    placeholder.textContent = "Pick an option below";
    rightWrap.appendChild(placeholder);
    right.appendChild(rightLabel);
    right.appendChild(rightWrap);

    body.appendChild(left);
    body.appendChild(right);

    const assetsStrip = document.createElement("div");
    assetsStrip.className = "sc-assets";

    const assetsHeader = document.createElement("div");
    assetsHeader.className = "sc-assets-header";
    const assetsTitle = document.createElement("span");
    assetsTitle.className = "sc-assets-title";
    assetsTitle.textContent = "Assets";
    assetsHeader.appendChild(assetsTitle);

    const tabs = document.createElement("div");
    tabs.className = "sc-assets-tabs";
    const imagesTab = document.createElement("button");
    imagesTab.type = "button";
    imagesTab.className = "sc-assets-tab is-active";
    imagesTab.textContent = "Images";
    const palettesTab = document.createElement("button");
    palettesTab.type = "button";
    palettesTab.className = "sc-assets-tab";
    palettesTab.textContent = "Palettes";
    tabs.appendChild(imagesTab);
    tabs.appendChild(palettesTab);

    const assetsActions = document.createElement("div");
    assetsActions.className = "sc-assets-actions";
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/png,image/webp,image/jpeg";
    fileInput.hidden = true;
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "sc-assets-btn";
    addBtn.textContent = "Add image";
    addBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = "";
      if (!file) return;
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const name = file.name.replace(/\.[^.]+$/, "") || "asset";
        await window.SeeCaptureAssets.saveAsset({
          name,
          dataUrl,
          mime: file.type || "image/png",
          kind: "image",
        });
        assetsTab = "images";
        setTabActive();
        await renderAssetList();
      } catch (err) {
        alert(err?.message || "Could not save asset");
      }
    });

    const saveCaptureBtn = document.createElement("button");
    saveCaptureBtn.type = "button";
    saveCaptureBtn.className = "sc-assets-btn";
    saveCaptureBtn.textContent = "Save capture";
    saveCaptureBtn.addEventListener("click", async () => {
      if (!croppedDataUrl) return;
      try {
        await window.SeeCaptureAssets.saveAsset({
          name: `capture-${Date.now()}`,
          dataUrl: croppedDataUrl,
          mime: "image/png",
          kind: "image",
        });
        assetsTab = "images";
        setTabActive();
        await renderAssetList();
      } catch (err) {
        alert(err?.message || "Could not save capture as asset");
      }
    });

    assetsActions.appendChild(addBtn);
    assetsActions.appendChild(saveCaptureBtn);
    assetsActions.appendChild(fileInput);

    assetsListEl = document.createElement("div");
    assetsListEl.className = "sc-assets-list";

    function setTabActive() {
      imagesTab.classList.toggle("is-active", assetsTab === "images");
      palettesTab.classList.toggle("is-active", assetsTab === "palettes");
      assetsActions.style.display = assetsTab === "images" ? "flex" : "none";
    }

    imagesTab.addEventListener("click", () => {
      assetsTab = "images";
      setTabActive();
      renderAssetList();
    });
    palettesTab.addEventListener("click", () => {
      assetsTab = "palettes";
      setTabActive();
      renderAssetList();
    });

    assetsStrip.appendChild(assetsHeader);
    assetsStrip.appendChild(tabs);
    assetsStrip.appendChild(assetsActions);
    assetsStrip.appendChild(assetsListEl);

    const variantsSection = document.createElement("div");
    variantsSection.className = "sc-variants is-hidden";
    variantsSectionRef = variantsSection;
    const variantsTitle = document.createElement("div");
    variantsTitle.className = "sc-variants-title";
    variantsTitle.textContent = "Variants with your assets";
    variantsHintEl = document.createElement("p");
    variantsHintEl.className = "sc-variants-hint";
    variantsHintEl.textContent = "Select an asset for more options";
    variantsEl = document.createElement("div");
    variantsEl.className = "sc-variants-options";

    const variantDefs = [
      { id: "place-sticker", label: "Place sticker", needs: "image" },
      {
        id: "replace-with-asset",
        label: "Replace with your asset",
        needs: "image",
      },
      { id: "apply-palette", label: "Apply palette", needs: "palette" },
      { id: "green-with-asset", label: "Green + asset", needs: "any" },
      { id: "bw-with-asset", label: "B&W + asset", needs: "any" },
    ];

    variantDefs.forEach((def) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sc-option sc-variant-btn";
      btn.textContent = def.label;
      btn.dataset.variantId = def.id;
      btn.dataset.needs = def.needs;
      btn.disabled = true;
      btn.hidden = true;
      btn.addEventListener("click", () =>
        runVariant(def.id, btn, rightWrap, variantsEl)
      );
      variantsEl.appendChild(btn);
    });

    variantsSection.appendChild(variantsTitle);
    variantsSection.appendChild(variantsHintEl);
    variantsSection.appendChild(variantsEl);

    const footer = document.createElement("div");
    footer.className = "sc-footer";
    footerRef = footer;
    const options = document.createElement("div");
    options.className = "sc-options";
    globalOptionsRef = options;

    const presets =
      typeof SEE_CAPTURE_PRESETS !== "undefined" ? SEE_CAPTURE_PRESETS : [];

    presets.forEach((preset) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sc-option";
      btn.textContent = preset.label;
      btn.dataset.presetId = preset.id;
      btn.addEventListener("click", () =>
        runPreset(preset.id, btn, rightWrap, options, { useAssets: false })
      );
      options.appendChild(btn);
    });

    footer.appendChild(options);
    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(assetsStrip);
    modal.appendChild(variantsSection);
    modal.appendChild(footer);
    root.appendChild(modal);
    shadowRoot.appendChild(root);

    setTabActive();
    renderAssetList().catch((err) => console.error(err));

    const onKeyDown = (e) => {
      if (e.key === "Escape" && !inFlight) {
        window.removeEventListener("keydown", onKeyDown, true);
        teardownHost();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);

    root.addEventListener("click", (e) => {
      if (e.target === root && !inFlight) teardownHost();
    });
  }

  async function renderAssetList() {
    if (!assetsListEl) return;
    if (!window.SeeCaptureAssets?.listAssets) {
      assetsListEl.textContent = "Assets unavailable";
      return;
    }

    const kind = assetsTab === "palettes" ? "palette" : "image";
    const assets = await window.SeeCaptureAssets.listAssets(kind);
    assetsListEl.innerHTML = "";

    if (!assets.length) {
      const empty = document.createElement("div");
      empty.className = "sc-assets-empty";
      empty.textContent =
        kind === "palette" ? "No palettes" : "No images yet — Add or Save capture";
      assetsListEl.appendChild(empty);
      updateVariantsState();
      return;
    }

    assets.forEach((asset) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "sc-asset-thumb";
      if (selectedAssetIds.includes(asset.id)) {
        item.classList.add("is-selected");
      }
      item.title = asset.name || asset.id;

      if (asset.kind === "palette") {
        item.classList.add("is-palette");
        const swatches = document.createElement("div");
        swatches.className = "sc-palette-swatches";
        (asset.colors || []).slice(0, 4).forEach((color) => {
          const sw = document.createElement("span");
          sw.className = "sc-palette-swatch";
          sw.style.background = color;
          swatches.appendChild(sw);
        });
        const name = document.createElement("span");
        name.className = "sc-palette-name";
        name.textContent = asset.name || "Palette";
        item.appendChild(swatches);
        item.appendChild(name);
      } else {
        const img = document.createElement("img");
        img.src = asset.dataUrl;
        img.alt = asset.name || "asset";
        item.appendChild(img);

        const del = document.createElement("span");
        del.className = "sc-asset-del";
        del.textContent = "×";
        del.title = "Delete";
        del.addEventListener("click", async (e) => {
          e.stopPropagation();
          try {
            await window.SeeCaptureAssets.deleteAsset(asset.id);
            selectedAssetIds = selectedAssetIds.filter((id) => id !== asset.id);
            await renderAssetList();
          } catch (err) {
            alert(err?.message || "Delete failed");
          }
        });
        item.appendChild(del);
      }

      item.addEventListener("click", () => {
        if (selectedAssetIds.includes(asset.id)) {
          selectedAssetIds = selectedAssetIds.filter((id) => id !== asset.id);
        } else {
          selectedAssetIds = [...selectedAssetIds, asset.id];
        }
        renderAssetList();
      });

      assetsListEl.appendChild(item);
    });

    updateVariantsState();
  }

  async function updateVariantsState() {
    if (!variantsEl || !variantsHintEl) return;
    const selected =
      selectedAssetIds.length > 0 && window.SeeCaptureAssets?.getAssetsByIds
        ? await window.SeeCaptureAssets.getAssetsByIds(selectedAssetIds)
        : [];
    const hasImage = selected.some((a) => a.kind !== "palette");
    const hasPalette = selected.some((a) => a.kind === "palette");
    const hasAny = selected.length > 0;

    // Discover-on-action: globals when nothing selected; asset variants otherwise.
    if (footerRef) {
      footerRef.classList.toggle("is-hidden", hasAny);
    }
    if (variantsSectionRef) {
      variantsSectionRef.classList.toggle("is-hidden", !hasAny);
    }

    variantsHintEl.textContent = hasAny
      ? "Click a variant to apply your selected asset(s)"
      : "Select an asset for more options";

    [...variantsEl.querySelectorAll(".sc-variant-btn")].forEach((btn) => {
      const needs = btn.dataset.needs;
      let visible = false;
      let enabled = false;
      if (needs === "image") {
        visible = hasImage;
        enabled = hasImage;
      } else if (needs === "palette") {
        visible = hasPalette;
        enabled = hasPalette;
      } else {
        visible = hasAny;
        enabled = hasAny;
      }
      btn.hidden = !visible;
      btn.disabled = !enabled || inFlight;
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  }

  async function saveImageToComputer(button) {
    const dataUrl = resultDataUrl || croppedDataUrl;
    if (!dataUrl) {
      alert("Nothing to save yet. Capture an area first.");
      return;
    }

    const previous = button.innerHTML;
    button.disabled = true;
    button.innerHTML = "<span>Saving…</span>";

    try {
      const blob = await dataUrlToBlob(dataUrl);
      const fileName = `see-and-capture-${Date.now()}.png`;

      if (typeof window.showSaveFilePicker === "function") {
        const handle = await window.showSaveFilePicker({
          suggestedName: fileName,
          types: [
            {
              description: "PNG image",
              accept: { "image/png": [".png"] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else if (typeof window.showDirectoryPicker === "function") {
        const dir = await window.showDirectoryPicker({ mode: "readwrite" });
        const fileHandle = await dir.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = fileName;
        link.click();
      }
    } catch (err) {
      if (err && err.name === "AbortError") {
        // cancelled
      } else {
        console.error(err);
        alert(err?.message || "Could not save the image.");
      }
    } finally {
      button.disabled = false;
      button.innerHTML = previous;
    }
  }

  async function dataUrlToBlob(dataUrl) {
    const response = await fetch(dataUrl);
    return response.blob();
  }

  function showResult(resultWrap, dataUrl) {
    resultWrap.innerHTML = "";
    resultWrap.classList.add("is-result");
    const img = document.createElement("img");
    img.alt = "Generated result";
    img.src = dataUrl;
    const previewBtn = document.createElement("button");
    previewBtn.type = "button";
    previewBtn.className = "sc-preview-btn";
    previewBtn.textContent = "Preview";
    previewBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openImagePreview(dataUrl);
    });
    resultWrap.appendChild(img);
    resultWrap.appendChild(previewBtn);
    resultDataUrl = dataUrl;
  }

  function openImagePreview(dataUrl) {
    if (!shadowRoot || !dataUrl) return;
    const existing = shadowRoot.querySelector(".sc-lightbox");
    if (existing) existing.remove();

    const lightbox = document.createElement("div");
    lightbox.className = "sc-lightbox";
    lightbox.setAttribute("role", "dialog");
    lightbox.setAttribute("aria-label", "Image preview");

    const inner = document.createElement("div");
    inner.className = "sc-lightbox-inner";

    const img = document.createElement("img");
    img.alt = "Full preview";
    img.src = dataUrl;

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "sc-lightbox-close";
    closeBtn.setAttribute("aria-label", "Close preview");
    closeBtn.textContent = "×";

    const close = () => {
      window.removeEventListener("keydown", onKey, true);
      lightbox.remove();
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };

    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      close();
    });
    inner.addEventListener("click", (e) => e.stopPropagation());
    lightbox.addEventListener("click", close);
    window.addEventListener("keydown", onKey, true);

    inner.appendChild(img);
    inner.appendChild(closeBtn);
    lightbox.appendChild(inner);
    shadowRoot.appendChild(lightbox);
  }

  function showWorking(resultWrap) {
    resultWrap.innerHTML = "";
    const status = document.createElement("div");
    status.className = "sc-status";
    status.innerHTML = '<div class="sc-spinner"></div>Working…';
    resultWrap.appendChild(status);
  }

  function showError(resultWrap, message) {
    resultWrap.innerHTML = "";
    const statusErr = document.createElement("div");
    statusErr.className = "sc-status is-error";
    statusErr.textContent = message;
    resultWrap.appendChild(statusErr);
  }

  async function runPreset(presetId, button, resultWrap, optionsEl, opts) {
    if (inFlight || !croppedDataUrl) return;
    const useAssets = Boolean(opts && opts.useAssets);
    inFlight = true;
    updateVariantsState();

    [...optionsEl.querySelectorAll(".sc-option")].forEach((el) => {
      el.disabled = true;
      el.classList.toggle("is-active", el === button);
    });
    if (globalOptionsRef && optionsEl !== globalOptionsRef) {
      [...globalOptionsRef.querySelectorAll(".sc-option")].forEach((el) => {
        el.disabled = true;
      });
    }

    showWorking(resultWrap);

    try {
      const data = await requestEdit(presetId, { useAssets });
      showResult(resultWrap, data.imageDataUrl);
      chrome.runtime.sendMessage({
        type: "SAVE_RESULT",
        presetId,
        captureDataUrl: croppedDataUrl,
        resultDataUrl: data.imageDataUrl,
      });
    } catch (err) {
      showError(
        resultWrap,
        err?.message ||
          "Request failed. Is the local server running on port 8787?"
      );
    } finally {
      inFlight = false;
      [...optionsEl.querySelectorAll(".sc-option")].forEach((el) => {
        el.disabled = false;
      });
      if (globalOptionsRef && optionsEl !== globalOptionsRef) {
        [...globalOptionsRef.querySelectorAll(".sc-option")].forEach((el) => {
          el.disabled = false;
        });
      }
      updateVariantsState();
    }
  }

  async function runVariant(variantId, button, resultWrap, optionsEl) {
    if (inFlight || !croppedDataUrl || selectedAssetIds.length === 0) return;
    inFlight = true;
    updateVariantsState();

    [...optionsEl.querySelectorAll(".sc-option")].forEach((el) => {
      el.disabled = true;
      el.classList.toggle("is-active", el === button);
    });
    if (globalOptionsRef) {
      [...globalOptionsRef.querySelectorAll(".sc-option")].forEach((el) => {
        el.disabled = true;
      });
    }

    showWorking(resultWrap);

    try {
      const assets = await window.SeeCaptureAssets.getAssetsByIds(
        selectedAssetIds
      );
      let image = croppedDataUrl;

      if (variantId === "place-sticker") {
        const images = assets.filter((a) => a.kind !== "palette" && a.dataUrl);
        if (!images.length) throw new Error("Select an image asset first");
        image = await window.SeeCaptureBlend.compositeAssetsOntoCapture(
          croppedDataUrl,
          images
        );
        showResult(resultWrap, image);
      } else if (variantId === "replace-with-asset") {
        const images = assets.filter((a) => a.kind !== "palette" && a.dataUrl);
        if (!images.length) throw new Error("Select an image asset first");
        const assetPng = await toPngDataUrl(images[0].dataUrl);
        const data = await requestEdit("replace-with-asset", {
          useAssets: true,
          skipBlend: true,
          assetsOverride: [{ ...images[0], dataUrl: assetPng }],
        });
        showResult(resultWrap, data.imageDataUrl);
      } else if (variantId === "apply-palette") {
        const palettes = assets.filter(
          (a) => a.kind === "palette" && a.colors
        );
        if (!palettes.length) throw new Error("Select a palette first");
        image = croppedDataUrl;
        for (const palette of palettes) {
          image = await window.SeeCaptureBlend.applyPaletteToCapture(
            image,
            palette.colors
          );
        }
        showResult(resultWrap, image);
      } else if (variantId === "green-with-asset") {
        const data = await requestEdit("to-green", { useAssets: true });
        showResult(resultWrap, data.imageDataUrl);
      } else if (variantId === "bw-with-asset") {
        const data = await requestEdit("black-white", { useAssets: true });
        showResult(resultWrap, data.imageDataUrl);
      } else {
        throw new Error("Unknown variant");
      }

      chrome.runtime.sendMessage({
        type: "SAVE_RESULT",
        presetId: variantId,
        captureDataUrl: croppedDataUrl,
        resultDataUrl: resultDataUrl,
      });
    } catch (err) {
      showError(resultWrap, err?.message || "Variant failed");
    } finally {
      inFlight = false;
      [...optionsEl.querySelectorAll(".sc-option")].forEach((el) => {
        el.disabled = false;
      });
      if (globalOptionsRef) {
        [...globalOptionsRef.querySelectorAll(".sc-option")].forEach((el) => {
          el.disabled = false;
        });
      }
      updateVariantsState();
    }
  }

  function toPngDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL("image/png"));
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error("Could not load asset image"));
      img.src = dataUrl;
    });
  }

  async function requestEdit(presetId, opts) {
    const useAssets = Boolean(opts && opts.useAssets);
    const skipBlend = Boolean(opts && opts.skipBlend);
    let imageForEdit = croppedDataUrl;
    let prepared = {
      imageDataUrl: croppedDataUrl,
      presetId,
      prompt: "",
      assets: [],
      pageContext: {},
      model: "eden",
    };

    if (window.SeeCapturePayload?.preparePayload) {
      prepared = await window.SeeCapturePayload.preparePayload({
        imageDataUrl: croppedDataUrl,
        presetId,
        prompt: "",
        model: "eden",
        flags: {
          contextEnabled,
          pageContext,
          selectedAssetIds: useAssets ? selectedAssetIds : [],
        },
      });
    }

    if (Array.isArray(opts?.assetsOverride) && opts.assetsOverride.length) {
      prepared.assets = opts.assetsOverride;
    }

    if (
      useAssets &&
      !skipBlend &&
      prepared.assets?.length > 0 &&
      window.SeeCaptureBlend?.applySelectedAssetsToCapture
    ) {
      imageForEdit = await window.SeeCaptureBlend.applySelectedAssetsToCapture(
        croppedDataUrl,
        prepared.assets
      );
    }

    const message = {
      type: "EDIT_IMAGE",
      imageDataUrl: imageForEdit,
      presetId: prepared.presetId,
      model: prepared.model,
      prompt: prepared.prompt,
      pageContext: prepared.pageContext || {},
      assets: useAssets ? prepared.assets || [] : [],
    };

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response?.ok || !response.imageDataUrl) {
          reject(new Error(response?.error || "Edit request failed"));
          return;
        }
        resolve(response);
      });
    });
  }
})();
