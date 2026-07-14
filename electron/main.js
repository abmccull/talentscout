"use strict";

const { app, BrowserWindow, ipcMain, dialog, session, protocol, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const {
  assertTrustedIpcSender,
  determineDevelopmentMode,
  isTrustedNavigationTarget,
  normalizeSafeExternalUrl,
} = require("./security");
const {
  MAX_ACTIVE_SAVE_TRANSFERS,
  MAX_SAVE_PAYLOAD_BYTES,
  SAVE_TRANSFER_TTL_MS,
  SaveDownloadTransferRegistry,
  SaveTransferBudget,
  SaveUploadTransferRegistry,
  decodeUtf8SavePayload,
} = require("./save-transfer");
const {
  atomicWriteUtf8File,
  readBoundedUtf8Buffer,
} = require("./file-io");
const { createStaticFileResponse } = require("./static-response");

// ---------------------------------------------------------------------------
// Dev mode detection
// ---------------------------------------------------------------------------

const isDev = determineDevelopmentMode({
  isPackaged: app.isPackaged,
  argv: process.argv,
  electronDev: process.env.ELECTRON_DEV,
});

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
const saveTransferBudget = new SaveTransferBudget({
  maxBytes: MAX_SAVE_PAYLOAD_BYTES,
  maxTransfers: MAX_ACTIVE_SAVE_TRANSFERS,
});
const steamSaveUploads = new SaveUploadTransferRegistry({
  budget: saveTransferBudget,
});
const steamSaveDownloads = new SaveDownloadTransferRegistry({
  budget: saveTransferBudget,
});
const dialogSaveUploads = new SaveUploadTransferRegistry({
  budget: saveTransferBudget,
});
const dialogSaveDownloads = new SaveDownloadTransferRegistry({
  budget: saveTransferBudget,
});
const dialogSaveUploadPaths = new Map();
const saveTransferCleanupTimer = setInterval(() => {
  steamSaveUploads.purgeExpired();
  steamSaveDownloads.purgeExpired();
  dialogSaveUploads.purgeExpired();
  dialogSaveDownloads.purgeExpired();
  const cutoff = Date.now() - SAVE_TRANSFER_TTL_MS;
  for (const [transferId, entry] of dialogSaveUploadPaths) {
    if (entry.updatedAt <= cutoff) dialogSaveUploadPaths.delete(transferId);
  }
}, Math.min(30_000, SAVE_TRANSFER_TTL_MS));
saveTransferCleanupTimer.unref?.();

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
  "object-src 'none'; frame-src 'none'; child-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self';";

const PROD_CSP =
  "default-src 'self' app: data: blob:; " +
  "script-src 'self' 'unsafe-inline' app:; " +
  "style-src 'self' 'unsafe-inline' app:; " +
  "img-src 'self' app: data: blob:; " +
  "font-src 'self' app: data:; " +
  "connect-src 'self' app: https://*.supabase.co wss://*.supabase.co https://*.ingest.sentry.io https://*.ingest.us.sentry.io; " +
  "media-src 'self' app: data: blob:; " +
  "object-src 'none'; frame-src 'none'; child-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self';";

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

function installRendererPermissionGuards() {
  // TalentScout does not need camera, microphone, geolocation, notifications,
  // screen capture, MIDI, USB, serial, HID, or clipboard-read permissions.
  // New web features therefore remain denied until deliberately reviewed.
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );

  app.on("web-contents-created", (_event, contents) => {
    contents.on("will-attach-webview", (event) => event.preventDefault());
  });
}

// ---------------------------------------------------------------------------
// Shell state for dialog defaults across relaunches
// ---------------------------------------------------------------------------

const DEFAULT_SAVE_FILENAME = "talentscout-save.json";
const MAX_FILE_BYTES = MAX_SAVE_PAYLOAD_BYTES;

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

function openExternalIfSafe(rawUrl) {
  const externalUrl = normalizeSafeExternalUrl(rawUrl);
  if (!externalUrl) return false;

  shell.openExternal(externalUrl).catch((err) => {
    console.warn("[Shell] Failed to open external URL:", err.message);
  });
  return true;
}

function handleTrustedIpc(channel, listener) {
  ipcMain.handle(channel, (event, ...args) => {
    const expectedWebContents = mainWindow ? mainWindow.webContents : null;
    assertTrustedIpcSender(event, expectedWebContents, { isDev });
    return listener(event, ...args);
  });
}

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
      sandbox: true,
      devTools: isDev,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalIfSafe(url);
    return { action: "deny" };
  });

  const guardNavigation = (event, url) => {
    if (isTrustedNavigationTarget(url, { isDev })) {
      return;
    }

    event.preventDefault();
    openExternalIfSafe(url);
  };

  mainWindow.webContents.on("will-navigate", guardNavigation);
  mainWindow.webContents.on("will-redirect", guardNavigation);

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

  const rendererOwnerId = mainWindow.webContents.id;
  const discardRendererTransfers = () => {
    steamSaveUploads.discardOwner(rendererOwnerId);
    steamSaveDownloads.discardOwner(rendererOwnerId);
    dialogSaveUploads.discardOwner(rendererOwnerId);
    dialogSaveDownloads.discardOwner(rendererOwnerId);
    for (const [transferId, entry] of dialogSaveUploadPaths) {
      if (entry.ownerId === rendererOwnerId) {
        dialogSaveUploadPaths.delete(transferId);
      }
    }
  };
  mainWindow.webContents.on("render-process-gone", discardRendererTransfers);
  mainWindow.on("closed", () => {
    discardRendererTransfers();
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// IPC - Steam API (real SDK when available, graceful fallbacks otherwise)
// ---------------------------------------------------------------------------

handleTrustedIpc("steam:isAvailable", () => {
  return steamAvailable && Boolean(steamClient);
});

handleTrustedIpc("steam:unlockAchievement", (_event, name) => {
  const achievementName = assertAchievementName(name);
  if (!steamClient) return;

  try {
    steamClient.achievement.activate(achievementName);
    console.log("[Steam] Achievement unlocked:", achievementName);
  } catch (err) {
    console.warn("[Steam] Failed to unlock achievement:", achievementName, err.message);
  }
});

handleTrustedIpc("steam:beginCloudSaveTransfer", (event, slot, totalBytes, chunkCount) => {
  const normalizedSlot = assertSteamSlot(slot);
  if (!steamClient) throw new Error("Steam Cloud is unavailable");
  return steamSaveUploads.begin({
    ownerId: event.sender.id,
    slot: normalizedSlot,
    totalBytes,
    chunkCount,
  });
});

handleTrustedIpc("steam:appendCloudSaveChunk", (event, transferId, index, chunk) =>
  steamSaveUploads.append({
    ownerId: event.sender.id,
    transferId,
    index,
    chunk,
  }),
);

handleTrustedIpc("steam:commitCloudSaveTransfer", (event, transferId) => {
  if (!steamClient) throw new Error("Steam Cloud is unavailable");
  const { slot, payload: binaryPayload } = steamSaveUploads.commit({
    ownerId: event.sender.id,
    transferId,
  });
  const payload = decodeUtf8SavePayload(binaryPayload);
  const filename = `talentscout_${slot}.json`;
  const written = steamClient.cloud.writeFile(filename, payload);
  if (!written) throw new Error(`Steam Cloud refused to write ${filename}`);
  console.log(
    "[Steam] Cloud save written: %s (%d bytes)",
    filename,
    binaryPayload.byteLength,
  );
});

handleTrustedIpc("steam:abortCloudSaveTransfer", (event, transferId) =>
  steamSaveUploads.abort(event.sender.id, transferId),
);

handleTrustedIpc("steam:beginCloudLoadTransfer", (event, slot) => {
  const normalizedSlot = assertSteamSlot(slot);
  if (!steamClient) return null;

  const filename = `talentscout_${normalizedSlot}.json`;
  const fileInfo = steamClient.cloud
    .listFiles()
    .find((candidate) => candidate.name === filename);
  if (!fileInfo) return null;
  const listedBytes = Number(fileInfo.size);
  if (
    !Number.isSafeInteger(listedBytes) ||
    listedBytes <= 0 ||
    listedBytes > MAX_SAVE_PAYLOAD_BYTES
  ) {
    throw new RangeError(`Steam Cloud file ${filename} has an invalid byte length`);
  }
  // Check the shared budget before Steam materializes the complete file in the
  // privileged process. Registry.begin reserves the actual bytes synchronously.
  saveTransferBudget.assertCanReserve(listedBytes);
  const data = steamClient.cloud.readFile(filename);
  let payload;
  if (typeof data === "string") payload = Buffer.from(data, "utf8");
  else if (Buffer.isBuffer(data)) payload = data;
  else payload = Buffer.from(data);
  const transfer = steamSaveDownloads.begin({
    ownerId: event.sender.id,
    slot: normalizedSlot,
    payload,
  });
  console.log("[Steam] Cloud save read: %s (%d bytes)", filename, payload.byteLength);
  return transfer;
});

handleTrustedIpc("steam:readCloudLoadChunk", (event, transferId, index) =>
  steamSaveDownloads.read({
    ownerId: event.sender.id,
    transferId,
    index,
  }),
);

handleTrustedIpc("steam:finishCloudLoadTransfer", (event, transferId) =>
  steamSaveDownloads.finish({
    ownerId: event.sender.id,
    transferId,
  }),
);

handleTrustedIpc("steam:deleteCloudSave", (_event, slot) => {
  const normalizedSlot = assertSteamSlot(slot);
  if (!steamClient) return;

  const filename = `talentscout_${normalizedSlot}.json`;
  if (!steamClient.cloud.fileExists(filename)) return;

  const deleted = steamClient.cloud.deleteFile(filename);
  if (!deleted) {
    throw new Error(`Steam Cloud refused to delete ${filename}`);
  }
  console.log("[Steam] Cloud save deleted:", filename);
});

handleTrustedIpc("steam:getPlayerName", () => {
  if (!steamClient) return "Player";

  try {
    return steamClient.localplayer.getName();
  } catch (err) {
    console.warn("[Steam] Failed to get player name:", err.message);
    return "Player";
  }
});

handleTrustedIpc("steam:setRichPresence", (_event, key, value) => {
  const normalizedKey = assertRichPresenceKey(key);
  const normalizedValue = assertString(value, "rich presence value", 256);
  if (!steamClient) return;

  try {
    steamClient.localplayer.setRichPresence(normalizedKey, normalizedValue);
  } catch (err) {
    console.warn("[Steam] Rich Presence failed:", normalizedKey, err.message);
  }
});

handleTrustedIpc("steam:resetAllAchievements", () => {
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

handleTrustedIpc("dialog:beginSaveFileTransfer", async (event, filename, totalBytes, chunkCount) => {
  if (!mainWindow) return null;

  const suggestedFilename = sanitizeSuggestedFilename(filename);
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: path.join(getDialogBaseDirectory(), suggestedFilename),
    filters: [
      { name: "JSON Save Files", extensions: ["json"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });

  if (result.canceled || !result.filePath) return null;

  for (const [activeId, entry] of dialogSaveUploadPaths) {
    if (entry.ownerId === event.sender.id) dialogSaveUploadPaths.delete(activeId);
  }
  const transferId = dialogSaveUploads.begin({
    ownerId: event.sender.id,
    slot: "dialog-export",
    totalBytes,
    chunkCount,
  });
  dialogSaveUploadPaths.set(transferId, {
    ownerId: event.sender.id,
    filePath: result.filePath,
    updatedAt: Date.now(),
  });
  return transferId;
});

handleTrustedIpc("dialog:appendSaveFileChunk", (event, transferId, index, chunk) => {
  const written = dialogSaveUploads.append({
    ownerId: event.sender.id,
    transferId,
    index,
    chunk,
  });
  const destination = dialogSaveUploadPaths.get(transferId);
  if (destination?.ownerId === event.sender.id) destination.updatedAt = Date.now();
  return written;
});

handleTrustedIpc("dialog:commitSaveFileTransfer", async (event, transferId) => {
  const destination = dialogSaveUploadPaths.get(transferId);
  if (!destination || destination.ownerId !== event.sender.id) {
    throw new Error("save export destination is unavailable");
  }

  try {
    const { payload: binaryPayload } = dialogSaveUploads.commit({
      ownerId: event.sender.id,
      transferId,
    });
    const payload = decodeUtf8SavePayload(binaryPayload);
    await atomicWriteUtf8File(destination.filePath, payload, MAX_FILE_BYTES);
    rememberDialogDirectory(destination.filePath);
    console.log("[IPC] dialog save export wrote:", destination.filePath);
    return true;
  } catch (err) {
    console.error("[IPC] dialog save export error:", err);
    return false;
  } finally {
    dialogSaveUploadPaths.delete(transferId);
  }
});

handleTrustedIpc("dialog:abortSaveFileTransfer", (event, transferId) => {
  const destination = dialogSaveUploadPaths.get(transferId);
  if (destination?.ownerId === event.sender.id) {
    dialogSaveUploadPaths.delete(transferId);
  }
  return dialogSaveUploads.abort(event.sender.id, transferId);
});

handleTrustedIpc("dialog:beginOpenFileTransfer", async (event) => {
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
    const payload = await readBoundedUtf8Buffer(selectedPath, MAX_FILE_BYTES);
    const transfer = dialogSaveDownloads.begin({
      ownerId: event.sender.id,
      slot: "dialog-import",
      payload,
    });
    rememberDialogDirectory(selectedPath);
    console.log("[IPC] dialog save import opened:", selectedPath);
    return transfer;
  } catch (err) {
    console.error("[IPC] dialog save import error:", err);
    return null;
  }
});

handleTrustedIpc("dialog:readOpenFileChunk", (event, transferId, index) =>
  dialogSaveDownloads.read({
    ownerId: event.sender.id,
    transferId,
    index,
  }),
);

handleTrustedIpc("dialog:finishOpenFileTransfer", (event, transferId) =>
  dialogSaveDownloads.finish({
    ownerId: event.sender.id,
    transferId,
  }),
);

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
  installRendererPermissionGuards();
  loadShellState();

  if (!isDev) {
    protocol.handle("app", async (request) => {
      const url = new URL(request.url);
      const filePath = resolveStaticFile(url.pathname);

      if (!filePath) {
        return new Response("Not Found", {
          status: 404,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }

      try {
        return await createStaticFileResponse({
          filePath,
          contentType: getMimeType(filePath),
          method: request.method,
          rangeHeader: request.headers.get("range"),
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

app.once("before-quit", () => {
  clearInterval(saveTransferCleanupTimer);
});
