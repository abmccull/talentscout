import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  assertTrustedIpcSender,
  determineDevelopmentMode,
  isTrustedIpcSender,
  isTrustedNavigationTarget,
  normalizeSafeExternalUrl,
} = require("../../electron/security.js") as {
  assertTrustedIpcSender: (
    event: unknown,
    expectedWebContents: unknown,
    options?: { isDev?: boolean },
  ) => void;
  determineDevelopmentMode: (input: {
    isPackaged: boolean;
    argv: string[];
    electronDev?: string;
  }) => boolean;
  isTrustedIpcSender: (
    event: unknown,
    expectedWebContents: unknown,
    options?: { isDev?: boolean },
  ) => boolean;
  isTrustedNavigationTarget: (
    url: string,
    options?: { isDev?: boolean },
  ) => boolean;
  normalizeSafeExternalUrl: (url: string) => string | null;
};

describe("Electron desktop trust boundary", () => {
  it("cannot be switched into development trust mode after packaging", () => {
    expect(
      determineDevelopmentMode({
        isPackaged: true,
        argv: ["TalentScout.exe", "--dev"],
        electronDev: "1",
      }),
    ).toBe(false);
    expect(
      determineDevelopmentMode({
        isPackaged: false,
        argv: ["electron", "electron/main.js", "--dev"],
      }),
    ).toBe(true);
    expect(
      determineDevelopmentMode({
        isPackaged: false,
        argv: ["electron", "electron/main.js"],
        electronDev: "1",
      }),
    ).toBe(true);
  });

  it("accepts only the configured game origin", () => {
    expect(isTrustedNavigationTarget("app://host/play")).toBe(true);
    expect(isTrustedNavigationTarget("app://host/play?slot=1#report")).toBe(true);
    expect(
      isTrustedNavigationTarget("http://localhost:3000/play", { isDev: true }),
    ).toBe(true);

    expect(isTrustedNavigationTarget("app://host.evil.example/play")).toBe(false);
    expect(isTrustedNavigationTarget("app://attacker@host/play")).toBe(false);
    expect(isTrustedNavigationTarget("https://host/play")).toBe(false);
    expect(
      isTrustedNavigationTarget("http://localhost:3001/play", { isDev: true }),
    ).toBe(false);
    expect(
      isTrustedNavigationTarget("http://localhost.evil:3000/play", { isDev: true }),
    ).toBe(false);
  });

  it("normalizes only HTTPS and email links for the operating system", () => {
    expect(normalizeSafeExternalUrl("https://example.com/a b")).toBe(
      "https://example.com/a%20b",
    );
    expect(normalizeSafeExternalUrl("mailto:support@example.com")).toBe(
      "mailto:support@example.com",
    );

    expect(normalizeSafeExternalUrl("https://user:pass@example.com")).toBeNull();
    expect(normalizeSafeExternalUrl("file:///etc/passwd")).toBeNull();
    expect(normalizeSafeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeSafeExternalUrl("not a URL")).toBeNull();
  });

  it("requires the active window's trusted top-level frame for IPC", () => {
    const mainFrame = { url: "app://host/play" };
    const expectedWebContents = { mainFrame };
    const trustedEvent = { sender: expectedWebContents, senderFrame: mainFrame };

    expect(isTrustedIpcSender(trustedEvent, expectedWebContents)).toBe(true);
    expect(() => assertTrustedIpcSender(trustedEvent, expectedWebContents)).not.toThrow();

    expect(
      isTrustedIpcSender(
        { sender: expectedWebContents, senderFrame: { url: "app://host/play" } },
        expectedWebContents,
      ),
    ).toBe(false);
    expect(
      isTrustedIpcSender(
        { sender: { mainFrame }, senderFrame: mainFrame },
        expectedWebContents,
      ),
    ).toBe(false);
    expect(
      isTrustedIpcSender(
        { sender: expectedWebContents, senderFrame: null },
        expectedWebContents,
      ),
    ).toBe(false);

    mainFrame.url = "data:text/html,failed";
    expect(isTrustedIpcSender(trustedEvent, expectedWebContents)).toBe(false);
    expect(() => assertTrustedIpcSender(trustedEvent, expectedWebContents)).toThrow(
      "Blocked IPC request from an untrusted renderer",
    );
  });

  it("routes every shipped IPC channel through the trusted wrapper", () => {
    const mainSource = readFileSync(resolve(process.cwd(), "electron/main.js"), "utf8");
    const channels = Array.from(
      mainSource.matchAll(/handleTrustedIpc\("([^"]+)"/g),
      (match) => match[1],
    ).sort();

    expect(channels).toEqual([
      "dialog:abortSaveFileTransfer",
      "dialog:appendSaveFileChunk",
      "dialog:beginOpenFileTransfer",
      "dialog:beginSaveFileTransfer",
      "dialog:commitSaveFileTransfer",
      "dialog:finishOpenFileTransfer",
      "dialog:readOpenFileChunk",
      "steam:abortCloudSaveTransfer",
      "steam:appendCloudSaveChunk",
      "steam:beginCloudLoadTransfer",
      "steam:beginCloudSaveTransfer",
      "steam:commitCloudSaveTransfer",
      "steam:deleteCloudSave",
      "steam:finishCloudLoadTransfer",
      "steam:getPlayerName",
      "steam:isAvailable",
      "steam:readCloudLoadChunk",
      "steam:resetAllAchievements",
      "steam:setRichPresence",
      "steam:unlockAchievement",
    ]);
    expect(mainSource).not.toMatch(/ipcMain\.handle\("(?:dialog|steam):/);
    expect(mainSource).not.toContain('handleTrustedIpc("steam:setCloudSave"');
    expect(mainSource).not.toContain('handleTrustedIpc("steam:getCloudSave"');
    expect(mainSource).toMatch(/sandbox:\s*true/);
    expect(mainSource).not.toMatch(/sandbox:\s*false/);
    expect(mainSource).toContain("setPermissionCheckHandler(() => false)");
    expect(mainSource).toContain("setPermissionRequestHandler(");
    expect(mainSource).toContain('contents.on("will-attach-webview"');
    expect(mainSource).toContain("frame-src 'none'");
    expect(mainSource).toContain("child-src 'none'");
    expect(mainSource).toContain("await atomicWriteUtf8File(");
    expect(mainSource).toContain("await readBoundedUtf8Buffer(");
    expect(mainSource).toContain("await createStaticFileResponse(");
    expect(mainSource).not.toContain("const data = fs.readFileSync(filePath)");
    expect(mainSource).toContain(
      'mainWindow.webContents.on("render-process-gone", discardRendererTransfers)',
    );
  });

  it("locks production packaging and omits debugging-only macOS entitlements", () => {
    const builderSource = readFileSync(
      resolve(process.cwd(), "electron-builder.yml"),
      "utf8",
    );
    const entitlements = readFileSync(
      resolve(process.cwd(), "build/entitlements.mac.plist"),
      "utf8",
    );

    expect(builderSource).toMatch(/runAsNode:\s*false/);
    expect(builderSource).toMatch(/enableNodeOptionsEnvironmentVariable:\s*false/);
    expect(builderSource).toMatch(/enableNodeCliInspectArguments:\s*false/);
    expect(builderSource).toMatch(/enableEmbeddedAsarIntegrityValidation:\s*true/);
    expect(builderSource).toMatch(/onlyLoadAppFromAsar:\s*true/);
    expect(builderSource).toMatch(/grantFileProtocolExtraPrivileges:\s*false/);
    expect(builderSource).toContain('- "!node_modules/**/*"');
    expect(builderSource).toContain('- "!**/node_modules/**/*"');
    expect(builderSource).toContain("- node_modules/steamworks.js/**/*");
    expect(entitlements).not.toContain(
      "com.apple.security.cs.allow-dyld-environment-variables",
    );
  });
});
