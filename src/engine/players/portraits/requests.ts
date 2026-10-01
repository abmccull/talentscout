import { AGE_CHECKPOINTS, type PlayerPortraitState, type VisualDNA } from "./types";
import { pendingVisualDNA } from "./identity";
export interface PortraitGenerationRequest {
  schemaVersion: 1;
  requestId: string;
  identityId: string;
  seed: string;
  dna: VisualDNA;
  artDirectionVersion: "documentary-v1";
  checkpoints: typeof AGE_CHECKPOINTS;
  output: { format: "webp"; width: 512; height: 640 };
  referenceRule: "create-canonical-face-then-reference-same-person-for-every-age";
  instruction: string;
}
/** Offline JSON export only. Contains controlled attributes, never arbitrary game text or credentials. */
export function exportPortraitRequests(ledger: PlayerPortraitState): PortraitGenerationRequest[] {
  return Object.values(ledger.reservations).filter((reservation) => !reservation.binding)
    .sort((left, right) => left.identity.identityId.localeCompare(right.identity.identityId))
    .map(({ identity }) => ({
      schemaVersion: 1, requestId: "portrait-request:v1:" + identity.identityId,
      identityId: identity.identityId, seed: identity.seed, dna: pendingVisualDNA(identity),
      artDirectionVersion: "documentary-v1", checkpoints: AGE_CHECKPOINTS,
      output: { format: "webp", width: 512, height: 640 },
      referenceRule: "create-canonical-face-then-reference-same-person-for-every-age",
      instruction: "Photoreal documentary football portrait. Preserve the same person's eye spacing, nose, mouth, facial proportions and distinctive features at every checkpoint. Show a believable adolescent at 15, mature athletic adults at 18 through 45, realistic skin, neutral unbranded training kit, overcast daylight, softly blurred football training ground, eye-level camera. No CGI, illustration, glamour, exaggerated aging or unrelated replacement faces.",
    }));
}
