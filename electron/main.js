"use strict";

const { app, BrowserWindow, ipcMain, dialog, session, protocol, net } = require("electron");
const path = require("path");
const fs = require("fs");

// ---------------------------------------------------------------------------
// Dev mode detection
// ---------------------------------------------------------------------------

const isDev =
  process.argv.includes("--dev") || process.env.ELECTRON_DEV === "1";

// ---------------------------------------------------------------------------
// Custom protocol registration (must happen before app.ready)
// ---------------------------------------------------------------------------
// Register a privileged "app" scheme so the static export can be served from
// inside the asar archive with correct MIME types. The deprecated
// protocol.interceptFileProtocol does not reliably serve files from asar in
// Electron 25+.

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
// Steamworks SDK initialization
// ---------------------------------------------------------------------------

const APP_ID = 4455570;

let steamClient = null;
let steamAvailable = false;

function initSteam() {
  try {
    const steamworks = require("steamworks.js");
    steamClient = steamworks.init(APP_ID);
    steamAvailable = true;
    console.log("[Steam] Initialized successfully — App ID:", APP_ID);
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
    },
  });

  // ----- CSP via response headers -----
  // In dev mode, set CSP headers on HTTP responses.
  if (isDev) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [
            "default-src 'self' file: data: blob:; " +
              "script-src 'self' 'unsafe-inline' file:; " +
              "style-src 'self' 'unsafe-inline' file:; " +
              "img-src 'self' file: data: blob:; " +
              "font-src 'self' file: data:; " +
              "connect-src 'self' file: https: wss:;",
          ],
        },
      });
    });
  }

  // ----- Load URL -----
  if (isDev) {
    mainWindow.loadURL("http://localhost:3000/play");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL("app://host/play.html");
  }

  // ----- F11 fullscreen toggle -----
  mainWindow.webContents.on("before-input-event", (_event, input) => {
    if (input.type === "keyDown" && input.key === "F11") {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// IPC — Steam API (real SDK when available, graceful fallbacks otherwise)
// ---------------------------------------------------------------------------

ipcMain.handle("steam:isAvailable", () => {
  return steamAvailable;
});

ipcMain.handle("steam:unlockAchievement", (_event, name) => {
  if (!steamClient) return;
  try {
    steamClient.achievement.activate(name);
    console.log("[Steam] Achievement unlocked:", name);
  } catch (err) {
    console.warn("[Steam] Failed to unlock achievement:", name, err.message);
  }
});

ipcMain.handle("steam:setCloudSave", (_event, slot, data) => {
  if (!steamClient) return;
  try {
    const filename = `talentscout_${slot}.json`;
    steamClient.cloud.writeFile(filename, data);
    console.log("[Steam] Cloud save written: %s (%d bytes)", filename, data.length);
  } catch (err) {
    console.warn("[Steam] Cloud save write failed:", err.message);
  }
});

ipcMain.handle("steam:getCloudSave", (_event, slot) => {
  if (!steamClient) return null;
  try {
    const filename = `talentscout_${slot}.json`;
    if (!steamClient.cloud.isFileExists(filename)) {
      return null;
    }
    const data = steamClient.cloud.readFile(filename);
    console.log("[Steam] Cloud save read: %s (%d bytes)", filename, data.length);
    return data;
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
  if (!steamClient) return;
  try {
    steamClient.localplayer.setRichPresence(key, value);
  } catch (err) {
    console.warn("[Steam] Rich Presence failed:", key, err.message);
  }
});

ipcMain.handle("steam:resetAllAchievements", () => {
  if (!steamClient) return;
  if (!isDev) {
    console.warn("[Steam] resetAllAchievements blocked — not in dev mode");
    return;
  }
  try {
    // steamworks.js exposes clearAchievement per-achievement;
    // iterate all known achievements
    const achievements = [
      "FIRST_OBSERVATION", "FIRST_REPORT", "FIRST_WEEK", "FIRST_MATCH",
      "FIRST_CONTACT", "FIRST_PERK", "FIRST_EQUIPMENT", "FIRST_YOUTH",
      "REACH_TIER_2", "REACH_TIER_3", "REACH_TIER_4", "REACH_TIER_5",
      "SEASON_1", "SEASON_3", "SEASON_5", "SEASON_10",
      "REPORTS_10", "REPORTS_25", "REPORTS_50", "REPORTS_100",
      "TABLE_POUND", "WONDERKID_FOUND", "ALUMNI_5", "ALUMNI_INTERNATIONAL",
      "HIGH_ACCURACY", "GENERATIONAL_TALENT",
      "MAX_SPEC", "ALL_PERKS_TREE", "MASTERY_PERK", "DUAL_MASTERY",
      "EQUIPMENT_MAXED", "SECONDARY_SPEC", "ALL_ACTIVITIES", "REP_50",
      "COUNTRIES_3", "COUNTRIES_6", "COUNTRIES_10", "COUNTRIES_15",
      "HOME_MASTERY", "ALL_CONTINENTS",
      "BLIND_FAITH", "TRIPLE_STORYLINE", "SURVIVED_FIRING",
      "WATCHLIST_10", "MARATHON",
    ];
    for (const name of achievements) {
      steamClient.achievement.clear(name);
    }
    console.log("[Steam] All %d achievements reset", achievements.length);
  } catch (err) {
    console.warn("[Steam] resetAllAchievements failed:", err.message);
  }
});

// ---------------------------------------------------------------------------
// IPC — Native file dialogs
// ---------------------------------------------------------------------------

ipcMain.handle("dialog:saveFile", async (_event, data, filename) => {
  if (!mainWindow) return false;
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: filename || "save.json",
    filters: [
      { name: "JSON Save Files", extensions: ["json"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (result.canceled || !result.filePath) return false;
  try {
    fs.writeFileSync(result.filePath, data, "utf8");
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
    properties: ["openFile"],
    filters: [
      { name: "JSON Save Files", extensions: ["json"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  try {
    const content = fs.readFileSync(result.filePaths[0], "utf8");
    console.log("[IPC] dialog:openFile read:", result.filePaths[0]);
    return content;
  } catch (err) {
    console.error("[IPC] dialog:openFile error:", err);
    return null;
  }
});

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  // Register the app:// protocol handler once, before any windows are created.
  // This serves the Next.js static export from the out/ directory (asar-aware).
  if (!isDev) {
    const outDir = path.join(__dirname, "..", "out");
    protocol.handle("app", (request) => {
      const url = new URL(request.url);
      let pathname = decodeURIComponent(url.pathname);

      if (pathname === "/" || pathname === "") {
        pathname = "play.html";
      } else if (pathname.startsWith("/")) {
        pathname = pathname.substring(1);
      }

      const filePath = path.join(outDir, pathname);
      const contentType = getMimeType(filePath);

      try {
        const data = fs.readFileSync(filePath);
        return new Response(data, {
          status: 200,
          headers: { "Content-Type": contentType },
        });
      } catch {
        return new Response("Not Found", {
          status: 404,
          headers: { "Content-Type": "text/plain" },
        });
      }
    });
  }

  initSteam();
  createWindow();

  app.on("activate", () => {
    // macOS: re-create window when dock icon is clicked and no windows open
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  // On macOS, apps typically stay in the dock until the user explicitly quits.
  // On all other platforms, quit when all windows are closed.
  if (process.platform !== "darwin") {
    app.quit();
  }
});
