import { expect, it } from "vitest";
import { RNG } from "@/engine/rng";
import { generatePhaseDescription, VENUE_DESCRIPTIONS } from "@/engine/observation/fullObservation";

it("reserves opening scenes for the first phase across venues and fallback matches", () => {
  for (const venue of [...Object.keys(VENUE_DESCRIPTIONS), "unknownMatch"]) {
    for (let seed = 0; seed < 24; seed++) {
      const describe = (phase: number) => generatePhaseDescription(venue, phase, 8, phase * 13, new RNG(`chronology-${seed}`));
      const first = describe(0);
      if (VENUE_DESCRIPTIONS[venue]) expect(VENUE_DESCRIPTIONS[venue].early).toContain(first);
      for (const phase of [1, 2]) {
        const next = describe(phase);
        expect(next).not.toMatch(/kick.?off|kicks off|whistle|match starts|session begins/i);
        if (venue !== "unknownMatch") expect(VENUE_DESCRIPTIONS[venue].early).not.toContain(next);
        expect(describe(phase)).toBe(next);
      }
    }
  }
});
