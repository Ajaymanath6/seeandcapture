const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { promisify } = require("util");
const { execFile } = require("child_process");

const execFileAsync = promisify(execFile);

const PASTE_GAP_MS = 1200;
const MAX_IMAGES = 40;

let runToken = 0;
let active = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(
    /^data:([^;,]+)?(;base64)?,(.*)$/s
  );
  if (!match) throw new Error("Invalid image dataUrl");
  const mime = (match[1] || "image/png").toLowerCase();
  const isBase64 = Boolean(match[2]);
  const payload = match[3] || "";
  const buffer = isBase64
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeURIComponent(payload), "utf8");
  return { mime, buffer };
}

async function commandExists(cmd) {
  try {
    await execFileAsync("which", [cmd]);
    return true;
  } catch {
    return false;
  }
}

async function writeClipboardPngLinuxGtk(filePath) {
  const script = `
import gi
gi.require_version("Gtk", "3.0")
gi.require_version("Gdk", "3.0")
from gi.repository import Gtk, Gdk, GdkPixbuf, GLib
path = ${JSON.stringify(filePath)}
pixbuf = GdkPixbuf.Pixbuf.new_from_file(path)
clip = Gtk.Clipboard.get(Gdk.SELECTION_CLIPBOARD)
clip.set_image(pixbuf)
clip.store()
GLib.timeout_add(150, Gtk.main_quit)
Gtk.main()
`.trim();
  await execFileAsync("python3", ["-c", script], {
    timeout: 8000,
    env: process.env,
  });
}

async function writeClipboardPng(filePath) {
  const platform = process.platform;

  if (platform === "darwin") {
    const script = `set the clipboard to (read (POSIX file "${filePath.replace(
      /\\/g,
      "\\\\"
    )}") as «class PNGf»)`;
    await execFileAsync("osascript", ["-e", script]);
    return;
  }

  if (platform === "linux") {
    const wayland = Boolean(process.env.WAYLAND_DISPLAY);
    if (wayland && (await commandExists("wl-copy"))) {
      await new Promise((resolve, reject) => {
        const child = spawn("wl-copy", ["--type", "image/png"], {
          stdio: ["pipe", "ignore", "pipe"],
        });
        let err = "";
        child.stderr.on("data", (d) => {
          err += String(d);
        });
        child.on("error", reject);
        child.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error(err || `wl-copy exited ${code}`));
        });
        fs.createReadStream(filePath).pipe(child.stdin);
      });
      return;
    }
    if (await commandExists("xclip")) {
      await execFileAsync("xclip", [
        "-selection",
        "clipboard",
        "-t",
        "image/png",
        "-i",
        filePath,
      ]);
      return;
    }
    // Fallback when xclip/wl-copy are missing (common on some desktops).
    try {
      await writeClipboardPngLinuxGtk(filePath);
      return;
    } catch (err) {
      throw new Error(
        `No clipboard tool found (tried wl-copy, xclip, GTK). Install xclip or wl-clipboard. (${err?.message || err})`
      );
    }
  }

  throw new Error(
    `Clipboard paste queue is not supported on platform: ${platform}`
  );
}

async function ensureClipboardTools() {
  if (process.platform === "darwin") {
    if (!(await commandExists("osascript"))) {
      throw new Error("osascript is required for clipboard paste on macOS.");
    }
    return;
  }
  if (process.platform === "linux") {
    const wayland = Boolean(process.env.WAYLAND_DISPLAY);
    if (wayland && (await commandExists("wl-copy"))) return;
    if (await commandExists("xclip")) return;
    // Probe GTK fallback once.
    try {
      await execFileAsync(
        "python3",
        [
          "-c",
          'import gi; gi.require_version("Gtk","3.0"); from gi.repository import Gtk, Gdk; print("ok")',
        ],
        { timeout: 5000 }
      );
      return;
    } catch {
      throw new Error(
        "No clipboard tool found. Install xclip (X11) or wl-clipboard (Wayland)."
      );
    }
  }
  throw new Error(
    `Clipboard paste queue is not supported on platform: ${process.platform}`
  );
}


function normalizeImages(raw) {
  if (!Array.isArray(raw) || !raw.length) {
    throw new Error("images array is required");
  }
  if (raw.length > MAX_IMAGES) {
    throw new Error(`Too many images (max ${MAX_IMAGES})`);
  }
  return raw.map((item, index) => {
    const dataUrl = item?.dataUrl;
    if (!dataUrl || typeof dataUrl !== "string") {
      throw new Error(`images[${index}].dataUrl is required`);
    }
    return {
      id: item?.id != null ? String(item.id) : String(index),
      dataUrl,
    };
  });
}

async function runQueue(images, delayMs, token) {
  active = true;
  const dir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "sc-paste-queue-")
  );
  try {
    for (let i = 0; i < images.length; i += 1) {
      if (token !== runToken) {
        console.log("[paste-queue] cancelled by newer queue");
        return;
      }
      const { buffer, mime } = parseDataUrl(images[i].dataUrl);
      const ext = mime.includes("jpeg") || mime.includes("jpg") ? "jpg" : "png";
      const filePath = path.join(dir, `img-${i}.${ext}`);
      await fs.promises.writeFile(filePath, buffer);

      // Clipboard image write expects PNG on macOS PNGf / xclip image/png.
      let pngPath = filePath;
      if (ext !== "png") {
        // Most moodboard captures are already PNG; if not, still try writing
        // bytes — tools may reject. Prefer converting via writing as-is only
        // when mime is png; otherwise rewrite using same buffer if labeled png.
        pngPath = path.join(dir, `img-${i}.png`);
        await fs.promises.writeFile(pngPath, buffer);
      }

      console.log(
        `[paste-queue] clipboard ${i + 1}/${images.length} id=${images[i].id}`
      );
      await writeClipboardPng(pngPath);

      if (i < images.length - 1) {
        await sleep(delayMs);
        if (token !== runToken) {
          console.log("[paste-queue] cancelled by newer queue");
          return;
        }
      }
    }
    console.log("[paste-queue] finished");
  } finally {
    if (token === runToken) active = false;
    fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Start a sequential clipboard queue. Replaces any in-flight queue.
 * @returns {{ ok: true, count: number, delayMs: number, replaced: boolean }}
 */
async function enqueuePasteQueue({ images: rawImages, delayMs } = {}) {
  const images = normalizeImages(rawImages);
  const gap =
    Number.isFinite(Number(delayMs)) && Number(delayMs) >= 200
      ? Math.min(5000, Math.round(Number(delayMs)))
      : PASTE_GAP_MS;

  await ensureClipboardTools();

  const replaced = active;
  runToken += 1;
  const token = runToken;

  // Fire-and-forget; caller gets 202 immediately.
  setImmediate(() => {
    runQueue(images, gap, token).catch((err) => {
      console.error("[paste-queue] failed:", err?.message || err);
      if (token === runToken) active = false;
    });
  });

  return {
    ok: true,
    count: images.length,
    delayMs: gap,
    replaced,
  };
}

function getPasteQueueStatus() {
  return { active, runToken };
}

module.exports = {
  PASTE_GAP_MS,
  enqueuePasteQueue,
  getPasteQueueStatus,
  ensureClipboardTools,
};
