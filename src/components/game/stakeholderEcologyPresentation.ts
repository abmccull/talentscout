export function memoryPersistenceLabel(effectiveSalience: number): string {
  if (effectiveSalience >= 70) return "strong memory";
  if (effectiveSalience >= 40) return "active memory";
  return "fading memory";
}
