# TalentScout security readiness report

**Review date:** July 29, 2026
**Candidate:** `a99b5849c8fa0d7efa873ef0124e37c109b093bd`
**Scope:** React/Next static client, Electron privilege boundary, save import/export, optional Supabase services, dependencies, packaged runtime, and release workflows

## Executive summary

The Electron source boundary is well hardened and no direct Critical source vulnerability was confirmed. Dependency and worker-policy defects are fixed in the working tree: `npm audit` reports zero vulnerabilities, and fresh packaged evidence instantiates the same-package worker with zero CSP errors. Release security remains incomplete because these changes are not yet a tagged candidate, GitHub workflows have not rerun on them, and the Windows artifact is unsigned supporting evidence.

## Resolved in the working tree

### TS-SUPPLY-001: dependency gate

- **Severity:** High
- **Location:** `package.json`; `.github/workflows/ci.yml:31`; `.github/workflows/build.yml:55`
- **Status:** Resolved locally; CI rerun pending.
- **Evidence:** Next 15.5.22, current compatible build tooling, and patched transitive overrides produce `found 0 vulnerabilities`.
- **Remaining release action:** Commit the lockfile and rerun both GitHub workflows on the exact candidate.

### TS-CSP-WORKER-002: production worker policy

- **Severity:** Medium security configuration conflict; High release-performance impact
- **Location:** `electron/main.js:266-274`; `src/lib/weeklySimulationWorkerClient.ts:154-181`
- **Status:** Resolved locally.
- **Evidence:** Production uses `worker-src 'self' app: blob:` while retaining `frame-src 'none'` and `child-src 'none'`. The fresh package reports an active weekly worker and zero CSP errors.
- **Regression control:** Electron source tests assert the policy, and Windows runtime evidence fails when the packaged worker is absent.

## Medium severity

### TS-SIGNING-003: supporting Windows package is not release-authenticated

- **Severity:** Medium
- **Location:** `electron-builder.yml`; generated Windows supporting-runtime evidence
- **Evidence:** Package/ASAR integrity passed, but Authenticode, exact candidate manifest binding, installed standard-user journey, and update signature behavior are unverified.
- **Impact:** Players and release automation cannot establish publisher identity and exact-artifact provenance.
- **Fix:** Sign the exact tagged candidate, verify signature after packaging, create the candidate package manifest, then run install/restart/uninstall and update/rollback checks.
- **Mitigation:** Do not distribute the local supporting artifact.

## Low severity and enablement conditions

### TS-CSP-INLINE-004: production CSP still permits inline script

- **Severity:** Low defense in depth
- **Location:** `electron/main.js:266-274`
- **Evidence:** `script-src` includes `'unsafe-inline'` for the Next static bootstrap. It does not include `unsafe-eval`; source scans found no shipped raw HTML/eval sink.
- **Impact:** An HTML injection would have a larger script-execution surface than a hash/nonce policy.
- **Fix:** Generate stable hashes or a packaging nonce strategy before removing compatibility allowance.

### TS-OPTIONAL-BACKENDS-005: online services must remain disabled until production controls are verified

- **Severity:** Low in this build; potentially High if enabled without controls
- **Location:** `src/config/beta.ts:4-18`; `supabase/functions/submit-score/index.ts:3-122`
- **Evidence:** Cloud saves and global leaderboard are disabled; online feedback requires an explicit build opt-in. The leaderboard function uses wildcard CORS and a service-role insert after authentication.
- **Impact:** Enabling services without RLS, rate limiting, retention, monitoring, and server-authoritative anti-cheat proof could permit abuse or cross-account data exposure.
- **Fix:** Verify production policies and abuse controls before changing feature flags.
- **Mitigation:** Keep all three features off in the shipping build.

## Verified controls

- React renders player/game text through JSX; no confirmed raw HTML or dynamic-code sink in shipped source.
- Next is exported statically; no shipped Next Route Handler or Server Action trust boundary.
- Electron uses context isolation, no Node integration, and Chromium sandboxing.
- Renderer permissions and webviews are denied.
- Navigation, external URLs, and IPC senders are constrained.
- Native saves are byte-bounded, UTF-8 validated, chunked, and atomically exported.
- Save recovery and previous-generation preservation passed in the packaged Windows supporting run.
- Optional online features are fail-closed in this candidate.

## Required security release evidence

1. Green current GitHub CI and desktop-build workflows for the committed fix candidate.
2. Signed exact-tag Windows artifact and native macOS notarization/signing.
3. Package hashes and manifest tied to the release tag.
4. Installed standard-user and update/rollback verification.
5. Production Supabase RLS, abuse, retention, and alerting before any online feature is enabled.
