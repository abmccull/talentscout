# Steam CI Upload — One-Time Setup

The `steam-upload` job in `.github/workflows/build.yml` automatically uploads all 3 platform builds to Steam depots when a `v*` tag is pushed. It requires two GitHub Secrets.

## Required Secrets

| Secret | Description |
|--------|-------------|
| `STEAM_USERNAME` | Steam developer account username (e.g. `gummy19vp`) |
| `STEAM_CONFIG_VDF` | Base64-encoded SteamCmd `config.vdf` with cached login token |

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

4. Add both secrets in GitHub:
   - Go to **Settings > Secrets and variables > Actions**
   - Create `STEAM_USERNAME` with value `gummy19vp`
   - Create `STEAM_CONFIG_VDF` with the base64 output from step 3

## Token Expiration

The cached token expires periodically. When the `steam-upload` job fails with an authentication error, repeat steps 2-4 above to refresh the secret.

## How It Works

On a `v*` tag push:
1. Three platform build jobs produce unpacked directories (`dist/win-unpacked/`, `dist/mac/`, `dist/linux-unpacked/`)
2. Each is uploaded as a GitHub Actions artifact (`steam-windows`, `steam-macos`, `steam-linux`)
3. The `steam-upload` job downloads all three, decodes `config.vdf`, and runs:
   ```
   steamcmd +login <username> +run_app_build steamcmd/app_build_4455570.vdf +quit
   ```
4. SteamCmd reads the depot VDFs which reference the `dist/` directories and uploads all three depots atomically
5. The new build appears in the [Steamworks partner portal](https://partner.steamgames.com/apps/builds/4455570)
