import type { GameState } from "@/engine/core/types";
import { createRNG } from "@/engine/rng";
import { getSeasonLength } from "@/engine/core/gameLoop";
import { isFinancialPeriodClose } from "@/engine/core/annualization";
import { getRunSimulationModifiers } from "@/engine/run";
import {
  getScoutHomeCountry as getScoutHome,
  getWorldConditionModifiers,
} from "@/engine/world";
import {
  processMarketplaceBids,
  expireOldListings,
  closeRetainerPeriod,
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
import { expireRetainerOffers } from "@/engine/finance/retainers";
import { expireConsultingOffers } from "@/engine/finance/consulting";
import { creditForRetainerCompleted } from "@/engine/finance/creditScore";
import {
  processWeeklyCourseProgress,
  countScheduledStudySessions,
  COURSE_CATALOG,
} from "@/engine/career/courses";
import {
  attemptCareerTierAdvancement,
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
    econFinances = expireRetainerOffers(
      econFinances,
      nextState.currentWeek,
      nextState.currentSeason,
    );
    econFinances = expireConsultingOffers(
      econFinances,
      nextState.currentWeek,
      nextState.currentSeason,
    );
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

  econFinances = processLoanPayment(
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
    countScheduledStudySessions(nextState.schedule),
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
      nextState.reports,
      nextState.currentWeek,
      nextState.currentSeason,
    );
    econFinances = workResult.finances;

    if (workResult.generatedWorkProducts.length > 0) {
      const existingIds = new Set(
        (econFinances.staffWorkProducts ?? []).map((product) => product.id),
      );
      econFinances = {
        ...econFinances,
        staffWorkProducts: [
          ...(econFinances.staffWorkProducts ?? []),
          ...workResult.generatedWorkProducts.filter(
            (product) => !existingIds.has(product.id),
          ),
        ],
      };
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
        actionRequired: message.title === "Staff scouting ready for review",
      }));
      nextState = { ...nextState, inbox: [...messages, ...nextState.inbox] };
    }
  }

  // Deadline checks run after every report producer. Work delivered during the
  // deadline week therefore counts, matching the retainer settlement order.
  const consultingStatusBeforeDeadline = new Map(
    econFinances.consultingContracts.map((contract) => [contract.id, contract.status]),
  );
  econFinances = processConsultingDeadline(
    econFinances,
    nextState.currentWeek,
    nextState.currentSeason,
    economicSeasonLength,
  );
  const newlyFailedConsulting = econFinances.consultingContracts.filter((contract) =>
    contract.status === "failed"
    && consultingStatusBeforeDeadline.get(contract.id) === "active"
  );
  if (newlyFailedConsulting.length > 0) {
    const reputationPenalty = Math.min(6, newlyFailedConsulting.length * 2);
    nextState = {
      ...nextState,
      scout: {
        ...nextState.scout,
        reputation: Math.max(0, nextState.scout.reputation - reputationPenalty),
      },
      inbox: [
        ...newlyFailedConsulting.map((contract) => ({
          id: `consulting:${contract.id}:failed`,
          week: nextState.currentWeek,
          season: nextState.currentSeason,
          type: "financial" as const,
          title: "Consulting Deadline Missed",
          body: `${nextState.clubs[contract.clubId]?.name ?? "The client"} closed the ${contract.type} engagement without payment. Client satisfaction and your professional reputation have fallen.`,
          read: false,
          actionRequired: false,
        })),
        ...nextState.inbox,
      ],
    };
  }

  // Close client periods after every report producer has run, so work
  // delivered in the closing week counts toward the contract that requested it.
  const retainerClose = closeRetainerPeriod(
    econFinances,
    nextState.currentWeek,
    nextState.currentSeason,
    economicSeasonLength,
  );
  econFinances = retainerClose.finances;
  for (const paid of retainerClose.events.filter((event) => event.outcome === "paid")) {
    void paid;
    econFinances = creditForRetainerCompleted(econFinances);
  }
  const retainerProblems = retainerClose.events.filter((event) => event.outcome !== "paid");
  if (retainerProblems.length > 0) {
    const retainerMessages = retainerProblems.map((event) => ({
      id: event.referenceId,
      week: nextState.currentWeek,
      season: nextState.currentSeason,
      type: "financial" as const,
      title: event.title,
      body: event.body,
      read: false,
      actionRequired: true,
    }));
    nextState = {
      ...nextState,
      scout: retainerClose.reputationPenalty > 0
        ? {
            ...nextState.scout,
            reputation: Math.max(
              0,
              nextState.scout.reputation - retainerClose.reputationPenalty,
            ),
          }
        : nextState.scout,
      inbox: [...retainerMessages, ...nextState.inbox],
    };
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
    const retainersBeforeRenewal = new Map(
      econFinances.retainerContracts.map((contract) => [contract.id, contract]),
    );
    econFinances = processRetainerRenewals(
      econRng,
      econFinances,
      nextState.currentWeek,
      nextState.currentSeason,
      economicSeasonLength,
      nextState.scout,
    );
    const changedRetainers = econFinances.retainerContracts.filter((contract) => {
      const before = retainersBeforeRenewal.get(contract.id);
      return before && (
        before.status !== contract.status
        || before.tier !== contract.tier
        || before.monthlyFee !== contract.monthlyFee
      );
    });
    if (changedRetainers.length > 0) {
      nextState = {
        ...nextState,
        inbox: [
          ...changedRetainers.map((contract) => {
            const before = retainersBeforeRenewal.get(contract.id)!;
            const cancelled = contract.status === "cancelled";
            return {
              id: `retainer-renewal:${contract.id}:s${nextState.currentSeason}w${nextState.currentWeek}`,
              week: nextState.currentWeek,
              season: nextState.currentSeason,
              type: "financial" as const,
              title: cancelled ? "Retainer Not Renewed" : "Retainer Expanded",
              body: cancelled
                ? `${nextState.clubs[contract.clubId]?.name ?? "The client"} declined to renew after falling satisfaction. The monthly revenue is no longer committed.`
                : `${nextState.clubs[contract.clubId]?.name ?? "The client"} expanded the retainer from tier ${before.tier} to tier ${contract.tier}: £${contract.monthlyFee.toLocaleString()}/month for ${contract.requiredReportsPerMonth} reports.`,
              read: false,
              actionRequired: false,
            };
          }),
          ...nextState.inbox,
        ],
      };
    }

    const retainerOffers = generateRetainerOffers(
      econRng,
      nextState.scout,
      econFinances,
      nextState.clubs,
      nextState.currentWeek,
      nextState.currentSeason,
      economicSeasonLength,
      nextState.players,
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

    const advancement = attemptCareerTierAdvancement(
      nextState.scout,
      econFinances,
      "independentMilestone",
    );
    if (advancement.decision.eligible) {
      nextState = { ...nextState, scout: advancement.scout };
      econFinances = advancement.finances as typeof econFinances;
    }
  }

  const lifestyleRepPenalty = isFinancialPeriodClose(
    nextState.currentWeek,
    economicSeasonLength,
  )
    ? getLifestyleReputationPenalty(
    econFinances.lifestyle.level,
    nextState.scout.careerTier,
    )
    : 0;
  const lifestyleReferenceId = `lifestyle-reputation:s${nextState.currentSeason}w${nextState.currentWeek}`;
  if (
    lifestyleRepPenalty !== 0
    && !econFinances.transactions.some((transaction) =>
      transaction.referenceId === lifestyleReferenceId
    )
  ) {
    const newReputation = Math.max(
      0,
      Math.min(100, nextState.scout.reputation + lifestyleRepPenalty),
    );
    nextState = {
      ...nextState,
      scout: { ...nextState.scout, reputation: newReputation },
    };
    econFinances = {
      ...econFinances,
      transactions: [
        ...econFinances.transactions,
        {
          week: nextState.currentWeek,
          season: nextState.currentSeason,
          amount: 0,
          description: `Lifestyle reputation effect (${lifestyleRepPenalty >= 0 ? "+" : ""}${lifestyleRepPenalty})`,
          referenceId: lifestyleReferenceId,
          category: "operatingCost",
        },
      ],
    };
  }

  return { ...nextState, finances: econFinances };
}
