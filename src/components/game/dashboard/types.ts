"use client";

import type { ReactNode } from "react";
import type { GameState } from "@/engine/core/types";
import type { GameScreen } from "@/stores/gameStoreTypes";
import type { YouthActiveCaseModel, YouthDeskProspectEntry } from "../workspace/desk/youthDeskModel";

export type DashboardSeasonPhase =
  | "preseason"
  | "earlyseason"
  | "midseason"
  | "lateseason"
  | "endseason";

export interface DashboardPlannedActivity {
  key: string;
  dayIndex: number;
  description: string;
  slots: number;
}

export interface DashboardYouthDeskAction {
  eyebrow: string;
  title: string;
  description: string;
  label: string;
  kind: "prospect" | "planner" | "advance";
}

export interface DashboardDeskMetric {
  label: string;
  value: string | number;
  detail: string;
  icon: ReactNode;
  toneClassName?: string;
}

export interface DashboardDeskSignal {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  meta: string;
  tone: "amber" | "violet" | "sky" | "red" | "emerald";
  actionLabel: string;
  onAction: () => void;
}

export interface DashboardRecentReport {
  id: string;
  playerId: string;
  conviction: "note" | "recommend" | "strongRecommend" | "tablePound";
  qualityScore: number;
  submittedWeek: number;
}

export type DashboardRecruitmentBrief = GameState["youthRecruitmentBriefs"][string];
export type DashboardRecommendationReview = GameState["recommendationReviews"][string];
export type DashboardTournament = GameState["youthTournaments"][string];
export type DashboardCareerEra = NonNullable<GameState["careerEraDirectorState"]>["current"];
export type DashboardMessage = GameState["inbox"][number];
export type DashboardRecentTransfer = GameState["transferRecords"][number];
export type DashboardDirective = GameState["managerDirectives"][number];
export type DashboardPrediction = GameState["predictions"][number];
export type DashboardDataAnalyst = GameState["dataAnalysts"][number];
export type DashboardLoan = NonNullable<GameState["activeLoans"]>[number];
export type DashboardNpcReport = GameState["npcReports"][string];
export type DashboardYouth = GameState["unsignedYouth"][string];
export type DashboardFixture = GameState["fixtures"][number];
export type DashboardYouthEvidenceEntry = YouthDeskProspectEntry;
export type DashboardSetScreen = (screen: GameScreen) => void;
export type DashboardResolveSeasonEvent = (eventId: string, choiceIndex: number) => void;
export type DashboardYouthActionModel = YouthActiveCaseModel;
