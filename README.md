# See & Capture

Chrome extension + local server: drag-select a region on any page, then click a preset to generate an image variation with **Nano Banana** (Gemini image model).

## What you need

- Google Chrome
- Node.js 20+ **or** Docker
- A free Google AI Studio API key: https://aistudio.google.com/apikey

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

- **Eden AI** (preferred when set): https://app.edenai.run/  
- **fal.ai**: https://fal.ai/dashboard/keys  
- Google Nano Banana: https://aistudio.google.com/apikey  

The server prefers **eden** → **fal** → **nano-banana** based on which keys are present.
## 2. Start the local server

**Option A — Node**

```bash
cd server
npm install
npm start
```

You should see: `See & Capture server listening on http://127.0.0.1:8787`

**Option B — Docker**

```bash
docker compose up --build
```

## 3. Load the extension

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked**
4. Select the `extension` folder inside this project

## 4. Use it

1. Click the toolbar icon **or** right-click the page → **See & Capture — select area**
2. Drag a rectangle over what you want
3. In the modal: left = your crop, right = result
4. Click any option (Warm tones, Watercolor, etc.)
5. Wait for Nano Banana — the result appears on the right

## Troubleshooting

| Problem | Fix |
|---|---|
| “GOOGLE_API_KEY is missing” | Put a real key in `server/.env` and restart |
| Request failed / port 8787 | Start the server (`npm start` or Docker) |
| Capture fails on some pages | Chrome blocks capture on `chrome://` and the Web Store; try a normal website |
| Extension outdated after edits | On `chrome://extensions`, click **Reload** on See & Capture |

## Project layout

- `extension/` — Manifest V3, plain JavaScript (no build step)
- `server/` — Express router + `providers/gemini.js` (Nano Banana)
- `server/prompts.js` — full preset prompts (UI only shows labels)
