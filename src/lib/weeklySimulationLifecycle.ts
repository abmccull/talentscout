/** Shared career ownership counter with no worker/engine/store dependencies. */
let lifecycleGeneration = 0;

export function getWeeklySimulationGeneration(): number {
  return lifecycleGeneration;
}

export function invalidateWeeklySimulationGeneration(): void {
  lifecycleGeneration += 1;
}
