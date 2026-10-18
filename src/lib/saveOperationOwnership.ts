export interface SaveOperationOwnership {
  /** Live caller ownership; checked again inside the atomic mutation. */
  canCommit?: () => boolean;
  /** Background mirrors can hand ownership to the exact accepted career. */
  canMirror?: () => boolean;
}
export class SaveOperationCancelledError extends Error {
  constructor() { super("This save operation was cancelled because the active career changed."); this.name = "SaveOperationCancelledError"; }
}
export function assertSaveOperationOwned(ownership?: SaveOperationOwnership): void {
  if (ownership?.canCommit && !ownership.canCommit()) throw new SaveOperationCancelledError();
}
