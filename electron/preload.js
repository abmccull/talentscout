"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const MAX_FILE_BYTES = 10 * 1024 * 1024;
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

function assertFilename(filename) {
  const normalized = assertString(filename, "filename", MAX_FILENAME_LENGTH).trim();
  return normalized || "talentscout-save.json";
}

function invoke(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args);
}

const electronAPI = Object.freeze({
  steam: Object.freeze({
    isAvailable: () => invoke("steam:isAvailable"),
    unlockAchievement: (name) =>
      invoke("steam:unlockAchievement", assertAchievementName(name)),
    setCloudSave: (slot, data) =>
      invoke("steam:setCloudSave", assertSteamSlot(slot), assertFilePayload(data)),
    getCloudSave: (slot) =>
      invoke("steam:getCloudSave", assertSteamSlot(slot)),
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
    saveFile: (data, filename) =>
      invoke("dialog:saveFile", assertFilePayload(data), assertFilename(filename)),
    openFile: () => invoke("dialog:openFile"),
  }),
});

contextBridge.exposeInMainWorld("electronAPI", electronAPI);
