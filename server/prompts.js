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
  "mashup-hybrid": {
    id: "mashup-hybrid",
    label: "Generate Hybrid Mashup",
    mode: "mashup-hybrid",
    prompt:
      "You are given two images. Image 1 is the STYLE / ENVIRONMENT scene " +
      "(use its background, lighting, color grade, camera angle, and atmosphere). " +
      "Image 2 is the SUBJECT / PRODUCT (preserve its exact identity, shape, logos, and geometry). " +
      "Composite the subject from Image 2 into the environment from Image 1 as a clean hybrid mashup. " +
      "Match ambient light on the subject to the scene when possible. Do not invent a different product. " +
      "Return one edited image.",
  },
  "text-remix": {
    id: "text-remix",
    label: "Text Remix",
    mode: "text-swap",
    prompt:
      "Edit the attached graphic only. Replace the listed on-image text strings. " +
      "Erase old lettering completely and paint new copy matching typography, color, " +
      "perspective, glow/shadow, and placement. Do not change unrelated artwork or layout.",
  },
  "visual-localizer": {
    id: "visual-localizer",
    label: "Visual Localizer",
    mode: "text-swap",
    prompt:
      "Edit the attached ad/graphic only. Replace on-image text with the provided translations. " +
      "Erase old lettering, render localized copy matching style and placement, and scale text " +
      "to fit buttons/banners without overflow. Keep brand art and layout intact.",
  },
  "custom-prompt": {
    id: "custom-prompt",
    label: "Edit with prompt",
    mode: "eden-custom-prompt",
    prompt:
      "The attached image is an identity and style REFERENCE only. " +
      "The user's target description below is authoritative: when it conflicts with the reference " +
      "(pose, hand/arm count, hair color or texture, prop colors, clothing, or other explicit details), " +
      "follow the target description. " +
      "HARD CONSTRAINT: If the target description states an explicit count or quantity " +
      "(digits like 2/3/4 or words like both/two/three/four, or phrases like multiple arms/hands), " +
      "you MUST render that exact count—even when the reference image shows a different count. " +
      "Do not collapse multiple requested limbs/objects into one. " +
      "Keep unrelated regions stable when possible. " +
      "Do not invent a wholly new scene unless the target description requires it. Return one edited image.",
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
