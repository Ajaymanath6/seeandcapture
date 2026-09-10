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
  let leftWrapRef = null;
  let rightWrapRef = null;
  let selectedPane = "capture";
  let modalRef = null;
  let bodyRef = null;
  let composerRef = null;
  let headerActionsRef = null;
  let headerBackRef = null;
  let headerBackHandler = null;
  let promptInputRef = null;
  let applyBtnRef = null;
  let assetCountEl = null;
  let assetsPanelEl = null;
  let moodboardViewerApi = null;

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "START_CAPTURE") {
      beginCapture();
    }
    if (message?.type === "OPEN_LAST_MODAL") {
      openLastModalFromStorage().catch((err) => console.error(err));
    }
    if (message?.type === "MOODBOARD_INBOX_UPDATED") {
      flushMoodboardInboxAndRefresh().catch((err) => console.error(err));
    }
    if (message?.type === "MOODBOARD_BOARD_UPDATED") {
      refreshOpenMoodboard(message.boardId).catch((err) => console.error(err));
    }
  });

  async function syncMoodboardReceiversFromDb() {
    try {
      await window.SeeCaptureMoodboards?.migrateFromPageIfNeeded?.();
      await chrome.runtime.sendMessage({
        type: "SYNC_MOODBOARD_RECEIVE_MENUS",
      });
    } catch (err) {
      console.error(err);
    }
  }

  async function flushMoodboardInbox() {
    const api = window.SeeCaptureMoodboards;
    if (!api?.addImage) return [];
    const data = await chrome.storage.local.get({ moodboardInbox: [] });
    const inbox = Array.isArray(data.moodboardInbox) ? data.moodboardInbox : [];
    if (!inbox.length) return [];

    const remaining = [];
    const touched = new Set();
    for (const item of inbox) {
      if (!item?.boardId || !item?.dataUrl) continue;
      try {
        await api.addImage(item.boardId, item.dataUrl);
        touched.add(item.boardId);
      } catch (err) {
        console.error(err);
        remaining.push(item);
      }
    }
    await chrome.storage.local.set({ moodboardInbox: remaining });
    return [...touched];
  }

  async function refreshOpenMoodboard(boardId) {
    const openId = moodboardViewerApi?.getBoardId?.();
    if (!openId || (boardId && openId !== boardId)) return;
    if (!window.SeeCaptureMoodboards?.getMoodboard) return;
    const board = await window.SeeCaptureMoodboards.getMoodboard(openId);
    if (board) moodboardViewerApi.refresh?.(board);
  }

  async function flushMoodboardInboxAndRefresh() {
    const touched = await flushMoodboardInbox();
    if (!touched.length) return;
    const openId = moodboardViewerApi?.getBoardId?.();
    if (openId && touched.includes(openId)) {
      await refreshOpenMoodboard(openId);
    }
  }

  function beginCapture() {
    if (capturing || modalOpen) return;
    capturing = true;
    ensureHost();
    showCaptureOverlay();
  }

  async function openLastModalFromStorage() {
    if (capturing || modalOpen) return;
    try {
      const data = await chrome.storage.local.get({ lastResult: null });
      const last = data.lastResult || null;
      const dataUrl =
        (last && (last.resultDataUrl || last.captureDataUrl)) || null;
      if (!dataUrl) {
        alert(
          "Nothing to open yet. Press Alt+C (or use See & Capture) to capture an area first."
        );
        return;
      }
      ensureHost();
      showModal(dataUrl);
    } catch (err) {
      console.error(err);
      alert(err?.message || "Could not open the last capture.");
    }
  }

  function persistLastCapture(captureDataUrl, resultUrl) {
    try {
      chrome.runtime.sendMessage({
        type: "SAVE_RESULT",
        presetId: null,
        captureDataUrl: captureDataUrl || null,
        resultDataUrl: resultUrl || null,
      });
    } catch (err) {
      console.error(err);
    }
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
      if (!document.getElementById("see-and-capture-lora")) {
        const fontLink = document.createElement("link");
        fontLink.id = "see-and-capture-lora";
        fontLink.rel = "stylesheet";
        fontLink.href =
          "https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,500;0,600;0,650;1,600&display=swap";
        document.documentElement.appendChild(fontLink);
      }
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
    leftWrapRef = null;
    rightWrapRef = null;
    selectedPane = "capture";
    modalRef = null;
    bodyRef = null;
    composerRef = null;
    headerActionsRef = null;
    headerBackRef = null;
    headerBackHandler = null;
    promptInputRef = null;
    applyBtnRef = null;
    assetCountEl = null;
    assetsPanelEl = null;
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

        // Hide chrome before screenshot so the dim/border never tint the capture.
        hint.style.display = "none";
        overlay.style.display = "none";
        if (activeHost) activeHost.style.visibility = "hidden";
        await new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        });

        const dataUrl = await requestTabCapture();
        if (activeHost) activeHost.style.visibility = "";
        croppedDataUrl = await cropDataUrl(dataUrl, rect);
        capturing = false;
        persistLastCapture(croppedDataUrl, null);
        showModal(croppedDataUrl);
      } catch (err) {
        if (activeHost) activeHost.style.visibility = "";
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

  const MATERIAL_PATHS = {
    close:
      "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
    more_vert:
      "M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z",
    folder_open:
      "M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z",
    download:
      "M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z",
    arrow_back:
      "M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z",
    dashboard:
      "M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z",
    expand_more: "M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z",
    article:
      "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z",
    add: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
    image:
      "M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z",
    palette:
      "M12 22C6.49 22 2 17.51 2 12S6.49 2 12 2s10 4.04 10 9c0 3.31-2.69 6-6 6h-1.77c-.28 0-.5.22-.5.5 0 .12.05.23.13.33.41.47.64 1.06.64 1.67A2.5 2.5 0 0 1 12 22zm0-18c-4.41 0-8 3.59-8 8s3.59 8 8 8c.28 0 .5-.22.5-.5a.54.54 0 0 0-.14-.35c-.41-.46-.63-1.05-.63-1.65a2.5 2.5 0 0 1 2.5-2.5H16c2.21 0 4-1.79 4-4 0-3.86-3.59-7-8-7z",
    upload:
      "M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z",
    auto_fix:
      "m19 9 1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12zm-1.5 4.3L9.1 12l1.4-3.1L11.9 12zm7.5.5L17 18l-1.25-2.75L13 14l2.75-1.25L17 10l1.25 2.75L21 14z",
    visibility:
      "M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z",
    edit: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
    filter_b_and_w:
      "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h7v14h7z",
    wallpaper:
      "M4 4h7V2H4c-1.1 0-2 .9-2 2v7h2V4zm6 10-4.5 6h13L14 12l-3 4-1-1.5zM17 8.5c0-.83-.67-1.5-1.5-1.5S14 7.67 14 8.5s.67 1.5 1.5 1.5S17 9.33 17 8.5zM20 2h-7v2h7v7h2V4c0-1.1-.9-2-2-2zm0 18h-7v2h7c1.1 0 2-.9 2-2v-7h-2v7zM4 13H2v7c0 1.1.9 2 2 2h7v-2H4v-7z",
    grass:
      "M12 22c4.97 0 9-2.16 9-5.5 0-1.52-1.05-2.87-2.72-3.86.17-.54.27-1.1.27-1.69C18.55 7.84 15.64 5 12 5S5.45 7.84 5.45 10.95c0 .59.1 1.15.27 1.69C4.05 13.63 3 14.98 3 16.5 3 19.84 7.03 22 12 22z",
  };

  function materialIcon(name, className) {
    const wrap = document.createElement("span");
    wrap.className = className ? `sc-mdi ${className}` : "sc-mdi";
    wrap.setAttribute("aria-hidden", "true");
    const path = MATERIAL_PATHS[name] || MATERIAL_PATHS.close;
    wrap.innerHTML = `<svg viewBox="0 0 24 24" width="1em" height="1em" focusable="false"><path fill="currentColor" d="${path}"/></svg>`;
    return wrap;
  }

  function showModal(captureDataUrl) {
    modalOpen = true;
    resultDataUrl = null;
    selectedAssetIds = [];
    contextEnabled = false;
    clearShadowUi();

    const root = document.createElement("div");
    root.className = "sc-root";

    const glass = document.createElement("div");
    glass.className = "sc-modal-glass";

    const modal = document.createElement("div");
    modal.className = "sc-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-label", "See & Capture");

    const header = document.createElement("div");
    header.className = "sc-header";

    const headerBack = document.createElement("button");
    headerBack.type = "button";
    headerBack.className = "sc-header-back is-hidden";
    headerBack.setAttribute("aria-label", "Back");
    headerBack.appendChild(materialIcon("arrow_back"));
    headerBackRef = headerBack;
    headerBack.addEventListener("click", (e) => {
      e.stopPropagation();
      if (typeof headerBackHandler === "function") headerBackHandler();
    });

    const brand = document.createElement("div");
    brand.className = "sc-header-brand";
    brand.setAttribute("aria-label", "See and Capture");

    const logo = document.createElement("img");
    logo.className = "sc-header-logo";
    logo.src = chrome.runtime.getURL("icons/logo.png");
    logo.alt = "";
    logo.draggable = false;

    const wordmark = document.createElement("span");
    wordmark.className = "sc-header-wordmark";
    const seePart = document.createElement("span");
    seePart.className = "sc-header-wordmark-see";
    seePart.textContent = "See";
    wordmark.appendChild(seePart);
    wordmark.appendChild(document.createTextNode(" and "));
    const captureEm = document.createElement("em");
    captureEm.textContent = "Capture";
    wordmark.appendChild(captureEm);

    brand.appendChild(logo);
    brand.appendChild(wordmark);

    const saveWrap = document.createElement("div");
    saveWrap.className = "sc-save-wrap";
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "sc-save-btn";
    saveBtn.setAttribute("aria-haspopup", "menu");
    saveBtn.setAttribute("aria-expanded", "false");
    const saveLabel = document.createElement("span");
    saveLabel.className = "sc-save-label";
    saveLabel.textContent = "Save";
    saveBtn.appendChild(saveLabel);
    saveBtn.appendChild(materialIcon("expand_more", "sc-btn-icon sc-btn-caret"));

    const savePop = document.createElement("div");
    savePop.className = "sc-save-pop is-hidden";
    savePop.setAttribute("role", "menu");

    function closeSavePop() {
      savePop.classList.add("is-hidden");
      saveBtn.setAttribute("aria-expanded", "false");
    }

    async function refreshSaveMenu() {
      savePop.innerHTML = "";
      const addSaveOption = (label, onClick) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "sc-save-option";
        item.setAttribute("role", "menuitem");
        item.textContent = label;
        item.addEventListener("click", async (e) => {
          e.stopPropagation();
          closeSavePop();
          await onClick();
        });
        savePop.appendChild(item);
      };

      addSaveOption("Save to folder", async () => {
        await saveImageToComputer(null);
      });

      let boards = [];
      try {
        boards = (await window.SeeCaptureMoodboards?.listMoodboards?.()) || [];
        await syncMoodboardReceiversFromDb();
      } catch (err) {
        console.error(err);
      }

      boards.forEach((board) => {
        addSaveOption(`Add to ${board.name}`, async () => {
          await addCurrentImageToMoodboard(board.id, board.name);
        });
      });
    }

    saveBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      menuPop.classList.add("is-hidden");
      const opening = savePop.classList.contains("is-hidden");
      if (opening) {
        await refreshSaveMenu();
        savePop.classList.remove("is-hidden");
        saveBtn.setAttribute("aria-expanded", "true");
      } else {
        closeSavePop();
      }
    });
    saveWrap.appendChild(saveBtn);
    saveWrap.appendChild(savePop);

    const boardsBtn = document.createElement("button");
    boardsBtn.type = "button";
    boardsBtn.className = "sc-boards-btn";
    boardsBtn.appendChild(materialIcon("dashboard", "sc-btn-icon"));
    const boardsLabel = document.createElement("span");
    boardsLabel.textContent = "Moodboards";
    boardsBtn.appendChild(boardsLabel);
    boardsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeSavePop();
      menuPop.classList.add("is-hidden");
      showMoodboardsPanel();
    });

    const menuWrap = document.createElement("div");
    menuWrap.className = "sc-menu-wrap";
    const menuBtn = document.createElement("button");
    menuBtn.type = "button";
    menuBtn.className = "sc-menu-btn";
    menuBtn.setAttribute("aria-label", "More options");
    menuBtn.appendChild(materialIcon("more_vert"));
    const menuPop = document.createElement("div");
    menuPop.className = "sc-menu-pop is-hidden";
    const menuItem = document.createElement("label");
    menuItem.className = "sc-menu-item";
    const contextCheck = document.createElement("input");
    contextCheck.type = "checkbox";
    contextCheck.checked = false;
    contextCheck.addEventListener("change", () => {
      contextEnabled = Boolean(contextCheck.checked);
    });
    menuItem.appendChild(contextCheck);
    menuItem.appendChild(materialIcon("article", "sc-btn-icon"));
    const menuText = document.createElement("span");
    menuText.textContent = "Use page text";
    menuItem.appendChild(menuText);
    menuPop.appendChild(menuItem);
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeSavePop();
      menuPop.classList.toggle("is-hidden");
    });
    menuWrap.appendChild(menuBtn);
    menuWrap.appendChild(menuPop);

    const headerActions = document.createElement("div");
    headerActions.className = "sc-header-actions";
    headerActions.appendChild(saveWrap);
    headerActions.appendChild(boardsBtn);
    headerActions.appendChild(menuWrap);
    headerActionsRef = headerActions;

    const closeBtn = document.createElement("button");
    closeBtn.className = "sc-close";
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.appendChild(materialIcon("close"));
    closeBtn.addEventListener("click", () => teardownHost());

    header.appendChild(headerBack);
    header.appendChild(brand);
    header.appendChild(headerActions);
    header.appendChild(closeBtn);

    const body = document.createElement("div");
    body.className = "sc-body";
    bodyRef = body;

    const left = document.createElement("div");
    left.className = "sc-pane";
    const leftLabel = document.createElement("p");
    leftLabel.className = "sc-pane-label";
    leftLabel.textContent = "Capture";
    const leftWrap = document.createElement("div");
    leftWrap.className = "sc-image-wrap is-capture is-selected";
    leftWrap.tabIndex = 0;
    leftWrap.setAttribute("role", "button");
    leftWrap.setAttribute("aria-pressed", "true");
    leftWrapRef = leftWrap;
    const leftImg = document.createElement("img");
    leftImg.alt = "Captured region";
    leftImg.src = captureDataUrl;
    leftWrap.appendChild(leftImg);
    attachImageActions(leftWrap, "capture");
    leftWrap.addEventListener("click", (e) => {
      if (e.target.closest(".sc-result-actions")) return;
      setSelectedPane("capture");
    });
    left.appendChild(leftLabel);
    left.appendChild(leftWrap);

    const right = document.createElement("div");
    right.className = "sc-pane";
    const rightLabel = document.createElement("p");
    rightLabel.className = "sc-pane-label";
    rightLabel.textContent = "Result";
    const rightWrap = document.createElement("div");
    rightWrap.className = "sc-image-wrap is-result";
    rightWrap.tabIndex = 0;
    rightWrap.setAttribute("role", "button");
    rightWrap.setAttribute("aria-pressed", "false");
    rightWrapRef = rightWrap;
    const placeholder = document.createElement("div");
    placeholder.className = "sc-placeholder";
    placeholder.textContent = "Generated image will appear here";
    rightWrap.appendChild(placeholder);
    rightWrap.addEventListener("click", (e) => {
      if (e.target.closest(".sc-result-actions")) return;
      setSelectedPane("result");
    });
    right.appendChild(rightLabel);
    right.appendChild(rightWrap);

    body.appendChild(left);
    body.appendChild(right);

    const composer = buildPromptComposer(rightWrap);
    composerRef = composer;
    modalRef = modal;
    selectedPane = "capture";

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(composer);
    glass.appendChild(modal);
    root.appendChild(glass);
    shadowRoot.appendChild(root);

    const onKeyDown = (e) => {
      if (e.key === "Escape" && !inFlight) {
        const boards = modal.querySelector(".sc-boards-view");
        if (boards) {
          e.stopPropagation();
          restoreCaptureView();
          return;
        }
        const mb = modal.querySelector(".sc-moodboard");
        if (mb) return;
        const lb = shadowRoot.querySelector(".sc-lightbox");
        if (lb) return;
        window.removeEventListener("keydown", onKeyDown, true);
        teardownHost();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);

    root.addEventListener("click", (e) => {
      if (!menuPop.classList.contains("is-hidden")) {
        menuPop.classList.add("is-hidden");
      }
      if (!savePop.classList.contains("is-hidden")) {
        if (!e.target.closest(".sc-save-wrap")) {
          closeSavePop();
        }
      }
      if (assetsPanelEl && !assetsPanelEl.classList.contains("is-hidden")) {
        if (!e.target.closest(".sc-composer-assets")) {
          assetsPanelEl.classList.add("is-hidden");
        }
      }
      const aspectPop = shadowRoot?.querySelector(".sc-aspect-pop:not(.is-hidden)");
      if (aspectPop && !e.target.closest(".sc-aspect-wrap")) {
        aspectPop.classList.add("is-hidden");
        const aspectBtn = shadowRoot.querySelector(".sc-aspect-btn");
        if (aspectBtn) aspectBtn.setAttribute("aria-expanded", "false");
      }
      if (e.target === root && !inFlight) teardownHost();
    });
  }

  function buildPromptComposer(rightWrap) {
    const composer = document.createElement("div");
    composer.className = "sc-composer";

    const quick = document.createElement("div");
    quick.className = "sc-quick-actions";
    const quickDefs = [
      { id: "black-white", label: "Black and white" },
      { id: "remove-bg", label: "Remove background" },
    ];
    quickDefs.forEach((def) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sc-quick-btn";
      btn.dataset.presetId = def.id;
      btn.textContent = def.label;
      btn.addEventListener("click", () => runQuickPreset(def.id, rightWrap));
      quick.appendChild(btn);
    });

    const field = document.createElement("div");
    field.className = "sc-composer-field";

    const input = document.createElement("textarea");
    input.className = "sc-composer-input";
    input.rows = 2;
    input.placeholder = "Describe what to change…";
    promptInputRef = input;

    const toolbar = document.createElement("div");
    toolbar.className = "sc-composer-toolbar";

    const assetsWrap = document.createElement("div");
    assetsWrap.className = "sc-composer-assets";
    const assetsBtn = document.createElement("button");
    assetsBtn.type = "button";
    assetsBtn.className = "sc-composer-btn";
    assetsBtn.appendChild(materialIcon("add", "sc-btn-icon"));
    const assetsBtnLabel = document.createElement("span");
    assetsBtnLabel.textContent = "Add assets";
    assetsBtn.appendChild(assetsBtnLabel);
    assetCountEl = document.createElement("span");
    assetCountEl.className = "sc-asset-count is-empty";
    assetCountEl.setAttribute("aria-hidden", "true");
    assetsBtn.appendChild(assetCountEl);
    updateAssetCountLabel();

    const panel = document.createElement("div");
    panel.className = "sc-assets-panel is-hidden";
    assetsPanelEl = panel;

    const tabRow = document.createElement("div");
    tabRow.className = "sc-assets-panel-tabs";
    const imagesTab = document.createElement("button");
    imagesTab.type = "button";
    imagesTab.className = "sc-assets-panel-tab is-active";
    imagesTab.textContent = "Images";
    const brandTab = document.createElement("button");
    brandTab.type = "button";
    brandTab.className = "sc-assets-panel-tab";
    brandTab.textContent = "Color / Brand";
    tabRow.appendChild(imagesTab);
    tabRow.appendChild(brandTab);
    const tabDivider = document.createElement("div");
    tabDivider.className = "sc-assets-panel-divider";
    tabDivider.setAttribute("aria-hidden", "true");

    const list = document.createElement("div");
    list.className = "sc-assets-panel-list";

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/png,image/webp,image/jpeg";
    fileInput.hidden = true;

    let panelKind = "image";

    async function refreshPanel() {
      list.innerHTML = "";
      if (!window.SeeCaptureAssets?.listAssets) {
        list.textContent = "Assets unavailable";
        return;
      }
      if (panelKind === "image") {
        const addRow = document.createElement("button");
        addRow.type = "button";
        addRow.className = "sc-assets-panel-add";
        addRow.setAttribute("aria-label", "Add image");
        addRow.title = "Add image";
        addRow.appendChild(materialIcon("add"));
        addRow.addEventListener("click", (e) => {
          e.stopPropagation();
          fileInput.click();
        });
        list.appendChild(addRow);
      }
      const assets = await window.SeeCaptureAssets.listAssets(
        panelKind === "image" ? "image" : "palette"
      );
      if (!assets.length) {
        const empty = document.createElement("div");
        empty.className = "sc-assets-empty";
        empty.textContent =
          panelKind === "image" ? "No images yet" : "No color / brand sets";
        list.appendChild(empty);
        return;
      }
      assets.forEach((asset) => {
        const item = document.createElement("div");
        item.className = "sc-asset-thumb";
        item.setAttribute("role", "button");
        item.tabIndex = 0;
        if (selectedAssetIds.includes(asset.id)) item.classList.add("is-selected");
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
          img.alt = asset.name || "Asset";
          img.src = asset.dataUrl;
          item.appendChild(img);

          const removeBtn = document.createElement("button");
          removeBtn.type = "button";
          removeBtn.className = "sc-asset-del";
          removeBtn.setAttribute("aria-label", "Remove image");
          removeBtn.title = "Remove";
          removeBtn.appendChild(materialIcon("close"));
          removeBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            e.preventDefault();
            try {
              if (!window.SeeCaptureAssets?.deleteAsset) {
                throw new Error("Assets unavailable");
              }
              await window.SeeCaptureAssets.deleteAsset(asset.id);
              selectedAssetIds = selectedAssetIds.filter((id) => id !== asset.id);
              updateAssetCountLabel();
              await refreshPanel();
            } catch (err) {
              alert(err?.message || "Could not remove asset");
            }
          });
          item.appendChild(removeBtn);
        }
        const toggleSelect = (e) => {
          e.stopPropagation();
          if (selectedAssetIds.includes(asset.id)) {
            selectedAssetIds = selectedAssetIds.filter((id) => id !== asset.id);
          } else {
            selectedAssetIds = [...selectedAssetIds, asset.id];
          }
          updateAssetCountLabel();
          refreshPanel();
        };
        item.addEventListener("click", toggleSelect);
        item.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleSelect(e);
          }
        });
        list.appendChild(item);
      });
    }

    imagesTab.addEventListener("click", (e) => {
      e.stopPropagation();
      panelKind = "image";
      imagesTab.classList.add("is-active");
      brandTab.classList.remove("is-active");
      refreshPanel();
    });
    brandTab.addEventListener("click", (e) => {
      e.stopPropagation();
      panelKind = "palette";
      brandTab.classList.add("is-active");
      imagesTab.classList.remove("is-active");
      refreshPanel();
    });

    assetsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const opening = panel.classList.contains("is-hidden");
      panel.classList.toggle("is-hidden");
      if (opening) refreshPanel();
    });

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
        panelKind = "image";
        imagesTab.classList.add("is-active");
        brandTab.classList.remove("is-active");
        await refreshPanel();
      } catch (err) {
        alert(err?.message || "Could not save asset");
      }
    });

    panel.appendChild(tabRow);
    panel.appendChild(tabDivider);
    panel.appendChild(list);
    assetsWrap.appendChild(assetsBtn);
    assetsWrap.appendChild(panel);
    assetsWrap.appendChild(fileInput);

    const applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.className = "sc-composer-apply";
    applyBtn.textContent = "Apply";
    applyBtnRef = applyBtn;
    applyBtn.addEventListener("click", () => runPromptApply(rightWrap));

    const aspectWrap = document.createElement("div");
    aspectWrap.className = "sc-aspect-wrap";
    const aspectBtn = document.createElement("button");
    aspectBtn.type = "button";
    aspectBtn.className = "sc-aspect-btn";
    aspectBtn.setAttribute("aria-label", "Aspect ratio");
    aspectBtn.setAttribute("aria-haspopup", "listbox");
    aspectBtn.setAttribute("aria-expanded", "false");
    const aspectLabel = document.createElement("span");
    aspectLabel.className = "sc-aspect-label";
    aspectLabel.textContent = "Original";
    aspectBtn.appendChild(aspectLabel);
    aspectBtn.appendChild(materialIcon("expand_more", "sc-btn-icon sc-btn-caret"));

    const aspectPop = document.createElement("div");
    aspectPop.className = "sc-aspect-pop is-hidden";
    aspectPop.setAttribute("role", "listbox");
    const aspectOptions = [
      { value: "original", label: "Original" },
      { value: "16:9", label: "Landscape 16:9" },
      { value: "16:10", label: "Desktop 16:10" },
      { value: "1:1", label: "Square 1:1" },
      { value: "9:16", label: "Portrait 9:16" },
    ];

    function closeAspectPop() {
      aspectPop.classList.add("is-hidden");
      aspectBtn.setAttribute("aria-expanded", "false");
    }

    function setAspectSelection(value, label) {
      aspectLabel.textContent = label;
      aspectPop.querySelectorAll(".sc-aspect-option").forEach((el) => {
        const selected = el.dataset.value === value;
        el.classList.toggle("is-selected", selected);
        el.setAttribute("aria-selected", selected ? "true" : "false");
      });
    }

    aspectOptions.forEach((opt) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className =
        "sc-aspect-option" + (opt.value === "original" ? " is-selected" : "");
      item.dataset.value = opt.value;
      item.setAttribute("role", "option");
      item.setAttribute(
        "aria-selected",
        opt.value === "original" ? "true" : "false"
      );
      item.textContent = opt.label;
      item.addEventListener("click", async (e) => {
        e.stopPropagation();
        setAspectSelection(opt.value, opt.label);
        closeAspectPop();
        if (opt.value === "original" || !croppedDataUrl) return;
        try {
          const source = resultDataUrl || croppedDataUrl;
          const reframed = await applyAspectRatio(source, opt.value);
          showResult(rightWrap, reframed);
        } catch (err) {
          alert(err?.message || "Could not apply aspect ratio");
        }
      });
      aspectPop.appendChild(item);
    });

    aspectBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const opening = aspectPop.classList.contains("is-hidden");
      if (opening) {
        if (assetsPanelEl) assetsPanelEl.classList.add("is-hidden");
        aspectPop.classList.remove("is-hidden");
        aspectBtn.setAttribute("aria-expanded", "true");
      } else {
        closeAspectPop();
      }
    });
    aspectWrap.appendChild(aspectBtn);
    aspectWrap.appendChild(aspectPop);

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        runPromptApply(rightWrap);
      }
    });

    toolbar.appendChild(assetsWrap);
    toolbar.appendChild(aspectWrap);
    toolbar.appendChild(applyBtn);
    field.appendChild(input);
    field.appendChild(toolbar);
    composer.appendChild(quick);
    composer.appendChild(field);
    return composer;
  }

  async function runQuickPreset(presetId, rightWrap) {
    if (inFlight || !croppedDataUrl) return;
    inFlight = true;
    if (applyBtnRef) applyBtnRef.disabled = true;
    const buttons = shadowRoot
      ? [...shadowRoot.querySelectorAll(".sc-quick-btn")]
      : [];
    buttons.forEach((b) => {
      b.disabled = true;
    });
    showWorking(rightWrap);
    try {
      const data = await requestEdit(presetId, {
        imageDataUrl: resultDataUrl || croppedDataUrl,
        useAssets: false,
      });
      showResult(rightWrap, data.imageDataUrl);
      chrome.runtime.sendMessage({
        type: "SAVE_RESULT",
        presetId,
        captureDataUrl: croppedDataUrl,
        resultDataUrl: data.imageDataUrl,
      });
    } catch (err) {
      showError(
        rightWrap,
        err?.message ||
          "Request failed. Is the local server running on port 8787?"
      );
    } finally {
      inFlight = false;
      if (applyBtnRef) applyBtnRef.disabled = false;
      buttons.forEach((b) => {
        b.disabled = false;
      });
    }
  }

  function updateAssetCountLabel() {
    if (!assetCountEl) return;
    const n = selectedAssetIds.length;
    assetCountEl.textContent = n ? String(n) : "";
    assetCountEl.classList.toggle("is-empty", !n);
    assetCountEl.setAttribute("aria-hidden", n ? "false" : "true");
  }

  async function runPromptApply(rightWrap) {
    if (inFlight || !croppedDataUrl) return;
    const prompt = String(promptInputRef?.value || "").trim();
    if (!prompt) {
      alert("Write a prompt describing what to change.");
      return;
    }
    inFlight = true;
    if (applyBtnRef) applyBtnRef.disabled = true;
    showWorking(rightWrap);
    try {
      const data = await requestEdit("custom-prompt", {
        imageDataUrl: resultDataUrl || croppedDataUrl,
        prompt,
        useAssets: selectedAssetIds.length > 0,
      });
      showResult(rightWrap, data.imageDataUrl);
      chrome.runtime.sendMessage({
        type: "SAVE_RESULT",
        presetId: "custom-prompt",
        captureDataUrl: croppedDataUrl,
        resultDataUrl: data.imageDataUrl,
      });
    } catch (err) {
      showError(
        rightWrap,
        err?.message ||
          "Request failed. Is the local server running on port 8787?"
      );
    } finally {
      inFlight = false;
      if (applyBtnRef) applyBtnRef.disabled = false;
    }
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  }

  function setSelectedPane(pane) {
    selectedPane = pane === "result" ? "result" : "capture";
    if (leftWrapRef) {
      const on = selectedPane === "capture";
      leftWrapRef.classList.toggle("is-selected", on);
      leftWrapRef.setAttribute("aria-pressed", on ? "true" : "false");
    }
    if (rightWrapRef) {
      const on = selectedPane === "result";
      rightWrapRef.classList.toggle("is-selected", on);
      rightWrapRef.setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  function getCurrentSaveImage() {
    if (selectedPane === "result") {
      return resultDataUrl || croppedDataUrl;
    }
    return croppedDataUrl || resultDataUrl;
  }

  function showHeaderBack(onClick) {
    headerBackHandler = onClick || null;
    if (headerBackRef) headerBackRef.classList.remove("is-hidden");
  }

  function hideHeaderBack() {
    headerBackHandler = null;
    if (headerBackRef) headerBackRef.classList.add("is-hidden");
  }

  function hideCaptureChrome() {
    if (bodyRef) bodyRef.classList.add("is-hidden");
    if (composerRef) composerRef.classList.add("is-hidden");
    if (headerActionsRef) headerActionsRef.classList.add("is-hidden");
  }

  function showCaptureChrome() {
    if (bodyRef) bodyRef.classList.remove("is-hidden");
    if (composerRef) composerRef.classList.remove("is-hidden");
    if (headerActionsRef) headerActionsRef.classList.remove("is-hidden");
  }

  function clearModalSubviews() {
    if (!modalRef) return;
    modalRef
      .querySelectorAll(".sc-boards-view, .sc-moodboard")
      .forEach((el) => el.remove());
    moodboardViewerApi = null;
  }

  function restoreCaptureView() {
    clearModalSubviews();
    hideHeaderBack();
    showCaptureChrome();
  }

  async function showMoodboardsPanel() {
    if (!modalRef) return;
    clearModalSubviews();
    moodboardViewerApi = null;
    hideCaptureChrome();
    showHeaderBack(() => restoreCaptureView());

    await flushMoodboardInbox();

    const view = document.createElement("div");
    view.className = "sc-boards-view";

    const heading = document.createElement("h3");
    heading.className = "sc-boards-view-title";
    heading.textContent = "Moodboards";

    const search = document.createElement("input");
    search.type = "search";
    search.className = "sc-boards-search";
    search.placeholder = "Search moodboards…";
    search.setAttribute("aria-label", "Search moodboards");

    const createRow = document.createElement("div");
    createRow.className = "sc-board-create";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "sc-board-name-input";
    nameInput.placeholder = "Name your board";
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "sc-board-add-btn";
    addBtn.textContent = "Add";

    async function createAndOpen() {
      const name = String(nameInput.value || "").trim();
      if (!name) {
        nameInput.focus();
        return;
      }
      const dataUrl = getCurrentSaveImage();
      if (!dataUrl) {
        alert("Nothing to save yet. Capture an area first.");
        return;
      }
      try {
        addBtn.disabled = true;
        const board = await window.SeeCaptureMoodboards.createMoodboard(name);
        await window.SeeCaptureMoodboards.addImage(board.id, dataUrl);
        showAppToast("Saved to board", board.name);
        await openMoodboardViewer(board.id);
      } catch (err) {
        console.error(err);
        alert(err?.message || "Could not create board");
        addBtn.disabled = false;
      }
    }

    addBtn.addEventListener("click", () => createAndOpen());
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        createAndOpen();
      }
    });
    createRow.appendChild(nameInput);
    createRow.appendChild(addBtn);

    const list = document.createElement("div");
    list.className = "sc-boards-chips";

    let boards = [];
    try {
      boards = (await window.SeeCaptureMoodboards?.listMoodboards?.()) || [];
      await syncMoodboardReceiversFromDb();
    } catch (err) {
      console.error(err);
    }

    function renderChips(filterText) {
      list.innerHTML = "";
      const q = String(filterText || "")
        .trim()
        .toLowerCase();
      const filtered = q
        ? boards.filter((b) => String(b.name || "").toLowerCase().includes(q))
        : boards;

      if (!filtered.length) {
        const empty = document.createElement("div");
        empty.className = "sc-board-empty";
        empty.textContent = boards.length
          ? "No boards match your search."
          : "No boards yet. Name one above to save this image.";
        list.appendChild(empty);
        return;
      }

      filtered.forEach((board) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "sc-board-chip";
        const count = Array.isArray(board.images) ? board.images.length : 0;

        const nameEl = document.createElement("span");
        nameEl.className = "sc-board-chip-name";
        nameEl.textContent = board.name || "Board";
        const meta = document.createElement("span");
        meta.className = "sc-board-chip-meta";
        meta.textContent = `${count} image${count === 1 ? "" : "s"}`;

        const previews = document.createElement("div");
        previews.className = "sc-board-chip-previews";
        (board.images || []).slice(0, 4).forEach((img) => {
          const thumb = document.createElement("img");
          thumb.src = img.dataUrl;
          thumb.alt = "";
          previews.appendChild(thumb);
        });
        if (count > 4) {
          const more = document.createElement("span");
          more.className = "sc-board-chip-more";
          more.textContent = `+${count - 4}`;
          previews.appendChild(more);
        }

        chip.appendChild(nameEl);
        chip.appendChild(meta);
        chip.appendChild(previews);
        chip.addEventListener("click", async () => {
          await openMoodboardViewer(board.id);
        });
        list.appendChild(chip);
      });
    }

    search.addEventListener("input", () => renderChips(search.value));
    renderChips("");

    view.appendChild(heading);
    view.appendChild(search);
    view.appendChild(createRow);
    view.appendChild(list);
    modalRef.appendChild(view);
    search.focus();
  }

  function showAppToast(titleText, subText) {
    if (!shadowRoot) return;
    let toast = shadowRoot.querySelector(".sc-app-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "sc-app-toast";
      toast.setAttribute("role", "status");
      const title = document.createElement("span");
      title.className = "sc-app-toast-title";
      const sub = document.createElement("span");
      sub.className = "sc-app-toast-sub";
      toast.appendChild(title);
      toast.appendChild(sub);
      shadowRoot.appendChild(toast);
    }
    toast.querySelector(".sc-app-toast-title").textContent = titleText;
    toast.querySelector(".sc-app-toast-sub").textContent = subText || "";
    toast.classList.remove("is-visible");
    void toast.offsetWidth;
    toast.classList.add("is-visible");
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => {
      toast.classList.remove("is-visible");
    }, 2200);
  }

  async function addCurrentImageToMoodboard(boardId, boardName) {
    const dataUrl = getCurrentSaveImage();
    if (!dataUrl) {
      alert("Nothing to add yet. Capture an area first.");
      return;
    }
    const api = window.SeeCaptureMoodboards;
    if (!api?.addImage) {
      alert("Boards unavailable.");
      return;
    }
    try {
      await api.addImage(boardId, dataUrl);
      showAppToast("Added to board", boardName || "Board");
    } catch (err) {
      console.error(err);
      alert(err?.message || "Could not add to board");
    }
  }

  async function openMoodboardViewer(boardId) {
    const api = window.SeeCaptureMoodboards;
    const ui = window.SeeCaptureMoodboardUI;
    if (!api?.getMoodboard || !ui?.mountMoodboardViewer || !modalRef) {
      alert("Moodboards unavailable.");
      return;
    }
    try {
      await flushMoodboardInbox();
      await syncMoodboardReceiversFromDb();
      const board = await api.getMoodboard(boardId);
      if (!board) {
        alert("Moodboard not found.");
        return;
      }
      clearModalSubviews();
      hideCaptureChrome();
      showHeaderBack(() => {
        moodboardViewerApi = null;
        restoreCaptureView();
      });
      moodboardViewerApi = ui.mountMoodboardViewer({
        hostEl: modalRef,
        embedded: true,
        board,
        materialIcon,
        saveDataUrl: (url) => saveImageToComputer(null, url),
        openPreview: (url) =>
          openImagePreview(url, { mode: "preview", target: "none" }),
        onClose: () => {
          moodboardViewerApi = null;
          restoreCaptureView();
        },
        onBack: () => {
          moodboardViewerApi = null;
          restoreCaptureView();
        },
      });
    } catch (err) {
      console.error(err);
      alert(err?.message || "Could not open moodboard");
    }
  }

  async function saveImageToComputer(button, overrideDataUrl) {
    const dataUrl = overrideDataUrl || getCurrentSaveImage();
    if (!dataUrl) {
      alert("Nothing to save yet. Capture an area first.");
      return;
    }

    const previous = button ? button.innerHTML : null;
    if (button) {
      button.disabled = true;
      button.innerHTML = "<span>Saving…</span>";
    }

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
      if (button && previous != null) {
        button.disabled = false;
        button.innerHTML = previous;
      }
    }
  }

  async function dataUrlToBlob(dataUrl) {
    const response = await fetch(dataUrl);
    return response.blob();
  }

  function syncLightboxImage(dataUrl) {
    const lightboxImg = shadowRoot?.querySelector(
      ".sc-lightbox-inner img.sc-lightbox-image"
    );
    if (lightboxImg) lightboxImg.src = dataUrl;
  }

  function syncCaptureImage(dataUrl) {
    croppedDataUrl = dataUrl;
    if (leftWrapRef) {
      const img = leftWrapRef.querySelector("img");
      if (img) img.src = dataUrl;
    }
    syncLightboxImage(dataUrl);
  }

  function syncResultImage(dataUrl) {
    resultDataUrl = dataUrl;
    if (rightWrapRef) {
      const img = rightWrapRef.querySelector("img");
      if (img) img.src = dataUrl;
    }
    syncLightboxImage(dataUrl);
  }

  function attachImageActions(wrap, target) {
    wrap.querySelector(".sc-result-actions")?.remove();
    const actions = document.createElement("div");
    actions.className = "sc-result-actions";

    const previewBtn = document.createElement("button");
    previewBtn.type = "button";
    previewBtn.className = "sc-preview-btn";
    previewBtn.textContent = "Preview";
    previewBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const url =
        target === "capture"
          ? croppedDataUrl
          : resultDataUrl || wrap.querySelector("img")?.src;
      if (url) openImagePreview(url, { mode: "preview", target });
    });

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "sc-preview-btn sc-edit-btn";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const url =
        target === "capture"
          ? croppedDataUrl
          : resultDataUrl || wrap.querySelector("img")?.src;
      if (url) openImagePreview(url, { mode: "edit", target });
    });

    actions.appendChild(previewBtn);
    actions.appendChild(editBtn);
    wrap.appendChild(actions);
  }

  function showResult(resultWrap, dataUrl) {
    resultWrap.innerHTML = "";
    resultWrap.classList.add("is-result");
    const img = document.createElement("img");
    img.alt = "Generated result";
    img.src = dataUrl;
    resultWrap.appendChild(img);
    attachImageActions(resultWrap, "result");
    resultDataUrl = dataUrl;
    setSelectedPane("result");
  }

  function openImagePreview(dataUrl, opts) {
    if (!shadowRoot || !dataUrl) return;
    const mode = opts && opts.mode === "edit" ? "edit" : "preview";
    const targetRaw = opts && opts.target;
    const target =
      targetRaw === "capture"
        ? "capture"
        : targetRaw === "none"
          ? "none"
          : "result";
    const existing = shadowRoot.querySelector(".sc-lightbox");
    if (existing) existing.remove();

    const working = { url: dataUrl };

    const lightbox = document.createElement("div");
    lightbox.className = "sc-lightbox";
    lightbox.setAttribute("role", "dialog");
    lightbox.setAttribute(
      "aria-label",
      mode === "edit" ? "Edit image" : "Image preview"
    );

    const panel = document.createElement("div");
    panel.className =
      mode === "edit" ? "sc-lightbox-panel is-edit" : "sc-lightbox-panel";

    const stage = document.createElement("div");
    stage.className = "sc-lightbox-stage";

    const inner = document.createElement("div");
    inner.className = "sc-lightbox-inner";

    const img = document.createElement("img");
    img.className = "sc-lightbox-image";
    img.alt = mode === "edit" ? "Edit view" : "Full preview";
    img.src = working.url;

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "sc-lightbox-close";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.appendChild(materialIcon("close"));

    const tools = document.createElement("div");
    tools.className = "sc-lightbox-tools";

    const close = () => {
      window.removeEventListener("keydown", onKey, true);
      if (target === "capture") {
        syncCaptureImage(working.url);
      } else if (target === "result") {
        syncResultImage(working.url);
        if (rightWrapRef) showResult(rightWrapRef, working.url);
      }
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
    panel.addEventListener("click", (e) => e.stopPropagation());
    lightbox.addEventListener("click", close);
    window.addEventListener("keydown", onKey, true);

    inner.appendChild(img);
    stage.appendChild(inner);
    if (mode === "edit") stage.appendChild(tools);
    panel.appendChild(closeBtn);
    panel.appendChild(stage);
    lightbox.appendChild(panel);
    shadowRoot.appendChild(lightbox);

    if (
      mode === "edit" &&
      window.SeeCapturePreviewEdit?.mountPreviewChrome
    ) {
      window.SeeCapturePreviewEdit.mountPreviewChrome({
        toolbarHost: tools,
        stageEl: inner,
        getImageEl: () => inner.querySelector("img"),
        getImageDataUrl: () => working.url,
        setImageDataUrl: (url) => {
          working.url = url;
          if (target === "capture") {
            syncCaptureImage(url);
          } else if (target === "result") {
            syncResultImage(url);
          }
        },
        editTargetLabel: target === "capture" ? "Capture" : "Result",
        requestEdit: (presetId, editOpts) => requestEdit(presetId, editOpts),
        saveDataUrl: (url) => saveImageToComputer(null, url),
      });
    }
  }

  function applyAspectRatio(dataUrl, ratioLabel) {
    const parts = String(ratioLabel).split(":");
    const rw = Number(parts[0]);
    const rh = Number(parts[1]);
    if (!rw || !rh) {
      return Promise.resolve(dataUrl);
    }
    const target = rw / rh;
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const srcW = img.naturalWidth || img.width;
          const srcH = img.naturalHeight || img.height;
          const srcRatio = srcW / srcH;
          let sx = 0;
          let sy = 0;
          let sw = srcW;
          let sh = srcH;
          if (srcRatio > target) {
            sw = Math.round(srcH * target);
            sx = Math.round((srcW - sw) / 2);
          } else if (srcRatio < target) {
            sh = Math.round(srcW / target);
            sy = Math.round((srcH - sh) / 2);
          }
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, sw);
          canvas.height = Math.max(1, sh);
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
          resolve(canvas.toDataURL("image/png"));
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = dataUrl;
    });
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

  async function requestEdit(presetId, opts) {
    const useAssets = Boolean(opts && opts.useAssets);
    const skipBlend = Boolean(opts && opts.skipBlend);
    const sourceImage =
      (opts && opts.imageDataUrl) || resultDataUrl || croppedDataUrl;
    const customPrompt =
      opts && typeof opts.prompt === "string" ? opts.prompt : "";
    let imageForEdit = sourceImage;
    let prepared = {
      imageDataUrl: sourceImage,
      presetId,
      prompt: customPrompt,
      assets: [],
      pageContext: {},
      model: "eden",
    };

    if (window.SeeCapturePayload?.preparePayload) {
      prepared = await window.SeeCapturePayload.preparePayload({
        imageDataUrl: sourceImage,
        presetId,
        prompt: customPrompt,
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
        sourceImage,
        prepared.assets
      );
    }

    const message = {
      type: "EDIT_IMAGE",
      imageDataUrl: imageForEdit,
      presetId: prepared.presetId,
      model: prepared.model,
      prompt: customPrompt || prepared.prompt || "",
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
