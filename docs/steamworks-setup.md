# TalentScout — Steamworks Setup Guide

This document covers everything a developer needs to configure, test, and ship
the Steam integration for TalentScout. Follow the sections in order when
setting up for the first time.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Development Setup](#2-development-setup)
3. [Achievement Configuration](#3-achievement-configuration)
4. [Cloud Save Configuration](#4-cloud-save-configuration)
5. [Rich Presence Configuration](#5-rich-presence-configuration)
6. [Testing](#6-testing)
7. [Build and Distribution](#7-build-and-distribution)

---

## 1. Prerequisites

Before touching any code, make sure the following are in place.

### Steamworks Partner Account

- Register at <https://partner.steamgames.com/>.
- Accept the Steamworks Distribution Agreement.
- Create your app and note the **App ID** that Valve assigns. Every reference to
  `<YOUR_APP_ID>` in this guide must be replaced with that number.

### Steamworks SDK

1. Download the latest Steamworks SDK from the Steamworks partner dashboard
   under **SDK Downloads**.
2. Extract the archive. The path you care about is
   `sdk/redistributable_bin/` — these are the native libraries required at
   runtime.
3. Keep the SDK directory available locally; the build step references files
   from it.

---

## 2. Development Setup

### Install steamworks.js

`steamworks.js` wraps the Steamworks SDK via a native Node.js addon and is the
recommended approach for Electron-based games.

```bash
npm install steamworks.js
```

The package ships prebuilt binaries for Windows, macOS, and Linux, so no
compiler toolchain is required in most cases.

### Create steam_appid.txt

Place a plain-text file named `steam_appid.txt` in the **project root** (the
same directory as `package.json`). Its entire content must be your App ID on a
single line with no trailing newline:

```
<YOUR_APP_ID>
```

During development you may use **Spacewar** (App ID `480`) to avoid needing a
published game. See [Section 6 — Testing](#6-testing) for details.

> `steam_appid.txt` must be present next to the Electron binary at runtime as
> well. The `electron-builder` `extraFiles` configuration in
> [Section 7](#7-build-and-distribution) handles this automatically.

### Steam SDK Redistribution Binaries

Copy the appropriate native library from the SDK into the project so that
Electron can load it. Exact paths vary by SDK version:

| Platform | SDK source path | Destination |
|---|---|---|
| Windows (64-bit) | `sdk/redistributable_bin/win64/steam_api64.dll` | project root |
| macOS | `sdk/redistributable_bin/osx/libsteam_api.dylib` | project root |
| Linux (64-bit) | `sdk/redistributable_bin/linux64/libsteam_api.so` | project root |

During development these files only need to be present alongside the dev Electron
binary. The `electron-builder` configuration in Section 7 packages them into
the final build.

### Verifying the Electron Integration

The `steamworks.js` integration is wired up through the Electron preload script
and exposed to the renderer via `window.electronAPI.steam`. The abstraction
layer lives in:

```
src/lib/steam/steamInterface.ts        — SteamInterface contract + factory
src/lib/steam/electronSteamInterface.ts — Electron IPC bridge
src/lib/steam/achievementMap.ts        — ID → Steam API name mapping
src/stores/achievementStore.ts         — Zustand store that calls unlockAchievement
```

When `window.electronAPI.steam` is present (Electron build), `getSteam()`
returns an `ElectronSteamInterface`. In all other environments it returns a
`NoopSteamInterface` (all methods are silent no-ops), so the web/dev build
never crashes.

---

## 3. Achievement Configuration

### Steamworks Dashboard Setup

For each achievement below:

1. Go to your app in the Steamworks partner dashboard.
2. Navigate to **Technical Tools → Edit Steamworks Settings → Stats & Achievements → Achievements**.
3. Click **Add Achievement**.
4. Set the **API Name** exactly as shown in the table (SCREAMING_SNAKE_CASE).
5. Fill in the **Display Name** and **Description** fields (visible to players on Steam).
6. Upload a locked icon and an unlocked icon (64×64 px minimum, PNG recommended).
7. Publish the changes.

> The **API Name** in the dashboard must match the values in
> `src/lib/steam/achievementMap.ts` exactly. A mismatch silently fails —
> `steamworks.js` will not throw; the achievement simply will not unlock.

### Achievement Reference Table

All 45 achievements, grouped by category.

#### Getting Started

| Steam API Name | In-Game ID | In-Game Name | Description |
|---|---|---|---|
| `FIRST_OBSERVATION` | `first-observation` | First Glance | Submit your first observation. |
| `FIRST_REPORT` | `first-report` | Ink on Paper | Write your first scouting report. |
| `FIRST_WEEK` | `first-week` | The Journey Begins | Advance your first week. |
| `FIRST_MATCH` | `first-match` | Matchday | Attend your first live match. |
| `FIRST_CONTACT` | `first-contact` | Networking | Meet your first contact. |
| `FIRST_PERK` | `first-perk` | Specializing | Unlock your first perk. |
| `FIRST_EQUIPMENT` | `first-equipment` | Tools of the Trade | Purchase your first piece of equipment. |
| `FIRST_YOUTH` | `first-youth` | Future Stars | Scout your first youth player. |

#### Career Milestones

| Steam API Name | In-Game ID | In-Game Name | Description |
|---|---|---|---|
| `REACH_TIER_2` | `reach-tier-2` | Rising Scout | Reach Career Tier 2. |
| `REACH_TIER_3` | `reach-tier-3` | Established | Reach Career Tier 3. |
| `REACH_TIER_4` | `reach-tier-4` | Elite Scout | Reach Career Tier 4. |
| `REACH_TIER_5` | `reach-tier-5` | Legend | Reach Career Tier 5. |
| `SEASON_1` | `season-1` | Survived | Complete your first season. |
| `SEASON_3` | `season-3` | Veteran | Complete 3 seasons. |
| `SEASON_5` | `season-5` | Dedicated | Complete 5 seasons. |
| `SEASON_10` | `season-10` | Lifer | Complete 10 seasons. |

#### Scouting Excellence

| Steam API Name | In-Game ID | In-Game Name | Description |
|---|---|---|---|
| `REPORTS_10` | `reports-10` | Prolific Reporter | Submit 10 scouting reports. |
| `REPORTS_25` | `reports-25` | Seasoned Analyst | Submit 25 scouting reports. |
| `REPORTS_50` | `reports-50` | Report Machine | Submit 50 scouting reports. |
| `REPORTS_100` | `reports-100` | The Archive | Submit 100 scouting reports. |
| `TABLE_POUND` | `table-pound` | Table Pounder | Submit a report with a Table Pound conviction. |
| `WONDERKID_FOUND` | `wonderkid-found` | Diamond in the Rough | Discover a wonderkid. |
| `ALUMNI_5` | `alumni-5` | Talent Pipeline | Have 5 alumni debuts. |
| `ALUMNI_INTERNATIONAL` | `alumni-international` | International Talent | Have an alumni earn an international call-up. |
| `HIGH_ACCURACY` | `high-accuracy` | Eagle Eye | Achieve a report quality score above 85. |
| `GENERATIONAL_TALENT` | `generational-talent` | Once in a Generation | Discover a generational talent. |

#### Specialization Mastery

| Steam API Name | In-Game ID | In-Game Name | Description |
|---|---|---|---|
| `MAX_SPEC` | `max-spec` | Master of One | Max out any specialization. |
| `ALL_PERKS_TREE` | `all-perks-tree` | Complete Tree | Unlock all perks in one specialization tree. |
| `MASTERY_PERK` | `mastery-perk` | True Mastery | Unlock a mastery-tier perk. |
| `DUAL_MASTERY` | `dual-mastery` | Renaissance Scout | Earn mastery in 2 different skills. |
| `EQUIPMENT_MAXED` | `equipment-maxed` | Fully Equipped | Have all equipment slots at maximum tier. |
| `SECONDARY_SPEC` | `secondary-spec` | Dual Threat | Unlock a secondary specialization. |
| `ALL_ACTIVITIES` | `all-activities` | Jack of All Trades | Perform every activity type at least once. |
| `REP_50` | `rep-50` | Well Known | Reach 50 reputation. |

#### World Explorer

| Steam API Name | In-Game ID | In-Game Name | Description |
|---|---|---|---|
| `COUNTRIES_3` | `countries-3` | Frequent Flyer | Scout in 3 countries. |
| `COUNTRIES_6` | `countries-6` | Globetrotter | Scout in 6 countries. |
| `COUNTRIES_10` | `countries-10` | World Scout | Scout in 10 countries. |
| `COUNTRIES_15` | `countries-15` | Global Network | Scout in 15 countries. |
| `HOME_MASTERY` | `home-mastery` | Home Turf | Achieve full familiarity in your home country. |
| `ALL_CONTINENTS` | `all-continents` | Continental | Submit a report on a player from every continent. |

#### Hidden Achievements

Hidden achievements must be marked as **Hidden** in the Steamworks dashboard so
that Steam shows "Hidden Achievement" to players before they unlock them —
matching the in-game behaviour.

| Steam API Name | In-Game ID | In-Game Name | Description |
|---|---|---|---|
| `BLIND_FAITH` | `blind-faith` | Blind Faith | Submit a report on a player with 0 observations. |
| `TRIPLE_STORYLINE` | `triple-storyline` | Drama Magnet | Have 3 active narrative events in the same season. |
| `SURVIVED_FIRING` | `survived-firing` | Comeback Kid | Continue playing after being fired. |
| `WATCHLIST_10` | `watchlist-10` | The Shortlist | Have 10 players on your watchlist. |
| `MARATHON` | `marathon` | Marathon Scout | Play for 50 or more weeks total. |

---

## 4. Cloud Save Configuration

### How Cloud Saves Work in TalentScout

TalentScout uses Steam Cloud to sync save files across a player's devices.
The `SteamInterface.setCloudSave(slot, data)` / `getCloudSave(slot)` methods
handle writing and reading serialised game state for each slot.

### File Naming Convention

Steam Cloud operates on named file paths. The following names are used:

| Slot | File name |
|---|---|
| Auto-save | `talentscout_autosave.json` |
| Slot 1 | `talentscout_slot_1.json` |
| Slot 2 | `talentscout_slot_2.json` |
| Slot 3 | `talentscout_slot_3.json` |
| Slot 4 | `talentscout_slot_4.json` |
| Slot 5 | `talentscout_slot_5.json` |

### Quota Recommendation

Valve requires you to declare a per-user quota in the Steamworks dashboard.

- 6 files × 2 MB each = **12 MB total** recommended quota.
- Navigate to **Technical Tools → Edit Steamworks Settings → Cloud → Steam Cloud** and
  set the quota to at least 12 MB.
- This leaves headroom for future save-format expansion without requiring a
  quota change submission.

### Steamworks Dashboard Setup

1. Navigate to **Technical Tools → Edit Steamworks Settings → Cloud → Steam Cloud**.
2. Enable Steam Cloud for your app.
3. Set the per-user quota as described above.
4. Set the file root to the game install directory (the default is fine for
   most configurations).
5. Publish the changes.

---

## 5. Rich Presence Configuration

### Overview

Rich Presence strings appear in the Steam friends list next to a player's name,
e.g. "Scouting in France — Season 2, Week 14".

The VDF configuration file is located at:

```
electron/rich_presence.vdf
```

### Token Reference

The file defines the following tokens and their display formats:

| Token | Format string | When used |
|---|---|---|
| `#StatusScouting` | `Scouting in %country% — Season %season%, Week %week%` | Player is scouting in a country |
| `#StatusWatching` | `Watching %fixture% — Season %season%, Week %week%` | Player is watching a live fixture |
| `#StatusReporting` | `Writing a scouting report — Season %season%, Week %week%` | Player is writing a report |
| `#StatusPlaying` | `Season %season%, Week %week%` | Generic in-game fallback |

### Variables

The following Rich Presence variables must be set at runtime via
`SteamInterface.setRichPresence(key, value)`:

| Variable key | Expected value | Example |
|---|---|---|
| `steam_display` | One of the `#Status*` token names | `#StatusScouting` |
| `country` | Country name string | `France` |
| `fixture` | Match description string | `PSG vs Lyon` |
| `season` | Season number as string | `2` |
| `week` | Week number as string | `14` |

### Uploading to the Steamworks Dashboard

1. Navigate to **Technical Tools → Edit Steamworks Settings → Stats & Achievements → Rich Presence**.
2. Upload `electron/rich_presence.vdf`.
3. Publish the changes.

---

## 6. Testing

### Testing with Spacewar (App ID 480)

Spacewar is Valve's public test app and is available to all Steam accounts.
You can use it to exercise the Steam API without publishing your own game:

1. Set `steam_appid.txt` to `480`.
2. Run the Electron app normally: `npm run electron:dev` (or equivalent).
3. Steamworks will initialise against Spacewar's app context.
4. Achievement API calls succeed — Steam records them against Spacewar, not
   your real game.

> Do not ship a build with `steam_appid.txt` containing `480`. This is only for
> local development. Set it to your real App ID before any external testing or
> release build.

### Resetting Achievements During Development

From the Steamworks dashboard:

1. Go to **Your Game → Stats & Achievements**.
2. Click **Reset All Stats and Achievements** for your Steam account.

From within the game (available in debug/dev builds only), the
`SteamInterface.resetAllAchievements()` method calls the equivalent SDK
function. It is a no-op in web/production builds.

From the Steam client itself, you can also use the **Achievement Unlocker**
community tool against App ID 480 during development.

### Verifying Achievement Unlock Flow

1. Launch the Electron build with a valid `steam_appid.txt`.
2. Trigger the condition for any achievement (e.g. submit a report to fire
   `first-report`).
3. Open the Steam overlay (Shift+Tab) and navigate to your achievements for
   the app — the achievement should appear as unlocked.
4. Alternatively, check the Steamworks partner dashboard under **Stats &
   Achievements → Achievement Percentages**.

To confirm the mapping layer is working end-to-end:

```
achievementStore.checkAndUnlock(gameState)
  └─ checkAchievements(state)      → returns satisfied IDs
  └─ filter already-unlocked       → newlyUnlocked[]
  └─ getSteamAchievementName(id)   → looks up STEAM_ACHIEVEMENT_MAP
  └─ steam.unlockAchievement(name) → IPC → native steamworks.js call
```

### Verifying Cloud Saves

1. Save a game to any slot on Device A.
2. Wait for Steam Cloud to sync (the progress indicator disappears from the
   Steam client taskbar icon).
3. On Device B (or after clearing local save data), load from the same slot.
4. The game state should be identical on both devices.

To force a sync during development, right-click the game in your Steam library,
choose **Properties → Cloud Saves**, and use the **Sync** button.

---

## 7. Build and Distribution

### SDK Redistribution Files Required Per Platform

The Electron build must bundle the correct native library for each target
platform. These files come from the Steamworks SDK.

| Platform | File | SDK source |
|---|---|---|
| Windows (64-bit) | `steam_api64.dll` | `sdk/redistributable_bin/win64/steam_api64.dll` |
| macOS | `libsteam_api.dylib` | `sdk/redistributable_bin/osx/libsteam_api.dylib` |
| Linux (64-bit) | `libsteam_api.so` | `sdk/redistributable_bin/linux64/libsteam_api.so` |

Place all three files in the project root so they are discoverable during
development. The `electron-builder` config packages them automatically via
`extraFiles`.

### electron-builder extraFiles Configuration

Add the following to your `electron-builder` configuration (typically in
`package.json` under the `"build"` key, or in `electron-builder.config.js`):

```json
{
  "extraFiles": [
    {
      "from": "steam_appid.txt",
      "to": "steam_appid.txt"
    },
    {
      "from": "steam_api64.dll",
      "to": "steam_api64.dll",
      "filter": ["win"]
    },
    {
      "from": "libsteam_api.dylib",
      "to": "libsteam_api.dylib",
      "filter": ["mac"]
    },
    {
      "from": "libsteam_api.so",
      "to": "libsteam_api.so",
      "filter": ["linux"]
    }
  ]
}
```

This ensures the native library lands next to the unpacked Electron binary in
the final installer, which is where `steamworks.js` expects to find it.

### Verifying the Final Build

After generating a production build:

1. Locate the unpacked output directory (e.g. `dist/win-unpacked/` on Windows).
2. Confirm `steam_appid.txt`, `steam_api64.dll` (or the platform equivalent),
   and the `resources/` folder all exist in the same directory as the `.exe`
   (or `.app` bundle on macOS).
3. Launch the binary directly (not via `npm run`). Steam must be running.
4. The Steam overlay should activate on Shift+Tab, confirming the SDK
   initialised correctly.
5. Unlock a test achievement and verify it appears in the Steam client.

### Checklist Before Submitting a Steam Build

- [ ] `steam_appid.txt` contains your real App ID (not `480`).
- [ ] All 45 achievements are created in the Steamworks dashboard with matching API names.
- [ ] Cloud save quota is set to at least 12 MB.
- [ ] `electron/rich_presence.vdf` has been uploaded to the dashboard.
- [ ] SDK redistribution binaries are bundled via `extraFiles`.
- [ ] `resetAllAchievements()` is not callable in production builds (it is a no-op in the `NoopSteamInterface`; ensure the Electron bridge does not expose it to release builds, or gate it behind a dev flag).
- [ ] The game passes Valve's technical review checklist before submitting for review.
