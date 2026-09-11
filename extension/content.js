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
  let leftLabelRef = null;
  let rightLabelRef = null;
  let selectedPane = "capture";
  let modalRef = null;
  let bodyRef = null;
  let composerRef = null;
  let headerActionsRef = null;
  let headerBackRef = null;
  let headerBackHandler = null;
  let promptInputRef = null;
  let applyBtnRef = null;
  let selectedAspectRatio = "original";
  let assetCountEl = null;
  let assetBadgesEl = null;
  let assetsPanelEl = null;
  let moodboardViewerApi = null;
  let selectedAssetMeta = {};
  let workflowMode = "all";
  let allWorkspaceRef = null;
  let mashupWorkspaceRef = null;
  let workflowPopRef = null;
  let workflowLabelRef = null;
  let mashupSubjectPreviewRef = null;
  let mashupStylePreviewRef = null;
  let mashupResultWrapRef = null;
  let mashupPromptRef = null;
  let mashupGenerateBtnRef = null;
  let mashupMemory = {
    subjectDataUrl: null,
    styleDataUrl: null,
    resultDataUrl: null,
    pendingSlot: null,
  };
  let textRemixWorkspaceRef = null;
  let visualLocalizerWorkspaceRef = null;
  let textRemixMemory = {
    captureDataUrl: null,
    texts: [],
    resultDataUrl: null,
    pendingCapture: false,
  };
  let visualLocalizerMemory = {
    captureDataUrl: null,
    texts: [],
    languages: ["es"],
    style: "literal",
    drafts: {},
    results: {},
    pendingCapture: false,
  };
  let textRemixUi = {};
  let visualLocalizerUi = {};

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "SC_PING") {
      sendResponse({ ok: true });
      return;
    }
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

  async function loadMashupMemory() {
    try {
      const data = await chrome.storage.local.get({ mashupState: null });
      const raw = data.mashupState || {};
      mashupMemory = {
        subjectDataUrl: raw.subjectDataUrl || null,
        styleDataUrl: raw.styleDataUrl || null,
        resultDataUrl: raw.resultDataUrl || null,
        pendingSlot:
          raw.pendingSlot === "subject" || raw.pendingSlot === "style"
            ? raw.pendingSlot
            : null,
      };
    } catch (err) {
      console.error(err);
    }
    return mashupMemory;
  }

  async function saveMashupMemory(patch) {
    mashupMemory = { ...mashupMemory, ...(patch || {}) };
    try {
      await chrome.storage.local.set({ mashupState: mashupMemory });
    } catch (err) {
      console.error(err);
    }
    return mashupMemory;
  }

  async function consumeMashupPendingSlot(dataUrl) {
    await loadMashupMemory();
    const slot = mashupMemory.pendingSlot;
    if (slot !== "subject" && slot !== "style") return false;
    const patch =
      slot === "subject"
        ? { subjectDataUrl: dataUrl, pendingSlot: null }
        : { styleDataUrl: dataUrl, pendingSlot: null };
    await saveMashupMemory(patch);
    return true;
  }

  async function startMashupSlotCapture(slot) {
    if (inFlight || capturing) return;
    await saveMashupMemory({ pendingSlot: slot });
    teardownHost();
    beginCapture();
  }

  async function loadTextRemixMemory() {
    try {
      const data = await chrome.storage.local.get({ textRemixState: null });
      const raw = data.textRemixState || {};
      textRemixMemory = {
        captureDataUrl: raw.captureDataUrl || null,
        texts: Array.isArray(raw.texts) ? raw.texts : [],
        resultDataUrl: raw.resultDataUrl || null,
        pendingCapture: Boolean(raw.pendingCapture),
      };
    } catch (err) {
      console.error(err);
    }
    return textRemixMemory;
  }

  async function saveTextRemixMemory(patch) {
    textRemixMemory = { ...textRemixMemory, ...(patch || {}) };
    try {
      await chrome.storage.local.set({ textRemixState: textRemixMemory });
    } catch (err) {
      console.error(err);
    }
    return textRemixMemory;
  }

  async function loadVisualLocalizerMemory() {
    try {
      const data = await chrome.storage.local.get({
        visualLocalizerState: null,
      });
      const raw = data.visualLocalizerState || {};
      visualLocalizerMemory = {
        captureDataUrl: raw.captureDataUrl || null,
        texts: Array.isArray(raw.texts) ? raw.texts : [],
        languages: Array.isArray(raw.languages) && raw.languages.length
          ? raw.languages
          : ["es"],
        style: raw.style === "marketing" ? "marketing" : "literal",
        drafts: raw.drafts && typeof raw.drafts === "object" ? raw.drafts : {},
        results:
          raw.results && typeof raw.results === "object" ? raw.results : {},
        pendingCapture: Boolean(raw.pendingCapture),
      };
    } catch (err) {
      console.error(err);
    }
    return visualLocalizerMemory;
  }

  async function saveVisualLocalizerMemory(patch) {
    visualLocalizerMemory = { ...visualLocalizerMemory, ...(patch || {}) };
    try {
      await chrome.storage.local.set({
        visualLocalizerState: visualLocalizerMemory,
      });
    } catch (err) {
      console.error(err);
    }
    return visualLocalizerMemory;
  }

  async function consumeTextWorkflowPending(dataUrl) {
    await loadTextRemixMemory();
    await loadVisualLocalizerMemory();
    if (textRemixMemory.pendingCapture) {
      await saveTextRemixMemory({
        captureDataUrl: dataUrl,
        texts: [],
        resultDataUrl: null,
        pendingCapture: false,
      });
      return "text-remix";
    }
    if (visualLocalizerMemory.pendingCapture) {
      await saveVisualLocalizerMemory({
        captureDataUrl: dataUrl,
        texts: [],
        drafts: {},
        results: {},
        pendingCapture: false,
      });
      return "visual-localizer";
    }
    return null;
  }

  async function startTextWorkflowCapture(workflow) {
    if (inFlight || capturing) return;
    if (workflow === "text-remix") {
      await saveTextRemixMemory({ pendingCapture: true });
    } else if (workflow === "visual-localizer") {
      await saveVisualLocalizerMemory({ pendingCapture: true });
    }
    teardownHost();
    beginCapture();
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
    selectedAssetMeta = {};
    leftWrapRef = null;
    rightWrapRef = null;
    leftLabelRef = null;
    rightLabelRef = null;
    selectedPane = "capture";
    modalRef = null;
    bodyRef = null;
    composerRef = null;
    headerActionsRef = null;
    headerBackRef = null;
    headerBackHandler = null;
    promptInputRef = null;
    applyBtnRef = null;
    selectedAspectRatio = "original";
    assetCountEl = null;
    assetBadgesEl = null;
    assetsPanelEl = null;
    allWorkspaceRef = null;
    mashupWorkspaceRef = null;
    workflowPopRef = null;
    workflowLabelRef = null;
    mashupSubjectPreviewRef = null;
    mashupStylePreviewRef = null;
    mashupResultWrapRef = null;
    mashupPromptRef = null;
    mashupGenerateBtnRef = null;
    textRemixWorkspaceRef = null;
    visualLocalizerWorkspaceRef = null;
    textRemixUi = {};
    visualLocalizerUi = {};
    workflowMode = "all";
  }

  async function cancelMashupCaptureIfNeeded() {
    await loadMashupMemory();
    await loadTextRemixMemory();
    await loadVisualLocalizerMemory();
    if (mashupMemory.pendingSlot) {
      await saveMashupMemory({ pendingSlot: null });
      const reopenUrl =
        mashupMemory.subjectDataUrl ||
        mashupMemory.styleDataUrl ||
        mashupMemory.resultDataUrl;
      if (reopenUrl) {
        ensureHost();
        await showModal(reopenUrl, { workflow: "mashup" });
        return true;
      }
      return false;
    }
    if (textRemixMemory.pendingCapture) {
      await saveTextRemixMemory({ pendingCapture: false });
      const reopenUrl =
        textRemixMemory.captureDataUrl || textRemixMemory.resultDataUrl;
      if (reopenUrl) {
        ensureHost();
        await showModal(reopenUrl, { workflow: "text-remix" });
        return true;
      }
      return false;
    }
    if (visualLocalizerMemory.pendingCapture) {
      await saveVisualLocalizerMemory({ pendingCapture: false });
      const reopenUrl = visualLocalizerMemory.captureDataUrl;
      if (reopenUrl) {
        ensureHost();
        await showModal(reopenUrl, { workflow: "visual-localizer" });
        return true;
      }
      return false;
    }
    return false;
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
        cancelMashupCaptureIfNeeded();
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
        cancelMashupCaptureIfNeeded();
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
        const pendingMashup = await consumeMashupPendingSlot(croppedDataUrl);
        if (pendingMashup) {
          showModal(croppedDataUrl, { workflow: "mashup" });
          return;
        }
        const pendingText = await consumeTextWorkflowPending(croppedDataUrl);
        if (pendingText) {
          showModal(croppedDataUrl, { workflow: pendingText });
          return;
        }
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
        const scaleX = img.width / Math.max(1, window.innerWidth);
        const scaleY = img.height / Math.max(1, window.innerHeight);
        let sx = Math.round(cssRect.left * scaleX);
        let sy = Math.round(cssRect.top * scaleY);
        let sw = Math.round(cssRect.width * scaleX);
        let sh = Math.round(cssRect.height * scaleY);
        sx = Math.max(0, Math.min(img.width - 1, sx));
        sy = Math.max(0, Math.min(img.height - 1, sy));
        sw = Math.max(1, Math.min(img.width - sx, sw));
        sh = Math.max(1, Math.min(img.height - sy, sh));

        const canvas = document.createElement("canvas");
        canvas.width = sw;
        canvas.height = sh;
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
    info:
      "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z",
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

  async function showModal(captureDataUrl, opts) {
    modalOpen = true;
    resultDataUrl = null;
    croppedDataUrl = captureDataUrl || null;
    selectedAssetIds = [];
    selectedAssetMeta = {};
    contextEnabled = false;
    await loadMashupMemory();
    await loadTextRemixMemory();
    await loadVisualLocalizerMemory();
    const allowed = ["all", "mashup", "text-remix", "visual-localizer"];
    const initialWorkflow = allowed.includes(opts?.workflow)
      ? opts.workflow
      : "all";
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
    brand.className = "sc-header-brand sc-workflow-brand";
    brand.setAttribute("aria-label", "See & Capture workflows");

    const logo = document.createElement("img");
    logo.className = "sc-header-logo";
    logo.src = chrome.runtime.getURL("icons/logo.png");
    logo.alt = "";
    logo.draggable = false;

    const workflowBtn = document.createElement("button");
    workflowBtn.type = "button";
    workflowBtn.className = "sc-workflow-btn";
    workflowBtn.setAttribute("aria-haspopup", "menu");
    workflowBtn.setAttribute("aria-expanded", "false");

    const wordmark = document.createElement("span");
    wordmark.className = "sc-header-wordmark";
    const seePart = document.createElement("span");
    seePart.className = "sc-header-wordmark-see";
    seePart.textContent = "See";
    wordmark.appendChild(seePart);
    const ampPart = document.createElement("span");
    ampPart.className = "sc-header-wordmark-amp";
    ampPart.textContent = " & ";
    ampPart.setAttribute("aria-hidden", "true");
    wordmark.appendChild(ampPart);
    const captureEm = document.createElement("em");
    captureEm.textContent = "Capture";
    wordmark.appendChild(captureEm);

    const workflowLabel = document.createElement("span");
    workflowLabel.className = "sc-workflow-label";
    workflowLabel.textContent = "All";
    workflowLabelRef = workflowLabel;

    workflowBtn.appendChild(wordmark);
    workflowBtn.appendChild(workflowLabel);
    workflowBtn.appendChild(materialIcon("expand_more", "sc-btn-icon sc-btn-caret"));

    const workflowPop = document.createElement("div");
    workflowPop.className = "sc-workflow-pop is-hidden";
    workflowPop.setAttribute("role", "menu");
    workflowPopRef = workflowPop;

    const workflowsHead = document.createElement("p");
    workflowsHead.className = "sc-workflow-pop-head";
    workflowsHead.textContent = "Workflows";
    workflowPop.appendChild(workflowsHead);

    function addWorkflowOption(id, label) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "sc-workflow-option";
      item.dataset.workflow = id;
      item.setAttribute("role", "menuitem");
      item.textContent = label;
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        workflowPop.classList.add("is-hidden");
        workflowBtn.setAttribute("aria-expanded", "false");
        setWorkflowMode(id);
      });
      workflowPop.appendChild(item);
    }
    addWorkflowOption("all", "See & Capture");
    addWorkflowOption("mashup", "See & Capture – Mashup");
    addWorkflowOption("text-remix", "Text Remix");
    addWorkflowOption("visual-localizer", "Visual Localizer");

    workflowBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const opening = workflowPop.classList.contains("is-hidden");
      workflowPop.classList.toggle("is-hidden", !opening);
      workflowBtn.setAttribute("aria-expanded", opening ? "true" : "false");
    });

    brand.appendChild(logo);
    brand.appendChild(workflowBtn);
    brand.appendChild(workflowPop);

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
    leftLabelRef = leftLabel;
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
    rightLabel.textContent = "Generation";
    rightLabelRef = rightLabel;
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

    const allWorkspace = document.createElement("div");
    allWorkspace.className = "sc-workspace sc-workspace-all";
    allWorkspace.appendChild(body);
    allWorkspace.appendChild(composer);
    allWorkspaceRef = allWorkspace;

    const mashupWorkspace = buildMashupWorkspace();
    mashupWorkspaceRef = mashupWorkspace;
    const textRemixWorkspace = buildTextRemixWorkspace();
    textRemixWorkspaceRef = textRemixWorkspace;
    const visualLocalizerWorkspace = buildVisualLocalizerWorkspace();
    visualLocalizerWorkspaceRef = visualLocalizerWorkspace;

    modal.appendChild(header);
    modal.appendChild(allWorkspace);
    modal.appendChild(mashupWorkspace);
    modal.appendChild(textRemixWorkspace);
    modal.appendChild(visualLocalizerWorkspace);
    glass.appendChild(modal);
    root.appendChild(glass);
    shadowRoot.appendChild(root);

    setWorkflowMode(initialWorkflow);

    const onKeyDown = (e) => {
      if (e.key === "Escape" && !inFlight) {
        const tipOpen = shadowRoot.querySelector(
          ".sc-apply-tip-pop:not(.is-hidden)"
        );
        if (tipOpen) {
          e.stopPropagation();
          tipOpen.classList.add("is-hidden");
          const tipBtn = shadowRoot.querySelector(".sc-apply-tip-btn");
          if (tipBtn) tipBtn.setAttribute("aria-expanded", "false");
          return;
        }
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
      if (!workflowPop.classList.contains("is-hidden")) {
        if (!e.target.closest(".sc-workflow-brand")) {
          workflowPop.classList.add("is-hidden");
          const wfBtn = shadowRoot.querySelector(".sc-workflow-btn");
          if (wfBtn) wfBtn.setAttribute("aria-expanded", "false");
        }
      }
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
      const tipPop = shadowRoot?.querySelector(".sc-apply-tip-pop:not(.is-hidden)");
      if (tipPop && !e.target.closest(".sc-apply-tip-wrap")) {
        tipPop.classList.add("is-hidden");
        const tipBtn = shadowRoot.querySelector(".sc-apply-tip-btn");
        if (tipBtn) tipBtn.setAttribute("aria-expanded", "false");
      }
      if (e.target === root && !inFlight) teardownHost();
    });
  }

  function setWorkflowMode(mode) {
    const allowed = ["all", "mashup", "text-remix", "visual-localizer"];
    workflowMode = allowed.includes(mode) ? mode : "all";
    if (allWorkspaceRef) {
      allWorkspaceRef.classList.toggle("is-hidden", workflowMode !== "all");
    }
    if (mashupWorkspaceRef) {
      mashupWorkspaceRef.classList.toggle(
        "is-hidden",
        workflowMode !== "mashup"
      );
    }
    if (textRemixWorkspaceRef) {
      textRemixWorkspaceRef.classList.toggle(
        "is-hidden",
        workflowMode !== "text-remix"
      );
    }
    if (visualLocalizerWorkspaceRef) {
      visualLocalizerWorkspaceRef.classList.toggle(
        "is-hidden",
        workflowMode !== "visual-localizer"
      );
    }
    if (workflowLabelRef) {
      const labels = {
        all: "All",
        mashup: "Mashup",
        "text-remix": "Text Remix",
        "visual-localizer": "Localizer",
      };
      workflowLabelRef.textContent = labels[workflowMode] || "All";
    }
    if (workflowPopRef) {
      workflowPopRef.querySelectorAll(".sc-workflow-option").forEach((el) => {
        el.classList.toggle(
          "is-selected",
          el.dataset.workflow === workflowMode
        );
      });
    }
    if (workflowMode === "mashup") refreshMashupPreviews();
    if (workflowMode === "text-remix") refreshTextRemixUi();
    if (workflowMode === "visual-localizer") refreshVisualLocalizerUi();
  }

  function setPreviewImage(el, dataUrl, emptyText) {
    if (!el) return;
    el.innerHTML = "";
    if (!dataUrl) {
      const empty = document.createElement("div");
      empty.className = "sc-tw-empty";
      empty.textContent = emptyText;
      el.appendChild(empty);
      return;
    }
    const img = document.createElement("img");
    img.alt = emptyText;
    img.src = dataUrl;
    el.appendChild(img);
  }

  function formatProviderError(message, fallback) {
    const raw = String(message || "").trim();
    if (!raw) return fallback || "Request failed";
    const lower = raw.toLowerCase();
    const tips = [];
    if (
      lower.includes("insufficient") ||
      lower.includes("credits are insufficient") ||
      lower.includes("top up")
    ) {
      tips.push("Top up Flux credits at fluxapi.ai (they do not refill daily).");
    }
    if (lower.includes("locked") || lower.includes("top_up")) {
      tips.push(
        "Unlock/top up fal.ai billing (or regenerate the API key after topping up)."
      );
    }
    if (
      lower.includes("api key not valid") ||
      lower.includes("invalid api key") ||
      lower.includes("api key not valid")
    ) {
      tips.push("Fix GOOGLE_API_KEY in server/.env (current key is invalid).");
    }
    if (!tips.length) return raw;
    return `${tips.join(" ")}\n\nDetails: ${raw}`;
  }

  function setButtonBusy(btn, busy, idleLabel, busyLabel) {
    if (!btn) return;
    btn.disabled = !!busy;
    btn.classList.toggle("is-busy", !!busy);
    btn.innerHTML = "";
    if (busy) {
      const spinner = document.createElement("span");
      spinner.className = "sc-spinner sc-spinner-inline";
      btn.appendChild(spinner);
      const label = document.createElement("span");
      label.textContent = busyLabel || "Working…";
      btn.appendChild(label);
    } else {
      btn.textContent = idleLabel;
    }
  }

  function updateTextRemixPrimaryBtn() {
    const btn = textRemixUi.primaryBtn;
    if (!btn) return;
    if (btn.classList.contains("is-busy")) return;
    const hasTexts = (textRemixMemory.texts || []).length > 0;
    const hasCapture = Boolean(textRemixMemory.captureDataUrl);
    btn.textContent = hasTexts ? "Swap Text" : "Detect text";
    btn.disabled = inFlight || (!hasTexts && !hasCapture);
    btn.title = hasTexts
      ? "Swap detected text on the graphic"
      : "Detect text in the capture";
    btn.dataset.mode = hasTexts ? "swap" : "detect";
  }

  function attachTextRemixCaptureActions(wrap) {
    if (!wrap) return;
    wrap.querySelector(".sc-result-actions")?.remove();
    const actions = document.createElement("div");
    actions.className = "sc-result-actions sc-tw-capture-actions";

    const captureBtn = document.createElement("button");
    captureBtn.type = "button";
    captureBtn.className = "sc-preview-btn";
    captureBtn.textContent = "Capture graphic";
    captureBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      startTextWorkflowCapture("text-remix");
    });

    const previewBtn = document.createElement("button");
    previewBtn.type = "button";
    previewBtn.className = "sc-preview-btn";
    previewBtn.textContent = "Preview";
    previewBtn.disabled = !textRemixMemory.captureDataUrl;
    previewBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const url = textRemixMemory.captureDataUrl;
      if (url) openImagePreview(url, { mode: "preview", target: "none" });
    });

    actions.appendChild(captureBtn);
    actions.appendChild(previewBtn);
    wrap.appendChild(actions);
    textRemixUi.captureBtn = captureBtn;
    textRemixUi.previewBtn = previewBtn;
  }

  function fillRemixPane(wrap, dataUrl, emptyText, kind) {
    if (!wrap) return;
    wrap.innerHTML = "";
    if (!dataUrl) {
      const empty = document.createElement("div");
      empty.className = "sc-placeholder";
      empty.textContent = emptyText;
      wrap.appendChild(empty);
    } else {
      const img = document.createElement("img");
      img.alt = emptyText;
      img.src = dataUrl;
      wrap.appendChild(img);
    }
    if (kind === "capture") {
      attachTextRemixCaptureActions(wrap);
    } else if (kind === "result" && dataUrl) {
      attachTextRemixResultActions(wrap, dataUrl);
    }
  }

  function attachTextRemixResultActions(wrap, dataUrl) {
    if (!wrap) return;
    wrap.querySelector(".sc-result-actions")?.remove();
    const actions = document.createElement("div");
    actions.className = "sc-result-actions";

    const previewBtn = document.createElement("button");
    previewBtn.type = "button";
    previewBtn.className = "sc-preview-btn";
    previewBtn.textContent = "Preview";
    previewBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const url = textRemixMemory.resultDataUrl || dataUrl || wrap.querySelector("img")?.src;
      if (url) openImagePreview(url, { mode: "preview", target: "none" });
    });

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "sc-preview-btn sc-edit-btn";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const url = textRemixMemory.resultDataUrl || dataUrl || wrap.querySelector("img")?.src;
      if (!url) return;
      openImagePreview(url, { mode: "edit", target: "text-remix-result" });
    });

    actions.appendChild(previewBtn);
    actions.appendChild(editBtn);
    wrap.appendChild(actions);
  }

  function refreshTextRemixUi() {
    fillRemixPane(
      textRemixUi.captureWrap,
      textRemixMemory.captureDataUrl,
      "Capture a graphic to remix",
      "capture"
    );
    fillRemixPane(
      textRemixUi.resultWrap,
      textRemixMemory.resultDataUrl,
      "Swapped result appears here",
      "result"
    );
    const list = textRemixUi.list;
    if (list) {
      list.innerHTML = "";
      (textRemixMemory.texts || []).forEach((row, index) => {
        const item = document.createElement("div");
        item.className = "sc-tw-row";
        const original = document.createElement("div");
        original.className = "sc-tw-original";
        original.textContent = row.text;
        const input = document.createElement("input");
        input.type = "text";
        input.className = "sc-tw-input";
        input.value = row.newText != null ? row.newText : row.text;
        input.placeholder = "New copy";
        input.addEventListener("input", () => {
          textRemixMemory.texts[index] = {
            ...textRemixMemory.texts[index],
            newText: input.value,
          };
        });
        item.appendChild(original);
        item.appendChild(input);
        list.appendChild(item);
      });
    }
    updateTextRemixPrimaryBtn();
  }

  function refreshVisualLocalizerUi() {
    setPreviewImage(
      visualLocalizerUi.preview,
      visualLocalizerMemory.captureDataUrl,
      "Capture an ad graphic"
    );
    if (visualLocalizerUi.chips) {
      visualLocalizerUi.chips.querySelectorAll(".sc-tw-chip").forEach((chip) => {
        const lang = chip.dataset.lang;
        chip.classList.toggle(
          "is-selected",
          visualLocalizerMemory.languages.includes(lang)
        );
      });
    }
    if (visualLocalizerUi.styleLiteral && visualLocalizerUi.styleMarketing) {
      visualLocalizerUi.styleLiteral.checked =
        visualLocalizerMemory.style !== "marketing";
      visualLocalizerUi.styleMarketing.checked =
        visualLocalizerMemory.style === "marketing";
    }
    const table = visualLocalizerUi.table;
    if (table) {
      table.innerHTML = "";
      const langs = visualLocalizerMemory.languages || [];
      (visualLocalizerMemory.texts || []).forEach((src) => {
        const row = document.createElement("div");
        row.className = "sc-tw-table-row";
        const srcEl = document.createElement("div");
        srcEl.className = "sc-tw-original";
        srcEl.textContent = src.text;
        row.appendChild(srcEl);
        langs.forEach((lang) => {
          const draftRows = visualLocalizerMemory.drafts[lang] || [];
          const found = draftRows.find((d) => d.id === src.id);
          const input = document.createElement("input");
          input.type = "text";
          input.className = "sc-tw-input";
          input.placeholder = lang.toUpperCase();
          input.value = found?.text || "";
          input.addEventListener("input", () => {
            const list = Array.isArray(visualLocalizerMemory.drafts[lang])
              ? [...visualLocalizerMemory.drafts[lang]]
              : [];
            const idx = list.findIndex((d) => d.id === src.id);
            if (idx >= 0) list[idx] = { id: src.id, text: input.value };
            else list.push({ id: src.id, text: input.value });
            visualLocalizerMemory.drafts = {
              ...visualLocalizerMemory.drafts,
              [lang]: list,
            };
          });
          row.appendChild(input);
        });
        table.appendChild(row);
      });
    }
    const tabs = visualLocalizerUi.resultTabs;
    const resultWrap = visualLocalizerUi.resultWrap;
    if (tabs && resultWrap) {
      tabs.innerHTML = "";
      resultWrap.innerHTML = "";
      const entries = Object.entries(visualLocalizerMemory.results || {});
      if (!entries.length) {
        setPreviewImage(resultWrap, null, "Localized results appear here");
      } else {
        let active = entries[0][0];
        entries.forEach(([lang, url]) => {
          const tab = document.createElement("button");
          tab.type = "button";
          tab.className = "sc-tw-result-tab";
          tab.textContent = lang.toUpperCase();
          tab.addEventListener("click", () => {
            tabs
              .querySelectorAll(".sc-tw-result-tab")
              .forEach((t) => t.classList.remove("is-active"));
            tab.classList.add("is-active");
            setPreviewImage(resultWrap, url, lang);
          });
          if (lang === active) tab.classList.add("is-active");
          tabs.appendChild(tab);
        });
        setPreviewImage(resultWrap, entries[0][1], entries[0][0]);
      }
    }
  }

  function buildTextRemixWorkspace() {
    const wrap = document.createElement("div");
    wrap.className = "sc-workspace sc-workspace-text-remix is-hidden";

    const body = document.createElement("div");
    body.className = "sc-body sc-tw-body";

    const left = document.createElement("div");
    left.className = "sc-pane";
    const leftLabel = document.createElement("p");
    leftLabel.className = "sc-pane-label";
    leftLabel.textContent = "Capture";
    const captureWrap = document.createElement("div");
    captureWrap.className = "sc-image-wrap is-capture";
    textRemixUi.captureWrap = captureWrap;
    left.appendChild(leftLabel);
    left.appendChild(captureWrap);

    const right = document.createElement("div");
    right.className = "sc-pane";
    const rightLabel = document.createElement("p");
    rightLabel.className = "sc-pane-label";
    rightLabel.textContent = "Result";
    const resultWrap = document.createElement("div");
    resultWrap.className = "sc-image-wrap is-result";
    textRemixUi.resultWrap = resultWrap;
    right.appendChild(rightLabel);
    right.appendChild(resultWrap);

    body.appendChild(left);
    body.appendChild(right);

    const list = document.createElement("div");
    list.className = "sc-tw-list";
    textRemixUi.list = list;

    const primaryBtn = document.createElement("button");
    primaryBtn.type = "button";
    primaryBtn.className = "sc-mashup-generate sc-tw-swap-btn sc-tw-primary-btn";
    primaryBtn.textContent = "Detect text";
    primaryBtn.dataset.mode = "detect";
    primaryBtn.addEventListener("click", () => {
      if (primaryBtn.dataset.mode === "swap") runTextRemixSwap();
      else runTextRemixDetect();
    });
    textRemixUi.primaryBtn = primaryBtn;

    wrap.appendChild(body);
    wrap.appendChild(list);
    wrap.appendChild(primaryBtn);
    refreshTextRemixUi();
    return wrap;
  }

  function buildVisualLocalizerWorkspace() {
    const wrap = document.createElement("div");
    wrap.className = "sc-workspace sc-workspace-visual-localizer is-hidden";

    const top = document.createElement("div");
    top.className = "sc-tw-top";
    const preview = document.createElement("div");
    preview.className = "sc-tw-preview";
    visualLocalizerUi.preview = preview;
    const actions = document.createElement("div");
    actions.className = "sc-tw-actions";
    const captureBtn = document.createElement("button");
    captureBtn.type = "button";
    captureBtn.className = "sc-mashup-capture-btn";
    captureBtn.textContent = "Capture graphic";
    captureBtn.addEventListener("click", () =>
      startTextWorkflowCapture("visual-localizer")
    );
    const detectBtn = document.createElement("button");
    detectBtn.type = "button";
    detectBtn.className = "sc-mashup-capture-btn";
    detectBtn.textContent = "Detect text";
    detectBtn.addEventListener("click", () => runVisualLocalizerDetect());
    actions.appendChild(captureBtn);
    actions.appendChild(detectBtn);
    top.appendChild(preview);
    top.appendChild(actions);

    const chips = document.createElement("div");
    chips.className = "sc-tw-chips";
    visualLocalizerUi.chips = chips;
    ["es", "de", "ja", "fr", "pt"].forEach((lang) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "sc-tw-chip";
      chip.dataset.lang = lang;
      chip.textContent = lang.toUpperCase();
      chip.addEventListener("click", () => {
        const set = new Set(visualLocalizerMemory.languages);
        if (set.has(lang)) {
          if (set.size > 1) set.delete(lang);
        } else set.add(lang);
        visualLocalizerMemory.languages = [...set];
        refreshVisualLocalizerUi();
      });
      chips.appendChild(chip);
    });

    const styleRow = document.createElement("div");
    styleRow.className = "sc-tw-style-row";
    const lit = document.createElement("label");
    const litInput = document.createElement("input");
    litInput.type = "radio";
    litInput.name = "sc-vl-style";
    litInput.value = "literal";
    litInput.addEventListener("change", () => {
      if (litInput.checked) visualLocalizerMemory.style = "literal";
    });
    lit.appendChild(litInput);
    lit.appendChild(document.createTextNode(" Literal"));
    const mkt = document.createElement("label");
    const mktInput = document.createElement("input");
    mktInput.type = "radio";
    mktInput.name = "sc-vl-style";
    mktInput.value = "marketing";
    mktInput.addEventListener("change", () => {
      if (mktInput.checked) visualLocalizerMemory.style = "marketing";
    });
    mkt.appendChild(mktInput);
    mkt.appendChild(document.createTextNode(" Marketing adapt"));
    visualLocalizerUi.styleLiteral = litInput;
    visualLocalizerUi.styleMarketing = mktInput;
    styleRow.appendChild(lit);
    styleRow.appendChild(mkt);

    const draftActions = document.createElement("div");
    draftActions.className = "sc-tw-actions";
    const translateBtn = document.createElement("button");
    translateBtn.type = "button";
    translateBtn.className = "sc-mashup-capture-btn";
    translateBtn.textContent = "Draft translations";
    translateBtn.addEventListener("click", () => runVisualLocalizerTranslate());
    draftActions.appendChild(translateBtn);

    const table = document.createElement("div");
    table.className = "sc-tw-table";
    visualLocalizerUi.table = table;

    const renderBtn = document.createElement("button");
    renderBtn.type = "button";
    renderBtn.className = "sc-mashup-generate";
    renderBtn.textContent = "Translate & Render";
    renderBtn.addEventListener("click", () => runVisualLocalizerRender());

    const resultTabs = document.createElement("div");
    resultTabs.className = "sc-tw-result-tabs";
    visualLocalizerUi.resultTabs = resultTabs;
    const resultWrap = document.createElement("div");
    resultWrap.className = "sc-tw-result";
    visualLocalizerUi.resultWrap = resultWrap;

    wrap.appendChild(top);
    wrap.appendChild(chips);
    wrap.appendChild(styleRow);
    wrap.appendChild(draftActions);
    wrap.appendChild(table);
    wrap.appendChild(renderBtn);
    wrap.appendChild(resultTabs);
    wrap.appendChild(resultWrap);
    refreshVisualLocalizerUi();
    return wrap;
  }

  async function runTextRemixDetect() {
    if (!textRemixMemory.captureDataUrl) {
      alert("Capture a graphic first.");
      return;
    }
    if (inFlight) return;
    inFlight = true;
    const captureWrap = textRemixUi.captureWrap;
    if (captureWrap) captureWrap.classList.add("is-busy");
    if (textRemixUi.captureBtn) textRemixUi.captureBtn.disabled = true;
    if (textRemixUi.previewBtn) textRemixUi.previewBtn.disabled = true;
    setButtonBusy(textRemixUi.primaryBtn, true, "Detect text", "Detecting…");
    try {
      const data = await requestDetectText(textRemixMemory.captureDataUrl);
      const texts = (data.texts || []).map((t) => ({
        ...t,
        newText: t.text,
      }));
      await saveTextRemixMemory({ texts });
      refreshTextRemixUi();
      if (!texts.length) {
        alert("No text found in this graphic.");
      }
    } catch (err) {
      alert(err?.message || "Detect text failed");
    } finally {
      inFlight = false;
      if (captureWrap) captureWrap.classList.remove("is-busy");
      if (textRemixUi.captureBtn) textRemixUi.captureBtn.disabled = false;
      if (textRemixUi.previewBtn) {
        textRemixUi.previewBtn.disabled = !textRemixMemory.captureDataUrl;
      }
      setButtonBusy(
        textRemixUi.primaryBtn,
        false,
        (textRemixMemory.texts || []).length ? "Swap Text" : "Detect text"
      );
      updateTextRemixPrimaryBtn();
    }
  }

  async function runTextRemixSwap() {
    if (!textRemixMemory.captureDataUrl) {
      alert("Capture a graphic first.");
      return;
    }
    if (!(textRemixMemory.texts || []).length) {
      alert("Detect text first.");
      return;
    }
    const replacements = (textRemixMemory.texts || [])
      .map((t) => ({
        from: t.text,
        to: String(t.newText != null ? t.newText : t.text).trim(),
      }))
      .filter((r) => r.from && r.to && r.from !== r.to);
    if (!replacements.length) {
      alert("Change at least one line of copy before swapping.");
      return;
    }
    if (inFlight) return;
    inFlight = true;
    setButtonBusy(textRemixUi.primaryBtn, true, "Swap Text", "Swapping…");
    const resultWrap = textRemixUi.resultWrap;
    if (resultWrap) {
      resultWrap.innerHTML = "";
      const status = document.createElement("div");
      status.className = "sc-status";
      const spinner = document.createElement("div");
      spinner.className = "sc-spinner";
      const label = document.createElement("span");
      label.textContent = "Swapping text…";
      status.appendChild(spinner);
      status.appendChild(label);
      resultWrap.appendChild(status);
    }
    try {
      const data = await requestTextSwap({
        presetId: "text-remix",
        imageDataUrl: textRemixMemory.captureDataUrl,
        replacements,
      });
      await saveTextRemixMemory({ resultDataUrl: data.imageDataUrl });
      refreshTextRemixUi();
      if (data.model) {
        console.info("[text-remix] swap model:", data.model);
      }
      if (data.model === "eden" || data.model === "eden-custom-prompt") {
        alert(
          "Swap used Eden (weak for text edits) and may rewrite the graphic. Prefer Flux — check server logs if Flux failed."
        );
      }
    } catch (err) {
      alert(formatProviderError(err?.message, "Swap text failed"));
      await saveTextRemixMemory({ resultDataUrl: null });
      fillRemixPane(
        textRemixUi.resultWrap,
        null,
        "Swapped result appears here",
        "result"
      );
    } finally {
      inFlight = false;
      setButtonBusy(textRemixUi.primaryBtn, false, "Swap Text");
      updateTextRemixPrimaryBtn();
    }
  }

  async function runVisualLocalizerDetect() {
    if (!visualLocalizerMemory.captureDataUrl) {
      alert("Capture a graphic first.");
      return;
    }
    if (inFlight) return;
    inFlight = true;
    try {
      const data = await requestDetectText(visualLocalizerMemory.captureDataUrl);
      await saveVisualLocalizerMemory({
        texts: data.texts || [],
        drafts: {},
        results: {},
      });
      refreshVisualLocalizerUi();
    } catch (err) {
      alert(err?.message || "Detect text failed");
    } finally {
      inFlight = false;
    }
  }

  async function runVisualLocalizerTranslate() {
    if (!(visualLocalizerMemory.texts || []).length) {
      alert("Detect text first.");
      return;
    }
    if (inFlight) return;
    inFlight = true;
    try {
      const data = await requestTranslateCopy({
        texts: visualLocalizerMemory.texts,
        languages: visualLocalizerMemory.languages,
        style: visualLocalizerMemory.style,
      });
      await saveVisualLocalizerMemory({ drafts: data.translations || {} });
      refreshVisualLocalizerUi();
    } catch (err) {
      alert(err?.message || "Draft translations failed");
    } finally {
      inFlight = false;
    }
  }

  async function runVisualLocalizerRender() {
    if (!visualLocalizerMemory.captureDataUrl) {
      alert("Capture a graphic first.");
      return;
    }
    const langs = visualLocalizerMemory.languages || [];
    if (!langs.length) {
      alert("Select at least one language.");
      return;
    }
    if (inFlight) return;
    inFlight = true;
    const results = { ...visualLocalizerMemory.results };
    try {
      for (const lang of langs) {
        const draftRows = visualLocalizerMemory.drafts[lang] || [];
        const replacements = (visualLocalizerMemory.texts || []).map((src) => {
          const found = draftRows.find((d) => d.id === src.id);
          return {
            from: src.text,
            to: String(found?.text || src.text).trim(),
          };
        }).filter((r) => r.from && r.to && r.from !== r.to);
        if (!replacements.length) continue;
        const data = await requestTextSwap({
          presetId: "visual-localizer",
          imageDataUrl: visualLocalizerMemory.captureDataUrl,
          replacements,
          languageLabel: lang.toUpperCase(),
        });
        results[lang] = data.imageDataUrl;
      }
      await saveVisualLocalizerMemory({ results });
      refreshVisualLocalizerUi();
    } catch (err) {
      alert(err?.message || "Translate & Render failed");
    } finally {
      inFlight = false;
    }
  }

  function setMashupSlotPreview(el, dataUrl, emptyText) {
    if (!el) return;
    el.innerHTML = "";
    if (!dataUrl) {
      const empty = document.createElement("div");
      empty.className = "sc-mashup-slot-empty";
      empty.textContent = emptyText;
      el.appendChild(empty);
      return;
    }
    const img = document.createElement("img");
    img.alt = emptyText;
    img.src = dataUrl;
    el.appendChild(img);
  }

  function refreshMashupPreviews() {
    setMashupSlotPreview(
      mashupSubjectPreviewRef,
      mashupMemory.subjectDataUrl,
      "Subject / product"
    );
    setMashupSlotPreview(
      mashupStylePreviewRef,
      mashupMemory.styleDataUrl,
      "Style / background"
    );
    if (mashupResultWrapRef) {
      mashupResultWrapRef.innerHTML = "";
      if (mashupMemory.resultDataUrl) {
        const img = document.createElement("img");
        img.alt = "Mashup result";
        img.src = mashupMemory.resultDataUrl;
        mashupResultWrapRef.appendChild(img);
      } else {
        const empty = document.createElement("div");
        empty.className = "sc-mashup-result-empty";
        empty.textContent = "Hybrid mashup will appear here";
        mashupResultWrapRef.appendChild(empty);
      }
    }
  }

  function buildMashupWorkspace() {
    const wrap = document.createElement("div");
    wrap.className = "sc-workspace sc-workspace-mashup is-hidden";

    const slots = document.createElement("div");
    slots.className = "sc-mashup-slots";

    function makeSlot(title, captureLabel, slotKey) {
      const slot = document.createElement("div");
      slot.className = "sc-mashup-slot";
      const label = document.createElement("p");
      label.className = "sc-pane-label";
      label.textContent = title;
      const preview = document.createElement("div");
      preview.className = "sc-mashup-slot-preview";
      if (slotKey === "subject") mashupSubjectPreviewRef = preview;
      else mashupStylePreviewRef = preview;
      const captureBtn = document.createElement("button");
      captureBtn.type = "button";
      captureBtn.className = "sc-mashup-capture-btn";
      captureBtn.textContent = captureLabel;
      captureBtn.addEventListener("click", () => startMashupSlotCapture(slotKey));
      slot.appendChild(label);
      slot.appendChild(preview);
      slot.appendChild(captureBtn);
      return slot;
    }

    slots.appendChild(
      makeSlot("Slot 1 · Subject / Product", "Capture Product", "subject")
    );
    slots.appendChild(
      makeSlot("Slot 2 · Style / Background", "Capture Style", "style")
    );

    const resultPane = document.createElement("div");
    resultPane.className = "sc-mashup-result-pane";
    const resultLabel = document.createElement("p");
    resultLabel.className = "sc-pane-label";
    resultLabel.textContent = "Hybrid";
    const resultWrap = document.createElement("div");
    resultWrap.className = "sc-mashup-result-wrap";
    mashupResultWrapRef = resultWrap;
    resultPane.appendChild(resultLabel);
    resultPane.appendChild(resultWrap);

    const controls = document.createElement("div");
    controls.className = "sc-mashup-controls";
    const prompt = document.createElement("textarea");
    prompt.className = "sc-mashup-prompt";
    prompt.rows = 2;
    prompt.placeholder =
      "Optional: soft shadows, golden hour lighting, keep logo sharp…";
    mashupPromptRef = prompt;
    const generateBtn = document.createElement("button");
    generateBtn.type = "button";
    generateBtn.className = "sc-mashup-generate";
    generateBtn.textContent = "Generate Hybrid Mashup";
    mashupGenerateBtnRef = generateBtn;
    generateBtn.addEventListener("click", () => runMashupGenerate());
    controls.appendChild(prompt);
    controls.appendChild(generateBtn);

    wrap.appendChild(slots);
    wrap.appendChild(resultPane);
    wrap.appendChild(controls);
    refreshMashupPreviews();
    return wrap;
  }

  async function runMashupGenerate() {
    if (inFlight) return;
    if (!mashupMemory.subjectDataUrl || !mashupMemory.styleDataUrl) {
      alert("Capture both a product (Slot 1) and a style (Slot 2) first.");
      return;
    }
    inFlight = true;
    if (mashupGenerateBtnRef) mashupGenerateBtnRef.disabled = true;
    if (mashupResultWrapRef) {
      mashupResultWrapRef.innerHTML = "";
      const status = document.createElement("div");
      status.className = "sc-status";
      const spinner = document.createElement("div");
      spinner.className = "sc-spinner";
      const label = document.createElement("span");
      label.textContent = "Generating hybrid…";
      status.appendChild(spinner);
      status.appendChild(label);
      mashupResultWrapRef.appendChild(status);
    }
    try {
      const prompt = String(mashupPromptRef?.value || "").trim();
      const data = await requestMashupHybrid({
        styleDataUrl: mashupMemory.styleDataUrl,
        subjectDataUrl: mashupMemory.subjectDataUrl,
        prompt,
      });
      await saveMashupMemory({ resultDataUrl: data.imageDataUrl });
      refreshMashupPreviews();
    } catch (err) {
      if (mashupResultWrapRef) {
        mashupResultWrapRef.innerHTML = "";
        const statusErr = document.createElement("div");
        statusErr.className = "sc-status is-error";
        statusErr.textContent = formatProviderError(
          err?.message,
          "Mashup failed. Is the local server running on port 8787?"
        );
        mashupResultWrapRef.appendChild(statusErr);
      }
    } finally {
      inFlight = false;
      if (mashupGenerateBtnRef) mashupGenerateBtnRef.disabled = false;
    }
  }

  function buildPromptComposer(rightWrap) {
    const composer = document.createElement("div");
    composer.className = "sc-composer";

    const quick = document.createElement("div");
    quick.className = "sc-quick-actions";
    const quickDefs = [
      { id: "black-white", label: "Black and white" },
      { id: "remove-bg", label: "Remove background" },
      { id: "get-prompt", label: "Get the prompt" },
      { id: "extract-palette", label: "Extract palette" },
    ];
    quickDefs.forEach((def) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sc-quick-btn";
      btn.dataset.presetId = def.id;
      btn.textContent = def.label;
      btn.addEventListener("click", () => {
        if (def.id === "get-prompt") runGetPrompt();
        else if (def.id === "extract-palette") runExtractPalette();
        else runQuickPreset(def.id, rightWrap);
      });
      quick.appendChild(btn);
    });

    const field = document.createElement("div");
    field.className = "sc-composer-field";

    const badges = document.createElement("div");
    badges.className = "sc-composer-asset-badges is-empty";
    badges.setAttribute("aria-label", "Selected assets");
    assetBadgesEl = badges;

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
    assetsBtnLabel.textContent = "Load assets";
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
        const hintLabel =
          asset.kind === "palette"
            ? "Click to add this palette"
            : "Click to add this asset";
        item.title = selectedAssetIds.includes(asset.id)
          ? `${asset.name || asset.id} (selected)`
          : hintLabel;
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
              delete selectedAssetMeta[asset.id];
              updateAssetCountLabel();
              await refreshPanel();
            } catch (err) {
              alert(err?.message || "Could not remove asset");
            }
          });
          item.appendChild(removeBtn);
        }
        const hoverHint = document.createElement("span");
        hoverHint.className = "sc-asset-hover-hint";
        hoverHint.textContent = selectedAssetIds.includes(asset.id)
          ? "Selected"
          : "Click to add";
        item.appendChild(hoverHint);
        const toggleSelect = (e) => {
          e.stopPropagation();
          if (selectedAssetIds.includes(asset.id)) {
            selectedAssetIds = selectedAssetIds.filter((id) => id !== asset.id);
            delete selectedAssetMeta[asset.id];
          } else {
            selectedAssetIds = [...selectedAssetIds, asset.id];
            selectedAssetMeta[asset.id] = {
              name: asset.name || (asset.kind === "palette" ? "Palette" : "Asset"),
              kind: asset.kind || "image",
            };
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

    const tipWrap = document.createElement("div");
    tipWrap.className = "sc-apply-tip-wrap";
    const tipBtn = document.createElement("button");
    tipBtn.type = "button";
    tipBtn.className = "sc-apply-tip-btn";
    tipBtn.setAttribute("aria-label", "Apply tips and limitations");
    tipBtn.setAttribute("aria-expanded", "false");
    tipBtn.setAttribute("aria-haspopup", "true");
    tipBtn.appendChild(materialIcon("info", "sc-btn-icon"));
    const tipPop = document.createElement("div");
    tipPop.className = "sc-apply-tip-pop is-hidden";
    tipPop.setAttribute("role", "tooltip");
    const tipList = document.createElement("ul");
    tipList.className = "sc-apply-tip-list";
    const tipItems = [
      "Short surgical edits work best (e.g. “both arms extended toward the purple butterfly”). State counts clearly (“three arms”). Remove leftover conflicting phrases like the old hair or prop color.",
      "Quantity or pose changes (e.g. “3 colossal arms”) are hard for image-guided edits—the source image anchors the pose. Color swaps are easier. Counts are requested strongly but not guaranteed.",
    ];
    tipItems.forEach((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      tipList.appendChild(li);
    });
    tipPop.appendChild(tipList);

    function closeTipPop() {
      tipPop.classList.add("is-hidden");
      tipBtn.setAttribute("aria-expanded", "false");
    }

    function openTipPop() {
      tipPop.classList.remove("is-hidden");
      tipBtn.setAttribute("aria-expanded", "true");
    }

    tipBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (tipPop.classList.contains("is-hidden")) openTipPop();
      else closeTipPop();
    });
    tipBtn.addEventListener("mouseenter", () => openTipPop());
    tipWrap.addEventListener("mouseleave", () => closeTipPop());
    tipWrap.appendChild(tipBtn);
    tipWrap.appendChild(tipPop);

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
    aspectLabel.dataset.value = "original";
    selectedAspectRatio = "original";
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
      selectedAspectRatio = value;
      aspectLabel.textContent = label;
      aspectLabel.dataset.value = value;
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
    toolbar.appendChild(tipWrap);
    toolbar.appendChild(applyBtn);
    field.appendChild(badges);
    field.appendChild(input);
    field.appendChild(toolbar);
    composer.appendChild(quick);
    composer.appendChild(field);
    updateAssetCountLabel();
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
    setRightPaneLabel("Generation");
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
        formatProviderError(
          err?.message,
          "Request failed. Is the local server running on port 8787?"
        )
      );
    } finally {
      inFlight = false;
      if (applyBtnRef) applyBtnRef.disabled = false;
      buttons.forEach((b) => {
        b.disabled = false;
      });
    }
  }

  async function runGetPrompt() {
    const useResult =
      selectedPane === "result" && Boolean(resultDataUrl);
    const targetWrap = useResult ? rightWrapRef : leftWrapRef;
    const sourceUrl = useResult
      ? resultDataUrl
      : croppedDataUrl;
    const actionTarget = useResult ? "result" : "capture";
    if (inFlight || !sourceUrl || !targetWrap) return;
    inFlight = true;
    if (applyBtnRef) applyBtnRef.disabled = true;
    const buttons = shadowRoot
      ? [...shadowRoot.querySelectorAll(".sc-quick-btn")]
      : [];
    buttons.forEach((b) => {
      b.disabled = true;
    });
    showWorking(targetWrap, "Writing prompt…");
    try {
      const result = await requestGetPrompt(sourceUrl);
      showPromptResult(targetWrap, result.prompt, result.model, {
        imageUrl: sourceUrl,
        actionTarget,
      });
    } catch (err) {
      showError(
        targetWrap,
        err?.message ||
          "Could not get prompt. Is the local server running on port 8787?"
      );
      if (!useResult && croppedDataUrl && leftWrapRef === targetWrap) {
        restoreCapturePaneImage();
      }
    } finally {
      inFlight = false;
      if (applyBtnRef) applyBtnRef.disabled = false;
      buttons.forEach((b) => {
        b.disabled = false;
      });
    }
  }

  function restoreCapturePaneImage() {
    if (!leftWrapRef || !croppedDataUrl) return;
    leftWrapRef.innerHTML = "";
    leftWrapRef.classList.remove(
      "is-prompt",
      "is-palette",
      "is-palette-scroll",
      "is-meta-scroll"
    );
    leftWrapRef.classList.add("is-capture");
    const img = document.createElement("img");
    img.alt = "Captured region";
    img.src = croppedDataUrl;
    leftWrapRef.appendChild(img);
    attachImageActions(leftWrapRef, "capture");
    if (leftLabelRef) leftLabelRef.textContent = "Capture";
  }

  function clearCapturePromptStack() {
    if (!leftWrapRef) return;
    const hadPrompt = leftWrapRef.querySelector(".sc-prompt-below");
    const hadPalette = leftWrapRef.querySelector(".sc-palette-below");
    if (
      !hadPrompt &&
      !hadPalette &&
      !leftWrapRef.classList.contains("is-meta-scroll")
    ) {
      return;
    }
    restoreCapturePaneImage();
  }

  async function runExtractPalette() {
    const useResult =
      selectedPane === "result" && Boolean(resultDataUrl);
    const targetWrap = useResult ? rightWrapRef : leftWrapRef;
    const sourceUrl = useResult ? resultDataUrl : croppedDataUrl;
    const actionTarget = useResult ? "result" : "capture";
    if (inFlight || !sourceUrl || !targetWrap) return;
    inFlight = true;
    if (applyBtnRef) applyBtnRef.disabled = true;
    const buttons = shadowRoot
      ? [...shadowRoot.querySelectorAll(".sc-quick-btn")]
      : [];
    buttons.forEach((b) => {
      b.disabled = true;
    });
    showWorking(targetWrap, "Extracting palette…");
    try {
      const hexes = await extractTopColors(sourceUrl, 5);
      if (!hexes.length) {
        throw new Error("Could not extract colors from this image.");
      }
      showPaletteResult(targetWrap, hexes, {
        imageUrl: sourceUrl,
        actionTarget,
      });
    } catch (err) {
      showError(
        targetWrap,
        err?.message || "Could not extract palette from image."
      );
      if (!useResult && croppedDataUrl && leftWrapRef === targetWrap) {
        restoreCapturePaneImage();
      }
    } finally {
      inFlight = false;
      if (applyBtnRef) applyBtnRef.disabled = false;
      buttons.forEach((b) => {
        b.disabled = false;
      });
    }
  }

  function setRightPaneLabel(text) {
    if (rightLabelRef) rightLabelRef.textContent = text;
  }

  function setLeftPaneLabel(text) {
    if (leftLabelRef) leftLabelRef.textContent = text;
  }

  function updateAssetCountLabel() {
    if (assetCountEl) {
      const n = selectedAssetIds.length;
      assetCountEl.textContent = n ? String(n) : "";
      assetCountEl.classList.toggle("is-empty", !n);
      assetCountEl.setAttribute("aria-hidden", n ? "false" : "true");
    }
    if (!assetBadgesEl) return;
    assetBadgesEl.innerHTML = "";
    if (!selectedAssetIds.length) {
      assetBadgesEl.classList.add("is-empty");
      return;
    }
    assetBadgesEl.classList.remove("is-empty");
    selectedAssetIds.forEach((id) => {
      const meta = selectedAssetMeta[id] || { name: id, kind: "image" };
      const chip = document.createElement("span");
      chip.className = "sc-composer-asset-badge";
      chip.title = meta.name;
      chip.textContent = meta.name;
      assetBadgesEl.appendChild(chip);
    });
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
    setRightPaneLabel("Generation");
    showWorking(rightWrap);
    try {
      const data = await requestEdit("custom-prompt", {
        imageDataUrl: resultDataUrl || croppedDataUrl,
        prompt,
        useAssets: selectedAssetIds.length > 0,
        aspectRatio:
          selectedAspectRatio && selectedAspectRatio !== "original"
            ? selectedAspectRatio
            : null,
        preferDirect: true,
      });
      showResult(rightWrap, data.imageDataUrl);
      if (data.model) {
        console.info("[custom-prompt] model:", data.model);
      }
      if (data.model === "eden" || data.model === "eden-custom-prompt") {
        alert(
          "Apply used Eden (weak for edits) and may rewrite the image. Prefer Flux — check credits/server logs if Flux failed."
        );
      }
      chrome.runtime.sendMessage({
        type: "SAVE_RESULT",
        presetId: "custom-prompt",
        captureDataUrl: croppedDataUrl,
        resultDataUrl: data.imageDataUrl,
      });
    } catch (err) {
      showError(
        rightWrap,
        formatProviderError(
          err?.message,
          "Request failed. Is the local server running on port 8787?"
        )
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

  function hideAllWorkspaces() {
    [
      allWorkspaceRef,
      mashupWorkspaceRef,
      textRemixWorkspaceRef,
      visualLocalizerWorkspaceRef,
    ].forEach((el) => {
      if (el) el.classList.add("is-hidden");
    });
  }

  function showActiveWorkflowWorkspace() {
    setWorkflowMode(workflowMode || "all");
  }

  function hideCaptureChrome() {
    hideAllWorkspaces();
    if (bodyRef) bodyRef.classList.add("is-hidden");
    if (composerRef) composerRef.classList.add("is-hidden");
    if (headerActionsRef) headerActionsRef.classList.add("is-hidden");
  }

  function showCaptureChrome() {
    if (bodyRef) bodyRef.classList.remove("is-hidden");
    if (composerRef) composerRef.classList.remove("is-hidden");
    if (headerActionsRef) headerActionsRef.classList.remove("is-hidden");
    showActiveWorkflowWorkspace();
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
        const maxThumbs = 2;
        (board.images || []).slice(0, maxThumbs).forEach((img) => {
          const thumb = document.createElement("img");
          thumb.src = img.dataUrl;
          thumb.alt = "";
          previews.appendChild(thumb);
        });
        if (count > maxThumbs) {
          const more = document.createElement("span");
          more.className = "sc-board-chip-more";
          more.textContent = `+${count - maxThumbs}`;
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
        extractColors: (dataUrl) => extractTopColors(dataUrl, 5),
        requestVariation: async ({ imageDataUrl, hex }) => {
          const color = String(hex || "").trim();
          try {
            const data = await requestEdit("custom-prompt", {
              imageDataUrl,
              prompt: `Recolor this exact image toward ${color}. Keep subjects, composition, and layout identical—only shift the color theme.`,
              preferDirect: true,
            });
            showAppToast("Variation ready", color || "Color shift");
            return data;
          } catch (err) {
            throw new Error(
              formatProviderError(
                err?.message,
                "Could not generate variation. Is the local server running on port 8787?"
              )
            );
          }
        },
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
    clearCapturePromptStack();
    setRightPaneLabel("Generation");
    resultWrap.innerHTML = "";
    resultWrap.classList.remove(
      "is-prompt",
      "is-palette",
      "is-palette-scroll",
      "is-meta-scroll"
    );
    resultWrap.classList.add("is-result");
    const img = document.createElement("img");
    img.className = "sc-gen-image";
    img.alt = "Generated image";
    img.src = dataUrl;
    resultWrap.appendChild(img);
    attachImageActions(resultWrap, "result");
    resultDataUrl = dataUrl;
    setSelectedPane("result");
  }

  function ensurePaneImageStage(wrap, imageUrl, actionTarget) {
    let stage = wrap.querySelector(".sc-gen-stage");
    if (stage) {
      const img = stage.querySelector("img");
      if (img && imageUrl) img.src = imageUrl;
      attachImageActions(stage, actionTarget);
      return stage;
    }
    const previousImg = wrap.querySelector("img");
    const src = previousImg?.src || imageUrl;
    wrap.innerHTML = "";
    stage = document.createElement("div");
    stage.className = "sc-gen-stage";
    const img = document.createElement("img");
    img.className = "sc-gen-image";
    img.alt = actionTarget === "capture" ? "Captured region" : "Generated image";
    img.src = src;
    stage.appendChild(img);
    wrap.appendChild(stage);
    attachImageActions(stage, actionTarget);
    return stage;
  }

  function buildPromptBelow(promptText, modelId) {
    const pane = document.createElement("div");
    pane.className = "sc-prompt-below";
    const toolbar = document.createElement("div");
    toolbar.className = "sc-prompt-pane-toolbar";
    const title = document.createElement("span");
    title.className = "sc-prompt-below-title";
    title.textContent = "Prompt";
    toolbar.appendChild(title);
    if (modelId) {
      const modelHint = document.createElement("span");
      modelHint.className = "sc-prompt-model-hint";
      modelHint.textContent = String(modelId);
      modelHint.title = `Generated via ${modelId}`;
      toolbar.appendChild(modelHint);
    }
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "sc-prompt-copy-btn";
    copyBtn.textContent = "Copy";
    const area = document.createElement("textarea");
    area.className = "sc-prompt-output";
    area.value = String(promptText || "").trim();
    area.setAttribute("aria-label", "Generated recreate prompt");
    copyBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const text = area.value;
      try {
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = "Copied";
        setTimeout(() => {
          copyBtn.textContent = "Copy";
        }, 1200);
      } catch (_err) {
        area.focus();
        area.select();
        alert("Could not copy automatically — select and copy manually.");
      }
    });
    toolbar.appendChild(copyBtn);
    pane.appendChild(toolbar);
    pane.appendChild(area);
    pane.addEventListener("click", (e) => e.stopPropagation());
    return pane;
  }

  function showPromptResult(wrap, promptText, modelId, opts) {
    const actionTarget =
      opts?.actionTarget === "capture" ? "capture" : "result";
    const imageUrl =
      opts?.imageUrl ||
      (actionTarget === "capture"
        ? croppedDataUrl
        : resultDataUrl || croppedDataUrl);
    if (!imageUrl || !wrap) {
      if (wrap) {
        showError(wrap, "Capture an image first, then get a prompt.");
      }
      return;
    }

    if (actionTarget === "capture") {
      setLeftPaneLabel("Capture · Prompt");
    } else {
      setRightPaneLabel(
        resultDataUrl ? "Generation · Prompt" : "Prompt"
      );
    }

    wrap.classList.remove("is-prompt", "is-palette");
    wrap.classList.add(
      actionTarget === "capture" ? "is-capture" : "is-result",
      "is-palette-scroll",
      "is-meta-scroll"
    );

    const existingBelow = wrap.querySelector(".sc-prompt-below");
    if (existingBelow) existingBelow.remove();
    const existingPalette = wrap.querySelector(".sc-palette-below");
    if (existingPalette) existingPalette.remove();

    ensurePaneImageStage(wrap, imageUrl, actionTarget);
    wrap.appendChild(buildPromptBelow(promptText, modelId));
    setSelectedPane(actionTarget === "capture" ? "capture" : "result");
    requestAnimationFrame(() => {
      const below = wrap.querySelector(".sc-prompt-below");
      if (below) below.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }

  function buildPaletteBelow(hexColors) {
    const pane = document.createElement("div");
    pane.className = "sc-palette-below";
    const heading = document.createElement("p");
    heading.className = "sc-palette-below-title";
    heading.textContent = "Palette";
    const list = document.createElement("div");
    list.className = "sc-palette-list";
    const hexes = Array.isArray(hexColors) ? hexColors : [];
    hexes.forEach((hex) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "sc-palette-swatch-row";
      row.title = `Copy ${hex}`;
      row.setAttribute("aria-label", `Copy color ${hex}`);
      const chip = document.createElement("span");
      chip.className = "sc-palette-swatch-chip";
      chip.style.background = hex;
      const label = document.createElement("span");
      label.className = "sc-palette-swatch-hex";
      label.textContent = hex;
      const status = document.createElement("span");
      status.className = "sc-palette-swatch-status";
      status.textContent = "Copy";
      row.appendChild(chip);
      row.appendChild(label);
      row.appendChild(status);
      row.addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(hex);
          status.textContent = "Copied";
          setTimeout(() => {
            status.textContent = "Copy";
          }, 1200);
        } catch (_err) {
          alert(`Could not copy ${hex} — copy manually.`);
        }
      });
      list.appendChild(row);
    });
    pane.appendChild(heading);
    pane.appendChild(list);
    pane.addEventListener("click", (e) => e.stopPropagation());
    return pane;
  }

  function showPaletteResult(wrap, hexColors, opts) {
    const actionTarget =
      opts?.actionTarget === "capture" ? "capture" : "result";
    const imageUrl =
      opts?.imageUrl ||
      (actionTarget === "capture"
        ? croppedDataUrl
        : resultDataUrl || croppedDataUrl);
    if (!imageUrl || !wrap) {
      if (wrap) {
        showError(wrap, "Capture an image first, then extract a palette.");
      }
      return;
    }

    if (actionTarget === "capture") {
      setLeftPaneLabel("Capture · Palette");
    } else {
      setRightPaneLabel(
        resultDataUrl ? "Generation · Palette" : "Palette"
      );
    }

    wrap.classList.remove("is-prompt", "is-palette");
    wrap.classList.add(
      actionTarget === "capture" ? "is-capture" : "is-result",
      "is-palette-scroll",
      "is-meta-scroll"
    );

    const existingBelow = wrap.querySelector(".sc-palette-below");
    if (existingBelow) existingBelow.remove();
    const existingPrompt = wrap.querySelector(".sc-prompt-below");
    if (existingPrompt) existingPrompt.remove();

    ensurePaneImageStage(wrap, imageUrl, actionTarget);
    wrap.appendChild(buildPaletteBelow(hexColors));
    setSelectedPane(actionTarget === "capture" ? "capture" : "result");
    requestAnimationFrame(() => {
      const below = wrap.querySelector(".sc-palette-below");
      if (below) below.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }

  function rgbToHex(r, g, b) {
    const toHex = (n) => n.toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
  }

  function rgbToHsv(r, g, b) {
    const rr = r / 255;
    const gg = g / 255;
    const bb = b / 255;
    const max = Math.max(rr, gg, bb);
    const min = Math.min(rr, gg, bb);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
      if (max === rr) h = ((gg - bb) / d) % 6;
      else if (max === gg) h = (bb - rr) / d + 2;
      else h = (rr - gg) / d + 4;
      h /= 6;
      if (h < 0) h += 1;
    }
    const s = max === 0 ? 0 : d / max;
    return { h, s, v: max };
  }

  function colorDistance(a, b) {
    return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
  }

  function hueDistance(a, b) {
    const d = Math.abs(a - b);
    return Math.min(d, 1 - d);
  }

  function extractTopColors(dataUrl, count = 5) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const maxSide = 180;
          const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) {
            reject(new Error("Could not read image pixels."));
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          const { data } = ctx.getImageData(0, 0, w, h);
          const buckets = new Map();

          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] < 128) continue;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const { h: hue, s, v } = rgbToHsv(r, g, b);
            const hb = Math.floor(hue * 36) % 36;
            const sb = s < 0.12 ? 0 : s < 0.35 ? 1 : s < 0.65 ? 2 : 3;
            const vb = v < 0.2 ? 0 : v < 0.45 ? 1 : v < 0.75 ? 2 : 3;
            const key = `${hb}:${sb}:${vb}`;
            let bucket = buckets.get(key);
            if (!bucket) {
              bucket = {
                count: 0,
                h: hue,
                s,
                v,
                best: { r, g, b },
                bestPop: -1,
              };
              buckets.set(key, bucket);
            }
            bucket.count += 1;
            bucket.h = hue;
            bucket.s = s;
            bucket.v = v;
            const pop = s * s * (0.35 + v);
            if (pop > bucket.bestPop) {
              bucket.bestPop = pop;
              bucket.best = { r, g, b };
            }
          }

          const ranked = [...buckets.values()].map((bucket) => {
            const vibrancy = bucket.s ** 1.2 * (0.25 + bucket.v);
            let score = bucket.count ** 0.85 * (0.08 + vibrancy * 4.5);
            if (bucket.v < 0.12) score *= 0.35;
            if (bucket.s < 0.08 && bucket.v > 0.2 && bucket.v < 0.95) {
              score *= 0.45;
            }
            return {
              r: bucket.best.r,
              g: bucket.best.g,
              b: bucket.best.b,
              h: bucket.h,
              s: bucket.s,
              v: bucket.v,
              score,
            };
          });
          ranked.sort((a, b) => b.score - a.score);

          const picked = [];
          for (const color of ranked) {
            if (picked.length >= count) break;
            const tooClose = picked.some((existing) => {
              if (colorDistance(existing, color) < 70) return true;
              if (
                color.s > 0.25 &&
                existing.s > 0.25 &&
                hueDistance(color.h, existing.h) < 0.06 &&
                Math.abs(color.v - existing.v) < 0.25
              ) {
                return true;
              }
              return false;
            });
            if (!tooClose) picked.push(color);
          }
          if (!picked.length && ranked.length) picked.push(ranked[0]);
          resolve(picked.map((c) => rgbToHex(c.r, c.g, c.b)));
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error("Could not load image for palette."));
      img.src = dataUrl;
    });
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
          : targetRaw === "text-remix-result"
            ? "text-remix-result"
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
      } else if (target === "text-remix-result") {
        saveTextRemixMemory({ resultDataUrl: working.url }).then(() => {
          refreshTextRemixUi();
        });
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
          } else if (target === "text-remix-result") {
            textRemixMemory.resultDataUrl = url;
            const remixImg = textRemixUi.resultWrap?.querySelector("img");
            if (remixImg) remixImg.src = url;
          }
        },
        editTargetLabel:
          target === "capture"
            ? "Capture"
            : target === "text-remix-result"
              ? "Result"
              : "Generation",
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

  function showWorking(resultWrap, statusText) {
    resultWrap.innerHTML = "";
    resultWrap.classList.remove(
      "is-prompt",
      "is-palette",
      "is-palette-scroll",
      "is-meta-scroll"
    );
    const status = document.createElement("div");
    status.className = "sc-status";
    const spinner = document.createElement("div");
    spinner.className = "sc-spinner";
    const label = document.createElement("span");
    label.textContent = statusText || "Working…";
    status.appendChild(spinner);
    status.appendChild(label);
    resultWrap.appendChild(status);
  }

  function showError(resultWrap, message) {
    resultWrap.innerHTML = "";
    resultWrap.classList.remove(
      "is-prompt",
      "is-palette",
      "is-palette-scroll",
      "is-meta-scroll"
    );
    const statusErr = document.createElement("div");
    statusErr.className = "sc-status is-error";
    statusErr.textContent = message;
    resultWrap.appendChild(statusErr);
  }

  async function requestGetPrompt(imageDataUrl) {
    let response;
    try {
      response = await fetch("http://127.0.0.1:8787/api/get-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl }),
      });
    } catch (_err) {
      throw new Error(
        "Could not reach local server on port 8787. Start it and try again."
      );
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.prompt) {
      throw new Error(
        data.error || `Get prompt failed (${response.status})`
      );
    }
    return { prompt: data.prompt, model: data.model || null };
  }

  async function requestMashupHybrid({
    styleDataUrl,
    subjectDataUrl,
    prompt,
  }) {
    let response;
    try {
      response = await fetch("http://127.0.0.1:8787/api/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          presetId: "mashup-hybrid",
          imageDataUrl: styleDataUrl,
          subjectDataUrl,
          prompt: prompt || "",
          model: "auto",
        }),
      });
    } catch (_err) {
      throw new Error(
        "Could not reach local server on port 8787. Start it and try again."
      );
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.imageDataUrl) {
      throw new Error(
        data.error || `Mashup failed (${response.status})`
      );
    }
    return data;
  }

  async function requestDetectText(imageDataUrl) {
    let response;
    try {
      response = await fetch("http://127.0.0.1:8787/api/detect-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl }),
      });
    } catch (_err) {
      throw new Error(
        "Could not reach local server on port 8787. Start it and try again."
      );
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(data.texts)) {
      throw new Error(data.error || `Detect text failed (${response.status})`);
    }
    return data;
  }

  async function requestTranslateCopy({ texts, languages, style }) {
    let response;
    try {
      response = await fetch("http://127.0.0.1:8787/api/translate-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts, languages, style }),
      });
    } catch (_err) {
      throw new Error(
        "Could not reach local server on port 8787. Start it and try again."
      );
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.translations) {
      throw new Error(
        data.error || `Translate copy failed (${response.status})`
      );
    }
    return data;
  }

  async function requestTextSwap({
    presetId,
    imageDataUrl,
    replacements,
    languageLabel,
  }) {
    let response;
    try {
      response = await fetch("http://127.0.0.1:8787/api/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          presetId,
          imageDataUrl,
          replacements,
          languageLabel: languageLabel || "",
          model: "auto",
        }),
      });
    } catch (_err) {
      throw new Error(
        "Could not reach local server on port 8787. Start it and try again."
      );
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.imageDataUrl) {
      throw new Error(data.error || `Text swap failed (${response.status})`);
    }
    return data;
  }

  async function requestEdit(presetId, opts) {
    const useAssets = Boolean(opts && opts.useAssets);
    const skipBlend = Boolean(opts && opts.skipBlend);
    const preferDirect = Boolean(opts && opts.preferDirect);
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
      model: "auto",
    };

    if (window.SeeCapturePayload?.preparePayload) {
      prepared = await window.SeeCapturePayload.preparePayload({
        imageDataUrl: sourceImage,
        presetId,
        prompt: customPrompt,
        model: "auto",
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

    const aspectRatio =
      opts && typeof opts.aspectRatio === "string" ? opts.aspectRatio.trim() : "";
    const body = {
      imageDataUrl: imageForEdit,
      presetId: prepared.presetId,
      model: prepared.model,
      prompt: customPrompt || prepared.prompt || "",
      pageContext: prepared.pageContext || {},
      assets: useAssets ? prepared.assets || [] : [],
    };
    if (aspectRatio && aspectRatio !== "original") {
      body.aspectRatio = aspectRatio;
    }

    async function viaDirect() {
      let response;
      try {
        response = await fetch("http://127.0.0.1:8787/api/edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch (_err) {
        throw new Error(
          "Could not reach local server on port 8787. Start it and try again."
        );
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.imageDataUrl) {
        throw new Error(data.error || `Edit failed (${response.status})`);
      }
      return data;
    }

    async function viaServiceWorker() {
      const message = {
        type: "EDIT_IMAGE",
        ...body,
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

    if (preferDirect || presetId === "custom-prompt") {
      try {
        return await viaDirect();
      } catch (err) {
        console.warn("[edit] direct failed, trying service worker:", err?.message);
        return viaServiceWorker();
      }
    }
    return viaServiceWorker();
  }
})();
