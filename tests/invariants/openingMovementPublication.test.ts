import { describe, expect, it, vi } from "vitest";
import type { GameState } from "@/engine/core/types";
import { RNG } from "@/engine/rng";
import { recruitForSeasonOpening } from "@/engine/freeAgents/seasonOpening";
import * as openingLoans from "@/engine/freeAgents/openingLoans";
import { getLifecycleWorld, withLifecycleWorld, type LifecycleWorldState } from "@/engine/world/playerLifecycle";
import * as archive from "@/engine/world/movementRowsArchive";
import { legacyRecruitForSeasonOpening } from "./openingRecruitment.legacy.fixture";
import { openingPublicationWorld } from "./openingMovementPublication.fixture";

// Runtime-semantic baseline: old two-argument implementation ignores the options object.
const merge = withLifecycleWorld as (state: GameState, slice: LifecycleWorldState, options?: { compactMovementHistory?: boolean }) => GameState;
const fields = ["players", "clubs", "activeLoans", "loanHistory", "retiredPlayers", "retiredPlayerIds", "freeAgentPool"] as const;
const tail = (rng: RNG) => Array.from({ length: 8 }, () => rng.next());
function acceptingRng(seed: string): RNG {
  const rng = new RNG(seed), ordinaryChance = rng.chance.bind(rng);
  // Force the acceptance path while retaining its ordinary RNG consumption.
  rng.chance = probability => { ordinaryChance(probability); return true; };
  return rng;
}
function pair(input: GameState, seed: string, accept = true) {
  const initial = structuredClone(input);
  const expectedInput = structuredClone(input), actualInput = structuredClone(input);
  const expectedRng = accept ? acceptingRng(seed) : new RNG(seed);
  const actualRng = accept ? acceptingRng(seed) : new RNG(seed);
  const expected = legacyRecruitForSeasonOpening(expectedInput, expectedRng);
  const actual = recruitForSeasonOpening(actualInput, actualRng);
  expect(actual).toStrictEqual(expected);
  expect(archive.expandPlayerMovementHistory(actual.playerMovementHistory)).toStrictEqual(archive.expandPlayerMovementHistory(expected.playerMovementHistory));
  expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
  expect(tail(actualRng)).toStrictEqual(tail(expectedRng));
  expect(actualInput).toStrictEqual(initial); expect(expectedInput).toStrictEqual(initial);
  return { expected, actual };
}

describe("opening recruitment movement publication", () => {
  it("preserves the default packed boundary and all eight authoritative slice fields while allowing owned raw publication", () => {
    const input = openingPublicationWorld(false), before = structuredClone(input);
    const slice = getLifecycleWorld(input);
    const expectedStored = archive.compactPlayerMovementHistory(slice.playerMovementHistory);
    expect(Array.isArray(expectedStored)).toBe(false);
    const ordinary = merge(input, slice), explicit = merge(input, slice, { compactMovementHistory: true }), deferred = merge(input, slice, { compactMovementHistory: false });
    expect(merge(input, slice, {})).toStrictEqual(ordinary);
    expect(ordinary).toStrictEqual(explicit);
    expect(ordinary.playerMovementHistory).toStrictEqual(expectedStored);
    expect(deferred.playerMovementHistory).toBe(slice.playerMovementHistory);
    expect(archive.expandPlayerMovementHistory(ordinary.playerMovementHistory)).toStrictEqual(slice.playerMovementHistory);
    for (const field of fields) {
      expect(ordinary[field]).toBe(slice[field]); expect(deferred[field]).toBe(slice[field]);
    }
    expect(deferred.inbox).toBe(input.inbox);
    expect(input).toStrictEqual(before);
  });

  it.each([false, true])("matches complete legacy results and RNG after eight signings with packedInput=%s", packedInput => {
    const input = openingPublicationWorld(false);
    if (packedInput) input.playerMovementHistory = archive.compactPlayerMovementHistory(input.playerMovementHistory);
    const expectedInput = structuredClone(input), actualInput = structuredClone(input), before = structuredClone(input);
    const expectedRng = acceptingRng("eight-publications"), actualRng = acceptingRng("eight-publications");
    const expected = legacyRecruitForSeasonOpening(expectedInput, expectedRng);
    const compact = vi.spyOn(archive, "compactPlayerMovementHistory");
    let actual: GameState;
    try {
      actual = recruitForSeasonOpening(actualInput, actualRng);
      // This bound prevents redoing complete history packing per accepted offer; this fixture signs in all three existing phases.
      expect(compact.mock.calls.length).toBeGreaterThan(0);
      expect(compact.mock.calls.length).toBeLessThanOrEqual(3);
    } finally { compact.mockRestore(); }
    expect(actual!).toStrictEqual(expected);
    expect(archive.expandPlayerMovementHistory(actual!.playerMovementHistory)).toStrictEqual(archive.expandPlayerMovementHistory(expected.playerMovementHistory));
    expect(JSON.stringify(actual!)).toBe(JSON.stringify(expected));
    expect(tail(actualRng)).toStrictEqual(tail(expectedRng));
    expect(actualInput).toStrictEqual(before); expect(expectedInput).toStrictEqual(before);
    expect(actual!.freeAgentPool.totalSignedThisSeason).toBe(8);
    expect(actual!.clubs.vacancy.budget).toBe(92_000);
    expect(actual!.clubs.vacancy.playerIds).toHaveLength(18);
    expect(actual!.players["vacancy-0"]).toBe(actualInput.players["vacancy-0"]);
    expect(actual!.inbox[0]).toBe(actualInput.inbox[0]);
    expect((actual! as unknown as { publicationOpaqueFacts: object }).publicationOpaqueFacts)
      .toBe((actualInput as unknown as { publicationOpaqueFacts: object }).publicationOpaqueFacts);
    expect(Array.isArray(actual!.playerMovementHistory)).toBe(false);
    const moves = archive.expandPlayerMovementHistory(actual!.playerMovementHistory);
    expect(moves.slice(0, 32)).toStrictEqual(archive.expandPlayerMovementHistory(input.playerMovementHistory));
    expect(moves.slice(32).map(move => move.type)).toStrictEqual(Array(8).fill("freeAgentSigning"));
    expect(actual!.inbox.slice(1).map(notice => notice.id)).toStrictEqual(moves.slice(32).map(move => `season-opening-notice:${move.id}`));
  });

  it("retains keeper-loan interleaving, complete obligations and notice order before later keeper-cover and depth signings", () => {
    const input = openingPublicationWorld(true);
    input.playerMovementHistory = archive.compactPlayerMovementHistory(input.playerMovementHistory);
    const ordinaryLoans = openingLoans.recruitOpeningGoalkeeperLoans;
    const loanInputs: { stored: unknown; packed: boolean }[] = [];
    const loans = vi.spyOn(openingLoans, "recruitOpeningGoalkeeperLoans").mockImplementation((state, rng) => {
      loanInputs.push({ stored: structuredClone(state.playerMovementHistory), packed: !Array.isArray(state.playerMovementHistory) });
      return ordinaryLoans(state, rng);
    });
    let actual = input;
    try { ({ actual } = pair(input, "mixed-publications")); } finally { loans.mockRestore(); }
    // Legacy and candidate each enter loans once after the first signing phase.
    expect(loanInputs).toHaveLength(2);
    expect(loanInputs[0].packed).toBe(true); expect(loanInputs[1].packed).toBe(true);
    expect(loanInputs[1].stored).toStrictEqual(loanInputs[0].stored);
    expect(JSON.stringify(loanInputs[1].stored)).toBe(JSON.stringify(loanInputs[0].stored));
    const moves = archive.expandPlayerMovementHistory(actual!.playerMovementHistory).slice(32);
    expect(actual.freeAgentPool.totalSignedThisSeason).toBe(8);
    expect(actual.activeLoans).toHaveLength(1);
    expect(actual.players.keeper).toMatchObject({ clubId: "host", contractClubId: "parent", onLoan: true, wage: 500 });
    expect(moves.map(move => move.type)).toStrictEqual(["freeAgentSigning", "loanStart", ...Array(7).fill("freeAgentSigning")]);
    expect(moves.map(move => move.id.split("_")[3])).toStrictEqual(Array.from({ length: 9 }, (_, index) => String(index + 32)));
    expect(actual.inbox.slice(1).map(notice => notice.id)).toStrictEqual(moves.map(move => move.type === "loanStart"
      ? `opening-loan-notice:${move.loanDealId}` : `season-opening-notice:${move.id}`));
    expect(actual.clubs.host.financialObligations?.length).toBeGreaterThan(0);
  });

  it("leaves loan-only default publication unchanged without an extra free-signing pack", () => {
    const input = openingPublicationWorld(true); input.freeAgentPool.agents = [];
    input.playerMovementHistory = archive.compactPlayerMovementHistory(input.playerMovementHistory);
    const expectedInput = structuredClone(input), actualInput = structuredClone(input), before = structuredClone(input);
    const expectedRng = acceptingRng("loan-only"), actualRng = acceptingRng("loan-only");
    const expected = legacyRecruitForSeasonOpening(expectedInput, expectedRng);
    const compact = vi.spyOn(archive, "compactPlayerMovementHistory");
    let actual: GameState;
    try {
      actual = recruitForSeasonOpening(actualInput, actualRng);
      expect(compact.mock.calls.length).toBe(1);
    } finally { compact.mockRestore(); }
    expect(actual!).toStrictEqual(expected); expect(JSON.stringify(actual!)).toBe(JSON.stringify(expected));
    expect(actual!.activeLoans).toHaveLength(1); expect(actual!.freeAgentPool.totalSignedThisSeason).toBe(0);
    expect(tail(actualRng)).toStrictEqual(tail(expectedRng));
    expect(actualInput).toStrictEqual(before); expect(expectedInput).toStrictEqual(before);
  });

  it.each([false, true])("preserves no-op identity and untouched history when packedInput=%s", packedInput => {
    const input = openingPublicationWorld(false); input.freeAgentPool.agents = [];
    if (packedInput) input.playerMovementHistory = archive.compactPlayerMovementHistory(input.playerMovementHistory);
    const before = structuredClone(input), expectedRng = new RNG("no-offer"), actualRng = new RNG("no-offer");
    const expected = legacyRecruitForSeasonOpening(input, expectedRng);
    const compact = vi.spyOn(archive, "compactPlayerMovementHistory");
    try {
      expect(recruitForSeasonOpening(input, actualRng)).toBe(input);
      expect(compact).not.toHaveBeenCalled();
    } finally { compact.mockRestore(); }
    expect(expected).toBe(input); expect(input).toStrictEqual(before);
    expect(tail(actualRng)).toStrictEqual(tail(expectedRng));
  });

  it("preserves default custom-row fallback and explicit raw array identity without reading hidden facts", () => {
    const input = openingPublicationWorld(false), slice = getLifecycleWorld(input);
    Object.defineProperty(slice.playerMovementHistory[0], "opaqueHidden", { value: { exact: [1, 1] }, writable: true, configurable: true });
    const ordinary = merge(input, slice), deferred = merge(input, slice, { compactMovementHistory: false });
    expect(ordinary.playerMovementHistory).toBe(slice.playerMovementHistory);
    expect(deferred.playerMovementHistory).toBe(slice.playerMovementHistory);
    expect(Object.getOwnPropertyDescriptor(slice.playerMovementHistory[0], "opaqueHidden")?.value).toStrictEqual({ exact: [1, 1] });
  });
});
