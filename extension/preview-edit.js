/**
 * Figma-style preview edit chrome: crop, lasso erase/isolate, rembg, prompt.
 * Exposed as window.SeeCapturePreviewEdit
 */
(() => {
  const MATERIAL_PATHS = {
    crop:
      "M17 15h2V7c0-1.1-.9-2-2-2H9v2h8v8zM7 17V1H5v4H1v2h4v10c0 1.1.9 2 2 2h10v4h2v-4h4v-2H7z",
    gesture:
      "M4.59 6.89c.7-.71 1.4-1.35 1.71-1.22.5.2 0 1.03-.3 1.52-.25.42-2.86 3.89-2.86 6.31 0 1.28.48 2.34 1.34 2.98.75.56 1.74.73 2.64.46 1.07-.31 1.95-1.4 3.06-2.77 1.29-1.6 2.8-3.35 4.12-3.35 1.04 0 1.69.68 1.69 1.57 0 .95-.57 1.71-1.19 2.38-.63.67-1.22 1.32-1.22 2.45 0 1.76 1.47 2.89 3.03 2.89 2.82 0 4.72-2.59 4.72-6.31 0-5.43-3.78-8.55-8.25-8.55-2.39 0-4.4.97-5.81 2.28-.5.46-.91.93-1.21 1.37-.3.44-.54.86-.54 1.28 0 .67.44 1.07 1.07 1.07.5 0 .87-.28 1.16-.58z",
    wallpaper:
      "M4 4h7V2H4c-1.1 0-2 .9-2 2v7h2V4zm6 10-4.5 6h13L14 12l-3 4-1-1.5zM17 8.5c0-.83-.67-1.5-1.5-1.5S14 7.67 14 8.5s.67 1.5 1.5 1.5S17 9.33 17 8.5zM20 2h-7v2h7v7h2V4c0-1.1-.9-2-2-2zm0 18h-7v2h7c1.1 0 2-.9 2-2v-7h-2v7zM4 13H2v7c0 1.1.9 2 2 2h7v-2H4v-7z",
    auto_fix:
      "m19 9 1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12zm-1.5 4.3L9.1 12l1.4-3.1L11.9 12zm7.5.5L17 18l-1.25-2.75L13 14l2.75-1.25L17 10l1.25 2.75L21 14z",
    expand_more: "M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z",
  };

  const ICON_NAMES = {
    crop: "crop",
    select: "gesture",
    rembg: "wallpaper",
    wand: "auto_fix",
    more: "expand_more",
  };

  function materialIcon(name, className) {
    const wrap = document.createElement("span");
    wrap.className = className ? `sc-mdi ${className}` : "sc-mdi";
    wrap.setAttribute("aria-hidden", "true");
    const path = MATERIAL_PATHS[name] || MATERIAL_PATHS.crop;
    wrap.innerHTML = `<svg viewBox="0 0 24 24" width="1em" height="1em" focusable="false"><path fill="currentColor" d="${path}"/></svg>`;
    return wrap;
  }

  /**
   * @param {{
   *   toolbarHost: HTMLElement,
   *   stageEl: HTMLElement,
   *   getImageEl: () => HTMLImageElement | null,
   *   getImageDataUrl: () => string,
   *   setImageDataUrl: (url: string) => void,
   *   requestEdit: (presetId: string, opts?: object) => Promise<{imageDataUrl: string}>,
   *   saveDataUrl: (url: string) => Promise<void>,
   * }} opts
   */
  function mountPreviewChrome(opts) {
    const {
      toolbarHost,
      stageEl,
      getImageEl,
      getImageDataUrl,
      setImageDataUrl,
      requestEdit,
      saveDataUrl,
      editTargetLabel,
    } = opts;
    const paneLabel = editTargetLabel || "Generation";

    toolbarHost.innerHTML = "";
    toolbarHost.classList.add("sc-preview-chrome");

    const bar = document.createElement("div");
    bar.className = "sc-figma-bar";

    const actionsHost = document.createElement("div");
    actionsHost.className = "sc-preview-actions is-hidden";

    const promptRow = document.createElement("div");
    promptRow.className = "sc-prompt-row is-hidden";
    const promptInput = document.createElement("input");
    promptInput.type = "text";
    promptInput.className = "sc-prompt-input";
    promptInput.placeholder = "Describe what to change…";
    const promptApply = document.createElement("button");
    promptApply.type = "button";
    promptApply.className = "sc-prompt-apply";
    promptApply.textContent = "Apply";
    promptRow.appendChild(promptInput);
    promptRow.appendChild(promptApply);

    let mode = null; // crop | select | prompt | null
    let overlay = null;
    let drawing = false;
    let cropStart = null;
    let cropRect = null;
    let lassoPoints = [];
    let closedLasso = null;
    let busy = false;

    function setBusy(on) {
      busy = on;
      bar.classList.toggle("is-busy", on);
      [...bar.querySelectorAll("button")].forEach((b) => {
        if (b.dataset.action === "more") return;
        if (!on && b.dataset.action === "more") return;
        if (b.dataset.action !== "more") b.disabled = on;
      });
      const more = bar.querySelector('[data-action="more"]');
      if (more) more.disabled = true;
      promptApply.disabled = on;
      promptInput.disabled = on;
    }

    function clearOverlay() {
      if (overlay) {
        overlay.remove();
        overlay = null;
      }
      drawing = false;
      cropStart = null;
      cropRect = null;
      lassoPoints = [];
      closedLasso = null;
      actionsHost.classList.add("is-hidden");
      actionsHost.innerHTML = "";
    }

    function exitMode() {
      mode = null;
      clearOverlay();
      promptRow.classList.add("is-hidden");
      [...bar.querySelectorAll(".sc-figma-item")].forEach((b) =>
        b.classList.remove("is-active")
      );
      stageEl.classList.remove("is-editing");
    }

    function ensureOverlay() {
      clearOverlay();
      overlay = document.createElement("div");
      overlay.className = "sc-edit-overlay";
      stageEl.classList.add("is-editing");
      stageEl.appendChild(overlay);
      return overlay;
    }

    function clientToImagePoint(clientX, clientY) {
      const img = getImageEl();
      if (!img) return null;
      const rect = img.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const x = ((clientX - rect.left) / rect.width) * img.naturalWidth;
      const y = ((clientY - rect.top) / rect.height) * img.naturalHeight;
      return {
        x: Math.max(0, Math.min(img.naturalWidth, x)),
        y: Math.max(0, Math.min(img.naturalHeight, y)),
        displayX: clientX - rect.left,
        displayY: clientY - rect.top,
        displayW: rect.width,
        displayH: rect.height,
        natW: img.naturalWidth,
        natH: img.naturalHeight,
      };
    }

    function loadImage(dataUrl) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = dataUrl;
      });
    }

    async function applyCropAndSave() {
      if (!cropRect) return;
      const { x, y, w, h, natW, natH } = cropRect;
      if (w < 2 || h < 2) return;
      const src = await loadImage(getImageDataUrl());
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(w));
      canvas.height = Math.max(1, Math.round(h));
      const ctx = canvas.getContext("2d");
      ctx.drawImage(
        src,
        Math.round(x),
        Math.round(y),
        Math.round(w),
        Math.round(h),
        0,
        0,
        canvas.width,
        canvas.height
      );
      const cropped = canvas.toDataURL("image/png");
      setImageDataUrl(cropped);
      exitMode();
      await saveDataUrl(cropped);
      showEditSavedToast();
    }

    function showEditSavedToast() {
      const root = stageEl.getRootNode?.();
      const attachTo =
        root instanceof ShadowRoot
          ? root
          : stageEl.closest(".sc-lightbox") || document.body;
      let toast = attachTo.querySelector(".sc-edit-toast");
      if (!toast) {
        toast = document.createElement("div");
        toast.className = "sc-edit-toast";
        toast.setAttribute("role", "status");
        const title = document.createElement("span");
        title.className = "sc-edit-toast-title";
        title.textContent = "Edit saved";
        const sub = document.createElement("span");
        sub.className = "sc-edit-toast-sub";
        sub.textContent = `Updated in the ${paneLabel} pane`;
        toast.appendChild(title);
        toast.appendChild(sub);
        attachTo.appendChild(toast);
      }
      toast.classList.remove("is-visible");
      void toast.offsetWidth;
      toast.classList.add("is-visible");
      clearTimeout(toast._hideTimer);
      toast._hideTimer = setTimeout(() => {
        toast.classList.remove("is-visible");
      }, 2200);
    }

    async function applyLasso(kind) {
      if (!closedLasso || closedLasso.length < 3) return;
      const src = await loadImage(getImageDataUrl());
      const canvas = document.createElement("canvas");
      canvas.width = src.naturalWidth || src.width;
      canvas.height = src.naturalHeight || src.height;
      const ctx = canvas.getContext("2d");

      if (kind === "isolate") {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.beginPath();
        closedLasso.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(src, 0, 0);
        ctx.restore();
      } else {
        ctx.drawImage(src, 0, 0);
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.beginPath();
        closedLasso.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      const next = canvas.toDataURL("image/png");
      setImageDataUrl(next);
      exitMode();
      showEditSavedToast();
    }

    function showSelectActions() {
      actionsHost.innerHTML = "";
      actionsHost.classList.remove("is-hidden");
      const eraseBtn = document.createElement("button");
      eraseBtn.type = "button";
      eraseBtn.className = "sc-select-action";
      eraseBtn.textContent = "Erase";
      eraseBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        applyLasso("erase").catch((err) => alert(err?.message || String(err)));
      });
      const isolateBtn = document.createElement("button");
      isolateBtn.type = "button";
      isolateBtn.className = "sc-select-action";
      isolateBtn.textContent = "Isolate";
      isolateBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        applyLasso("isolate").catch((err) =>
          alert(err?.message || String(err))
        );
      });
      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "sc-select-action is-muted";
      cancelBtn.textContent = "Cancel";
      cancelBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        exitMode();
      });
      actionsHost.appendChild(eraseBtn);
      actionsHost.appendChild(isolateBtn);
      actionsHost.appendChild(cancelBtn);
    }

    function renderCropBox() {
      if (!overlay || !cropRect) return;
      let box = overlay.querySelector(".sc-crop-box");
      if (!box) {
        box = document.createElement("div");
        box.className = "sc-crop-box";
        overlay.appendChild(box);
      }
      const img = getImageEl();
      const rect = img.getBoundingClientRect();
      const stageRect = stageEl.getBoundingClientRect();
      const scaleX = rect.width / cropRect.natW;
      const scaleY = rect.height / cropRect.natH;
      const left = rect.left - stageRect.left + cropRect.x * scaleX;
      const top = rect.top - stageRect.top + cropRect.y * scaleY;
      box.style.left = `${left}px`;
      box.style.top = `${top}px`;
      box.style.width = `${cropRect.w * scaleX}px`;
      box.style.height = `${cropRect.h * scaleY}px`;
    }

    function renderLasso() {
      if (!overlay) return;
      let svg = overlay.querySelector("svg.sc-lasso-svg");
      if (!svg) {
        svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.classList.add("sc-lasso-svg");
        overlay.appendChild(svg);
      }
      const img = getImageEl();
      const rect = img.getBoundingClientRect();
      const stageRect = stageEl.getBoundingClientRect();
      svg.setAttribute("width", String(stageRect.width));
      svg.setAttribute("height", String(stageRect.height));
      svg.style.left = "0";
      svg.style.top = "0";

      const pts = closedLasso || lassoPoints;
      if (!pts.length) {
        svg.innerHTML = "";
        return;
      }
      const scaleX = rect.width / (img.naturalWidth || 1);
      const scaleY = rect.height / (img.naturalHeight || 1);
      const ox = rect.left - stageRect.left;
      const oy = rect.top - stageRect.top;
      const d = pts
        .map((p, i) => {
          const x = ox + p.x * scaleX;
          const y = oy + p.y * scaleY;
          return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(" ");
      const closed = closedLasso ? " Z" : "";
      svg.innerHTML = `<path d="${d}${closed}" class="sc-lasso-path" />`;
    }

    function startCropMode() {
      exitMode();
      mode = "crop";
      bar.querySelector('[data-action="crop"]')?.classList.add("is-active");
      const ov = ensureOverlay();
      ov.style.cursor = "crosshair";

      const onDown = (e) => {
        if (busy) return;
        e.preventDefault();
        e.stopPropagation();
        const p = clientToImagePoint(e.clientX, e.clientY);
        if (!p) return;
        drawing = true;
        cropStart = p;
        cropRect = {
          x: p.x,
          y: p.y,
          w: 0,
          h: 0,
          natW: p.natW,
          natH: p.natH,
        };
        renderCropBox();
      };
      const onMove = (e) => {
        if (!drawing || !cropStart) return;
        e.preventDefault();
        const p = clientToImagePoint(e.clientX, e.clientY);
        if (!p) return;
        const x1 = Math.min(cropStart.x, p.x);
        const y1 = Math.min(cropStart.y, p.y);
        const x2 = Math.max(cropStart.x, p.x);
        const y2 = Math.max(cropStart.y, p.y);
        cropRect = {
          x: x1,
          y: y1,
          w: x2 - x1,
          h: y2 - y1,
          natW: p.natW,
          natH: p.natH,
        };
        renderCropBox();
      };
      const onUp = (e) => {
        if (!drawing) return;
        e.preventDefault();
        drawing = false;
        if (cropRect && cropRect.w >= 2 && cropRect.h >= 2) {
          actionsHost.innerHTML = "";
          actionsHost.classList.remove("is-hidden");
          const saveBtn = document.createElement("button");
          saveBtn.type = "button";
          saveBtn.className = "sc-select-action";
          saveBtn.textContent = "Save crop";
          saveBtn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            applyCropAndSave().catch((err) =>
              alert(err?.message || String(err))
            );
          });
          const cancelBtn = document.createElement("button");
          cancelBtn.type = "button";
          cancelBtn.className = "sc-select-action is-muted";
          cancelBtn.textContent = "Cancel";
          cancelBtn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            exitMode();
          });
          actionsHost.appendChild(saveBtn);
          actionsHost.appendChild(cancelBtn);
        }
      };

      ov.addEventListener("pointerdown", onDown);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      ov._cleanup = () => {
        ov.removeEventListener("pointerdown", onDown);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      const prevClear = clearOverlay;
      // wrap clear to cleanup listeners
      const originalRemove = ov.remove.bind(ov);
      ov.remove = () => {
        if (ov._cleanup) ov._cleanup();
        originalRemove();
      };
    }

    function startSelectMode() {
      exitMode();
      mode = "select";
      bar.querySelector('[data-action="select"]')?.classList.add("is-active");
      const ov = ensureOverlay();
      ov.style.cursor = "crosshair";
      lassoPoints = [];
      closedLasso = null;

      const onDown = (e) => {
        if (busy || closedLasso) return;
        e.preventDefault();
        e.stopPropagation();
        const p = clientToImagePoint(e.clientX, e.clientY);
        if (!p) return;
        drawing = true;
        lassoPoints = [{ x: p.x, y: p.y }];
        renderLasso();
      };
      const onMove = (e) => {
        if (!drawing || closedLasso) return;
        e.preventDefault();
        const p = clientToImagePoint(e.clientX, e.clientY);
        if (!p) return;
        const last = lassoPoints[lassoPoints.length - 1];
        const dx = p.x - last.x;
        const dy = p.y - last.y;
        if (dx * dx + dy * dy < 9) return;
        lassoPoints.push({ x: p.x, y: p.y });
        renderLasso();
      };
      const onUp = (e) => {
        if (!drawing) return;
        e.preventDefault();
        drawing = false;
        if (lassoPoints.length >= 3) {
          closedLasso = lassoPoints.slice();
          renderLasso();
          showSelectActions();
        } else {
          lassoPoints = [];
          renderLasso();
        }
      };

      ov.addEventListener("pointerdown", onDown);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      ov._cleanup = () => {
        ov.removeEventListener("pointerdown", onDown);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      const originalRemove = ov.remove.bind(ov);
      ov.remove = () => {
        if (ov._cleanup) ov._cleanup();
        originalRemove();
      };
    }

    function startPromptMode() {
      const wasPrompt = mode === "prompt";
      exitMode();
      if (wasPrompt) return;
      mode = "prompt";
      bar.querySelector('[data-action="prompt"]')?.classList.add("is-active");
      promptRow.classList.remove("is-hidden");
      promptInput.focus();
    }

    async function runRemoveBg() {
      if (busy) return;
      exitMode();
      setBusy(true);
      try {
        const data = await requestEdit("remove-bg", {
          imageDataUrl: getImageDataUrl(),
          useAssets: false,
        });
        setImageDataUrl(data.imageDataUrl);
      } catch (err) {
        alert(err?.message || "Remove background failed");
      } finally {
        setBusy(false);
      }
    }

    async function runPromptApply() {
      const text = String(promptInput.value || "").trim();
      if (!text) {
        alert("Write what you want to change.");
        return;
      }
      if (busy) return;
      setBusy(true);
      try {
        const data = await requestEdit("custom-prompt", {
          imageDataUrl: getImageDataUrl(),
          prompt: text,
          useAssets: false,
        });
        setImageDataUrl(data.imageDataUrl);
        exitMode();
      } catch (err) {
        alert(err?.message || "Edit with prompt failed");
      } finally {
        setBusy(false);
      }
    }

    function addItem(action, label, iconName, { disabled = false } = {}) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sc-figma-item";
      btn.dataset.action = action;
      btn.disabled = disabled;
      const icon = materialIcon(iconName, "sc-figma-icon");
      const text = document.createElement("span");
      text.textContent = label;
      btn.appendChild(icon);
      btn.appendChild(text);
      if (disabled) btn.title = "Coming soon";
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (disabled || busy) return;
        if (action === "crop") startCropMode();
        else if (action === "select") startSelectMode();
        else if (action === "rembg") runRemoveBg();
        else if (action === "prompt") startPromptMode();
      });
      return btn;
    }

    bar.appendChild(addItem("crop", "Crop", ICON_NAMES.crop));
    bar.appendChild(addItem("select", "Select area", ICON_NAMES.select));
    bar.appendChild(addItem("rembg", "Remove background", ICON_NAMES.rembg));
    bar.appendChild(addItem("prompt", "Edit with prompt", ICON_NAMES.wand));

    const divider = document.createElement("span");
    divider.className = "sc-figma-divider";
    bar.appendChild(divider);

    const moreBtn = addItem("more", "More", ICON_NAMES.more, { disabled: true });
    moreBtn.classList.add("sc-figma-more");
    bar.appendChild(moreBtn);

    promptApply.addEventListener("click", (e) => {
      e.stopPropagation();
      runPromptApply();
    });

    toolbarHost.appendChild(bar);
    toolbarHost.appendChild(actionsHost);
    toolbarHost.appendChild(promptRow);

    return {
      destroy() {
        exitMode();
        toolbarHost.innerHTML = "";
      },
      refresh() {
        // image may have changed; overlays already cleared on set
      },
    };
  }

  window.SeeCapturePreviewEdit = {
    mountPreviewChrome,
  };
})();
