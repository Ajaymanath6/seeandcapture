# Chrome Extension — Publish & Use Guide

**Read this file end to end.** It is the checklist to finish **See & Capture** as a real Chrome extension people can install from the Chrome Web Store (or load unpacked while testing).

Official docs (bookmark these):

- [Publish in the Chrome Web Store](https://developer.chrome.com/docs/webstore/publish)
- [Privacy practices (dashboard)](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Program policies](https://developer.chrome.com/docs/webstore/program-policies)
- [User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)

---

## What this product is (single purpose)

**See & Capture** is a Chrome extension that lets designers:

1. Select an area on a web page  
2. Edit / remix it with AI (prompts, remove background, mashup, moodboards, etc.)  
3. Save results and assets locally  

Everything should stay **one clear purpose**: *capture visuals from the page and edit them with AI-assisted tools*. Do not market it as a general VPN, ad blocker, or unrelated toolbox — Google rejects “mixed purpose” listings.

---

## Part A — Use it locally (before publishing)

### Step 1 — Install Node (or Docker)

You need:

- Google Chrome  
- Node.js 20+ **or** Docker  

### Step 2 — Server keys (never put these in the extension zip)

```bash
cp server/.env.example server/.env
```

Edit `server/.env` with your keys (OpenRouter, Flux, Eden, etc.).  
**Never commit `.env`. Never ship API keys inside the extension package.**

### Step 3 — Start the local server

```bash
cd server
npm install
npm start
```

Optional rembg (background removal):

```bash
docker compose up -d rembg
```

Server should answer at `http://127.0.0.1:8787/health`.

### Step 4 — Load the extension unpacked

1. Open `chrome://extensions`  
2. Turn **Developer mode** ON  
3. Click **Load unpacked**  
4. Select the `extension/` folder (this repo)  

### Step 5 — Smoke test

- Capture an area (toolbar or right‑click / Alt+C)  
- Apply a prompt / Remove BG / Moodboard  
- Confirm mic STT only if you use voice  

If something fails, fix it **before** you pay for the Web Store.

---

## Part B — Make the package store-ready

### Step 6 — Confirm Manifest V3 (already done)

Your `extension/manifest.json` already has:

- `"manifest_version": 3`  
- `background.service_worker`  
- Local scripts only (no remote JS)  

Before upload, check again:

- [ ] No `eval` / remote `<script src="https://...">`  
- [ ] Version bumped if you re-upload (`"version": "1.9.0"` → next number)  
- [ ] Name, description, icons look professional  
- [ ] No secrets, no `.env`, no `node_modules` in the zip  

### Step 7 — Build the ZIP (extension folder only)

From the repo root:

```bash
cd extension
zip -r ../see-and-capture-extension.zip . -x "*.DS_Store" -x "*node_modules*"
```

Upload **that zip**. Do not zip the whole git repo.

### Step 8 — Assets Google will ask for

Prepare before opening the dashboard:

| Asset | Size / note |
|--------|-------------|
| Store icon | **128×128** PNG (you already have `extension/icons/logo.png` — replace if low quality) |
| Screenshots | At least **1**, ideally **3–5**. Preferred **1280×800** or **640×400** |
| Small promo (optional) | 440×280 |
| Marquee promo (optional) | 1400×560 |
| Short description | ≤ 132 characters |
| Detailed description | What it does, how to use, that a **local server** may be required |

**Screenshot tips:** show capture → edit → result. No fake 5‑star claims. No competing store logos.

---

## Part C — Chrome Web Store account & money

### Step 9 — Developer account

1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)  
2. Sign in with a Google account  
3. Pay the **one-time registration fee** (historically ~$5 USD)  
4. Accept the [Developer Agreement](https://developer.chrome.com/docs/webstore/terms)  

### Step 10 — Create a new item

Dashboard → **New item** → upload `see-and-capture-extension.zip`.

---

## Part D — Privacy & policy (this is what gets you rejected if wrong)

Google cares more about **privacy honesty** than pretty screenshots.

### Step 11 — Host a public Privacy Policy URL

You need a **public HTTPS page** (GitHub Pages, Notion public page, your site, etc.).

The policy must say, in plain language:

1. **What data** — screenshots/images the user captures; prompts; optional mic audio for speech‑to‑text; moodboard/prompt library stored in the browser; page context if “Use page text” is on  
2. **Where it goes** — local IndexedDB / `chrome.storage`; to the user’s **local server** (`127.0.0.1`); from there to **third‑party AI APIs** the user configures (OpenRouter, Flux, Eden, etc.)  
3. **What you don’t do** — you (the publisher) do not sell personal data; you don’t scrape unrelated browsing history for ads  
4. **Security** — recommend HTTPS for any remote APIs; keys stay on the user’s machine in `server/.env`  
5. **Retention / deletion** — user can remove the extension / clear site data / delete moodboard items  
6. **Contact email** for privacy questions  

Paste that URL into:

- Developer account privacy fields  
- The item’s **Privacy practices** tab  

### Step 12 — Single purpose statement

Example you can adapt:

> See & Capture helps designers capture a region of a webpage and edit it with AI-assisted tools (prompt edit, background removal, moodboards, remix workflows). It does not provide unrelated browsing features.

### Step 13 — Permission justifications (copy into dashboard)

Use clear “why” language for each permission in your manifest:

| Permission | Why (example justification) |
|------------|-----------------------------|
| `activeTab` | Capture and inject UI only when the user starts a capture / opens the tool |
| `tabs` | Identify the tab to inject the capture overlay and content scripts |
| `storage` / `unlimitedStorage` | Save moodboards, prompt library, and settings locally |
| `contextMenus` | Right‑click “See & Capture” / add to moodboard |
| `scripting` | Inject the capture overlay and editor UI into the page |
| `clipboardWrite` | Copy results / sequential paste-for-AI |
| `offscreen` | Record microphone audio for speech‑to‑text in a secure offscreen document |
| Host `<all_urls>` | User may capture from any site they are viewing; content script runs to draw selection overlay |
| `http://127.0.0.1:8787/*` / `localhost` | Talk to the user’s local edit server |

**Important:** `<all_urls>` is sensitive. Your store description + privacy policy must match: *user-triggered capture on the page they are on*, not silent scraping.

### Step 14 — Data practices checkboxes

In Privacy practices, disclose only what is true. Typical for this app:

- User content (images, prompts, audio if mic used)  
- Stored locally and/or sent to **user-run** local server → AI providers the user configures  
- Certify **Limited Use** (only use data to provide the feature)  
- Declare **no remote code** (all JS is in the package)  

If mic / STT is optional, say so clearly.

### Step 15 — Remote code declaration

Answer: **No remote code** (bundled JS only).  
Calling HTTPS APIs for AI images is **data**, not remote code — still disclose those APIs in the privacy policy.

---

## Part E — Listing text that passes review

### Step 16 — Write the store listing

**Do:**

- Explain local server requirement honestly  
- List main features (capture, edit, rembg, moodboards, prompt library)  
- Say API keys are configured by the user on their machine  

**Don’t:**

- Promise “100% free unlimited AI” if APIs cost money  
- Use trademarked names in misleading ways  
- Claim Google/Chrome endorsement  
- Hide that images leave the browser toward AI providers  

### Step 17 — Distribution

Choose **Public** (anyone) or **Unlisted** (link only) for early testing.  
Start with **Trusted testers** if you want a private beta first (recommended).

---

## Part F — Submit & survive review

### Step 18 — Submit for review

Dashboard → item → **Submit for review**.

Typical wait: days to a couple of weeks. Sensitive permissions (`<all_urls>`, mic) can take longer.

### Step 19 — If rejected

Read the email carefully. Common fixes:

| Rejection reason | Fix |
|------------------|-----|
| Broad host permission | Narrow if possible, or rewrite justification + privacy policy |
| Missing / weak privacy policy | Host a clearer public page and update URL |
| Single purpose unclear | Rewrite description to one job |
| Remote code | Remove any CDN scripts |
| Misleading screenshots | Replace with real product UI |
| Permissions unused | Remove from `manifest.json` and re-zip |

Bump `version`, upload new zip, reply in the dashboard if asked.

### Step 20 — After approval

- Install from the Web Store link and retest  
- Keep `server` instructions in your GitHub README for users who need local AI  
- For each update: bump version → zip → upload → submit again  

---

## Part G — Extra checklist for *this* repo

Before every upload:

- [ ] `server/.env` **not** in the zip  
- [ ] No API keys in `extension/` source  
- [ ] `manifest.json` version bumped  
- [ ] Mic permission pages work (`mic-permission.html`, offscreen voice)  
- [ ] Privacy policy mentions: captures, prompts, optional audio, local server, third-party AI  
- [ ] Listing mentions local server on port **8787**  
- [ ] Icons are crisp at 128×128  
- [ ] You tested **Load unpacked** after the last code change  

---

## Suggested order (do this, in this order)

1. Local load + full smoke test  
2. Write & host privacy policy  
3. Prepare screenshots + icon  
4. Zip `extension/` only  
5. Pay developer fee / open dashboard  
6. Upload zip  
7. Fill Privacy practices + permission justifications  
8. Trusted testers first (optional but smart)  
9. Submit public listing  
10. Fix any review feedback and resubmit  

---

## Quick links again

- Dashboard: https://chrome.google.com/webstore/devconsole  
- Publish guide: https://developer.chrome.com/docs/webstore/publish  
- Privacy tab help: https://developer.chrome.com/docs/webstore/cws-dashboard-privacy  
- Policies: https://developer.chrome.com/docs/webstore/program-policies  

When you finish Part A–F, the product is a publishable Chrome extension. Keep this file as your only “what do I do next?” map.
