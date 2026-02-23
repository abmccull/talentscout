"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  steam: {
    /** Returns true if the Steam client is available and initialized. */
    isAvailable: () => ipcRenderer.invoke("steam:isAvailable"),

    /** Unlock a Steam achievement by its API name. */
    unlockAchievement: (name) =>
      ipcRenderer.invoke("steam:unlockAchievement", name),

    /** Save data to a Steam Cloud save slot. */
    setCloudSave: (slot, data) =>
      ipcRenderer.invoke("steam:setCloudSave", slot, data),

    /** Load data from a Steam Cloud save slot. Returns null if no data. */
    getCloudSave: (slot) => ipcRenderer.invoke("steam:getCloudSave", slot),

    /** Returns the Steam player's display name. */
    getPlayerName: () => ipcRenderer.invoke("steam:getPlayerName"),

    /** Set Steam rich presence key/value pair. */
    setRichPresence: (key, value) =>
      ipcRenderer.invoke("steam:setRichPresence", key, value),
  },

  dialog: {
    /** Show native save dialog and write data to chosen path. Returns true on success. */
    saveFile: (data, filename) =>
      ipcRenderer.invoke("dialog:saveFile", data, filename),

    /** Show native open dialog and return file contents as string, or null if canceled. */
    openFile: () => ipcRenderer.invoke("dialog:openFile"),
  },
});
