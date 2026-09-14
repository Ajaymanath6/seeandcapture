/**
 * Prompt library RPC client (content script).
 * Exposed as window.SeeCapturePromptLibrary
 */
(() => {
  function call(type, payload) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ type, ...(payload || {}) }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!response || response.ok === false) {
            reject(
              new Error(response?.error || "Prompt library request failed")
            );
            return;
          }
          resolve(response.result);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  async function listPrompts() {
    return (await call("PROMPT_LIBRARY_LIST")) || [];
  }

  async function getPrompt(id) {
    return call("PROMPT_LIBRARY_GET", { id });
  }

  async function savePrompt({ prompt, imageDataUrl, modelId }) {
    return call("PROMPT_LIBRARY_SAVE", { prompt, imageDataUrl, modelId });
  }

  async function removePrompt(id) {
    return call("PROMPT_LIBRARY_REMOVE", { id });
  }

  window.SeeCapturePromptLibrary = {
    listPrompts,
    getPrompt,
    savePrompt,
    removePrompt,
  };
})();
