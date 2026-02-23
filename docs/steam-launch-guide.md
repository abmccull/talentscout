# TalentScout — Steam Launch Guide (First-Time Publisher)

Complete walkthrough from zero to published game on Steam.

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
10. [Code Signing (Optional but Recommended)](#10-code-signing)
11. [Review & Release](#11-review-release)
12. [Post-Launch](#12-post-launch)
13. [Quick Reference](#13-quick-reference)

---

## 1. Overview: How Steam Publishing Works <a id="1-overview"></a>

Here's the mental model:

```
Your Code → electron-builder → Desktop App → SteamCmd → Steam Depots → Steam Client
                                  (dist/)                  (cloud)      (players)
```

**Key concepts:**
- **App** = Your game listing (App ID: 4455570). One per game.
- **Depots** = Platform-specific bundles of files. You need one per OS.
- **Builds** = Versioned snapshots of your depots. Steam keeps every build.
- **Branches** = Named release channels. `default` is what players get. `testing` is for internal QA.
- **SteamCmd** = Valve's CLI tool for uploading builds to depots.

**What's already done in your project:**
- Steamworks SDK integrated (`steamworks.js`)
- Electron packaging configured for Win/macOS/Linux
- 45 achievements defined and wired
- Cloud save system implemented
- Rich Presence VDF created
- CI/CD pipeline for building all platforms

**What you need to do:**
- Create depots in Steamworks portal
- Upload a build
- Configure the store page
- Set up achievements in the portal
- Submit for review

---

## 2. Steamworks Partner Portal Setup <a id="2-partner-portal"></a>

### Log in

Go to **https://partner.steamgames.com/** and sign in with the Steam account that owns App 4455570.

### Navigate to your app

Click **Apps & Packages** → **All Applications** → **TalentScout** (App 4455570).

### Verify app type

Under **General** → **Application**, confirm:
- **Type:** Game
- **Name:** TalentScout
- **Category:** Indie, Simulation, Strategy, Sports (set whatever fits)

---

## 3. Create Depots (One-Time) <a id="3-create-depots"></a>

Depots are where your game files live on Steam's servers. You need one per platform.

### In the Steamworks portal:

1. Go to **SteamPipe** → **Depots**
2. Create three depots with these **exact IDs** (they must match your VDF files):

| Depot ID | Name | OS |
|----------|------|-----|
| 4455571 | TalentScout Windows | Windows |
| 4455572 | TalentScout macOS | macOS |
| 4455573 | TalentScout Linux | Linux |

> If Valve auto-assigned different depot IDs when you created the app, update
> the IDs in all files under `steamcmd/*.vdf` to match.

3. For each depot, set the **OS** filter:
   - 4455571 → Windows
   - 4455572 → macOS
   - 4455573 → Linux

4. Click **Publish** to save depot configuration.

### Set Launch Options

Go to **Installation** → **General Installation**:

**Windows:**
- Executable: `TalentScout.exe`
- Arguments: (leave empty)
- OS: Windows

**macOS:**
- Executable: `TalentScout.app`
- Arguments: (leave empty)
- OS: macOS

**Linux:**
- Executable: `talentscout` (lowercase — check the actual binary name in `dist/linux-unpacked/`)
- Arguments: (leave empty)
- OS: Linux

Click **Publish**.

---

## 4. Build Your Game Locally <a id="4-build-locally"></a>

### Prerequisites

```bash
# Make sure dependencies are installed
cd ~/talentscout
npm install
```

### Option A: Build for your current platform only (fastest)

```bash
# This builds Next.js + packages for your current OS
npm run electron:dist
```

Output goes to `dist/`. On macOS you'll see:
- `dist/mac/TalentScout.app` (the app bundle)
- `dist/TalentScout-x.x.x-arm64.dmg` (installer)

### Option B: Build all platforms (for upload)

For cross-platform builds, use the CI pipeline:
```bash
git tag v0.1.0
git push origin v0.1.0
```
This triggers GitHub Actions which builds Win/macOS/Linux and creates a GitHub Release with all artifacts.

### Option C: Use the helper script

```bash
# Build + upload in one step
./scripts/steam-upload.sh

# Or just build
./scripts/steam-upload.sh --build-only
```

---

## 5. Upload to Steam via SteamCmd <a id="5-upload-steamcmd"></a>

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

### Upload your build

You upload **one platform at a time** (from the machine that built it):

```bash
cd ~/talentscout

# Upload Windows depot (run from Windows or with Windows build artifacts)
steamcmd +login YOUR_STEAM_USERNAME +run_app_build steamcmd/app_build_4455570.vdf +quit
```

SteamCmd will:
1. Ask for your password
2. Ask for Steam Guard code (check your email/authenticator)
3. Upload the files from `dist/` to Steam's servers
4. Print a build ID when done

> **Important:** The VDF files reference `../dist/win-unpacked`, `../dist/mac`,
> etc. This means SteamCmd must run from the `steamcmd/` directory OR you must
> be in the project root. The helper script handles this for you.

### First-time: upload from macOS only

Since you're on macOS, you can only build the macOS version locally. For Windows/Linux:
- Use the GitHub Actions CI to build those platforms
- Download the artifacts from the GitHub Release
- Extract them into `dist/win-unpacked/` and `dist/linux-unpacked/`
- Then run the SteamCmd upload

Or: just upload the macOS build first to test the pipeline, and add other platforms later.

---

## 6. Test via Steam Client <a id="6-test-steam-client"></a>

### Set a build live on a testing branch

1. Go to **https://partner.steamgames.com/apps/builds/4455570**
2. Find your uploaded build (newest at top)
3. Click the dropdown under **Set build live on branch**
4. Select **testing** (create it if it doesn't exist)
5. Click **Preview Change** → **Set Build Live**

### Install and test

1. In your Steam client, right-click **TalentScout** in your library
2. Go to **Properties** → **Betas**
3. Select the **testing** branch
4. Steam will download your build
5. Click **Play** to launch

### What to test

- [ ] Game launches without crash
- [ ] Steam overlay works (Shift+Tab)
- [ ] Achievements unlock (check in Steam overlay → Achievements)
- [ ] Cloud saves sync (save on one machine, load on another)
- [ ] Rich Presence shows in friends list
- [ ] Window management (fullscreen F11, resize, minimize)
- [ ] Save/Load works (all 5 manual slots + autosave)

---

## 7. Store Page Setup <a id="7-store-page"></a>

This is what players see when they find your game on Steam.

### Required assets (minimum)

| Asset | Size | Notes |
|-------|------|-------|
| **Header Capsule** | 460×215 px | Shown in store search results |
| **Small Capsule** | 231×87 px | Shown in wishlists, recommendations |
| **Main Capsule** | 616×353 px | Top of store page |
| **Hero Graphic** | 3840×1240 px | Background of store page header |
| **Page Background** | 1438×810 px | Optional, tiling background |
| **Screenshots** | 1920×1080 px (min 5) | Gameplay screenshots |
| **Library Capsule** | 600×900 px | Shown in Steam library |
| **Library Hero** | 3840×1240 px | Background when selected in library |
| **Logo** | 1280×720 px (PNG with transparency) | Overlaid on hero graphic |

### Where to upload

Steamworks portal → **Store Page** → **Graphical Assets**

### Store description

You already have copy in `docs/steam-store-page.md`. Copy it into:
- **Store Page** → **Description** → **About This Game**

### Tags

Go to **Store Page** → **Tags** and add:
- Simulation
- Sports
- Management
- Indie
- Strategy
- Singleplayer
- Football (Soccer)

### System Requirements

Set in **Store Page** → **Basic Info** → **System Requirements**:

**Windows:**
- Minimum: Windows 10, 4 GB RAM, 500 MB disk
- Recommended: Windows 10/11, 8 GB RAM, 1 GB disk

**macOS:**
- Minimum: macOS 11 Big Sur, 4 GB RAM, 500 MB disk
- Recommended: macOS 13+, 8 GB RAM, 1 GB disk

**Linux:**
- Minimum: Ubuntu 20.04+, 4 GB RAM, 500 MB disk

---

## 8. Achievements Setup <a id="8-achievements"></a>

### Import from VDF

Your project has a pre-built VDF import file: `docs/achievements_import.vdf`

1. In Steamworks portal, go to **Stats & Achievements** → **Achievement Configuration**
2. Click **Import** and upload `docs/achievements_import.vdf`
3. This creates all 45 achievements with correct API names

### Achievement icons

Each achievement needs two icons:
- **Unlocked:** 256×256 px, color (shows when earned)
- **Locked:** 256×256 px, grayscale (shows before earning)

Upload these in the Achievements editor for each achievement.

> **Shortcut:** You can use a single placeholder icon for all achievements
> initially, then replace with proper art later. Steam requires icons but
> doesn't block review over placeholder art.

### Publish

After importing/configuring, click **Publish** on the Achievements page.

---

## 9. Cloud Saves Setup <a id="9-cloud-saves"></a>

### Configure in Steamworks portal

Go to **Cloud** → **Settings**:

1. **Enable Steam Cloud:** Yes
2. **Byte quota per user:** 12582912 (12 MB — enough for 6 save slots)
3. **File count quota per user:** 10
4. **Root path override:** (leave empty — the game manages paths via API)

Click **Publish**.

The game already handles cloud saves via `steamworks.js` IPC calls in
`electron/main.js`. Slots are named `cloud_save_0.json` through
`cloud_save_5.json`.

---

## 10. Code Signing (Optional but Recommended) <a id="10-code-signing"></a>

Code signing prevents "Unknown publisher" warnings on Windows and Gatekeeper
blocks on macOS.

### Windows (EV Code Signing Certificate)

1. Purchase from a Certificate Authority (DigiCert, Sectigo, etc.) — ~$200-400/year
2. You'll receive a `.pfx` file and password
3. Add to GitHub Secrets:
   - `WIN_CSC_LINK` = base64-encoded `.pfx` file
   - `WIN_CSC_KEY_PASSWORD` = the certificate password

### macOS (Apple Developer ID)

1. Enroll in Apple Developer Program — $99/year at https://developer.apple.com
2. Create a **Developer ID Application** certificate in Xcode or the Apple Developer portal
3. Export the `.p12` certificate
4. Add to GitHub Secrets:
   - `CSC_LINK` = base64-encoded `.p12` file
   - `CSC_KEY_PASSWORD` = the certificate password
   - `APPLE_ID` = your Apple ID email
   - `APPLE_ID_PASSWORD` = app-specific password (generate at appleid.apple.com)
   - `APPLE_TEAM_ID` = your 10-character team ID

### Can I skip this?

- **For testing:** Yes. Unsigned builds work fine when sideloading.
- **For Steam distribution:** Steam handles distribution trust differently than web downloads. Players install via the Steam client, which is already trusted. Code signing is still recommended but won't block your launch.

---

## 11. Review & Release <a id="11-review-release"></a>

### Pre-review checklist

- [ ] Store page complete (all required images, description, tags)
- [ ] At least one build uploaded and set live on `default` branch
- [ ] Launch options configured for all platforms you support
- [ ] System requirements listed
- [ ] Content survey completed (Steamworks → **Store Page** → **Content Survey**)
- [ ] Pricing set (Steamworks → **Store Page** → **Pricing**)

### Submit for review

1. Go to Steamworks → **Store Page** → **Release Management**
2. Click **Mark as Ready for Review**
3. Valve reviews within **2-5 business days** typically
4. They may ask for changes (usually minor — description clarity, screenshot issues)
5. Once approved, you can set a release date or release immediately

### Release day

1. Set your build live on the `default` branch
2. Click **Release App** in the Release Management section
3. Your game is now live on Steam

### Pricing

- Go to **Store Page** → **Pricing**
- Set your base price (USD). Steam auto-calculates regional pricing.
- You can also set a launch discount (10-20% is common for visibility)

---

## 12. Post-Launch <a id="12-post-launch"></a>

### Updating the game

1. Build a new version (bump version in `package.json`)
2. Upload via SteamCmd (same process as initial upload)
3. Set the new build live on `default`
4. Players auto-update on next Steam client restart

### Monitoring

- **Sales data:** Steamworks → **Sales & Activations**
- **Reviews:** Steamworks → **Community** → **Reviews**
- **Bug reports:** Steam Community Hub → Discussions
- **Crash reports:** Check your email / any error reporting you add

### Community features you can enable later

- **Trading Cards** — requires card artwork + Valve approval
- **Workshop** — for user-generated content (custom leagues, etc.)
- **Leaderboards** — sync local leaderboards to Steamworks API
- **Demo** — publish a free demo using your existing demo mode (`NEXT_PUBLIC_DEMO=true`)

---

## 13. Quick Reference <a id="13-quick-reference"></a>

### Key IDs

| Item | ID |
|------|----|
| App ID | 4455570 |
| Windows Depot | 4455571 |
| macOS Depot | 4455572 |
| Linux Depot | 4455573 |

### Key files in this project

| File | Purpose |
|------|---------|
| `steam_appid.txt` | Steam SDK initialization |
| `electron/main.js` | Electron main process + Steam IPC |
| `electron/preload.js` | Steam API bridge to renderer |
| `electron/rich_presence.vdf` | Rich Presence display strings |
| `electron-builder.yml` | Desktop packaging config |
| `steamcmd/app_build_4455570.vdf` | SteamCmd build manifest |
| `steamcmd/depot_build_*.vdf` | Per-platform depot configs |
| `scripts/steam-upload.sh` | Build + upload helper |
| `docs/achievements_import.vdf` | Achievement batch import |
| `src/lib/achievements.ts` | Achievement definitions (code) |
| `src/lib/steam/achievementMap.ts` | Code-to-Steam name mapping |
| `src/lib/steam/saveProvider.ts` | Multi-backend save system |

### Common commands

```bash
# Run in development (Next.js + Electron hot reload)
npm run electron:dev

# Build for current platform
npm run electron:dist

# Build + upload to Steam
./scripts/steam-upload.sh

# Upload only (skip rebuild)
./scripts/steam-upload.sh --skip-build

# Tag a release (triggers CI build for all platforms)
git tag v0.1.0 && git push origin v0.1.0

# Install SteamCmd (macOS)
brew install steamcmd
```

### Portal URLs

- **Partner Dashboard:** https://partner.steamgames.com/apps/landing/4455570
- **Build Manager:** https://partner.steamgames.com/apps/builds/4455570
- **Store Page Editor:** https://partner.steamgames.com/apps/landing/4455570 → Store Page
- **Achievements:** https://partner.steamgames.com/apps/achievements/4455570
