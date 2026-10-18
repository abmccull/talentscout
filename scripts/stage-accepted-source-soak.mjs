// Compatibility refusal for the obsolete unbounded shard transport introduced on
// the historical quality branch. Its accepted/ordinary labels cannot certify the
// current c3 campaign, and its stripping of execution identity must not migrate.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const message = "Legacy source-soak transport cannot certify the canonical fresh 20x30/c3 campaign. Use scripts/stage-accepted-soak-evidence.mjs with --shards for bounded diagnostic-only staging, or the canonical workflow with its provider-bound --campaign inputs.";
function refuse() { throw Object.assign(new Error(message), { code: "ERR_LEGACY_SOAK_TRANSPORT_RETIRED" }); }
// Preserve named imports with an explicit error instead of silently accepting or
// partially copying old evidence. The candidate's bounded diagnostic path remains.
export async function selectSourceSoakArtifacts() { refuse(); }
export async function stageAcceptedSourceSoak() { refuse(); }
export async function verifyAcceptedSourceSoak() { refuse(); }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.error(message);
  process.exitCode = 1;
}
