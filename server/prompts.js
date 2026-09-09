const PRESERVE =
  "Use the attached image as the ONLY source. Keep the same subjects, composition, framing, and details. Do not invent a new scene, object, or location. Apply only the requested change and return one edited image.";

const PRESETS = {
  "to-green": {
    id: "to-green",
    label: "Change to green",
    mode: "local-green",
    prompt:
      "Recolor this exact image toward green tones. Keep every subject, shape, and layout identical—only shift colors to green.",
  },
  "remove-bg": {
    id: "remove-bg",
    label: "Remove background",
    mode: "eden-background-removal",
    prompt:
      "Remove the background from this image. Keep the main subject sharp and unchanged on a transparent background.",
  },
  "black-white": {
    id: "black-white",
    label: "Black and white",
    mode: "local-grayscale",
    prompt:
      "Convert this exact image to black and white. Keep composition, subjects, and detail identical—only remove color.",
  },
  "replace-with-asset": {
    id: "replace-with-asset",
    label: "Replace with your asset",
    mode: "eden-replace-subject",
    prompt:
      "You are given two images. Image 1 is the SCENE (keep its background, camera angle, lighting, and composition). Image 2 is the REPLACEMENT SUBJECT (use this person's or object's identity). Replace ONLY the main subject/person/object in Image 1 with the subject from Image 2. Keep everything else in the scene the same. Do not invent a new location. Return one edited image.",
  },
  "custom-prompt": {
    id: "custom-prompt",
    label: "Edit with prompt",
    mode: "eden-custom-prompt",
    prompt: `${PRESERVE} Apply only the user's requested edit described below.`,
  },
};

function getPreset(presetId) {
  if (!presetId || typeof presetId !== "string") return null;
  return PRESETS[presetId] || null;
}

function listPresetMeta() {
  return Object.values(PRESETS).map(({ id, label, prompt, mode }) => ({
    id,
    label,
    prompt,
    mode,
  }));
}

module.exports = {
  PRESERVE,
  PRESETS,
  getPreset,
  listPresetMeta,
};
