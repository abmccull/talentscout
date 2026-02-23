"use strict";

const { app, BrowserWindow, ipcMain, dialog, session } = require("electron");
const path = require("path");
const fs = require("fs");

// ---------------------------------------------------------------------------
// Dev mode detection
// ---------------------------------------------------------------------------

const isDev =
  process.argv.includes("--dev") || process.env.ELECTRON_DEV === "1";

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
  // In production (file://), Electron's webRequest doesn't intercept file:// loads,
  // so we disable the default CSP entirely — the app is sandboxed by Electron already.
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
    const outDir = path.join(__dirname, "..", "out");
    const indexPath = path.join(outDir, "play.html");

    // Intercept file:// requests so that absolute paths like /_next/...
    // resolve relative to the out/ directory instead of the filesystem root.
    const { protocol } = require("electron");
    protocol.interceptFileProtocol("file", (request, callback) => {
      let url = request.url.replace("file://", "");
      url = decodeURIComponent(url);

      // If the path doesn't exist on disk and starts with /_next or /images etc.,
      // resolve it relative to the out/ directory.
      if (!fs.existsSync(url) && (url.startsWith("/_next") || url.startsWith("/images") || url.startsWith("/audio"))) {
        callback(path.join(outDir, url));
      } else {
        callback(url);
      }
    });

    mainWindow.loadFile(indexPath);
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
