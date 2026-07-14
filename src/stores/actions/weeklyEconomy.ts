import type { GameState } from "@/engine/core/types";
import { createRNG } from "@/engine/rng";
import { getSeasonLength } from "@/engine/core/gameLoop";
import { getRunSimulationModifiers } from "@/engine/run";
import {
  getScoutHomeCountry as getScoutHome,
  getWorldConditionModifiers,
} from "@/engine/world";
import {
  processMarketplaceBids,
  expireOldListings,
  processRetainerDeliveries,
  processLoanPayment,
  processConsultingDeadline,
  processEmployeeWeek,
  generateRetainerOffers,
  generateConsultingOffers,
  processEmployeeWork,
  processClientRelationshipWeek,
  checkEmployeeEvents,
  expireEmployeeEvents,
  processRetainerRenewals,
  getLifestyleReputationPenalty,
} from "@/engine/finance";
import {
  processWeeklyCourseProgress,
  COURSE_CATALOG,
} from "@/engine/career/courses";
import {
  checkIndependentTierAdvancement,
  advanceIndependentTier,
} from "@/engine/career";
import {
  updateMarketTemperature,
  generateEconomicEvent,
  applyEconomicEvent,
  expireEconomicEvents,
} from "@/engine/events";

type WeeklyEconomyRngContext = Pick<
  GameState,
  "seed" | "currentWeek" | "currentSeason"
>;

/**
 * Applies the deterministic weekly economy/agency pipeline.
 *
 * The RNG context is explicit because advanceWeek seeds this phase from the
 * command's starting date, while the evolving state may already contain
 * earlier same-command mutations.
 */
export function processWeeklyEconomy(
  state: GameState,
  rngContext: WeeklyEconomyRngContext,
): GameState {
  if (!state.finances) return state;

  let nextState = state;
  const econRng = createRNG(
    `${rngContext.seed}-econ-${rngContext.currentWeek}-${rngContext.currentSeason}`,
  );
  let econFinances = state.finances;
  const economicSeasonLength = getSeasonLength(
    nextState.fixtures,
    nextState.currentSeason,
  );

  const newTemp = updateMarketTemperature(
    nextState.transferWindow,
    nextState.currentWeek,
  );
  econFinances = { ...econFinances, marketTemperature: newTemp };

  econFinances = expireEconomicEvents(
    econFinances,
    nextState.currentWeek,
    nextState.currentSeason,
    economicSeasonLength,
  );
  const runModifiers = getRunSimulationModifiers(nextState.runManifest);
  const newEvent = generateEconomicEvent(
    econRng,
    econFinances,
    nextState.currentWeek,
    nextState.currentSeason,
    {
      chanceMultiplier: runModifiers.economicEventChanceMultiplier,
      impactMultiplier: runModifiers.economicImpactMultiplier,
    },
  );
  if (newEvent) {
    econFinances = applyEconomicEvent(econFinances, newEvent);
  }

  if (nextState.scout.careerPath === "independent") {
    const marketplaceConditions = getWorldConditionModifiers(
      nextState,
      getScoutHome(nextState.scout),
    );
    const bidResult = processMarketplaceBids(
      econRng,
      econFinances,
      nextState.clubs,
      nextState.reports,
      nextState.players,
      nextState.scout,
      nextState.currentWeek,
      nextState.currentSeason,
      nextState.unsignedYouth,
      economicSeasonLength,
      {
        valueMultiplier: marketplaceConditions.marketplaceValueMultiplier,
        demandMultiplier: marketplaceConditions.opportunityMultiplier,
      },
    );
    econFinances = bidResult.finances;
    if (bidResult.inboxMessages.length > 0) {
      nextState = {
        ...nextState,
        inbox: [...bidResult.inboxMessages, ...nextState.inbox],
      };
    }
    econFinances = expireOldListings(
      econFinances,
      nextState.currentWeek,
      nextState.currentSeason,
      economicSeasonLength,
    );
  }

  econFinances = processRetainerDeliveries(
    econFinances,
    nextState.currentWeek,
    nextState.currentSeason,
  );
  econFinances = processLoanPayment(
    econFinances,
    nextState.currentWeek,
    nextState.currentSeason,
  );
  econFinances = processConsultingDeadline(
    econFinances,
    nextState.currentWeek,
    nextState.currentSeason,
    economicSeasonLength,
  );

  const prevCompletedCourses = econFinances.completedCourses;
  econFinances = processWeeklyCourseProgress(
    econFinances,
    nextState.currentWeek,
    nextState.currentSeason,
    economicSeasonLength,
  );

  if (econFinances.completedCourses.length > prevCompletedCourses.length) {
    const newCourseId =
      econFinances.completedCourses[econFinances.completedCourses.length - 1];
    const completedCourse = COURSE_CATALOG.find((course) => course.id === newCourseId);
    if (completedCourse) {
      let updatedScout = { ...nextState.scout };
      for (const effect of completedCourse.effects) {
        switch (effect.type) {
          case "reputationBonus":
            updatedScout = {
              ...updatedScout,
              reputation: Math.min(100, updatedScout.reputation + effect.value),
            };
            break;
          case "skillBonus":
            if (effect.target && effect.target in updatedScout.skills) {
              updatedScout = {
                ...updatedScout,
                skills: {
                  ...updatedScout.skills,
                  [effect.target]: Math.min(
                    20,
                    updatedScout.skills[effect.target as keyof typeof updatedScout.skills]
                      + effect.value,
                  ),
                },
              };
            }
            break;
          case "attributeBonus":
            if (effect.target && effect.target in updatedScout.attributes) {
              updatedScout = {
                ...updatedScout,
                attributes: {
                  ...updatedScout.attributes,
                  [effect.target]: Math.min(
                    20,
                    updatedScout.attributes[
                      effect.target as keyof typeof updatedScout.attributes
                    ] + effect.value,
                  ),
                },
              };
            }
            break;
        }
      }
      nextState = { ...nextState, scout: updatedScout };

      const bonusParts: string[] = [];
      for (const effect of completedCourse.effects) {
        if (effect.type === "reputationBonus") {
          bonusParts.push(`Reputation +${effect.value}`);
        } else if (effect.type === "skillBonus" && effect.target) {
          bonusParts.push(`${effect.target} +${effect.value}`);
        } else if (effect.type === "attributeBonus" && effect.target) {
          bonusParts.push(`${effect.target} +${effect.value}`);
        }
      }
      const bonusSummary = bonusParts.length > 0
        ? ` Bonuses applied: ${bonusParts.join(", ")}.`
        : "";
      nextState = {
        ...nextState,
        inbox: [
          {
            id: `course_complete_${nextState.currentWeek}_${newCourseId}`,
            week: nextState.currentWeek,
            season: nextState.currentSeason,
            type: "event" as const,
            title: "Course Completed",
            body: `Course completed: ${completedCourse.name}.${bonusSummary}`,
            read: false,
            actionRequired: false,
          },
          ...nextState.inbox,
        ],
      };
    }
  }

  if (econFinances.employees.length > 0) {
    econFinances = processEmployeeWeek(
      econRng,
      econFinances,
      nextState.scout.reputation,
      nextState.currentWeek,
      nextState.currentSeason,
    );
  }

  if (econFinances.employees.length > 0) {
    const workResult = processEmployeeWork(
      econRng,
      econFinances,
      nextState.players,
      nextState.clubs,
      nextState.scout,
      nextState.currentWeek,
      nextState.currentSeason,
    );
    econFinances = workResult.finances;

    if (workResult.generatedReports.length > 0) {
      const newReports = { ...nextState.reports };
      for (const report of workResult.generatedReports) {
        newReports[report.id] = report;
      }
      nextState = { ...nextState, reports: newReports };
    }

    if (workResult.inboxMessages.length > 0) {
      const messages = workResult.inboxMessages.map((message, index) => ({
        id: `emp_work_${nextState.currentWeek}_${index}`,
        week: nextState.currentWeek,
        season: nextState.currentSeason,
        type: "event" as const,
        title: message.title,
        body: message.body,
        read: false,
        actionRequired: false,
      }));
      nextState = { ...nextState, inbox: [...messages, ...nextState.inbox] };
    }
  }

  econFinances = expireEmployeeEvents(
    econFinances,
    nextState.currentWeek,
    nextState.currentSeason,
    economicSeasonLength,
  );
  if (econFinances.employees.length > 0) {
    for (const employee of econFinances.employees) {
      const event = checkEmployeeEvents(
        econRng,
        employee,
        econFinances,
        nextState.scout,
        nextState.currentWeek,
        nextState.currentSeason,
        economicSeasonLength,
      );
      if (event) {
        econFinances = {
          ...econFinances,
          pendingEmployeeEvents: [
            ...(econFinances.pendingEmployeeEvents ?? []),
            event,
          ],
        };
        nextState = {
          ...nextState,
          inbox: [
            {
              id: `emp_evt_${event.id}`,
              week: nextState.currentWeek,
              season: nextState.currentSeason,
              type: "event" as const,
              title: `Employee Event: ${event.type}`,
              body: event.description,
              read: false,
              actionRequired: true,
              relatedId: "agency",
              relatedEntityType: "tool" as const,
            },
            ...nextState.inbox,
          ],
        };
      }
    }
  }

  if (nextState.scout.careerPath === "independent") {
    econFinances = processClientRelationshipWeek(
      econRng,
      econFinances,
      nextState.currentWeek,
      nextState.currentSeason,
      economicSeasonLength,
    );
    econFinances = processRetainerRenewals(
      econRng,
      econFinances,
      nextState.currentWeek,
      nextState.currentSeason,
    );

    const retainerOffers = generateRetainerOffers(
      econRng,
      nextState.scout,
      econFinances,
      nextState.clubs,
    );
    if (retainerOffers.length > 0) {
      econFinances = {
        ...econFinances,
        pendingRetainerOffers: [
          ...(econFinances.pendingRetainerOffers ?? []),
          ...retainerOffers,
        ],
      };
    }
    const consultingOffers = generateConsultingOffers(
      econRng,
      nextState.scout,
      econFinances,
      nextState.clubs,
      nextState.currentWeek,
      nextState.currentSeason,
      economicSeasonLength,
    );
    if (consultingOffers.length > 0) {
      econFinances = {
        ...econFinances,
        pendingConsultingOffers: [
          ...(econFinances.pendingConsultingOffers ?? []),
          ...consultingOffers,
        ],
      };
    }

    const nextTier = checkIndependentTierAdvancement(nextState.scout, econFinances);
    if (nextTier) {
      const { scout: advancedScout, finances: advancedFinances } =
        advanceIndependentTier(nextState.scout, econFinances, nextTier);
      nextState = { ...nextState, scout: advancedScout };
      econFinances = advancedFinances;
    }
  }

  const lifestyleRepPenalty = getLifestyleReputationPenalty(
    econFinances.lifestyle.level,
    nextState.scout.careerTier,
  );
  if (lifestyleRepPenalty !== 0) {
    const newReputation = Math.max(
      0,
      Math.min(100, nextState.scout.reputation + lifestyleRepPenalty),
    );
    nextState = {
      ...nextState,
      scout: { ...nextState.scout, reputation: newReputation },
    };
  }

  return { ...nextState, finances: econFinances };
}
