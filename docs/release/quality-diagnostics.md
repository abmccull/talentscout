# Supporting quality diagnostics

These commands retain development observations. They do not close human, provider, physical hardware, package, or release certification gates. Run against the final reviewed source and use a new external output directory for every attempt. Preserve failures; never increase an existing game budget to obtain a pass.

```powershell
node scripts/run-game-systems-diagnostics.mjs --profile=smoke --out=../game-systems-smoke-new
node scripts/run-career-balance-diagnostics.mjs --mode=smoke --out=../career-balance-smoke-new
```

The supporting configuration retains the existing weekly/calendar, CPU, wall, heap, save, collection and deterministic-state assertions. Instrumentation has overhead and does not establish interactive performance. It never emits a canonical campaign summary or modifies the 45-member transport. The canonical driver refuses supporting mode/output flags even when inherited as empty or false strings.

For separate long-career inputs:

```powershell
node scripts/run-game-systems-diagnostics.mjs --profile=long --seasons=30 --seeds=1 --concurrency=1 --out=../career-storage-inputs-new
```

Inspect `diagnostics.json` and the per-run diagnostic receipt. Retained S1/S10/S30 save inputs are beneath `<output>/release-soak-01--commercial/storage-inputs`; each must describe the clean source/build used by the browser test. Point `SOAK_STORAGE_CHECKPOINT_DIRECTORY` at that directory only for `e2e/regression/retained-storage-checkpoints.spec.ts`, after a matching instrumented build. Require three passes and zero skips. Simulation persistence is mocked; writing these input files does not prove IndexedDB, package saves, cloud conflicts, power-loss or disk-full recovery.

The balance full diagnostic (`--mode=full`) freezes eight discovery and four holdout seeds across commercial, cautious and aggressive policies for six seasons. Smoke uses a separate one-discovery/one-holdout namespace for one season. Existing late-career assertions may fail early; retain that result. Compare identical seeds across policies. Once inspected, holdout seeds are no longer unseen for subsequent tuning. Review earned income separately from opening money, debt, and asset cash; compare consequences, relationship changes and repeated wording. No heuristic policy simulation measures human enjoyment.

The bounded youth consequence scenario is also supporting-only: set `SOAK_YOUTH_CONSEQUENCES_ONLY=true`, set `SOAK_YOUTH_CONSEQUENCES_OUTPUT` to a new file in a newly owned directory, and run `node node_modules/vitest/vitest.mjs run --config vitest.supporting-diagnostics.config.ts`. Do not select the canonical configuration for that scenario.

Full release still requires the exact fresh 20x30/c3 campaign with a fresh seed-one replay under `canonical-release-soak.yml`, unchanged admitted budgets, real provider-bound transport, and every other current release gate. Sequential supporting observations cannot substitute for it.
