# TalentScout security review

Review date: July 13, 2026

Scope: shipped React/Next static client, Electron privilege boundary, imported data and saves, optional Supabase services, dependency graph, navigation, storage, and release configuration.

## Result

No confirmed Critical or High vulnerability remains in the reviewed source. Production dependencies and development dependencies currently pass `npm audit`. The packaged desktop runtime and production Supabase policies still require environment-level verification; source review cannot certify them.

## Resolved findings

### TS-ELECTRON-IPC-001

- Severity: High
- Location: `electron/main.js`, `handleTrustedIpc` and all Steam/dialog handlers; `electron/security.js`, `isTrustedIpcSender`
- Evidence: before this pass, IPC handlers validated payloads but not the active sender frame. They now require the active window WebContents, exact main frame, and trusted `app://host` origin; tests cover stale, child, failure-page, and navigated senders.
- Impact: a renderer that left the trusted game origin could otherwise retain access to native dialogs and Steam operations exposed by the preload bridge.
- Fix: centralized fail-closed sender validation plus guarded direct navigation and redirects.
- Automated test: `tests/electron/desktopSecurity.test.ts`.

### TS-ELECTRON-DEVTRUST-002

- Severity: High
- Location: `electron/security.js`, `determineDevelopmentMode`; `electron/main.js`, development-mode initialization
- Evidence: development trust is now impossible when Electron reports a packaged application, even when `--dev` or `ELECTRON_DEV=1` is supplied.
- Impact: a packaged application must never load localhost content with its privileged preload bridge.
- Fix: package state is authoritative; command-line and environment opt-in applies only to unpackaged development.
- Automated test: `tests/electron/desktopSecurity.test.ts`.

### TS-SUPPLY-001

- Severity: Medium
- Location: `package.json` lines 80-81 and `package-lock.json`
- Evidence: Next's exact PostCSS dependency resolved to a version affected by GHSA-qx2v-qp2m-jg93, and a development dependency used an affected `brace-expansion` release.
- Impact: vulnerable CSS serialization or crafted brace expansion could affect build/development tooling.
- Fix: force PostCSS 8.5.16 through the lockfile and apply the non-breaking audit remediation for `brace-expansion`; CI now runs `npm audit --audit-level=moderate`.
- Automated test: `npm audit` and `npm audit --omit=dev` both return zero vulnerabilities.

### TS-MOD-IMPORT-001

- Severity: Medium
- Location: `src/lib/modLoader.ts`, `validateCountryData` and `importGameData`
- Evidence: the old boundary accepted any object with a key, name, array named `leagues`, and object named `nativeNamePool`. Missing nested pools, invalid finances, duplicate IDs, or non-finite values could be persisted and consumed by the next world initialization.
- Impact: a malformed local mod could crash or corrupt a newly created career and grow IndexedDB without a file bound.
- Fix: 10 MB input cap, bounded nested schemas, finite numeric ranges, safe identifiers, outer/inner key equality, unique league/club IDs, and isolated write failures.
- Automated test: `tests/persistence/modLoaderValidation.test.ts`.

### TS-URL-001

- Severity: Low
- Location: `electron/security.js`, `normalizeSafeExternalUrl`; `src/components/game/DemoEndScreen.tsx` line 69
- Evidence: operating-system delegation now rejects credentials and every protocol except HTTPS/mailto; the browser fallback opens the fixed Steam URL with `noopener,noreferrer`.
- Impact: prevents executable/local URL delegation and opener-based tab control.
- Fix: one normalized URL allowlist and an opener-free browser call.
- Automated test: `tests/electron/desktopSecurity.test.ts`.

### TS-AUTH-STORAGE-005

- Severity: Medium before cloud enablement
- Location: `src/lib/supabase.ts`, `src/stores/authStore.ts`
- Evidence: the shared Supabase client remains usable for anonymous feedback,
  but session persistence, token refresh, and OAuth URL detection now follow
  the disabled cloud flag. Auth initialization and every sign-in entry point
  fail closed while that flag is off, and exact legacy Supabase session keys
  are removed.
- Impact: a build configured for feedback can no longer create dormant browser
  auth state for a player-facing feature that is intentionally unavailable.
- Automated test: `tests/persistence/cloudFeatureGate.test.ts`.

### TS-NATIVE-SAVE-006

- Severity: Medium integrity risk
- Location: `electron/file-io.js`; `electron/main.js`, native save dialogs
- Evidence: exports now flush a private same-directory temporary file before an
  atomic rename; failures clean the temporary file and preserve the previous
  export. Imports use one open handle, enforce the byte cap twice, require a
  regular file, and reject malformed UTF-8.
- Impact: interrupted writes no longer truncate a known-good manual backup, and
  malformed local bytes cannot be silently normalized into a different save.
- Automated test: `tests/electron/fileIo.test.ts`.

### TS-DESKTOP-PERMISSIONS-007

- Severity: Low defense in depth
- Location: `electron/main.js`, `installRendererPermissionGuards`
- Evidence: permission checks and requests are denied by default, webview
  attachment is blocked, and both CSPs explicitly deny child frames.
- Impact: future renderer content cannot silently acquire device or capture
  capabilities that TalentScout does not use.
- Automated test: `tests/electron/desktopSecurity.test.ts`.

### TS-ELECTRON-PACKAGE-009

- Severity: Medium defense in depth
- Location: `electron-builder.yml`, `build/entitlements.mac.plist`
- Evidence: production packages now disable RunAsNode, Node environment
  options, CLI inspector arguments, and extra `file://` privileges; require the
  application ASAR; and enable supported ASAR integrity validation. The macOS
  DYLD environment entitlement, which is debugging-only and not a Steamworks
  loading requirement, has been removed.
- Impact: environment variables or alternate app directories have fewer paths
  to substitute privileged main-process code in an installed build.
- Automated test: packaging contracts in
  `tests/electron/desktopSecurity.test.ts`; signed runtime behavior remains in
  the packaged-platform matrix.

## Verified controls

- React renders game, save, contact, report, and mod strings through normal JSX. Repository scans found no `dangerouslySetInnerHTML`, direct HTML insertion, `eval`, `new Function`, or string-timer sink in shipped source.
- Next is a production static export. There are no Next Route Handlers, Server Actions, or API Routes in the shipped application.
- The optional global leaderboard and Supabase cloud saves are explicitly disabled in `src/config/beta.ts`; source comments are not treated as proof of Row-Level Security.
- Imported save payloads are size-bounded in Electron, envelope-validated, migrated through the canonical migration path, journaled, and recoverable from previous generations.
- Production CSP blocks object embedding, framing, cross-origin forms, eval, arbitrary external navigation, and arbitrary network destinations. Supabase and Sentry ingestion are the only remote connection families allowlisted.
- Context isolation is enabled, Node integration and production DevTools are disabled, the preload API is frozen and narrow, and custom-protocol file paths remain under the exported application root.

## Residual and unverified risks

### TS-ELECTRON-SANDBOX-003

- Severity: Low defense-in-depth gap
- Location: `electron/main.js`, BrowserWindow sandbox configuration
- Evidence: Chromium renderer sandboxing is enabled in source and enforced by a regression test alongside context isolation, Node isolation, navigation controls, IPC sender validation, and CSP.
- Fix: retain `sandbox: true`; prove Steam, preload, save dialogs, audio, and startup on every packaged platform in the runtime matrix.
- Status: Source hardening Passed; cross-platform runtime compatibility remains Unverified.

### TS-CSP-INLINE-004

- Severity: Low defense-in-depth gap
- Location: `electron/main.js`, production `script-src` includes `'unsafe-inline'`
- Evidence: Next's static export emits inline bootstrap code. The policy does not include `unsafe-eval`, and the source scan found no raw HTML/code-execution sink.
- Fix: generate stable script hashes or a nonce-capable packaging step, then validate the exact packaged export before removing the compatibility allowance.
- Status: Unverified pending packaged-runtime proof.

### TS-FEEDBACK-BACKEND-008

- Severity: Low in the client; environment verification required
- Location: `src/lib/feedbackService.ts`, production Supabase `feedback` table
- Evidence: the client now bounds and trims every field, accepts only known
  categories, catches transport failures, and does not expose database errors.
  Online insertion also requires the separate fail-closed
  `NEXT_PUBLIC_ENABLE_ONLINE_FEEDBACK=true` build opt-in; Supabase credentials
  alone are insufficient. Source review cannot prove production Row-Level
  Security, abuse throttling, retention, or alerting for anonymous submissions.
- Fix: verify anonymous insert-only RLS, rate limits/abuse controls, retention,
  and cross-table denial against the production project before exposing the
  feedback form in a Supabase-configured release.
- Status: Client boundary Passed and online submission disabled; production
  policy Unverified. The email-draft fallback does not require Supabase.

## Required environment evidence

- Signed/notarized packaged Windows, macOS, and Linux startup and sandbox compatibility.
- Production Supabase RLS policies and authenticated cross-account isolation tests before cloud features are enabled.
- Production anonymous-feedback insert-only RLS, abuse throttling, retention,
  and failure monitoring before the form is exposed.
- Update-channel signature and rollback behavior.
- Exact package hashes tied to the packaged-runtime matrix.
