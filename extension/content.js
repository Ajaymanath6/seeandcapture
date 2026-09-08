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
    rightWrap.className = "sc-image-wrap";
    const placeholder = document.createElement("div");
    placeholder.className = "sc-placeholder";
    placeholder.textContent = "Pick an option below";
    rightWrap.appendChild(placeholder);
    right.appendChild(rightLabel);
    right.appendChild(rightWrap);

    body.appendChild(left);
    body.appendChild(right);

    const footer = document.createElement("div");
    footer.className = "sc-footer";
    const options = document.createElement("div");
    options.className = "sc-options";

    const presets =
      typeof SEE_CAPTURE_PRESETS !== "undefined" ? SEE_CAPTURE_PRESETS : [];

    presets.forEach((preset) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sc-option";
      btn.textContent = preset.label;
      btn.dataset.presetId = preset.id;
      btn.addEventListener("click", () =>
        runPreset(preset.id, btn, rightWrap, options)
      );
      options.appendChild(btn);
    });

    footer.appendChild(options);
    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    root.appendChild(modal);
    shadowRoot.appendChild(root);

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
        // user cancelled picker
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

  async function runPreset(presetId, button, resultWrap, optionsEl) {
    if (inFlight || !croppedDataUrl) return;
    inFlight = true;

    [...optionsEl.querySelectorAll(".sc-option")].forEach((el) => {
      el.disabled = true;
      el.classList.toggle("is-active", el === button);
    });

    resultWrap.innerHTML = "";
    const status = document.createElement("div");
    status.className = "sc-status";
    status.innerHTML =
      '<div class="sc-spinner"></div>Working…';
    resultWrap.appendChild(status);

    try {
      const data = await requestEdit(presetId);

      resultWrap.innerHTML = "";
      const img = document.createElement("img");
      img.alt = "Generated result";
      img.src = data.imageDataUrl;
      resultWrap.appendChild(img);
      resultDataUrl = data.imageDataUrl;

      chrome.runtime.sendMessage({
        type: "SAVE_RESULT",
        presetId,
        captureDataUrl: croppedDataUrl,
        resultDataUrl: data.imageDataUrl,
      });
    } catch (err) {
      resultWrap.innerHTML = "";
      const statusErr = document.createElement("div");
      statusErr.className = "sc-status is-error";
      statusErr.textContent =
        err?.message ||
        "Request failed. Is the local server running on port 8787?";
      resultWrap.appendChild(statusErr);
    } finally {
      inFlight = false;
      [...optionsEl.querySelectorAll(".sc-option")].forEach((el) => {
        el.disabled = false;
      });
    }
  }

  function requestEdit(presetId) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: "EDIT_IMAGE",
          imageDataUrl: croppedDataUrl,
          presetId,
          model: "eden",
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!response?.ok || !response.imageDataUrl) {
            reject(new Error(response?.error || "Edit request failed"));
            return;
          }
          resolve(response);
        }
      );
    });
  }
})();
