# Steam CI Upload — One-Time Setup

The release workflow builds signed packages and uploads all three Steam depots when a `v*` tag is pushed. Valve redistributables are proprietary, so CI provisions verified binaries from encrypted GitHub Secrets instead of committing them.

## Required Secrets

| Secret | Description |
|--------|-------------|
| `STEAM_USERNAME` | Steam developer account username (e.g. `gummy19vp`) |
| `STEAM_CONFIG_VDF` | Base64-encoded SteamCmd `config.vdf` with cached login token |
| `STEAM_SDK_WINDOWS_URL` | Private HTTPS download URL for `steam_api64.dll` from the licensed Steamworks SDK |
| `STEAM_SDK_WINDOWS_SHA256` | Lowercase SHA-256 for the downloaded Windows binary |
| `STEAM_SDK_MACOS_URL` | Private HTTPS download URL for `libsteam_api.dylib` |
| `STEAM_SDK_MACOS_SHA256` | Lowercase SHA-256 for the downloaded macOS binary |
| `STEAM_SDK_LINUX_URL` | Private HTTPS download URL for `libsteam_api.so` |
| `STEAM_SDK_LINUX_SHA256` | Lowercase SHA-256 for the downloaded Linux binary |
| `STEAM_SDK_DOWNLOAD_TOKEN` | Optional bearer token shared by the private download endpoints |
| `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` | Windows signing certificate and password |
| `CSC_LINK` / `CSC_KEY_PASSWORD` | Apple Developer ID certificate and password |
| `APPLE_ID` / `APPLE_ID_PASSWORD` / `APPLE_TEAM_ID` | Apple notarization credentials |

Tagged builds fail closed if a redistributable, its checksum, or required signing credentials are absent. Manual workflow builds may omit Steam SDK secrets and are then explicitly non-Steam verification artifacts.

Publish each redistributable to access-controlled object storage or a private release, then record its checksum:

```bash
sha256sum steam_api64.dll
```

Repeat for `libsteam_api.dylib` and `libsteam_api.so`. Store the private HTTPS URLs, lowercase hashes, and optional short-lived bearer token in the corresponding secrets above. GitHub Secrets cannot hold these binaries directly because of their size; never add them to source control.

## Generating `STEAM_CONFIG_VDF`

SteamCmd caches login credentials in `config.vdf` after a successful interactive login. This lets CI authenticate without entering a password or 2FA code.

1. Install SteamCmd locally (if not already installed):
   ```bash
   # macOS (Homebrew)
   brew install --cask steamcmd

   # Ubuntu/Debian
   sudo apt-get install steamcmd
   ```

2. Log in interactively — complete password + Steam Guard 2FA:
   ```bash
   steamcmd +login gummy19vp +quit
   ```

3. Locate and encode the config file:
   ```bash
   # macOS
   base64 < ~/Library/Application\ Support/Steam/config/config.vdf | pbcopy

   # Linux
   base64 < ~/.steam/config/config.vdf
   ```

4. Add the authentication secrets in GitHub:
   - Go to **Settings > Secrets and variables > Actions**
   - Create `STEAM_USERNAME` with value `gummy19vp`
   - Create `STEAM_CONFIG_VDF` with the base64 output from step 3

## Token Expiration

The cached token expires periodically. When the `steam-upload` job fails with an authentication error, repeat steps 2-4 above to refresh the secret.

## How It Works

On a `v*` tag push:
1. The quality gate runs unit, migration, production-static Youth EA, smoke, and accessibility tests.
2. Three platform jobs provision and verify SDK files, then build signed packages. The macOS app is normalized to `steam-stage/macos/` regardless of runner architecture.
3. Each unpacked build is uploaded as a GitHub Actions artifact (`steam-windows`, `steam-macos`, `steam-linux`).
4. The `steam-upload` job downloads all three, decodes `config.vdf`, and runs:
   ```
   steamcmd +login <username> +run_app_build steamcmd/app_build_4455570.vdf +quit
   ```
5. SteamCmd reads the depot VDFs and uploads all three depots atomically.
6. The new build appears in the [Steamworks partner portal](https://partner.steamgames.com/apps/builds/4455570).

The ten-season canonical simulation runs separately in `nightly-soak.yml` with a 30-minute job budget. Pull requests run the faster manual-versus-fast-forward state-equivalence scenario; long soak failures remain visible without making every code review wait several minutes.
