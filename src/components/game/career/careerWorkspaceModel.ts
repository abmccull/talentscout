"use client";

import type { BoardProfile, JobOffer, ManagerProfile, PerformanceReview, Scout } from "@/engine/core/types";
import type { FinancialRecord } from "@/engine/core/types";
import type { CareerRoleProfile } from "@/engine/career/roleProfile";

export interface CareerTimelinePreviewItem {
  id: string;
  label: string;
  title: string;
  description: string;
  when: string;
}

export interface CareerBridgeSignal {
  label: string;
  value: string;
  detail: string;
  tone: "emerald" | "amber" | "sky" | "red";
}

export interface CareerBridgeHighlight {
  id: string;
  label: string;
  title: string;
  body: string;
  meta: string;
  tone: "emerald" | "amber" | "sky" | "violet" | "red";
}

export interface CareerRecurringCastItem {
  id: string;
  label: string;
  title: string;
  detail: string;
}

export interface CareerWorkspaceViewModel {
  pathLabel: string;
  framing: string;
  roleTitle: string;
  roleBase: string;
  seasonLabel: string;
  signals: CareerBridgeSignal[];
  highlights: CareerBridgeHighlight[];
  recurringCast: CareerRecurringCastItem[];
  timelinePreview: CareerTimelinePreviewItem[];
}

interface BuildCareerWorkspaceViewModelInput {
  scout: Scout;
  finances: FinancialRecord | null;
  currentSeason: number;
  currentWeek: number;
  roleProfile: CareerRoleProfile;
  roleBase: string;
  monthlyIncome: number;
  monthlyExpenses: number;
  latestReview?: PerformanceReview;
  showPathChoice: boolean;
  jobOffers: JobOffer[];
  pressureHighlight?: CareerBridgeHighlight | null;
  opportunityHighlight?: CareerBridgeHighlight | null;
  historicalCallback?: CareerBridgeHighlight | null;
  timelinePreview: CareerTimelinePreviewItem[];
  managerProfile?: ManagerProfile;
  boardProfile?: BoardProfile;
  latestTrackedPlayerTitle?: string | null;
}

function formatGameDate(season: number, week: number): string {
  return `S${season} W${week}`;
}

function deriveSecuritySignal(
  scout: Scout,
  latestReview: PerformanceReview | undefined,
): CareerBridgeSignal {
  if (scout.careerPath === "independent") {
    return {
      label: "Security",
      value: "Self-directed",
      detail: "Your freedom is real, but so is the cash and credibility risk.",
      tone: "sky",
    };
  }
  if (latestReview?.outcome === "warning" || scout.clubTrust < 35) {
    return {
      label: "Security",
      value: "At risk",
      detail: "The next reports and conversations will be judged under pressure.",
      tone: "red",
    };
  }
  if (scout.clubTrust < 55) {
    return {
      label: "Security",
      value: "Under review",
      detail: "You still have the seat, but the club needs cleaner proof and delivery.",
      tone: "amber",
    };
  }
  return {
    label: "Security",
    value: scout.clubTrust >= 75 ? "Trusted" : "Stable",
    detail: scout.clubTrust >= 75
      ? "You have room to challenge assumptions, but trust still has to be defended."
      : "Your current work is keeping the role secure.",
    tone: "emerald",
  };
}

function deriveRunwaySignal(
  finances: FinancialRecord | null,
  monthlyIncome: number,
  monthlyExpenses: number,
): CareerBridgeSignal {
  if (!finances) {
    return {
      label: "Runway",
      value: "Not recorded",
      detail: "This save does not have a complete financial ledger.",
      tone: "amber",
    };
  }
  const monthlyBurn = monthlyExpenses - monthlyIncome;
  if (monthlyBurn <= 0) {
    return {
      label: "Runway",
      value: "Cash-flow positive",
      detail: "Committed income is covering the standing monthly cost base.",
      tone: "emerald",
    };
  }
  const months = Math.max(0, finances.balance / monthlyBurn);
  return {
    label: "Runway",
    value: months >= 24 ? "24+ months" : `${months.toFixed(months < 4 ? 1 : 0)} months`,
    detail: months < 2
      ? "A bad month can force a career decision."
      : months < 5
        ? "You can keep operating, but speculative work carries real risk."
        : "You have enough space to choose rather than react.",
    tone: months < 2 ? "red" : months < 5 ? "amber" : "sky",
  };
}

function deriveMilestoneSignal(
  input: BuildCareerWorkspaceViewModelInput,
): CareerBridgeSignal {
  if (input.jobOffers.length > 0) {
    return {
      label: "Next milestone",
      value: `${input.jobOffers.length} offer${input.jobOffers.length === 1 ? "" : "s"} on the table`,
      detail: "Compare authority, weekly reality, and long-term leverage before moving.",
      tone: "amber",
    };
  }
  if (input.showPathChoice) {
    return {
      label: "Next milestone",
      value: "Choose the next career path",
      detail: "This fork decides who carries the money risk and who defines the work.",
      tone: "amber",
    };
  }
  if (input.scout.careerPath === "club" && input.scout.contractEndSeason !== undefined
    && input.scout.contractEndSeason <= input.currentSeason + 1) {
    return {
      label: "Next milestone",
      value: "Earn the next contract",
      detail: `Current agreement runs through Season ${input.scout.contractEndSeason}.`,
      tone: "amber",
    };
  }
  return {
    label: "Next milestone",
    value: input.roleProfile.promotion.nextRole ?? "Shape your legacy",
    detail: input.roleProfile.promotion.requirements[0]
      ?? "A defended judgment with a remembered consequence matters more than raw volume.",
    tone: "emerald",
  };
}

function defaultOpportunity(
  input: BuildCareerWorkspaceViewModelInput,
): CareerBridgeHighlight {
  if (input.showPathChoice) {
    return {
      id: "career-fork",
      label: "Live opportunity",
      title: "A structural career fork is open",
      body: "Choose whether the next era is employer-led or self-directed before the current role hardens into habit.",
      meta: `Week ${input.currentWeek} | Season ${input.currentSeason}`,
      tone: "amber",
    };
  }
  if (input.jobOffers.length > 0) {
    return {
      id: "career-offers",
      label: "Live opportunity",
      title: `${input.jobOffers.length} role offer${input.jobOffers.length === 1 ? "" : "s"} available`,
      body: "A stronger title only matters if it gives you better weekly questions, support, and leverage.",
      meta: "Opportunity is only real if the role is better",
      tone: "emerald",
    };
  }
  return {
    id: "promotion-path",
    label: "Live opportunity",
    title: input.roleProfile.promotion.nextRole ?? "Better work opens through remembered outcomes",
    body: "Promotion comes from decisions that survive challenge and change a player's career, not from abstract grind.",
    meta: input.roleProfile.promotion.requirements[0] ?? "Keep building authority through defended calls",
    tone: "sky",
  };
}

function defaultHistoricalCallback(
  input: BuildCareerWorkspaceViewModelInput,
): CareerBridgeHighlight {
  const firstTimeline = input.timelinePreview[0];
  if (firstTimeline) {
    return {
      id: `callback-${firstTimeline.id}`,
      label: "Historical callback",
      title: firstTimeline.title,
      body: firstTimeline.description,
      meta: `${firstTimeline.label} | ${firstTimeline.when}`,
      tone: "violet",
    };
  }
  if (input.latestReview) {
    return {
      id: "latest-review",
      label: "Historical callback",
      title: `Season ${input.latestReview.season} review: ${input.latestReview.outcome}`,
      body: `${input.latestReview.reportsSubmitted} reports, ${Math.round(input.latestReview.averageQuality)} average craft, and ${input.latestReview.successfulRecommendations} successful recommendations defined the last formal verdict.`,
      meta: "Past verdicts still set the trust floor",
      tone: "violet",
    };
  }
  return {
    id: "first-record",
    label: "Historical callback",
    title: "Your record is still being written",
    body: "The first callback appears when a named player or formal review can be tied back to your judgment.",
    meta: "No durable callback yet",
    tone: "sky",
  };
}

function buildRecurringCast(
  input: BuildCareerWorkspaceViewModelInput,
): CareerRecurringCastItem[] {
  const cast: CareerRecurringCastItem[] = [
    {
      id: "current-seat",
      label: input.scout.careerPath === "independent" ? "Current seat" : "Current seat",
      title: input.roleBase,
      detail: input.roleProfile.title,
    },
  ];

  if (input.scout.careerPath === "club") {
    if (input.managerProfile) {
      cast.push({
        id: "manager",
        label: "Recurring counterpart",
        title: input.managerProfile.managerName,
        detail: `${input.managerProfile.preference} manager preference`,
      });
    }
    if (input.boardProfile) {
      cast.push({
        id: "board",
        label: "Governance memory",
        title: `${Math.round(input.boardProfile.satisfactionLevel)}/100 satisfaction`,
        detail: `${input.boardProfile.personality} board personality`,
      });
    }
  } else {
    const activeRetainers = input.finances?.retainerContracts.filter((contract) => contract.status === "active") ?? [];
    cast.push({
      id: "client-base",
      label: "Recurring cast",
      title: `${activeRetainers.length} active client${activeRetainers.length === 1 ? "" : "s"}`,
      detail: activeRetainers.length > 0
        ? "Retainers turn your calendar into obligations."
        : "The next client changes the pressure profile of the practice.",
    });
    cast.push({
      id: "cash-ledger",
      label: "Practice witness",
      title: input.finances ? `GBP ${Math.round(input.finances.balance).toLocaleString("en-GB")}` : "Ledger unavailable",
      detail: "Cash remembers every wrong bet faster than prestige does.",
    });
  }

  if (input.latestTrackedPlayerTitle) {
    cast.push({
      id: "tracked-player",
      label: "Living record",
      title: input.latestTrackedPlayerTitle,
      detail: "The most recent named player still carrying your judgment forward.",
    });
  }

  return cast.slice(0, 3);
}

export function buildCareerWorkspaceViewModel(
  input: BuildCareerWorkspaceViewModelInput,
): CareerWorkspaceViewModel {
  const pathLabel = input.scout.careerPath === "independent"
    ? "Independent command bridge"
    : "Club command bridge";
  const framing = input.scout.careerPath === "independent"
    ? "Your name carries the fee risk, the client pressure, and the credibility of every recommendation."
    : "You are judged by whether your evidence answers the club's real need without burning trust.";

  return {
    pathLabel,
    framing,
    roleTitle: input.roleProfile.title,
    roleBase: input.roleBase,
    seasonLabel: formatGameDate(input.currentSeason, input.currentWeek),
    signals: [
      deriveSecuritySignal(input.scout, input.latestReview),
      deriveRunwaySignal(input.finances, input.monthlyIncome, input.monthlyExpenses),
      deriveMilestoneSignal(input),
    ],
    highlights: [
      input.pressureHighlight ?? {
        id: "current-pressure",
        label: "Current pressure",
        title: "No immediate fire",
        body: "The role is stable enough that the next step can be chosen rather than forced.",
        meta: "Pressure is currently diffuse",
        tone: "emerald",
      },
      input.opportunityHighlight ?? defaultOpportunity(input),
      input.historicalCallback ?? defaultHistoricalCallback(input),
    ],
    recurringCast: buildRecurringCast(input),
    timelinePreview: input.timelinePreview.slice(0, 3),
  };
}
