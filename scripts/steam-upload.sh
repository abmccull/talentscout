#!/usr/bin/env bash
# ============================================================================
# steam-upload.sh — Build TalentScout and upload to Steam depots
#
# Usage:
#   ./scripts/steam-upload.sh              # Build + upload (prompts for Steam login)
#   ./scripts/steam-upload.sh --build-only # Build only, don't upload
#   ./scripts/steam-upload.sh --skip-build # Upload existing dist/ without rebuilding
#
# Prerequisites:
#   1. SteamCmd installed and in PATH (or set STEAMCMD_PATH)
#   2. Steam developer account with upload permissions for App 4455570
#   3. Depot IDs created in Steamworks partner portal (4455571/4455572/4455573)
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STEAMCMD="${STEAMCMD_PATH:-steamcmd}"

BUILD_ONLY=false
SKIP_BUILD=false

for arg in "$@"; do
  case "$arg" in
    --build-only) BUILD_ONLY=true ;;
    --skip-build) SKIP_BUILD=true ;;
  esac
done

echo "=== TalentScout Steam Build & Upload ==="
echo "Project root: $PROJECT_ROOT"
echo ""

# ── Step 1: Build ────────────────────────────────────────────────────────────

if [ "$SKIP_BUILD" = false ]; then
  echo ">> Step 1: Building Next.js static export..."
  cd "$PROJECT_ROOT"
  npm run build
  echo "   ✓ Next.js build complete (out/ directory)"
  echo ""

  echo ">> Step 2: Packaging with electron-builder..."
  npx electron-builder --publish never
  echo "   ✓ Electron packaging complete (dist/ directory)"
  echo ""

  echo ">> Build artifacts:"
  ls -la "$PROJECT_ROOT/dist/" 2>/dev/null || echo "   (no dist/ found — check for errors above)"
  echo ""
else
  echo ">> Skipping build (--skip-build)"
  echo ""
fi

if [ "$BUILD_ONLY" = true ]; then
  echo ">> Done (--build-only). Artifacts are in dist/"
  echo "   Upload manually with: steamcmd +login <user> +run_app_build steamcmd/app_build_4455570.vdf +quit"
  exit 0
fi

# ── Step 2: Upload to Steam ──────────────────────────────────────────────────

echo ">> Step 3: Uploading to Steam via SteamCmd..."
echo "   You will be prompted for your Steam developer credentials."
echo "   (Use Steam Guard code if 2FA is enabled)"
echo ""

if ! command -v "$STEAMCMD" &>/dev/null; then
  echo "ERROR: steamcmd not found in PATH."
  echo ""
  echo "Install SteamCmd:"
  echo "  macOS:   brew install steamcmd"
  echo "  Linux:   sudo apt install steamcmd"
  echo "  Windows: Download from https://developer.valvesoftware.com/wiki/SteamCMD"
  echo ""
  echo "Or set STEAMCMD_PATH to the full path of the steamcmd binary."
  exit 1
fi

cd "$PROJECT_ROOT"
"$STEAMCMD" +login "" +run_app_build "$PROJECT_ROOT/steamcmd/app_build_4455570.vdf" +quit

echo ""
echo "=== Upload complete ==="
echo ""
echo "Next steps:"
echo "  1. Go to https://partner.steamgames.com/apps/builds/4455570"
echo "  2. Find your new build in the list"
echo "  3. Set it live on a 'testing' branch to test via Steam client"
echo "  4. When ready, set it live on 'default' for public release"
