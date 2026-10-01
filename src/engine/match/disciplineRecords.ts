import type { DisciplinaryRecord, Player } from "../core/types";

/** A present central ledger is authoritative, including an empty season reset. */
export function getPlayerDisciplinaryRecord(
  player: Player,
  records: Record<string, DisciplinaryRecord> | undefined,
): DisciplinaryRecord | undefined {
  return records === undefined ? player.disciplinaryRecord : records[player.id];
}

/** Remove the obsolete cache; all live discipline and suspensions stay in the ledger. */
export function withoutDisciplineMirror(player: Player): Player {
  if (player.disciplinaryRecord === undefined) return player;
  const { disciplinaryRecord: _obsoleteCache, ...canonicalPlayer } = player;
  return canonicalPlayer;
}
