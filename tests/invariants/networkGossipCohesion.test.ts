import { describe, expect, it } from "vitest";

import type { Club, Contact, GameState, GossipItem, Player } from "@/engine/core/types";
import { RNG } from "@/engine/rng";
import {
  processWeeklyContactDecay,
} from "@/engine/network/contacts";
import {
  applyGossipAction,
  generateGossip,
  getActionableGossipItems,
  processGossipDecay,
  processWeeklyGossip,
} from "@/engine/network/gossip";

function gossip(overrides: Partial<GossipItem> = {}): GossipItem {
  return {
    id: "gossip-1",
    type: "youthProspect",
    playerId: "player-good",
    clubId: "club-1",
    reliability: 0.8,
    claimStatus: "accurate",
    revealedAt: { season: 1, week: 36 },
    expiresAt: { season: 2, week: 4 },
    content: "A prospect is attracting attention.",
    dismissed: false,
    ...overrides,
  };
}

function contact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: "contact-1",
    name: "Marta Silva",
    type: "grassrootsOrganizer",
    organization: "Regional FA",
    relationship: 80,
    reliability: 80,
    knownPlayerIds: ["player-good", "player-poor"],
    trustLevel: 80,
    loyalty: 60,
    interactionHistory: [],
    gossipQueue: [],
    referralNetwork: [],
    betrayalRisk: 0,
    ...overrides,
  };
}

const club = {
  id: "club-1",
  name: "Northbridge",
} as Club;

const goodProspect = {
  id: "player-good",
  firstName: "Good",
  lastName: "Prospect",
  clubId: club.id,
  age: 18,
  morale: 7,
  contractExpiry: 5,
  currentAbility: 82,
  potentialAbility: 148,
  injured: false,
} as Player;

const poorProspect = {
  ...goodProspect,
  id: "player-poor",
  firstName: "Limited",
  currentAbility: 88,
  potentialAbility: 96,
} as Player;

function stateAt(
  season: number,
  week: number,
  sourceContact: Contact,
): GameState {
  return {
    currentSeason: season,
    currentWeek: week,
    fixtures: {},
    contacts: { [sourceContact.id]: sourceContact },
    players: {
      [goodProspect.id]: goodProspect,
      [poorProspect.id]: poorProspect,
    },
    clubs: { [club.id]: club },
  } as GameState;
}

describe("network gossip cohesion", () => {
  it("keeps gossip alive across rollover until its canonical expiry date", () => {
    const source = contact({ gossipQueue: [gossip()] });

    const beforeExpiry = processGossipDecay(
      { [source.id]: source },
      { season: 2, week: 3 },
    );
    const atExpiry = processGossipDecay(
      { [source.id]: source },
      { season: 2, week: 4 },
    );

    expect(beforeExpiry[source.id].gossipQueue).toHaveLength(1);
    expect(atExpiry[source.id].gossipQueue).toHaveLength(0);
  });

  it("calculates contact decay across a season boundary", () => {
    const source = contact({
      relationship: 60,
      trustLevel: 60,
      loyalty: 100,
      lastInteractionAt: { season: 1, week: 35 },
    });

    const insideGrace = processWeeklyContactDecay(
      stateAt(2, 1, source),
      new RNG("contact-decay-inside-grace"),
    ).updatedContacts[source.id];
    const afterGrace = processWeeklyContactDecay(
      stateAt(2, 2, source),
      new RNG("contact-decay-after-grace"),
    ).updatedContacts[source.id];

    expect(insideGrace.relationship).toBe(60);
    expect(afterGrace.relationship).toBe(59);
    expect(insideGrace.trustLevel).toBe(60);
    expect(afterGrace.trustLevel).toBe(59);
  });

  it("makes reliable sources causally more accurate", () => {
    const sample = (reliability: number): { accurate: number; total: number } => {
      let accurate = 0;
      let total = 0;
      for (let index = 0; index < 500; index++) {
        const source = contact({ reliability, loyalty: 50 });
        const item = generateGossip(
          new RNG(`reliability-${reliability}-${index}`),
          source,
          stateAt(1, 10, source),
        );
        if (!item) continue;
        total += 1;
        if (item.claimStatus === "accurate") accurate += 1;
      }
      return { accurate, total };
    };

    const weak = sample(10);
    const strong = sample(100);
    expect(weak.total).toBeGreaterThan(100);
    expect(strong.total).toBeGreaterThan(100);
    expect(strong.accurate / strong.total).toBeGreaterThan(
      weak.accurate / weak.total + 0.3,
    );
  });

  it("produces actionable inbox gossip from the canonical contact queue", () => {
    const source = contact({ relationship: 100, trustLevel: 100, loyalty: 100 });
    let result: ReturnType<typeof processWeeklyGossip> | null = null;
    for (let index = 0; index < 100 && !result?.gossipMessages.length; index++) {
      result = processWeeklyGossip(
        stateAt(1, 36, source),
        new RNG(`actionable-gossip-${index}`),
      );
    }

    expect(result?.gossipMessages).toHaveLength(1);
    const generated = result!.updatedContacts[source.id].gossipQueue![0];
    expect(result!.gossipMessages[0]).toMatchObject({
      type: "gossip",
      relatedId: generated.id,
      relatedEntityType: "gossip",
    });

    const actionable = getActionableGossipItems(result!.updatedContacts);
    expect(actionable[0]).toMatchObject({ id: generated.id, contactId: source.id });
    const acted = applyGossipAction(result!.updatedContacts, generated.id, "actOn");
    expect(acted?.item.actionTaken).toBe("actOn");
    expect(acted?.updatedContacts[source.id].gossipQueue![0].actionTaken).toBe("actOn");
  });

  it("turns betrayal into a timed loss of network access", () => {
    const source = contact({
      relationship: 40,
      trustLevel: 0,
      loyalty: 0,
      gossipQueue: [gossip()],
      exclusiveWindow: {
        playerId: goodProspect.id,
        expiresAt: { season: 2, week: 4 },
      },
    });
    const state = stateAt(1, 36, source);
    let betrayed: ReturnType<typeof processWeeklyContactDecay> | null = null;
    for (let index = 0; index < 500 && !betrayed?.betrayalMessages.length; index++) {
      betrayed = processWeeklyContactDecay(state, new RNG(`betrayal-${index}`));
    }

    expect(betrayed?.betrayalMessages).toHaveLength(1);
    const updated = betrayed!.updatedContacts[source.id];
    expect(updated).toMatchObject({
      dormant: true,
      accessSuspendedUntil: { season: 2, week: 2 },
      gossipQueue: [],
    });
    expect(updated.exclusiveWindow).toBeUndefined();

    const otherwiseTrusted = contact({
      trustLevel: 100,
      relationship: 100,
      accessSuspendedUntil: { season: 2, week: 2 },
    });
    expect(generateGossip(
      new RNG("suspended-source"),
      otherwiseTrusted,
      stateAt(2, 1, otherwiseTrusted),
    )).toBeNull();
  });
});
