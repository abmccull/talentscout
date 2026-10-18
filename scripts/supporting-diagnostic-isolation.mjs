// Supporting instrumentation is never admitted into the fixed canonical artifact set.
export const supportingDiagnosticKeys = Object.freeze([
  "SOAK_SUPPORTING_DIAGNOSTICS_ONLY", "SOAK_BALANCE_DIAGNOSTICS_ONLY", "SOAK_YOUTH_CONSEQUENCES_ONLY",
  "SOAK_GAME_SYSTEMS_DIAGNOSTICS_DIRECTORY", "SOAK_GAME_SYSTEMS_CHECKPOINTS", "SOAK_STORAGE_CHECKPOINT_DIRECTORY",
  "SOAK_BALANCE_DIAGNOSTICS_OUTPUT", "SOAK_YOUTH_CONSEQUENCES_OUTPUT",
]);
export function assertNoSupportingDiagnostics(environment = process.env) {
  const selected = supportingDiagnosticKeys.filter((key) => environment[key] !== undefined);
  if (selected.length) throw Object.assign(new Error(
    `ERR_RELEASE_ARTIFACT_UNSUPPORTED_MODE: supporting diagnostics require their separate configuration (${selected.join(", ")})`,
  ), { code: "ERR_RELEASE_ARTIFACT_UNSUPPORTED_MODE" });
}
