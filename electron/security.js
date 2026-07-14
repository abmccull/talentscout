"use strict";

function determineDevelopmentMode({ isPackaged, argv, electronDev }) {
  if (isPackaged) return false;
  return argv.includes("--dev") || electronDev === "1";
}

/**
 * Return whether a URL is allowed to host TalentScout's privileged preload API.
 *
 * Keep this check origin-based. Paths legitimately change as the static export
 * routes between screens, while credentials, alternate ports and lookalike hosts
 * must never inherit renderer privileges.
 */
function isTrustedNavigationTarget(rawUrl, options = {}) {
  if (typeof rawUrl !== "string" || rawUrl.length === 0) return false;

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (parsed.username || parsed.password) return false;

  if (options.isDev) {
    return (
      parsed.protocol === "http:" &&
      parsed.hostname === "localhost" &&
      parsed.port === "3000"
    );
  }

  return (
    parsed.protocol === "app:" &&
    parsed.hostname === "host" &&
    parsed.port === ""
  );
}

/**
 * Normalize a URL before handing it to the operating system. TalentScout only
 * delegates HTTPS pages and email links; all executable and local-file schemes
 * remain inside the denied path.
 */
function normalizeSafeExternalUrl(rawUrl) {
  if (typeof rawUrl !== "string" || rawUrl.length === 0) return null;

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  if (parsed.username || parsed.password) return null;
  if (parsed.protocol !== "https:" && parsed.protocol !== "mailto:") return null;
  return parsed.href;
}

/**
 * IPC is privileged even with contextIsolation enabled. Require the currently
 * active game window, its top-level frame, and its trusted origin. This rejects
 * stale windows, future child frames, failure pages and navigated renderers.
 */
function isTrustedIpcSender(event, expectedWebContents, options = {}) {
  if (!event || !expectedWebContents) return false;
  if (event.sender !== expectedWebContents) return false;

  const senderFrame = event.senderFrame;
  if (!senderFrame || senderFrame !== expectedWebContents.mainFrame) return false;

  return isTrustedNavigationTarget(senderFrame.url, options);
}

function assertTrustedIpcSender(event, expectedWebContents, options = {}) {
  if (!isTrustedIpcSender(event, expectedWebContents, options)) {
    throw new Error("Blocked IPC request from an untrusted renderer");
  }
}

module.exports = {
  assertTrustedIpcSender,
  determineDevelopmentMode,
  isTrustedIpcSender,
  isTrustedNavigationTarget,
  normalizeSafeExternalUrl,
};
