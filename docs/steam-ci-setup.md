# Steam CI Upload - One-Time Setup

TalentScout uses a two-stage release flow:

1. Push a `v*` tag to create an exact candidate packaging run.
2. Certify that exact run externally, then manually promote it.

Pushing a `v*` tag does not upload Steam depots and does not create a GitHub
release. The tag only produces candidate artifacts bound to the exact source
tag, commit SHA, source tree, package manifest, and workflow run ID. Valve
redistributables are proprietary, so CI provisions verified binaries from
encrypted GitHub Secrets instead of committing them.

## Required Secrets

| Secret | Description |
|--------|-------------|
| `STEAM_USERNAME` | Steam developer account username (for example `gummy19vp`) |
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

Candidate runs intended for signed promotion fail closed if a redistributable,
its checksum, or required signing credentials are absent. Verification-only
workflow runs may omit Steam SDK or signing secrets, but those artifacts are
explicitly non-Steam and non-production. They are useful for testing only and
must never be treated as promotion-eligible packages.

Publish each redistributable to access-controlled object storage or a private
release, then record its checksum:

```bash
sha256sum steam_api64.dll
```

Repeat for `libsteam_api.dylib` and `libsteam_api.so`. Store the private HTTPS
URLs, lowercase hashes, and optional short-lived bearer token in the
corresponding secrets above. GitHub Secrets cannot hold these binaries directly
because of their size; never add them to source control.

## Generating `STEAM_CONFIG_VDF`

SteamCmd caches login credentials in `config.vdf` after a successful
interactive login. This lets CI authenticate without entering a password or 2FA
code.

1. Install SteamCmd locally if it is not already installed:
   ```bash
   # macOS (Homebrew)
   brew install --cask steamcmd

   # Ubuntu/Debian
   sudo apt-get install steamcmd
   ```
2. Log in interactively and complete password plus Steam Guard 2FA:
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

The cached token expires periodically. When a Steam authentication failure
appears in a promotion run, repeat the login and encoding steps above to
refresh the secret.

## How It Works

On a `v*` tag push:
1. The quality gate runs unit, migration, production-static Youth EA, smoke,
   accessibility, and candidate-bound certification checks.
2. Three platform jobs provision and verify SDK files, then build packages. If
   signing secrets are present, the candidate packages are production-signed.
   If signing secrets are intentionally omitted, the artifacts are
   verification-only and cannot be promoted.
3. Each unpacked build is uploaded as a GitHub Actions artifact
   (`steam-windows`, `steam-macos`, `steam-linux`) along with the broader
   candidate evidence bundle.
4. The run records the exact candidate provenance that later certification must
   match: candidate tag, full commit SHA, source tree, package manifest hash,
   and original workflow run ID.
5. The run stops there. It does not upload to Steam and does not create a
   GitHub release, including for final-looking tags.

After external/manual gates pass:
1. Run `Certify and Promote Existing Candidate` manually with the original
   candidate workflow run ID, the candidate tag, the independent certification
   ref, and explicit GitHub and/or Steam publication choices.
2. The promotion workflow reuses the original artifacts byte-for-byte instead
   of rebuilding them. It verifies the candidate tag, commit SHA, source tree,
   package manifest hash, and certification hashes before any publication step.
3. GitHub promotion creates a draft release only.
4. Steam promotion is allowed only when all of the following are true:
   - the operator explicitly requested Steam publication;
   - the `production-release` environment approval passed;
   - the tag is a final tag with no prerelease suffix;
   - all external/manual certification gates passed against the exact
     candidate.
5. Only then does SteamCmd run:
   ```text
   steamcmd +login <username> +run_app_build steamcmd/app_build_4455570.vdf +quit
   ```
6. The resulting build appears in the
   [Steamworks partner portal](https://partner.steamgames.com/apps/builds/4455570).

External/manual gates stay outside the candidate packaging run. At minimum,
keep NVDA, VoiceOver, moderated usability, paired-career replayability,
minimum-hardware, packaged Windows/macOS/Linux, store readiness, and final
operator approval as explicit release gates.

The ten-season canonical simulation runs separately in `nightly-soak.yml` with
a 30-minute job budget. Pull requests run the faster
manual-versus-fast-forward state-equivalence scenario; long soak failures stay
visible without making every code review wait several minutes.
