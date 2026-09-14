/**
 * Prompt library viewer (left image / right prompt details).
 * Exposed as window.SeeCapturePromptLibraryUI
 */
(() => {
  function truncatePrompt(text, max) {
    const s = String(text || "").replace(/\s+/g, " ").trim();
    if (s.length <= max) return s;
    return `${s.slice(0, max - 1)}…`;
  }

  function prefersReducedMotion() {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (_) {
      return false;
    }
  }

  /**
   * Pointer tilt on hover only (no open/entrance animation).
   * @param {HTMLElement} el
   * @param {{ maxTilt?: number, scale?: number }} [opts]
   */
  function attachTiltHover(el, opts) {
    if (!el || el.dataset.scTiltBound === "1") return;
    el.dataset.scTiltBound = "1";
    const maxTilt = opts?.maxTilt ?? 7;
    const scale = opts?.scale ?? 1.015;
    const flat =
      "perspective(1200px) rotateX(0deg) rotateY(0deg) scale(1)";

    const onMove = (e) => {
      if (prefersReducedMotion()) return;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dx = (e.clientX - rect.left) / rect.width - 0.5;
      const dy = (e.clientY - rect.top) / rect.height - 0.5;
      el.classList.add("is-tilting");
      el.style.transform = `perspective(1200px) rotateX(${-(dy * 2) * maxTilt}deg) rotateY(${dx * 2 * maxTilt}deg) scale(${scale})`;
    };

    const onLeave = () => {
      el.classList.remove("is-tilting");
      el.style.transform = flat;
    };

    el.addEventListener("pointerenter", () => {
      if (prefersReducedMotion()) return;
      el.classList.add("is-tilting");
    });
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("pointercancel", onLeave);
  }

  function mountPromptLibraryViewer(opts) {
    const hostEl = opts?.hostEl;
    const entry = opts?.entry;
    if (!hostEl || !entry?.id) {
      throw new Error("hostEl and entry are required");
    }

    const root = document.createElement("div");
    root.className = "sc-prompt-lib is-embedded";

    const shell = document.createElement("div");
    shell.className = "sc-prompt-lib-shell";

    const stage = document.createElement("div");
    stage.className = "sc-prompt-lib-stage";
    const blur = document.createElement("div");
    blur.className = "sc-prompt-lib-blur";
    if (entry.imageDataUrl) {
      blur.style.backgroundImage = `url("${entry.imageDataUrl}")`;
    }
    const heroWrap = document.createElement("div");
    heroWrap.className = "sc-prompt-lib-hero-wrap";
    const hero = document.createElement("img");
    hero.className = "sc-prompt-lib-hero";
    hero.alt = "Prompt source image";
    hero.src = entry.imageDataUrl || "";
    heroWrap.appendChild(hero);
    attachTiltHover(heroWrap, { maxTilt: 6, scale: 1.02 });
    stage.appendChild(blur);
    stage.appendChild(heroWrap);

    const side = document.createElement("div");
    side.className = "sc-prompt-lib-side";

    const title = document.createElement("h3");
    title.className = "sc-prompt-lib-title";
    title.textContent = "Prompt";

    const sub = document.createElement("p");
    sub.className = "sc-prompt-lib-sub";
    sub.textContent = entry.modelId
      ? `Saved · ${entry.modelId}`
      : "Saved prompt";

    const thumb = document.createElement("img");
    thumb.className = "sc-prompt-lib-thumb";
    thumb.alt = "";
    thumb.src = entry.imageDataUrl || "";

    const area = document.createElement("textarea");
    area.className = "sc-prompt-lib-text";
    area.value = String(entry.prompt || "");
    area.readOnly = true;
    area.setAttribute("aria-label", "Saved prompt text");

    const actions = document.createElement("div");
    actions.className = "sc-prompt-lib-actions";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "sc-prompt-lib-btn";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(area.value);
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

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "sc-prompt-lib-btn sc-prompt-lib-btn-danger";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", async () => {
      if (!confirm("Delete this saved prompt?")) return;
      try {
        deleteBtn.disabled = true;
        await window.SeeCapturePromptLibrary.removePrompt(entry.id);
        if (typeof opts?.onDeleted === "function") opts.onDeleted(entry.id);
      } catch (err) {
        deleteBtn.disabled = false;
        alert(err?.message || "Could not delete prompt");
      }
    });

    const backBtn = document.createElement("button");
    backBtn.type = "button";
    backBtn.className = "sc-prompt-lib-btn sc-prompt-lib-btn-ghost";
    backBtn.textContent = "Back to library";
    backBtn.addEventListener("click", () => {
      if (typeof opts?.onBack === "function") opts.onBack();
    });

    actions.appendChild(copyBtn);
    actions.appendChild(deleteBtn);
    actions.appendChild(backBtn);

    side.appendChild(title);
    side.appendChild(sub);
    side.appendChild(thumb);
    side.appendChild(area);
    side.appendChild(actions);

    shell.appendChild(stage);
    shell.appendChild(side);
    root.appendChild(shell);
    hostEl.appendChild(root);

    return {
      close() {
        root.remove();
      },
      getId() {
        return entry.id;
      },
      root,
    };
  }

  window.SeeCapturePromptLibraryUI = {
    mountPromptLibraryViewer,
    truncatePrompt,
    attachTiltHover,
  };
})();
