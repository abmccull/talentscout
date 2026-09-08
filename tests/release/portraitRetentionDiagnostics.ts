import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { GameState } from "@/engine/core/types";
import { portraitCoverage } from "@/engine/players/portraits/allocation";
import { canonicalPlayers } from "@/engine/players/portraits/state";
import type { PlayerPortraitState, PortraitWorld } from "@/engine/players/portraits/types";

/** Root delivery metadata may change; every gameplay field remains in the digest. */
export function persistentStateDigest(state: GameState): string {
  const { lastSaved: _lastSaved, ...gameplay } = state;
  void _lastSaved;
  const normalized = { ...gameplay, activeObservationSession: gameplay.activeObservationSession ?? null };
  const stable = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stable);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, stable(entry)]));
  };
  return createHash("sha256").update(JSON.stringify(stable(normalized))).digest("hex");
}

/** Inspect the source ledger without calling migration, which can repair missing owners. */
export function portraitRetentionDiagnostic(world: PortraitWorld) {
  const ledger = world.playerPortraits;
  const people = canonicalPlayers(world);
  const reservations = Object.entries(ledger?.reservations ?? {});
  const violations: string[] = [];
  const bindingOwners = new Map<string, string>();
  for (const [identityId, reservation] of reservations) {
    if (identityId !== reservation.identity.identityId) violations.push(`identity-key:${identityId}`);
    const binding = reservation.binding;
    if (!binding) continue;
    const face = binding.canonicalFaceSha256;
    const prior = bindingOwners.get(face);
    if (prior && prior !== identityId) violations.push(`reused-face:${face}:${prior}:${identityId}`);
    bindingOwners.set(face, identityId);
    if (ledger?.faceOwners[face] !== identityId) violations.push(`owner-mismatch:${identityId}:${face}`);
  }
  return {
    ...portraitCoverage(world),
    ledgerBytes: ledger ? Buffer.byteLength(JSON.stringify(ledger), "utf8") : 0,
    reservationBytes: Buffer.byteLength(JSON.stringify(ledger?.reservations ?? {}), "utf8"),
    ownershipBytes: Buffer.byteLength(JSON.stringify(ledger?.faceOwners ?? {}), "utf8"),
    retainedPeopleWithoutPlayerRecord: reservations.filter(([, entry]) => !people.has(entry.playerId)).length,
    ownershipTombstonesWithoutReservation: Object.values(ledger?.faceOwners ?? {})
      .filter((identityId) => !ledger?.reservations[identityId]).length,
    violations: violations.sort(),
  };
}

/** Old bindings and tombstones remain reserved even after football history is compacted. */
export function portraitContinuityViolations(
  before: PlayerPortraitState | undefined, after: PlayerPortraitState | undefined,
): string[] {
  const failures: string[] = [];
  for (const [face, identity] of Object.entries(before?.faceOwners ?? {})) {
    if (after?.faceOwners[face] !== identity) failures.push(`released-or-reassigned-face:${face}`);
  }
  for (const [identity, prior] of Object.entries(before?.reservations ?? {})) {
    const next = after?.reservations[identity];
    if (!next) { failures.push(`lost-person:${identity}`); continue; }
    if (JSON.stringify(prior.identity) !== JSON.stringify(next.identity)
      || prior.playerId !== next.playerId
      || JSON.stringify(prior.firstSeen) !== JSON.stringify(next.firstSeen)) failures.push(`changed-person:${identity}`);
    // A waiting person may gain a first binding; an existing photograph cannot be replaced.
    if (prior.binding && JSON.stringify(prior.binding) !== JSON.stringify(next.binding)) failures.push(`changed-face:${identity}`);
  }
  return failures.sort();
}

export interface RetainedCheckpointReceipt {
  schemaVersion: 1;
  evidenceKind: "long-career-storage-input";
  candidateCommitSha: string;
  candidateTreeSha: string;
  sourceTreeClean: boolean;
  seed: string;
  completedSeason: number;
  currentSeason: number;
  canonicalTicks: number;
  file: string;
  sha256: string;
  bytes: number;
  persistentStateSha256: string;
  portrait: ReturnType<typeof portraitRetentionDiagnostic>;
  storageVerification: "not-run";
}

/** Retains input for a separate real-provider test; writing JSON is not storage proof. */
export async function retainStorageCheckpoint(input: {
  directory: string; state: GameState; completedSeason: number; canonicalTicks: number;
  candidateCommitSha: string; candidateTreeSha: string; sourceTreeClean: boolean;
}): Promise<RetainedCheckpointReceipt> {
  if (![1, 10, 30].includes(input.completedSeason)
    || input.state.currentSeason !== input.completedSeason + 1
    || input.state.worldHistory?.latestRecordedSeason !== input.completedSeason
    || input.canonicalTicks <= 0) throw new Error("Checkpoint is not a completed canonical season boundary");
  for (const sha of [input.candidateCommitSha, input.candidateTreeSha]) {
    if (!/^[a-f0-9]{40,64}$/.test(sha)) throw new Error("Checkpoint requires exact source identity");
  }
  const file = `completed-season-${input.completedSeason}.json`;
  const payload = JSON.stringify(input.state);
  const receipt: RetainedCheckpointReceipt = {
    schemaVersion: 1, evidenceKind: "long-career-storage-input",
    candidateCommitSha: input.candidateCommitSha, candidateTreeSha: input.candidateTreeSha,
    sourceTreeClean: input.sourceTreeClean, seed: input.state.seed,
    completedSeason: input.completedSeason, currentSeason: input.state.currentSeason,
    canonicalTicks: input.canonicalTicks, file,
    sha256: createHash("sha256").update(payload).digest("hex"),
    bytes: Buffer.byteLength(payload, "utf8"), persistentStateSha256: persistentStateDigest(input.state),
    portrait: portraitRetentionDiagnostic(input.state), storageVerification: "not-run",
  };
  if (receipt.portrait.violations.length) throw new Error(`Invalid checkpoint portrait ownership: ${receipt.portrait.violations.join(", ")}`);
  await mkdir(input.directory, { recursive: true });
  const path = resolve(input.directory, file);
  await writeFile(`${path}.partial`, payload, "utf8");
  await rename(`${path}.partial`, path);
  await writeFile(`${path}.receipt.json`, JSON.stringify(receipt, null, 2), "utf8");
  return receipt;
}
