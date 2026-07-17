import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const checkOnly = process.argv.includes("--check");
const outputFlag = process.argv.find((argument) => argument.startsWith("--out="));
const outputPath = path.resolve(
  root,
  outputFlag?.slice("--out=".length)
    ?? "artifacts/release/generated/youth-perk-truth-table.json",
);
const testPath = "tests/invariants/youthPerkAuthority.test.ts";

const authorities = [
  {
    perkId: "youth_grassroots_access",
    consumer: "src/engine/core/calendar.ts",
    consumerToken: "hasGrassrootsAccess",
    formula: "Unlock active grassroots tournaments and street football when local familiarity is at least 20.",
    uiExplanation: "Grassroots and street-football activities appear in the Planner when their visible prerequisites are met.",
    testName: "makes Grassroots Access unlock grassroots tournaments and street football",
  },
  {
    perkId: "youth_raw_potential_reading",
    consumer: "src/engine/reports/reporting.ts",
    consumerToken: "canShowYouthProjection",
    formula: "Expose the observation-derived perceived PA star range for youth reports; never expose canonical potential.",
    uiExplanation: "The report draft gains a rough potential range after the perk unlocks.",
    testName: "makes Raw Potential Reading unlock the youth upside range",
  },
  {
    perkId: "youth_instinct_sharpening",
    consumer: "src/engine/youth/gutFeeling.ts",
    consumerToken: "gutFeelingMultiplier",
    formula: "Multiply gut-feeling trigger chance by 1.4 when prospect age is below 16.",
    uiExplanation: "The perk description states the under-16 trigger-rate multiplier.",
    testName: "makes Instinct Sharpening increase youth gut-feeling trigger odds",
  },
  {
    perkId: "youth_network_expansion",
    consumer: "src/engine/core/gameLoop.ts",
    consumerToken: "hasYouthNetworkTips",
    formula: "Roll a 25% weekly chance for a contact-grounded unsigned-youth lead.",
    uiExplanation: "Successful rolls arrive as named inbox leads with a prospect link.",
    testName: "makes Youth Network tips appear only after the perk unlocks",
  },
  {
    perkId: "youth_placement_reputation",
    consumer: "src/engine/youth/academyPlacementCase.ts",
    consumerToken: "placementReputationBonus * 20",
    formula: "Map the 0.25 trust factor to +5 academy-decision score, bounded by the decision model.",
    uiExplanation: "Decision reasons name the +5 trusted-weight adjustment; it cannot bypass mobility or evidence gates.",
    testName: "makes Placement Reputation change academy club decisions",
  },
  {
    perkId: "youth_wonderkid_radar",
    consumer: "src/stores/actions/weeklyYouthObservationActivities.ts",
    consumerToken: "createWonderkidRadarAlert",
    formula: "Alert only for age 16 or younger with perceived PA high at least 4 stars and confidence at least 0.25.",
    uiExplanation: "The inbox calls it an uncertain high-upside signal and asks for follow-up evidence.",
    testName: "makes Wonderkid Radar produce evidence-based alerts",
  },
  {
    perkId: "youth_academy_whisperer",
    consumer: "src/engine/core/calendar.ts",
    consumerToken: "hasTrialDayAccess",
    formula: "Unlock academy trial-day activity when an academy coach/director relationship is at least 40.",
    uiExplanation: "The Planner shows the trial-day action only when the perk and contact prerequisite are active.",
    testName: "makes Academy Whisperer unlock academy trial days",
  },
  {
    perkId: "youth_generational_eye",
    consumer: "src/stores/actions/observationActions.ts",
    consumerToken: "paEstimateMargin",
    formula: "Attach a gut-feeling PA estimate with a base ±5 canonical-point margin, further bounded by existing equipment logic.",
    uiExplanation: "The reflection narrative labels the estimate as a gut feeling rather than verified truth.",
    testName: "makes Generational Eye reveal a bounded PA estimate during reflection",
  },
];

function read(relativePath) {
  return readFileSync(path.resolve(root, relativePath), "utf8");
}

const perkSourcePath = "src/engine/specializations/perks.ts";
const perkSource = read(perkSourcePath);
const youthSection = perkSource.split("// Youth Scout")[1]?.split("// First Team Scout")[0] ?? "";
const shippedIds = [...youthSection.matchAll(/\bid:\s*"(youth_[^"]+)"/g)]
  .map((match) => match[1]);
const registeredIds = authorities.map((entry) => entry.perkId);
const failures = [];

for (const perkId of shippedIds) {
  if (!registeredIds.includes(perkId)) failures.push(`Missing authority for ${perkId}`);
}
for (const perkId of registeredIds) {
  if (!shippedIds.includes(perkId)) failures.push(`Authority references unshipped perk ${perkId}`);
}

const sourceFiles = new Set([perkSourcePath, testPath]);
const testSource = read(testPath);
for (const authority of authorities) {
  sourceFiles.add(authority.consumer);
  const consumerSource = read(authority.consumer);
  if (!consumerSource.includes(authority.consumerToken)) {
    failures.push(`${authority.perkId} consumer token missing from ${authority.consumer}`);
  }
  if (!testSource.includes(authority.testName)) {
    failures.push(`${authority.perkId} invariant test name is missing`);
  }
}

const fingerprint = createHash("sha256");
for (const file of [...sourceFiles].sort()) {
  fingerprint.update(file);
  fingerprint.update("\0");
  fingerprint.update(read(file));
  fingerprint.update("\0");
}

let commitSha = "unknown";
let dirtyPaths = [];
try {
  commitSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  dirtyPaths = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3));
} catch {
  failures.push("Git provenance could not be resolved");
}

const report = {
  schemaVersion: 1,
  status: failures.length === 0 ? "passed" : "failed",
  commitSha,
  dirtyPaths,
  sourceFingerprint: fingerprint.digest("hex"),
  shippedPerkCount: shippedIds.length,
  authorities: authorities.map(({ consumerToken: _consumerToken, testName, ...entry }) => ({
    ...entry,
    test: `${testPath} :: ${testName}`,
  })),
  failures,
};

if (!checkOnly) {
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

if (failures.length > 0) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(`Youth perk truth table passed: ${authorities.length}/${shippedIds.length} perks have a consumer, formula, UI explanation, and invariant test.`);
if (!checkOnly) console.log(`Wrote ${path.relative(root, outputPath)}`);
