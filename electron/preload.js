"use strict";

const { contextBridge, ipcRenderer } = require("electron");

// Keep these values synchronized with electron/save-transfer.js. Sandboxed
// preloads cannot import arbitrary local CommonJS modules, so the source test
// guards this explicit trust-boundary duplication.
const MAX_FILE_BYTES = 96 * 1024 * 1024;
const SAVE_TRANSFER_CHUNK_BYTES = 1024 * 1024;
const MAX_FILENAME_LENGTH = 255;
const MAX_STEAM_STRING_LENGTH = 256;
const STEAM_SLOT_PATTERN = /^[0-5]$/;
const STEAM_ACHIEVEMENTS = new Set([
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
]);
const RICH_PRESENCE_KEYS = new Set([
  "steam_display",
  "country",
  "fixture",
  "season",
  "week",
  "steam_player_group",
]);

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
  if (!STEAM_SLOT_PATTERN.test(normalized)) {
    throw new TypeError("slot must be a digit between 0 and 5");
  }
  return normalized;
}

function assertAchievementName(name) {
  const normalized = assertString(name, "achievement name", 64).trim();
  if (!STEAM_ACHIEVEMENTS.has(normalized)) {
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

function expectedSaveChunkCount(totalBytes) {
  return Math.ceil(totalBytes / SAVE_TRANSFER_CHUNK_BYTES);
}

function assertTransferId(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 128) {
    throw new TypeError("Save transfer returned an invalid identifier");
  }
  return value;
}

function assertTransferMetadata(value) {
  if (!value || typeof value !== "object") {
    throw new TypeError("Save transfer returned invalid metadata");
  }
  const { transferId, totalBytes, chunkCount } = value;
  assertTransferId(transferId);
  if (
    !Number.isSafeInteger(totalBytes) ||
    totalBytes <= 0 ||
    totalBytes > MAX_FILE_BYTES
  ) {
    throw new RangeError("Save transfer returned an invalid byte length");
  }
  if (chunkCount !== expectedSaveChunkCount(totalBytes)) {
    throw new RangeError("Save transfer returned an invalid chunk count");
  }
  return { transferId, totalBytes, chunkCount };
}

function normalizeTransferChunk(value) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof Uint8Array) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new TypeError("Save transfer returned a non-binary chunk");
}

function assertFilename(filename) {
  const normalized = assertString(filename, "filename", MAX_FILENAME_LENGTH).trim();
  return normalized || "talentscout-save.json";
}

function invoke(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args);
}

async function uploadSaveTransfer({
  data,
  beginChannel,
  beginArgs,
  appendChannel,
  commitChannel,
  abortChannel,
  allowCancel = false,
}) {
  const text = assertFilePayload(data);
  const payload = Buffer.from(text, "utf8");
  const chunkCount = expectedSaveChunkCount(payload.byteLength);
  const rawTransferId = await invoke(
    beginChannel,
    ...beginArgs,
    payload.byteLength,
    chunkCount,
  );
  if (rawTransferId === null && allowCancel) return false;
  const transferId = assertTransferId(rawTransferId);

  try {
    for (let index = 0; index < chunkCount; index += 1) {
      const start = index * SAVE_TRANSFER_CHUNK_BYTES;
      const end = Math.min(start + SAVE_TRANSFER_CHUNK_BYTES, payload.byteLength);
      await invoke(
        appendChannel,
        transferId,
        index,
        payload.subarray(start, end),
      );
    }
    return await invoke(commitChannel, transferId);
  } catch (error) {
    await invoke(abortChannel, transferId).catch(() => {});
    throw error;
  }
}

async function downloadSaveTransfer(rawMetadata, readChannel, finishChannel) {
  if (rawMetadata === null) return null;

  let transferId = rawMetadata && typeof rawMetadata === "object"
    && typeof rawMetadata.transferId === "string"
    ? rawMetadata.transferId
    : null;
  let finished = false;
  try {
    const metadata = assertTransferMetadata(rawMetadata);
    transferId = metadata.transferId;
    const chunks = [];
    let receivedBytes = 0;

    for (let index = 0; index < metadata.chunkCount; index += 1) {
      const chunk = normalizeTransferChunk(
        await invoke(readChannel, transferId, index),
      );
      const isLast = index === metadata.chunkCount - 1;
      const expectedBytes = isLast
        ? metadata.totalBytes - SAVE_TRANSFER_CHUNK_BYTES * (metadata.chunkCount - 1)
        : SAVE_TRANSFER_CHUNK_BYTES;
      if (chunk.byteLength !== expectedBytes) {
        throw new RangeError(
          `Steam save chunk ${index} contained ${chunk.byteLength} bytes instead of ${expectedBytes}`,
        );
      }
      chunks.push(chunk);
      receivedBytes += chunk.byteLength;
    }

    if (receivedBytes !== metadata.totalBytes) {
      throw new RangeError("Save transfer ended at the wrong byte length");
    }
    const payload = Buffer.concat(chunks, metadata.totalBytes);
    const decoded = payload.toString("utf8");
    if (!Buffer.from(decoded, "utf8").equals(payload)) {
      throw new TypeError("Save payload is not valid UTF-8");
    }

    await invoke(finishChannel, transferId);
    finished = true;
    return decoded;
  } finally {
    if (transferId && !finished) {
      await invoke(finishChannel, transferId).catch(() => {});
    }
  }
}

async function setSteamCloudSave(slot, data) {
  await uploadSaveTransfer({
    data,
    beginChannel: "steam:beginCloudSaveTransfer",
    beginArgs: [assertSteamSlot(slot)],
    appendChannel: "steam:appendCloudSaveChunk",
    commitChannel: "steam:commitCloudSaveTransfer",
    abortChannel: "steam:abortCloudSaveTransfer",
  });
}

async function getSteamCloudSave(slot) {
  return downloadSaveTransfer(
    await invoke("steam:beginCloudLoadTransfer", assertSteamSlot(slot)),
    "steam:readCloudLoadChunk",
    "steam:finishCloudLoadTransfer",
  );
}

async function saveFile(data, filename) {
  return uploadSaveTransfer({
    data,
    beginChannel: "dialog:beginSaveFileTransfer",
    beginArgs: [assertFilename(filename)],
    appendChannel: "dialog:appendSaveFileChunk",
    commitChannel: "dialog:commitSaveFileTransfer",
    abortChannel: "dialog:abortSaveFileTransfer",
    allowCancel: true,
  });
}

async function openFile() {
  return downloadSaveTransfer(
    await invoke("dialog:beginOpenFileTransfer"),
    "dialog:readOpenFileChunk",
    "dialog:finishOpenFileTransfer",
  );
}

const electronAPI = Object.freeze({
  steam: Object.freeze({
    isAvailable: () => invoke("steam:isAvailable"),
    unlockAchievement: (name) =>
      invoke("steam:unlockAchievement", assertAchievementName(name)),
    setCloudSave: (slot, data) => setSteamCloudSave(slot, data),
    getCloudSave: (slot) => getSteamCloudSave(slot),
    deleteCloudSave: (slot) =>
      invoke("steam:deleteCloudSave", assertSteamSlot(slot)),
    getPlayerName: () => invoke("steam:getPlayerName"),
    setRichPresence: (key, value) =>
      invoke(
        "steam:setRichPresence",
        assertRichPresenceKey(key),
        assertString(value, "rich presence value", MAX_STEAM_STRING_LENGTH),
      ),
    resetAllAchievements: () => invoke("steam:resetAllAchievements"),
  }),

  dialog: Object.freeze({
    saveFile,
    openFile,
  }),
});

contextBridge.exposeInMainWorld("electronAPI", electronAPI);
