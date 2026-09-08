# See & Capture

Chrome extension + local server: drag-select a region, then apply presets (green / remove background / black & white). Optional **page text**, **image assets**, and **color palettes** enrich the flow without changing the default path when those features are off.

## What you need

- Google Chrome
- Node.js 20+ **or** Docker
- At least one API key (Eden recommended for remove-bg)

## 1. Add your API key

```bash
cp server/.env.example server/.env
```

Open `server/.env` and set at least one:

```
EDEN_AI_API_KEY=paste_your_eden_key_here
FAL_KEY=paste_your_fal_key_here
GOOGLE_API_KEY=paste_your_google_key_here
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
3. With **no asset selected**, use the **3 global badges** at the bottom (Change to green / Remove background / Black and white)
4. Optional: **Select folder to save**

### Discover-on-action

Actions adapt to what you select:

| State | Shown |
|-------|--------|
| No asset | Only the 3 global badges; asset variants hidden |
| Image asset selected | Globals hidden; **Place sticker**, **Replace with your asset**, Green + asset, B&W + asset |
| Palette selected | Globals hidden; **Apply palette**, Green + asset, B&W + asset |

### Use page text (Context)

Header checkbox **Use page text** (off by default). Hover/focus the ⓘ tip for details.

- **Off:** only the cropped image is used  
- **On:** page title + nearby words are sent as hidden hints for AI-backed steps  

### Assets: Images | Palettes

- **Images:** Add a PNG/JPEG, or **Save capture**; click a thumbnail to select  
- **Palettes:** 4 built-in color sets (Warm Earth, Cool Ocean, Neon Night, Soft Pastel); click to select  

### Variants with your assets

| Variant | Needs | What it does |
|---------|--------|----------------|
| Place sticker | image | Pastes logo onto the capture (local, additive) |
| Replace with your asset | image | AI subject swap via Eden — keeps the capture scene, replaces the main person/object with your asset |
| Apply palette | palette | Recolors capture toward the 4 swatches (local) |
| Green + asset | any | Asset blend, then green |
| B&W + asset | any | Asset blend, then black & white |

**Replace** needs `EDEN_AI_API_KEY`. It uses Eden v3 image edits (scene + asset), with a dual-panel v2 fallback if needed.

## Regression checklist

1. No asset → only 3 global badges; variants hidden  
2. ⓘ tooltip explains page text; no long helper paragraph under the header  
3. Select image → globals hidden; Place sticker + Replace + green/bw visible  
4. Replace → right pane keeps scene, subject looks like asset (Eden key required)  
5. Select palette → Apply palette + green/bw; Place sticker / Replace hidden  
6. Place sticker still additive; Save folder still works  

## Project layout

- `extension/` — MV3 plain JS (capture, modal, assets, palettes, variants, blend)
- `server/` — Express + Eden / fal / Gemini / local providers
