# TalentScout

TalentScout is a football scouting career simulation. The supported Early Access game is Youth Scout: observe prospects, build evidence, write reports, develop relationships, and live with the consequences of your judgment. Other career modes remain future scope.

The game uses React, Next.js static export, Zustand, and local IndexedDB saves. Electron serves the exported game from its own application origin. Core gameplay works without a cloud account or a development server.

## Local setup

Use Node.js 22 and npm. Run commands from this directory, which contains `package.json`. On Windows PowerShell, use `npm.cmd` if the npm PowerShell shim is blocked.

```sh
npm ci
npm run dev
```

Open [the game](http://localhost:3000/play). Use `npm ci` after switching branches or changing the lockfile so local tests use the intended dependency versions. Optional settings are documented in [.env.example](.env.example); no values are required for offline play. If needed, copy it to `.env.local` and keep populated values out of source control.

## Preview and desktop

```sh
npm run build
npm start
```

The production preview serves `out` at [localhost:3000](http://localhost:3000/play). Choose another port with `npm start -- --port 3100`. This is a static export; a Next.js production server is not used. The build records the current full Git commit and package version automatically.

For the local Electron development shell:

```sh
npm run electron:dev
```

For a local desktop package:

```sh
npm run electron:dist
```

Packages are written to `dist`. A successful local package is a verification artifact until signing, package-specific runtime checks, and release certification pass. Steam SDK redistributables are provisioned separately; local gameplay can run when Steam is unavailable.

On Windows, after building the normal export and installing the Electron runtime, run `node scripts/run-source-windows-runtime-diagnostic.mjs` to exercise the real opening, manual save, graceful close and exact save reopen in an isolated offline profile. The result is written under `artifacts/source-runtime-diagnostics`. This uses local source and the Electron executable; it does not build, sign or certify an installer.

## Verify changes

```sh
npm run typecheck
npm run lint
npm run test:architecture
npm run test:unit
npm run build
```

For browser regression, build the separate instrumented artifact first:

```sh
npx playwright install chromium
npm run build:e2e
npm run test:e2e:youth-ea
```

Playwright uses `out-e2e`; shipping packages use `out`. Stop the development server before building, and do not run concurrent builds in the same checkout: both development and production write `.next`. Parallel work needs separate checkouts and generated output. CI also checks critical persistence coverage, retention, dependency advisories, and replayability. Full release soaks are separate multi-hour jobs; smaller development runs are supporting evidence only.

## Error reporting and optional services

`NEXT_PUBLIC_SENTRY_DSN` enables renderer exception reporting at compile time. The client starts through `src/instrumentation-client.ts`. Reports keep the error type, sanitized compiled stack locations, build SHA, and a fixed renderer tag; they omit raw error messages, local filesystem paths, account/request data, breadcrumbs, and save contents. Tracing, replay, logs, and session reporting are disabled. Missing DSN means no Sentry client is initialized. Local transport tests verify event creation and redaction; receipt in the actual Sentry project must be checked separately for a release. No source-map upload credentials are needed by this setup.

Supabase credentials are optional for cloud features. Keep online feedback disabled until its backend controls are certified. Never put service-role keys, asset-generation API keys, or signing credentials in `NEXT_PUBLIC_*` variables.

## Release and support

- [Release evidence and exact-candidate checks](docs/release/release-evidence.md)
- [Candidate certification and promotion](docs/release/release-certification.md)
- [Steam and signing setup](docs/steam-ci-setup.md)
- [Packaged runtime matrix](docs/release/packaged-runtime-matrix.md)
- [Crash, rollback, and installer runbooks](docs/release/operations/README.md)

Passing source tests does not certify a signed installer, Steam integration, physical hardware, or human usability/accessibility. Release evidence must refer to the exact source candidate and package bytes being distributed.
