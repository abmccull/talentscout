# TalentScout - Steam Launch Guide (First-Time Publisher)

Complete walkthrough from setup to a manually promoted Steam release.

---

## Table of Contents

1. [Overview: How Steam Publishing Works](#1-overview)
2. [Steamworks Partner Portal Setup](#2-partner-portal)
3. [Create Depots (One-Time)](#3-create-depots)
4. [Build Your Game Locally](#4-build-locally)
5. [Upload to Steam via SteamCmd](#5-upload-steamcmd)
6. [Test via Steam Client](#6-test-steam-client)
7. [Store Page Setup](#7-store-page)
8. [Achievements Setup](#8-achievements)
9. [Cloud Saves Setup](#9-cloud-saves)
10. [Code Signing](#10-code-signing)
11. [Review and Release](#11-review-release)
12. [Post-Launch](#12-post-launch)
13. [Quick Reference](#13-quick-reference)

---

## 1. Overview: How Steam Publishing Works <a id="1-overview"></a>

Here is the operating model:

```text
Your Code -> Candidate Tag -> GitHub candidate run -> Manual certification
           -> Manual promotion -> Steam Build Manager -> Steam Client
```

**Key concepts:**
- **App** = Your game listing (App ID: 4455570). One per game.
- **Depots** = Platform-specific bundles of files. You need one per OS.
- **Builds** = Versioned snapshots of your depots. Steam keeps every build.
- **Branches** = Named release channels. `default` is what players get.
  `testing` is for internal QA.
- **SteamCmd** = Valve's CLI tool for uploading builds to depots.
- **Candidate run** = The GitHub Actions run created by pushing a `v*` tag. It
  builds artifacts for one exact tag, SHA, tree, and run ID, then stops short
  of publication.
- **Certification bundle** = Independent manual/platform evidence collected
  against the exact candidate packages.
- **Promotion run** = The manual `Certify and Promote Existing Candidate`
  workflow that can create a draft GitHub release and, for a fully certified
  final tag only, upload Steam depots.

**What is already done in this project:**
- Steamworks SDK integrated (`steamworks.js`)
- Electron packaging configured for Windows, macOS, and Linux
- 45 achievements defined and wired
- Cloud save system implemented
- Rich Presence VDF created
- CI pipeline for building exact candidate artifacts across platforms

**What you still need to do:**
- Create depots in Steamworks
- Push a candidate tag and keep the original run ID
- Complete the manual/platform certification gates
- Promote the exact certified candidate
- Configure the store page
- Set up achievements in the portal
- Submit for review and release

---

## 2. Steamworks Partner Portal Setup <a id="2-partner-portal"></a>

### Log in

Go to **https://partner.steamgames.com/** and sign in with the Steam account
that owns App 4455570.

### Navigate to your app

Click **Apps & Packages** -> **All Applications** -> **TalentScout**
(App 4455570).

### Verify app type

Under **General** -> **Application**, confirm:
- **Type:** Game
- **Name:** TalentScout
- **Category:** Indie, Simulation, Strategy, Sports, or the final category mix
  you want to ship

---

## 3. Create Depots (One-Time) <a id="3-create-depots"></a>

Depots are where your game files live on Steam's servers. You need one per
platform.

### In the Steamworks portal

1. Go to **SteamPipe** -> **Depots**.
2. Create three depots with these exact IDs so they match the VDF files in the
   repo:

| Depot ID | Name | OS |
|----------|------|----|
| 4455571 | TalentScout Windows | Windows |
| 4455572 | TalentScout macOS | macOS |
| 4455573 | TalentScout Linux | Linux |

> If Valve auto-assigned different depot IDs when you created the app, update
> the IDs in every `steamcmd/*.vdf` file before uploading.

3. For each depot, set the OS filter:
   - 4455571 -> Windows
   - 4455572 -> macOS
   - 4455573 -> Linux
4. Click **Publish** to save the depot configuration.

### Set launch options

Go to **Installation** -> **General Installation**.

**Windows**
- Executable: `TalentScout.exe`
- Arguments: leave empty
- OS: Windows

**macOS**
- Executable: `TalentScout.app`
- Arguments: leave empty
- OS: macOS

**Linux**
- Executable: `talentscout`
- Arguments: leave empty
- OS: Linux

Click **Publish**.

---

## 4. Build Your Game Locally <a id="4-build-locally"></a>

### Prerequisites

```bash
cd ~/talentscout
npm install
```

### Option A: Build for your current platform only

```bash
npm run electron:dist
```

Output goes to `dist/`. On macOS you should expect artifacts such as:
- `dist/mac/TalentScout.app`
- `dist/TalentScout-x.x.x-arm64.dmg`

### Option B: Build all platforms with the official candidate path

Push a release-candidate tag:

```bash
git tag v0.1.0-rc.1
git push origin v0.1.0-rc.1
```

That creates exact Windows, macOS, and Linux candidate artifacts in GitHub
Actions. It does not create a GitHub release and does not upload to Steam.

For a final candidate, push the final tag the same way:

```bash
git tag v0.1.0
git push origin v0.1.0
```

That still creates candidate artifacts only. Steam upload remains a later,
manual promotion step after certification. Use
`docs/release/release-certification.md` as the source of truth for the
promotion flow.

### Option C: Use the helper script for local packaging or ad hoc uploads

```bash
# Build + upload manually
./scripts/steam-upload.sh

# Build only
./scripts/steam-upload.sh --build-only
```

This helper is convenient for local branch testing. It is not the official
production promotion path.

---

## 5. Upload to Steam via SteamCmd <a id="5-upload-steamcmd"></a>

The recommended production path is not a direct SteamCmd upload from your local
machine. Production Steam publication should come from the manual
`Certify and Promote Existing Candidate` workflow so the uploaded depots match
the exact certified candidate run.

Use direct SteamCmd uploads in these cases only:
- local or ad hoc testing;
- uploading a testing-branch build outside the formal promotion flow;
- recovering a portal-side issue when you intentionally want a manual upload.

### Install SteamCmd

```bash
# macOS
brew install steamcmd

# Linux (Debian/Ubuntu)
sudo apt install steamcmd

# Windows
# Download from: https://developer.valvesoftware.com/wiki/SteamCMD
# Extract to C:\steamcmd\
```

### Upload your build manually

You upload one platform at a time from the machine that built it:

```bash
cd ~/talentscout
steamcmd +login YOUR_STEAM_USERNAME +run_app_build steamcmd/app_build_4455570.vdf +quit
```

SteamCmd will:
1. Ask for your password.
2. Ask for your Steam Guard code.
3. Upload the files from `dist/` to Steam's servers.
4. Print a build ID when done.

> The VDF files reference `../dist/win-unpacked`, `../dist/mac`, and related
> paths. Run SteamCmd from the project root or from a location where those
> relative paths still resolve correctly. The helper script handles that for
> you.

### First-time note for macOS-only local packaging

If you only package locally on macOS, you only have a local macOS build. For
Windows and Linux:
- use the exact GitHub candidate run to build those platforms;
- download the matching artifacts from that run;
- extract them into `dist/win-unpacked/` and `dist/linux-unpacked/`;
- then run SteamCmd if you intentionally want a manual upload.

---

## 6. Test via Steam Client <a id="6-test-steam-client"></a>

### Set a build live on a testing branch

1. Go to **https://partner.steamgames.com/apps/builds/4455570**.
2. Find your uploaded build.
3. Click the dropdown under **Set build live on branch**.
4. Select **testing** or another internal branch.
5. Click **Preview Change** -> **Set Build Live**.

### Install and test

1. In the Steam client, right-click **TalentScout** in your library.
2. Go to **Properties** -> **Betas**.
3. Select the **testing** branch.
4. Let Steam download the build.
5. Click **Play**.

### What to test

- [ ] Game launches without crashing
- [ ] Steam overlay works (`Shift+Tab`)
- [ ] Achievements unlock
- [ ] Cloud saves sync
- [ ] Rich Presence appears correctly
- [ ] Fullscreen, resize, minimize, and restore behave correctly
- [ ] Save/load works across all manual slots plus autosave

---

## 7. Store Page Setup <a id="7-store-page"></a>

### Required assets

| Asset | Size | Notes |
|-------|------|-------|
| Header Capsule | 460x215 px | Search results |
| Small Capsule | 231x87 px | Wishlists and recommendations |
| Main Capsule | 616x353 px | Top of store page |
| Hero Graphic | 3840x1240 px | Header background |
| Page Background | 1438x810 px | Optional |
| Screenshots | 1920x1080 px, minimum 5 | Gameplay screenshots |
| Library Capsule | 600x900 px | Library art |
| Library Hero | 3840x1240 px | Library header |
| Logo | 1280x720 px PNG | Transparent background recommended |

### Where to upload

Steamworks portal -> **Store Page** -> **Graphical Assets**

### Store description

Use the copy in `docs/steam-store-page.md` for:
- **Store Page** -> **Description** -> **About This Game**

### Tags

Steamworks portal -> **Store Page** -> **Tags**

Suggested tags:
- Simulation
- Sports
- Management
- Indie
- Strategy
- Singleplayer
- Football (Soccer)

### System requirements

Steamworks portal -> **Store Page** -> **Basic Info** -> **System Requirements**

**Windows**
- Minimum: Windows 10, 4 GB RAM, 1 GB disk
- Recommended: Windows 10/11, 8 GB RAM, 2 GB disk

**macOS**
- Minimum: macOS 12 Monterey, 4 GB RAM, 1 GB disk
- Recommended: macOS 14 or newer, 8 GB RAM, 2 GB disk

**Linux**
- Minimum: Ubuntu 20.04 or newer, 4 GB RAM, 1 GB disk

---

## 8. Achievements Setup <a id="8-achievements"></a>

Your project includes:

- `docs/achievements_import.vdf` for the audited 45-achievement full-game
  import file.
- `docs/achievements_import_youth_early_access.vdf` for the current Youth
  Scout Early Access Steam setup.

Before importing, regenerate and validate both files:

```bash
npm run steam:generate-achievement-imports
npm run test:steam-achievement-imports
```

1. In Steamworks, go to **Stats & Achievements** ->
   **Achievement Configuration**.
2. Click **Import** and upload
   `docs/achievements_import_youth_early_access.vdf`.
3. Confirm all 36 Youth Scout Early Access achievements are created with the
   correct API names.
4. Leave the following achievements reserved for a future full build:
   `FIRST_MATCH`, `ALL_PERKS_TREE`, `DUAL_MASTERY`, `SECONDARY_SPEC`,
   `MATCHES_25`, `MATCHES_50`, `MATCHES_100`, `AGAINST_ALL_ODDS`,
   `BLIND_FAITH`.

### Achievement icons

Each achievement needs:
- **Unlocked:** 256x256 px color icon
- **Locked:** 256x256 px grayscale icon

Placeholder icons are acceptable for early internal setup, but replace them
before public release.

Click **Publish** after the achievement configuration is complete.

---

## 9. Cloud Saves Setup <a id="9-cloud-saves"></a>

Go to **Cloud** -> **Settings** and configure:

1. **Enable Steam Cloud:** Yes
2. **Byte quota per user:** 12582912 (12 MB)
3. **File count quota per user:** 10
4. **Root path override:** leave empty

Click **Publish**.

The game already handles Steam Cloud through `steamworks.js` IPC calls in
`electron/main.js`. Slots are named `cloud_save_0.json` through
`cloud_save_5.json`.

---

## 10. Code Signing <a id="10-code-signing"></a>

Code signing is part of the release model, not just a polish step.

### Windows

1. Purchase an EV code-signing certificate from a CA such as DigiCert or
   Sectigo.
2. Export or receive the `.pfx` file and password.
3. Add:
   - `WIN_CSC_LINK`
   - `WIN_CSC_KEY_PASSWORD`

### macOS

1. Enroll in the Apple Developer Program.
2. Create a **Developer ID Application** certificate.
3. Export the `.p12` certificate.
4. Add:
   - `CSC_LINK`
   - `CSC_KEY_PASSWORD`
   - `APPLE_ID`
   - `APPLE_ID_PASSWORD`
   - `APPLE_TEAM_ID`

### What is optional vs required

- **Verification-only candidate runs:** Unsigned artifacts are acceptable for
  internal testing and manual certification.
- **Production promotion:** The candidate you intend to promote should be built
  with signing secrets present so the certified packages match the release
  packages.
- **Steam distribution:** Steam itself distributes the build, but the promoted
  final candidate should still be the signed one you certified.

---

## 11. Review and Release <a id="11-review-release"></a>

### Pre-review checklist

- [ ] Store page complete
- [ ] Exact candidate tag pushed
- [ ] Original candidate workflow run ID recorded
- [ ] Candidate commit SHA and source tree recorded with the run evidence
- [ ] Manual/platform certification bundle completed against that exact
      candidate
- [ ] Internal review build uploaded and tested on a non-default Steam branch
- [ ] Launch options configured
- [ ] System requirements listed
- [ ] Content survey completed
- [ ] Pricing set
- [ ] Valve review approved
- [ ] Final tag has no prerelease suffix if you intend to promote to Steam

### Submit for Valve review

1. Go to Steamworks -> **Store Page** -> **Release Management**.
2. Click **Mark as Ready for Review**.
3. Expect review in roughly 2 to 5 business days.
4. Address any requested changes.

### Release day

1. Run `Certify and Promote Existing Candidate` manually using:
   - the original candidate workflow run ID;
   - the exact candidate tag;
   - the independent certification ref;
   - explicit GitHub and Steam publication choices.
2. If GitHub publication was enabled, review the generated draft release and
   publish it when you are ready.
3. If Steam publication was enabled and the tag is final, confirm the new build
   appears in **Build Manager**.
4. Set that build live on the `default` branch.
5. Click **Release App** in Steamworks.

### Pricing

Steamworks portal -> **Store Page** -> **Pricing**

Set the base USD price and any launch discount you intend to use.

---

## 12. Post-Launch <a id="12-post-launch"></a>

### Updating the game

1. Build a new version.
2. Push a new candidate tag.
3. Certify that exact candidate.
4. Promote the exact certified candidate.
5. Set the resulting build live on `default`.

### Monitoring

- **Sales data:** Steamworks -> **Sales & Activations**
- **Reviews:** Steamworks -> **Community** -> **Reviews**
- **Bug reports:** Steam Community Hub discussions
- **Crash reports:** your external monitoring stack, if configured

### Features you can add later

- Trading Cards
- Workshop
- Leaderboards
- Demo support using `NEXT_PUBLIC_DEMO=true`

---

## 13. Quick Reference <a id="13-quick-reference"></a>

### IDs

| Item | ID |
|------|----|
| App ID | 4455570 |
| Windows Depot | 4455571 |
| macOS Depot | 4455572 |
| Linux Depot | 4455573 |

### Key files

| File | Purpose |
|------|---------|
| `steam_appid.txt` | Steam SDK initialization |
| `electron/main.js` | Electron main process and Steam IPC |
| `electron/preload.js` | Steam API bridge to the renderer |
| `electron/rich_presence.vdf` | Rich Presence display strings |
| `electron-builder.yml` | Desktop packaging config |
| `steamcmd/app_build_4455570.vdf` | SteamCmd build manifest |
| `steamcmd/depot_build_*.vdf` | Per-platform depot configs |
| `scripts/steam-upload.sh` | Local build and upload helper |
| `docs/achievements_import.vdf` | Audited 45-achievement full-game import file |
| `docs/achievements_import_youth_early_access.vdf` | Youth Scout Early Access achievement import file |
| `docs/steam_achievement_scope_youth_early_access.json` | Audited Youth EA Steam achievement scope manifest |
| `src/lib/achievements.ts` | Achievement definitions |
| `src/lib/steam/achievementMap.ts` | Code-to-Steam name mapping |
| `src/lib/steam/saveProvider.ts` | Save provider logic |

### Common commands

```bash
# Run in development
npm run electron:dev

# Build for the current platform
npm run electron:dist

# Build and upload manually
./scripts/steam-upload.sh

# Regenerate the Youth EA Steam achievement import
npm run steam:generate-achievement-imports

# Validate the checked-in Youth EA Steam achievement import
npm run test:steam-achievement-imports

# Upload only
./scripts/steam-upload.sh --skip-build

# Push a release candidate tag
git tag v0.1.0-rc.1 && git push origin v0.1.0-rc.1

# Push a final tag
git tag v0.1.0 && git push origin v0.1.0

# Install SteamCmd on macOS
brew install steamcmd
```

### Portal URLs

- **Partner Dashboard:** https://partner.steamgames.com/apps/landing/4455570
- **Build Manager:** https://partner.steamgames.com/apps/builds/4455570
- **Store Page Editor:** https://partner.steamgames.com/apps/landing/4455570
- **Achievements:** https://partner.steamgames.com/apps/achievements/4455570
