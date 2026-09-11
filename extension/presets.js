/**
 * Option labels only. Keep ids in sync with server/prompts.js.
 * Assign on globalThis so reinjection does not throw.
 */
globalThis.SEE_CAPTURE_PRESETS = [
  { id: "to-green", label: "Change to green" },
  { id: "remove-bg", label: "Remove background" },
  { id: "black-white", label: "Black and white" },
  { id: "similar-variant", label: "Generate similar" },
];
