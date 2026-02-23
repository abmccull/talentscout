"use strict";

const { notarize } = require("@electron/notarize");

/**
 * electron-builder afterSign hook.
 *
 * Submits the signed macOS .app bundle to Apple's notarization service.
 * Requires the following environment variables (set in CI secrets, never
 * committed to the repository):
 *
 *   APPLE_ID            — Apple ID email used to sign in to App Store Connect
 *   APPLE_ID_PASSWORD   — App-specific password generated at appleid.apple.com
 *   APPLE_TEAM_ID       — 10-character Apple Developer Team ID
 *
 * The script exits silently on non-macOS platforms and when the credentials
 * are absent, allowing local / Windows / Linux builds to proceed unchanged.
 */
exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;

  if (electronPlatformName !== "darwin") {
    return;
  }

  // Skip silently for dev builds that have no Apple credentials configured.
  if (!process.env.APPLE_ID || !process.env.APPLE_TEAM_ID) {
    console.log("[Notarize] Skipping — APPLE_ID or APPLE_TEAM_ID not set");
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  console.log(`[Notarize] Notarizing ${appName} at ${appPath} ...`);

  await notarize({
    appBundleId: "com.talentscout.game",
    appPath,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_ID_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  });

  console.log("[Notarize] Done");
};
