(() => {
  const allowBtn = document.getElementById("allowBtn");
  const status = document.getElementById("status");

  function setStatus(text, kind) {
    status.textContent = text;
    status.classList.toggle("is-ok", kind === "ok");
    status.classList.toggle("is-err", kind === "err");
  }

  allowBtn.addEventListener("click", async () => {
    allowBtn.disabled = true;
    setStatus("Requesting microphone…", null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setStatus(
        "Microphone allowed. You can close this tab and use the mic in See & Capture.",
        "ok"
      );
      allowBtn.textContent = "Allowed";
    } catch (err) {
      allowBtn.disabled = false;
      const name = err?.name || "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setStatus(
          "Permission blocked. Use the lock icon in this tab’s address bar → Microphone → Allow, then try again.",
          "err"
        );
      } else {
        setStatus(err?.message || "Could not access the microphone.", "err");
      }
    }
  });
})();
