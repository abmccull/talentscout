import { describe, expect, it } from "vitest";
import type { Activity, Scout, WeekSchedule } from "@/engine/core/types";
import {
  addActivity,
  canScheduleActivity,
  capActivityQualityForFatigue,
  createWeekSchedule,
  enforceForcedRestSchedule,
  getNextConsecutiveRestWeeks,
  getScheduledActivityInstances,
  processCompletedWeek,
  resolveWeekActivityXp,
} from "@/engine/core/calendar";
import { createRNG } from "@/engine/rng";

function scout(fatigue = 0): Scout {
  return {
    id: "weekly-economy-scout",
    fatigue,
    careerPath: "independent",
    primarySpecialization: "youth",
    specializationLevel: 1,
    specializationXp: 0,
    unlockedPerks: [],
    skills: {
      technicalEye: 10,
      physicalAssessment: 10,
      psychologicalRead: 10,
      tacticalUnderstanding: 10,
      dataLiteracy: 10,
      playerJudgment: 10,
      potentialAssessment: 10,
    },
    attributes: {
      intuition: 10,
      memory: 10,
      networking: 10,
      persuasion: 10,
      adaptability: 10,
      endurance: 10,
    },
    skillXp: {},
    attributeXp: {},
  } as unknown as Scout;
}

function scheduleActivities(...activities: Activity[]): WeekSchedule {
  let schedule = createWeekSchedule(4, 1);
  let dayIndex = 0;
  for (const activity of activities) {
    schedule = addActivity(schedule, activity, dayIndex);
    dayIndex += activity.slots;
  }
  return schedule;
}

const study = (): Activity => ({
  type: "study",
  slots: 1,
  description: "Study scouting material",
});

describe("weekly action XP authority", () => {
  it("resolves quality for each activity instead of blending the week", () => {
    const schedule = scheduleActivities(study(), {
      type: "streetFootball",
      slots: 1,
      description: "Scout street football",
    });
    const instances = getScheduledActivityInstances(schedule);
    const result = resolveWeekActivityXp(schedule, scout(), {
      qualityMultiplierByInstance: new Map([
        [instances[0].key, 0.4],
        [instances[1].key, 2],
      ]),
    });

    expect(result.skillXpGained.dataLiteracy).toBe(2);
    expect(result.skillXpGained.technicalEye).toBe(6);
    expect(result.skillXpGained.psychologicalRead).toBe(2);
  });

  it("applies readable diminishing returns to repeated identical one-day work", () => {
    const schedule = scheduleActivities(study(), study(), study(), study());
    const result = processCompletedWeek(
      schedule,
      scout(),
      createRNG("weekly-repetition"),
    );

    expect(result.skillXpGained.dataLiteracy).toBe(10);
    expect(result.attributeXpGained.memory).toBe(8);
  });

  it("does not penalize the same activity performed for distinct targets", () => {
    const distinctTargets = scheduleActivities(
      {
        type: "networkMeeting",
        slots: 1,
        targetId: "contact-a",
        description: "Meet contact A",
      },
      {
        type: "networkMeeting",
        slots: 1,
        targetId: "contact-b",
        description: "Meet contact B",
      },
    );
    const repeatedTarget = scheduleActivities(
      {
        type: "networkMeeting",
        slots: 1,
        targetId: "contact-a",
        description: "Meet contact A",
      },
      {
        type: "networkMeeting",
        slots: 1,
        targetId: "contact-a",
        description: "Meet contact A again",
      },
    );

    expect(resolveWeekActivityXp(distinctTargets, scout()).attributeXpGained.networking)
      .toBe(6);
    expect(resolveWeekActivityXp(repeatedTarget, scout()).attributeXpGained.networking)
      .toBe(5);
  });

  it("turns the refreshed state into a modest learning bonus", () => {
    const schedule = scheduleActivities({
      type: "algorithmCalibration",
      slots: 1,
      description: "Calibrate the model",
    });

    expect(resolveWeekActivityXp(schedule, scout()).skillXpGained.dataLiteracy).toBe(5);
    expect(resolveWeekActivityXp(schedule, scout(), { refreshed: true }).skillXpGained.dataLiteracy)
      .toBe(6);
  });

  it("caps tired quality at good and removes exceptional discovery upside", () => {
    const capped = capActivityQualityForFatigue({
      activityType: "study",
      tier: "exceptional",
      multiplier: 2,
      narrative: "Exceptional work",
      discoveryModifier: 2,
    }, 70);

    expect(capped).toMatchObject({
      tier: "good",
      multiplier: 1,
      discoveryModifier: 0,
    });
    expect(capActivityQualityForFatigue(capped, 69)).toBe(capped);
  });
});

describe("weekly fatigue scheduling authority", () => {
  it("blocks work at the forced-rest boundary and sanitizes stale schedules", () => {
    const schedule = scheduleActivities(study());
    const rest: Activity = { type: "rest", slots: 1, description: "Rest" };

    expect(canScheduleActivity(createWeekSchedule(4, 1), study(), 0, scout(85))).toBe(false);
    expect(canScheduleActivity(createWeekSchedule(4, 1), rest, 0, scout(85))).toBe(true);

    const forced = enforceForcedRestSchedule(schedule, 85);
    expect(forced.activities).toHaveLength(7);
    expect(forced.activities.every((activity) => activity?.type === "rest")).toBe(true);
    expect(enforceForcedRestSchedule(forced, 85)).toBe(forced);
  });

  it("tracks complete recovery weeks and resets the streak when work resumes", () => {
    const empty = createWeekSchedule(4, 1);
    const restOnly = scheduleActivities({
      type: "rest",
      slots: 1,
      description: "Rest",
    });
    const working = scheduleActivities(study());

    expect(getNextConsecutiveRestWeeks(empty, 0)).toBe(1);
    expect(getNextConsecutiveRestWeeks(restOnly, 1)).toBe(2);
    expect(getNextConsecutiveRestWeeks(working, 2)).toBe(0);
  });
});
