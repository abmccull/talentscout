/** Wire shapes only: core state types must not depend on codec implementations. */
export interface MovementRowsArchiveV1 {
  movementRowsV1: [kind: 0 | 1, dictionary: string[], entries: unknown[][]];
}

export type StoredObservationSituationSnapshot = {
  readonly observationSituationV1: readonly [version: 1, presenceMask: number, undefinedMask: number, ...values: unknown[]];
};
