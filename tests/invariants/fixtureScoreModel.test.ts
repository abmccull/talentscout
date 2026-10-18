import { expect, it } from "vitest";
import { calculateFixtureExpectedGoals, sampleFixtureGoals } from "@/engine/match/scoreModel";
import { RNG } from "@/engine/rng";

it("keeps the same scoring calibration while responding to strength, tactics and weather", () => {
  const even = calculateFixtureExpectedGoals(100, 100);
  expect(even.home + even.away).toBeCloseTo(2.9);
  expect(even.home).toBeGreaterThan(even.away);
  const weakerHome = calculateFixtureExpectedGoals(80, 100);
  expect(weakerHome.home).toBeLessThan(even.home);
  expect(weakerHome.away).toBeGreaterThan(even.away);
  expect(calculateFixtureExpectedGoals(100, 100, 1.2).home).toBeGreaterThan(even.home);
  const rain = calculateFixtureExpectedGoals(100, 100, 1, 1, "heavyRain");
  expect(rain.home + rain.away).toBeLessThan(even.home + even.away);
});

it("does not invent scoring strength for empty teams or emit non-finite goals", () => {
  expect(calculateFixtureExpectedGoals(0, 0)).toEqual({ home: 0, away: 0 });
  expect(calculateFixtureExpectedGoals(0, 100).home).toBe(0);
  expect(calculateFixtureExpectedGoals(100, 0).away).toBe(0);
  const rng = new RNG("empty-score");
  for (const value of [0, -1, NaN, Infinity]) expect(sampleFixtureGoals(value, rng)).toBe(0);
});

it("samples the intended discrete mean and zero-goal probability reproducibly", () => {
  const rng = new RNG("score-distribution"), repeated = new RNG("score-distribution");
  let total = 0, zeroes = 0;
  for (let sample = 0; sample < 50_000; sample++) {
    const goals = sampleFixtureGoals(1.3, rng);
    expect(goals).toBe(sampleFixtureGoals(1.3, repeated));
    total += goals; zeroes += Number(goals === 0);
  }
  expect(Math.abs(total / 50_000 - 1.3)).toBeLessThan(0.03);
  expect(Math.abs(zeroes / 50_000 - Math.exp(-1.3))).toBeLessThan(0.008);
});
