import { describe, expect, it } from "vitest";
import { generateMoments } from "@/engine/observation/moments";
import { FOOTBALL_ACTIONS } from "@/engine/observation/footballActions";
import type { SessionPlayer } from "@/engine/observation/types";
import { generatePlayer } from "@/engine/players/generation";
import { RNG } from "@/engine/rng";

const participant: SessionPlayer = {
  playerId: "action-player", name: "Ryan Test", position: "CM",
  isFocused: true, focusedPhases: [0], focusHistory: [{ phaseIndex: 0, lens: "technical" }],
};

function sample(position = "CM") {
  return Array.from({ length: 160 }, (_, index) => generateMoments(
    new RNG(`action-${index}`), [{ ...participant, position }], "streetFootball", 0, 6,
  )).flat();
}

describe("football actions produce coherent evidence", () => {
  it("records pressure whenever the action explicitly involves a closing opponent", () => {
    const releases = sample().filter(moment => moment.actionId === "composed-release");
    expect(releases.length).toBeGreaterThan(5);
    for (const moment of releases) {
      expect(moment.description).toContain("opponent closed in");
      expect(moment.pressureContext).toBe(true);
    }
  });

  it("uses pressure temperament in the outcome without changing the attempted actions", () => {
    const player = generatePlayer(new RNG("pressure-profile"), {
      position: "CM", ageRange: [20, 20], abilityRange: [90, 90],
      nationality: "English", clubId: "club-test",
    });
    const low = { ...player, form: 0, morale: 5.5,
      attributes: { ...player.attributes, composure: 10, bigGameTemperament: 1 } };
    const high = { ...low, attributes: { ...low.attributes, bigGameTemperament: 20 } };
    let improvedReleases = 0;
    for (let index = 0; index < 160; index++) {
      const run = (profile: typeof player) => {
        const rng = new RNG(`pressure-${index}`);
        const moments = generateMoments(rng, [participant], "streetFootball", 0, 6,
          undefined, { [participant.playerId]: profile });
        return { moments, nextDraw: rng.next() };
      };
      const a = run(low);
      const b = run(high);
      expect(b.nextDraw).toBe(a.nextDraw);
      expect(b.moments.map(moment => moment.actionId)).toEqual(a.moments.map(moment => moment.actionId));
      a.moments.forEach((moment, slot) => {
        if (moment.actionId !== "composed-release") return;
        expect(b.moments[slot].quality).toBeGreaterThanOrEqual(moment.quality);
        if (b.moments[slot].quality > moment.quality) improvedReleases++;
      });
    }
    expect(improvedReleases).toBeGreaterThan(5);
  });

  it("never turns a dribble into passing or first-touch evidence", () => {
    const moments = sample();
    const dribbles = moments.filter((moment) => moment.actionId === "dribble");
    expect(dribbles.length).toBeGreaterThan(5);
    for (const moment of dribbles) {
      expect(moment.attributesHinted).toEqual(["dribbling"]);
      expect(moment.description).toMatch(/dribble|shifted the ball/);
    }
    for (const moment of moments) {
      const action = FOOTBALL_ACTIONS.find((candidate) => candidate.id === moment.actionId)!;
      expect(action).toBeDefined();
      expect(moment.attributesHinted).toEqual(action.attributes);
      const band = moment.quality >= 7 ? "high" : moment.quality >= 5 ? "medium" : "low";
      expect(moment.description).toBe(action.outcomes[band].replaceAll("{playerName}", participant.name));
      expect(moment.vagueDescription).not.toMatch(/impressive|clever|good|precise|won|intelligent/);
    }
  });

  it("does not give keepers outfield finishing, crossing or pressing sequences", () => {
    const moments = sample("GK");
    expect(moments.length).toBeGreaterThan(400);
    for (const moment of moments) {
      expect(FOOTBALL_ACTIONS.find((action) => action.id === moment.actionId)?.outfieldOnly).toBe(false);
    }
  });

  it("the attempted action stays fixed while relevant skill changes the outcome", () => {
    const player = generatePlayer(new RNG("action-profile"), {
      position: "CM", ageRange: [20, 20], abilityRange: [90, 90],
      nationality: "English", clubId: "club-test",
    });
    const weak = { ...player, attributes: { ...player.attributes, dribbling: 1 }, form: 0, morale: 5.5 };
    const strong = { ...weak, attributes: { ...weak.attributes, dribbling: 20 } };
    let compared = 0;
    for (let index = 0; index < 120; index++) {
      const run = (profile: typeof player) => generateMoments(
        new RNG(`causal-${index}`), [participant], "streetFootball", 0, 6,
        undefined, { [participant.playerId]: profile },
      );
      const low = run(weak);
      const high = run(strong);
      expect(run(weak)).toEqual(low);
      expect(high.map((moment) => moment.actionId)).toEqual(low.map((moment) => moment.actionId));
      low.forEach((moment, slot) => {
        if (moment.actionId === "dribble") {
          compared++;
          expect(high[slot].quality).toBeGreaterThan(moment.quality);
          expect(high[slot].description).not.toBe(moment.description);
        } else {
          expect(high[slot]).toEqual(moment);
        }
      });
    }
    expect(compared).toBeGreaterThan(5);
  });
});
