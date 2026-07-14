# Desktop security review

Review date: 2026-07-13

Scope: `electron/main.js`, `electron/preload.js`, the custom `app://` protocol,
native file dialogs, Steam IPC, and renderer navigation controls.

## Result

The desktop privilege boundary is hardened in source and covered by focused
unit tests. Every shipped IPC channel now rejects calls unless they originate
from the active TalentScout window, its top-level frame, and the expected game
origin. Child frames, stale windows, navigated renderers, and the local failure
page cannot invoke Steam or native file APIs.

External windows remain denied. HTTPS and `mailto:` links are normalized before
being delegated to the operating system; executable, local-file, credentialed,
and malformed URLs are rejected. Both direct navigations and redirects are
guarded, including redirects that leave the trusted game origin.

A packaged executable can no longer be switched into localhost/development
trust mode with a `--dev` argument or `ELECTRON_DEV` environment variable. That
mode is now accepted only when Electron itself reports an unpackaged app.

Existing renderer protections remain enabled: context isolation and Chromium
renderer sandboxing are on, Node integration is off, production DevTools are
off, the preload API is frozen and narrow, Steam identifiers are allowlisted,
save payloads are size-bounded, and static protocol paths are constrained to
the packaged export root.

All web permissions are denied by default and webview attachment is blocked.
The game currently requires none of the camera, microphone, location, display,
notification, device, or clipboard-read capabilities governed by those APIs.
The CSP also denies child frames explicitly.

Native save exports now use a same-directory temporary file, durable flush, and
atomic rename. A failed or interrupted replacement leaves the previous export
intact. Imports are opened once, checked as regular files, byte-bounded before
and after reading, and decoded as strict UTF-8 so corrupt bytes cannot be
silently substituted before save validation. Both import and export cross the
preload boundary in ordered 1 MiB chunks under the same 96 MiB shared transfer
budget as Steam Cloud, avoiding single 40-96 MiB structured-clone messages in
long careers.

The packaged `app://` protocol now streams static files instead of reading
them synchronously into the main process. It supports one bounded byte range,
HEAD requests, and defensive MIME headers; malformed/multipart ranges receive
416. This makes the renderer's metadata-only HTML5 audio strategy real in the
packaged app rather than loading each multi-megabyte track in full.

Packaging now disables Electron's RunAsNode, Node options, CLI inspector, and
privileged `file://` fuses; requires the application ASAR; enables supported
ASAR integrity validation and cookie encryption; and removes the macOS DYLD
environment entitlement that is intended only for debugging. These settings
still require signed/notarized startup and Steam-native-module verification on
real packaged macOS, Windows, and Linux builds.

## Intentionally deferred

- The production CSP was not tightened beyond the current static-export policy
  without a packaged runtime check proving that Next's emitted inline bootstrap
  code still starts correctly.
- Code signing, notarization, platform sandboxing, updater behavior, and native
  Steam redistributables require the packaged-runtime release matrix; source
  tests are not evidence for those platform outcomes.

## Verification

- `npx vitest run tests/electron/desktopSecurity.test.ts`
- `node --check electron/main.js`
- `node --check electron/preload.js`
- `node --check electron/security.js`
- `node --check electron/file-io.js`
- `npx vitest run tests/electron/fileIo.test.ts`
- `node --check electron/static-response.js`
- `npx vitest run tests/electron/staticResponse.test.ts`

These checks cover the source trust boundary. They do not replace the packaged
Windows/macOS/Linux security and recovery journeys.
