import { describe, expect, it } from "vitest";

import type { Contact, GameState } from "@/engine/core/types";
import { generateReferralOpportunity } from "@/engine/network/referrals";
import type { RNG } from "@/engine/rng";

function recordChance(onChance: (probability: number) => void): RNG {
  return {
    chance: (probability: number) => {
      onChance(probability);
      return false;
    },
  } as RNG;
}

function contact(overrides: Partial<Contact>): Contact {
  return {
    id: "contact-1",
    name: "Long Career Contact",
    type: "academyCoach",
    organization: "Academy FC",
    country: "england",
    relationship: 60,
    reliability: 50,
    trustLevel: 60,
    loyalty: 50,
    knownPlayerIds: [],
    referralNetwork: [],
    ...overrides,
  };
}

const state = {
  currentSeason: 30,
  currentWeek: 20,
  contacts: {},
} as GameState;

describe("network referral probability", () => {
  it("floors a damaged long-career relationship at zero probability", () => {
    let sampledChance = -1;

    generateReferralOpportunity(
      recordChance((probability) => {
        sampledChance = probability;
      }),
      contact({ loyalty: -100 }),
      state,
    );

    expect(sampledChance).toBe(0);
  });

  it("caps stacked long-career trust and loyalty at certainty", () => {
    let sampledChance = -1;

    generateReferralOpportunity(
      recordChance((probability) => {
        sampledChance = probability;
      }),
      contact({ trustLevel: 500, loyalty: 500 }),
      state,
    );

    expect(sampledChance).toBe(1);
  });
});
