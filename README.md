# See & Capture

Chrome extension + local server: drag-select a region, describe an edit in a prompt, optionally attach image or color/brand assets, then Preview or Edit the result.

## What you need

- Google Chrome
- Node.js 20+ **or** Docker
- At least one API key (FluxAPI or Eden recommended)

## 1. Add your API key

```bash
cp server/.env.example server/.env
```

Open `server/.env` and set at least one:

```
FLUXAPI_API_KEY=paste_your_fluxapi_key_here
EDEN_AI_API_KEY=paste_your_eden_key_here
FAL_KEY=paste_your_fal_key_here
GOOGLE_API_KEY=paste_your_google_key_here
```

When `FLUXAPI_API_KEY` is set, prompt edits prefer Flux Kontext Pro ([docs](https://docs.fluxapi.ai/)).

For Eden subject-quality edits, you can still set:

```
EDEN_AI_MODEL=openai/gpt-image-1.5
```

## 2. Start the local server

```bash
cd server && npm install && npm start
```

## 3. Load the extension

`chrome://extensions` → Developer mode → **Load unpacked** → `extension/`

## 4. Use it

1. Toolbar or right-click → **See & Capture — select area**
2. Drag a rectangle
3. Write a prompt under the two panes → **Apply** (edits the result, or the capture if there is no result yet)
4. Optional: **Add assets** → **Images** or **Color / Brand**, then Apply again
5. Hover the result → **Preview** (image only) or **Edit** (Figma-style tools)
6. Optional: **Select folder to save**

### Header

Order: title → **Select folder to save** → **⋮** (Use page text) → close. Glass-style border around the modal. UI uses Material Symbols icons throughout.

### Prompt composer

- Text field under Capture | Result
- **Add assets** dropdown: **Images** (pick / add PNG-JPEG) and **Color / Brand** (built-in palettes)
- **Apply** / Enter → Eden `custom-prompt` on the working image; selected assets are blended first when present

### Preview vs Edit (~70% viewport)

| Button | Window |
|--------|--------|
| Preview | Large image only |
| Edit | Same size + dark toolbar: Crop, Select area (Erase / Isolate), Remove background, Edit with prompt; **More** disabled |

The Figma toolbar is **not** shown under the small right pane in the main modal.

## Regression checklist

1. No footer badges and no variants strip under the modal  
2. ⋮ toggles Use page text  
3. Prompt + Apply updates the right pane  
4. Add assets Images / Color/Brand selection works  
5. Preview = image only; Edit = toolbar; both ~70% viewport  
6. Save downloads the latest result  

## Project layout

- `extension/` — MV3 plain JS (capture, modal, assets, blend, preview-edit)
- `server/` — Express + Eden / fal / Gemini / local providers
