import { describe, expect, it } from "vitest";
import { createRNG } from "@/engine/rng";
import { generateSquad } from "@/engine/players/generation";
import type { ClubData } from "@/data/types";

const club: ClubData = { id: "coverage-club", name: "Coverage Club", shortName: "COV", reputation: 24, scoutingPhilosophy: "marketSmart", youthAcademyRating: 8, budget: 850_000 };

describe("initial professional squad coverage", () => {
  it("retains a goalkeeper when the seeded shuffle would trim all three", () => {
    const squad = generateSquad(createRNG("keeper-coverage-20164"), club, 3);
    expect(squad).toHaveLength(22);
    expect(squad.some((player) => player.position === "GK")).toBe(true);
  });

  it.each([22, 23, 24, 25, 26, 27, 28])("honors a seeded requested squad size of %i", (size) => {
    const seed = Array.from({ length: 100 }, (_, index) => `squad-size-${index}`)
      .find((candidate) => createRNG(candidate).nextInt(22, 28) === size);
    expect(seed).toBeDefined();
    const squad = generateSquad(createRNG(seed!), club, 3);
    expect(squad).toHaveLength(size);
    expect(new Set(squad.map((player) => player.id)).size).toBe(size);
    expect(squad.every((player) => player.clubId === club.id)).toBe(true);
    expect(squad.some((player) => player.position === "GK")).toBe(true);
  });

  it("replays the complete squad and RNG continuation from the same seed", () => {
    const first = createRNG("squad-coverage-replay");
    const second = createRNG("squad-coverage-replay");
    expect(generateSquad(first, club, 3)).toEqual(generateSquad(second, club, 3));
    expect(first.next()).toBe(second.next());
  });
});
