# Quality diagnostics

These commands produce supporting development evidence. They do not close human, provider, physical hardware, package or final release certification gates. Preserve failed runs and never increase an existing limit to obtain a pass.

## Balance and consequences

From the quality checkout, use a new external output directory:

```powershell
node scripts/run-career-balance-diagnostics.mjs --mode=smoke --out=../quality-implementation-20260904/balance-smoke-v1
```

Smoke runs one discovery and one held-out seed through three existing policies for one season. Its separate seed namespace preserves the full diagnostic's holdouts. Existing career progression assertions may fail at that early boundary; such failures remain visible and must be interpreted, not suppressed.

After integration and source freeze, `--mode=full` runs eight discovery plus four held-out seeds, each through commercial, cautious and aggressive policies for six seasons. Compare the same seed across policies; inspect the held-out cohort only after drawing conclusions from discovery runs. Subsequent tuning needs new unseen holdouts. The runner refuses existing output directories, strips inherited soak flags, checks source hashes and preserves incremental failures.

Read earned receipts separately from opening money, borrowing and asset cash; compare debt, relationships, report outcomes, reputation, delayed consequences and exact repeated wording. These ordinary policy heuristics do not prove optimal play or enjoyment. Diagnostic collection adds overhead, so use the separate interactive suite for performance claims.

## Long careers and real browser saves

Commit a reviewed development checkpoint and require a clean tree before building. Run the instrumented build once, preserve its log and `out-e2e/.e2e-bridge.json`, and keep source/build bytes fixed throughout the career and provider checks.

```powershell
$candidate = (git rev-parse HEAD).Trim()
$candidateTree = (git rev-parse 'HEAD^{tree}').Trim()
if (git status --porcelain --untracked-files=all) { throw 'Clean source required' }
$diagnosticRoot = "../quality-implementation-20260904/career-diagnostic-$candidate"
New-Item -ItemType Directory -Path $diagnosticRoot | Out-Null
npm.cmd run build:e2e
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }

# Remove inherited diagnostic modes and cap overrides before this bounded run.
Get-ChildItem Env:SOAK_* | Remove-Item
$env:SOAK_CANDIDATE_SHA = $candidate
$env:SOAK_CANDIDATE_TREE_SHA = $candidateTree
$env:SOAK_SEEDS = '1'
$env:SOAK_SEED_START = '1'
$env:SOAK_SEASONS = '30'
$env:SOAK_CONCURRENCY = '1'
$env:SOAK_RESUME = 'false'
$env:SOAK_REQUIRE_CLEAN_CANDIDATE = 'true'
$env:SOAK_SKIP_DETERMINISM_REPLAY = 'true'
$env:SOAK_OUTPUT = "$diagnosticRoot/one-seed-summary.json"
$env:SOAK_WORKER_DIRECTORY = "$diagnosticRoot/workers"
$env:SOAK_DIAGNOSTIC_CHECKPOINT_PATH = "$diagnosticRoot/last-completed-season.json"
$env:SOAK_PLAN_ONLY = 'true'
node scripts/run-long-career-release-soak.mjs
if ($LASTEXITCODE -ne 0) { throw 'Preflight failed' }
$env:SOAK_PLAN_ONLY = 'false'
node scripts/run-long-career-release-soak.mjs
if ($LASTEXITCODE -ne 0) { throw 'Preserve and investigate the failed career' }

$env:SOAK_STORAGE_CHECKPOINT_DIRECTORY = "$diagnosticRoot/workers/storage-inputs/$candidate/seed-1-run"
$env:PLAYWRIGHT_PORT = '3110'
npx.cmd playwright test e2e/regression/retained-storage-checkpoints.spec.ts --workers=1 --retries=0
```

Require 30 full season boundaries and positive canonical tick counts before the browser run. The three retained inputs must represent completed seasons 1, 10 and 30. The storage suite verifies served compiled bytes and matching clean commit/tree, commits to native IndexedDB, reads the row, closes the browser, and loads the same disk profile in a fresh process. Require exactly three passes and zero skips. This is ordinary browser recovery evidence; the simulation itself still mocks persistence. It does not test abrupt power loss, disk-full, packaged saves or cloud conflicts.

Report one seed without replay as a diagnostic even if the runner summary says passed. Full certification still requires 20 unique seeds and a fresh deterministic replay under the unchanged release policy.

## Portrait demand

The current catalog has 52 distinct faces, 46 eligible for new people, and eight age states per lineage. Six legacy-only lineages remain available for existing saves. Measure permanent face reservations plus people waiting for a pack; include tombstones and distinguish true exhausted capacity from an allocation failure while eligible faces remain free.

Size future capacity from the maximum demand within a career across the full cohort, with the proposed 20% reserve. Do not sum independent careers or recycle an owned face within a career. One representative run is a lower-bound planning input, not enough to commission the final art volume.
