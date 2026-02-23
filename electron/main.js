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

  // ----- CSP via response headers (allows file:// protocol) -----
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

  // ----- Load URL -----
  if (isDev) {
    mainWindow.loadURL("http://localhost:3000/play");
    mainWindow.webContents.openDevTools();
  } else {
    const indexPath = path.join(__dirname, "..", "out", "play.html");
    mainWindow.loadURL("file://" + indexPath);
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
// Steam app ID (dev only — loads from project root for future Steamworks)
// ---------------------------------------------------------------------------

function tryLoadSteamAppId() {
  if (!isDev) return;
  const candidates = [
    path.join(__dirname, "..", "steam_appid.txt"),
    path.join(process.cwd(), "steam_appid.txt"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const appId = fs.readFileSync(candidate, "utf8").trim();
      console.log("[Steam] Found steam_appid.txt — App ID:", appId);
      return;
    }
  }
  console.log("[Steam] No steam_appid.txt found (expected in dev).");
}

// ---------------------------------------------------------------------------
// IPC — Steam API stubs
// ---------------------------------------------------------------------------

ipcMain.handle("steam:isAvailable", () => {
  console.log("[IPC] steam:isAvailable");
  return false;
});

ipcMain.handle("steam:unlockAchievement", (_event, name) => {
  console.log("[IPC] steam:unlockAchievement:", name);
});

ipcMain.handle("steam:setCloudSave", (_event, slot, data) => {
  console.log("[IPC] steam:setCloudSave slot=%s length=%d", slot, String(data).length);
});

ipcMain.handle("steam:getCloudSave", (_event, slot) => {
  console.log("[IPC] steam:getCloudSave slot=%s", slot);
  return null;
});

ipcMain.handle("steam:getPlayerName", () => {
  console.log("[IPC] steam:getPlayerName");
  return "Player";
});

ipcMain.handle("steam:setRichPresence", (_event, key, value) => {
  console.log("[IPC] steam:setRichPresence %s=%s", key, value);
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
  tryLoadSteamAppId();
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
