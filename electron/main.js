"use strict";

const { app, BrowserWindow, ipcMain, dialog, session, protocol, shell } = require("electron");
const path = require("path");
const fs = require("fs");

// ---------------------------------------------------------------------------
// Dev mode detection
// ---------------------------------------------------------------------------

const isDev =
  process.argv.includes("--dev") || process.env.ELECTRON_DEV === "1";

// ---------------------------------------------------------------------------
// Single-instance lock
// ---------------------------------------------------------------------------

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

// ---------------------------------------------------------------------------
// Custom protocol registration (must happen before app.ready)
// ---------------------------------------------------------------------------

if (!isDev) {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: "app",
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

// ---------------------------------------------------------------------------
// Static export routing
// ---------------------------------------------------------------------------

const STATIC_EXPORT_ROOT = path.join(__dirname, "..", "out");
const DEFAULT_ENTRY_ROUTE = "play";

function isPathInside(parentPath, childPath) {
  const resolvedParent = path.resolve(parentPath);
  const resolvedChild = path.resolve(childPath);
  return (
    resolvedChild === resolvedParent ||
    resolvedChild.startsWith(`${resolvedParent}${path.sep}`)
  );
}

function normalizeStaticPathname(rawPathname) {
  let pathname;
  try {
    pathname = decodeURIComponent(rawPathname || "/");
  } catch {
    return null;
  }

  pathname = pathname.replace(/\\/g, "/").replace(/^\/+/, "");
  const normalized = path.posix.normalize(pathname);
  if (
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("/../")
  ) {
    return null;
  }

  return normalized === "." ? "" : normalized;
}

function resolveStaticFile(rawPathname) {
  const normalized = normalizeStaticPathname(rawPathname);
  if (normalized === null) return null;

  const candidates = [];
  if (!normalized) {
    candidates.push(`${DEFAULT_ENTRY_ROUTE}.html`, "index.html");
  } else if (normalized.endsWith("/")) {
    candidates.push(path.posix.join(normalized, "index.html"));
  } else {
    candidates.push(normalized);
    if (!path.posix.extname(normalized)) {
      candidates.push(`${normalized}.html`);
      candidates.push(path.posix.join(normalized, "index.html"));
    }
  }

  for (const relativeCandidate of candidates) {
    const filePath = path.resolve(STATIC_EXPORT_ROOT, relativeCandidate);
    if (!isPathInside(STATIC_EXPORT_ROOT, filePath)) {
      continue;
    }

    try {
      if (fs.statSync(filePath).isFile()) {
        return filePath;
      }
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Steamworks SDK initialization
// ---------------------------------------------------------------------------

const APP_ID = 4455570;
const STEAM_ACHIEVEMENTS = [
  "FIRST_OBSERVATION", "FIRST_REPORT", "FIRST_WEEK", "FIRST_MATCH",
  "FIRST_CONTACT", "FIRST_PERK", "FIRST_EQUIPMENT", "FIRST_YOUTH",
  "REACH_TIER_2", "REACH_TIER_3", "REACH_TIER_4", "REACH_TIER_5",
  "SEASON_1", "SEASON_3", "SEASON_5", "SEASON_10",
  "REPORTS_10", "REPORTS_25", "REPORTS_50", "REPORTS_100",
  "TABLE_POUND", "WONDERKID_FOUND", "DISCOVERIES_5", "DISCOVERIES_15",
  "ALUMNI_5", "ALUMNI_15", "ALUMNI_INTERNATIONAL", "ACADEMY_GOLD",
  "HIGH_ACCURACY", "GENERATIONAL_TALENT", "FULL_HOUSE", "PERFECT_RECORD",
  "MAX_SPEC", "ALL_PERKS_TREE", "MASTERY_PERK", "DUAL_MASTERY",
  "EQUIPMENT_MAXED", "SECONDARY_SPEC", "ALL_ACTIVITIES", "REP_50",
  "COUNTRIES_3", "COUNTRIES_6", "COUNTRIES_10", "COUNTRIES_15",
  "HOME_MASTERY", "ALL_CONTINENTS",
  "MATCHES_25", "MATCHES_50", "MATCHES_100",
  "OBSERVATIONS_50", "OBSERVATIONS_200", "OBSERVATIONS_500",
  "CONTACTS_5", "CONTACTS_15", "REP_75", "REP_100",
  "SAVINGS_100K", "SAVINGS_500K", "BIG_SPENDER", "FIRST_EMPLOYEE", "AGENCY_EMPIRE",
  "BLIND_FAITH", "TRIPLE_STORYLINE", "SURVIVED_FIRING",
  "WATCHLIST_10", "MARATHON", "SPEEDRUN", "AGAINST_ALL_ODDS", "STREAK_5",
];
const STEAM_ACHIEVEMENT_SET = new Set(STEAM_ACHIEVEMENTS);
const RICH_PRESENCE_KEYS = new Set([
  "steam_display",
  "country",
  "fixture",
  "season",
  "week",
  "steam_player_group",
]);

let steamClient = null;
let steamAvailable = false;

function initSteam() {
  try {
    const steamworks = require("steamworks.js");
    steamClient = steamworks.init(APP_ID);
    steamAvailable = true;
    console.log("[Steam] Initialized successfully - App ID:", APP_ID);
  } catch (err) {
    steamClient = null;
    steamAvailable = false;
    console.warn("[Steam] Failed to initialize (Steam client may not be running):", err.message);
  }
}

// ---------------------------------------------------------------------------
// MIME type lookup
// ---------------------------------------------------------------------------

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".webm": "audio/webm",
  ".mp4": "video/mp4",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".map": "application/json",
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

// ---------------------------------------------------------------------------
// Content Security Policy
// ---------------------------------------------------------------------------

const DEV_CSP =
  "default-src 'self' http://localhost:3000 data: blob:; " +
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:3000; " +
  "style-src 'self' 'unsafe-inline' http://localhost:3000; " +
  "img-src 'self' http://localhost:3000 data: blob:; " +
  "font-src 'self' http://localhost:3000 data:; " +
  "connect-src 'self' http://localhost:3000 https://*.supabase.co https: ws: wss:; " +
  "media-src 'self' http://localhost:3000 data: blob:; " +
  "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self';";

const PROD_CSP =
  "default-src 'self' app: data: blob:; " +
  "script-src 'self' 'unsafe-inline' app:; " +
  "style-src 'self' 'unsafe-inline' app:; " +
  "img-src 'self' app: data: blob:; " +
  "font-src 'self' app: data:; " +
  "connect-src 'self' app: https://*.supabase.co https: wss:; " +
  "media-src 'self' app: data: blob:; " +
  "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self';";

let cspInstalled = false;

function installContentSecurityPolicy() {
  if (cspInstalled) return;
  cspInstalled = true;

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const url = details.url || "";
    const shouldApply =
      details.resourceType === "mainFrame" &&
      (
        (isDev && url.startsWith("http://localhost:3000")) ||
        (!isDev && url.startsWith("app://"))
      );

    if (!shouldApply) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [isDev ? DEV_CSP : PROD_CSP],
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Shell state for dialog defaults across relaunches
// ---------------------------------------------------------------------------

const DEFAULT_SAVE_FILENAME = "talentscout-save.json";
const MAX_FILE_BYTES = 10 * 1024 * 1024;

let shellState = {
  lastDialogDirectory: null,
};
let shellStateLoaded = false;

function getShellStatePath() {
  return path.join(app.getPath("userData"), "shell-state.json");
}

function loadShellState() {
  if (shellStateLoaded) return;
  shellStateLoaded = true;

  try {
    const raw = fs.readFileSync(getShellStatePath(), "utf8");
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.lastDialogDirectory === "string"
    ) {
      shellState.lastDialogDirectory = parsed.lastDialogDirectory;
    }
  } catch {
    shellState.lastDialogDirectory = null;
  }
}

function saveShellState() {
  try {
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.writeFileSync(
      getShellStatePath(),
      JSON.stringify(shellState, null, 2),
      "utf8",
    );
  } catch (err) {
    console.warn("[Shell] Failed to persist shell state:", err.message);
  }
}

function rememberDialogDirectory(filePath) {
  const directory = path.dirname(filePath);
  if (!directory) return;

  try {
    if (!fs.statSync(directory).isDirectory()) {
      return;
    }
  } catch {
    return;
  }

  shellState.lastDialogDirectory = directory;
  saveShellState();
}

function getDialogBaseDirectory() {
  loadShellState();

  if (shellState.lastDialogDirectory) {
    try {
      if (fs.statSync(shellState.lastDialogDirectory).isDirectory()) {
        return shellState.lastDialogDirectory;
      }
    } catch {
      // Fall back to Documents below.
    }
  }

  return app.getPath("documents");
}

function sanitizeSuggestedFilename(filename) {
  if (typeof filename !== "string") return DEFAULT_SAVE_FILENAME;

  const trimmed = filename.trim();
  if (!trimmed) return DEFAULT_SAVE_FILENAME;

  const basename = path.basename(trimmed).replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_");
  if (!basename) return DEFAULT_SAVE_FILENAME;
  return basename.toLowerCase().endsWith(".json") ? basename : `${basename}.json`;
}

// ---------------------------------------------------------------------------
// Input validation helpers
// ---------------------------------------------------------------------------

function assertString(value, label, maxLength) {
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be a string`);
  }

  if (value.length > maxLength) {
    throw new TypeError(`${label} exceeds ${maxLength} characters`);
  }

  return value;
}

function assertSteamSlot(slot) {
  const normalized = assertString(slot, "slot", 8).trim();
  if (!/^[0-5]$/.test(normalized)) {
    throw new TypeError("slot must be a digit between 0 and 5");
  }
  return normalized;
}

function assertAchievementName(name) {
  const normalized = assertString(name, "achievement name", 64).trim();
  if (!STEAM_ACHIEVEMENT_SET.has(normalized)) {
    throw new TypeError(`Unsupported achievement name: ${normalized}`);
  }
  return normalized;
}

function assertRichPresenceKey(key) {
  const normalized = assertString(key, "rich presence key", 64).trim();
  if (!RICH_PRESENCE_KEYS.has(normalized)) {
    throw new TypeError(`Unsupported rich presence key: ${normalized}`);
  }
  return normalized;
}

function assertFilePayload(data) {
  const normalized = assertString(data, "file data", MAX_FILE_BYTES);
  if (Buffer.byteLength(normalized, "utf8") > MAX_FILE_BYTES) {
    throw new TypeError(`file data exceeds ${MAX_FILE_BYTES} bytes`);
  }
  return normalized;
}

function isTrustedNavigationTarget(url) {
  if (!url) return false;
  if (isDev) {
    return url === "http://localhost:3000" || url.startsWith("http://localhost:3000/");
  }
  return url === "app://host" || url.startsWith("app://host/");
}

function isSafeExternalUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "mailto:";
  } catch {
    return false;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[char]);
}

function renderLoadFailurePage(errorCode, errorDescription) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>TalentScout failed to load</title>
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #0c0c0c;
        color: #ffffff;
        font-family: system-ui, sans-serif;
      }
      main {
        max-width: 38rem;
        padding: 2rem;
        text-align: center;
      }
      p { color: #c9c9c9; line-height: 1.5; }
      code {
        display: inline-block;
        margin-top: 1rem;
        padding: 0.4rem 0.6rem;
        border-radius: 0.4rem;
        background: #171717;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>TalentScout failed to load</h1>
      <p>The desktop shell could not load the packaged app content.</p>
      <code>${escapeHtml(errorDescription)} (${escapeHtml(errorCode)})</code>
      <p>Restart the app. If this keeps happening, the packaged export or install may be incomplete.</p>
    </main>
  </body>
</html>`;
}

// ---------------------------------------------------------------------------
// Window management
// ---------------------------------------------------------------------------

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    title: "TalentScout",
    width: 1280,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: isDev,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isTrustedNavigationTarget(url)) {
      return;
    }

    event.preventDefault();
    if (isSafeExternalUrl(url)) {
      shell.openExternal(url).catch(() => {});
    }
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:3000/play");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadURL("app://host/play");
  }

  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;

    if (input.key === "F11") {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      return;
    }

    if (isDev) return;

    const lowerKey = String(input.key || "").toLowerCase();
    const modifier = process.platform === "darwin" ? input.meta : input.control;
    if (
      lowerKey === "f12" ||
      (modifier && input.shift && (lowerKey === "i" || lowerKey === "j" || lowerKey === "c"))
    ) {
      event.preventDefault();
    }
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
    const html = renderLoadFailurePage(errorCode, errorDescription);
    mainWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// IPC - Steam API (real SDK when available, graceful fallbacks otherwise)
// ---------------------------------------------------------------------------

ipcMain.handle("steam:isAvailable", () => {
  return steamAvailable && Boolean(steamClient);
});

ipcMain.handle("steam:unlockAchievement", (_event, name) => {
  const achievementName = assertAchievementName(name);
  if (!steamClient) return;

  try {
    steamClient.achievement.activate(achievementName);
    console.log("[Steam] Achievement unlocked:", achievementName);
  } catch (err) {
    console.warn("[Steam] Failed to unlock achievement:", achievementName, err.message);
  }
});

ipcMain.handle("steam:setCloudSave", (_event, slot, data) => {
  const normalizedSlot = assertSteamSlot(slot);
  const payload = assertFilePayload(data);
  if (!steamClient) return;

  try {
    const filename = `talentscout_${normalizedSlot}.json`;
    steamClient.cloud.writeFile(filename, payload);
    console.log("[Steam] Cloud save written: %s (%d bytes)", filename, payload.length);
  } catch (err) {
    console.warn("[Steam] Cloud save write failed:", err.message);
  }
});

ipcMain.handle("steam:getCloudSave", (_event, slot) => {
  const normalizedSlot = assertSteamSlot(slot);
  if (!steamClient) return null;

  try {
    const filename = `talentscout_${normalizedSlot}.json`;
    if (!steamClient.cloud.isFileExists(filename)) {
      return null;
    }
    const data = steamClient.cloud.readFile(filename);
    console.log("[Steam] Cloud save read: %s (%d bytes)", filename, data.length);
    return typeof data === "string" ? data : String(data);
  } catch (err) {
    console.warn("[Steam] Cloud save read failed:", err.message);
    return null;
  }
});

ipcMain.handle("steam:getPlayerName", () => {
  if (!steamClient) return "Player";

  try {
    return steamClient.localplayer.getName();
  } catch (err) {
    console.warn("[Steam] Failed to get player name:", err.message);
    return "Player";
  }
});

ipcMain.handle("steam:setRichPresence", (_event, key, value) => {
  const normalizedKey = assertRichPresenceKey(key);
  const normalizedValue = assertString(value, "rich presence value", 256);
  if (!steamClient) return;

  try {
    steamClient.localplayer.setRichPresence(normalizedKey, normalizedValue);
  } catch (err) {
    console.warn("[Steam] Rich Presence failed:", normalizedKey, err.message);
  }
});

ipcMain.handle("steam:resetAllAchievements", () => {
  if (!steamClient) return;
  if (!isDev) {
    console.warn("[Steam] resetAllAchievements blocked - not in dev mode");
    return;
  }

  try {
    for (const name of STEAM_ACHIEVEMENTS) {
      steamClient.achievement.clear(name);
    }
    console.log("[Steam] All %d achievements reset", STEAM_ACHIEVEMENTS.length);
  } catch (err) {
    console.warn("[Steam] resetAllAchievements failed:", err.message);
  }
});

// ---------------------------------------------------------------------------
// IPC - Native file dialogs
// ---------------------------------------------------------------------------

ipcMain.handle("dialog:saveFile", async (_event, data, filename) => {
  if (!mainWindow) return false;

  const payload = assertFilePayload(data);
  const suggestedFilename = sanitizeSuggestedFilename(filename);
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: path.join(getDialogBaseDirectory(), suggestedFilename),
    filters: [
      { name: "JSON Save Files", extensions: ["json"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });

  if (result.canceled || !result.filePath) return false;

  try {
    fs.writeFileSync(result.filePath, payload, "utf8");
    rememberDialogDirectory(result.filePath);
    console.log("[IPC] dialog:saveFile wrote:", result.filePath);
    return true;
  } catch (err) {
    console.error("[IPC] dialog:saveFile error:", err);
    return false;
  }
});

ipcMain.handle("dialog:openFile", async () => {
  if (!mainWindow) return null;

  const result = await dialog.showOpenDialog(mainWindow, {
    defaultPath: getDialogBaseDirectory(),
    properties: ["openFile"],
    filters: [
      { name: "JSON Save Files", extensions: ["json"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) return null;

  try {
    const selectedPath = result.filePaths[0];
    const stats = fs.statSync(selectedPath);
    if (!stats.isFile()) {
      throw new Error("Selected path is not a file");
    }
    if (stats.size > MAX_FILE_BYTES) {
      throw new Error(`Selected file exceeds ${MAX_FILE_BYTES} bytes`);
    }

    const content = fs.readFileSync(selectedPath, "utf8");
    rememberDialogDirectory(selectedPath);
    console.log("[IPC] dialog:openFile read:", selectedPath);
    return content;
  } catch (err) {
    console.error("[IPC] dialog:openFile error:", err);
    return null;
  }
});

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.on("second-instance", () => {
  if (!mainWindow) {
    createWindow();
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
});

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) {
    return;
  }

  installContentSecurityPolicy();
  loadShellState();

  if (!isDev) {
    protocol.handle("app", (request) => {
      const url = new URL(request.url);
      const filePath = resolveStaticFile(url.pathname);

      if (!filePath) {
        return new Response("Not Found", {
          status: 404,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }

      try {
        const data = fs.readFileSync(filePath);
        return new Response(data, {
          status: 200,
          headers: { "Content-Type": getMimeType(filePath) },
        });
      } catch {
        return new Response("Not Found", {
          status: 404,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
    });
  }

  initSteam();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
