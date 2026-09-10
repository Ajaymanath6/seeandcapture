/**
 * Train-station payload builder. Runs right before API messaging.
 * When context/assets are empty, payload matches today's bare edit request.
 * Exposed as window.SeeCapturePayload
 */
(() => {
  /**
   * @param {{
   *   imageDataUrl: string,
   *   presetId: string,
   *   prompt?: string,
   *   model?: string,
   *   flags?: {
   *     contextEnabled?: boolean,
   *     pageContext?: object,
   *     selectedAssetIds?: string[],
   *   }
   * }} args
   */
  async function preparePayload({
    imageDataUrl,
    presetId,
    prompt,
    model,
    flags,
  }) {
    const safeFlags = flags || {};
    const payload = {
      imageDataUrl,
      presetId,
      prompt: prompt || "",
      assets: [],
      pageContext: {},
      model: model || "auto",
    };

    if (safeFlags.contextEnabled && safeFlags.pageContext) {
      payload.pageContext = safeFlags.pageContext;
    }

    if (
      Array.isArray(safeFlags.selectedAssetIds) &&
      safeFlags.selectedAssetIds.length > 0 &&
      window.SeeCaptureAssets?.getAssetsByIds
    ) {
      payload.assets = await window.SeeCaptureAssets.getAssetsByIds(
        safeFlags.selectedAssetIds
      );
    }

    return payload;
  }

  function extractDOMContext(clientX, clientY) {
    let target = null;
    try {
      target = document.elementFromPoint(clientX, clientY);
    } catch (_err) {
      target = null;
    }

    const parent =
      (target &&
        target.closest &&
        target.closest("section, article, main, [role='main'], div")) ||
      document.body;

    let surroundingText = "";
    try {
      surroundingText = String(parent?.innerText || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 300);
    } catch (_err) {
      surroundingText = "";
    }

    const meta =
      document.querySelector('meta[name="description"]')?.getAttribute("content") ||
      "";

    return {
      pageTitle: document.title || "",
      metaDescription: meta,
      surroundingText,
      url: location.href || "",
    };
  }

  window.SeeCapturePayload = {
    preparePayload,
    extractDOMContext,
  };
})();
