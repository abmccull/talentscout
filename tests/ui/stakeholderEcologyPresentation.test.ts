import { describe, expect, it } from "vitest";

import { memoryPersistenceLabel } from "@/components/game/stakeholderEcologyPresentation";

describe("stakeholderEcologyPresentation", () => {
  it("translates engine salience into player-facing memory language", () => {
    expect(memoryPersistenceLabel(90)).toBe("strong memory");
    expect(memoryPersistenceLabel(55)).toBe("active memory");
    expect(memoryPersistenceLabel(12)).toBe("fading memory");
  });
});
