export type OpeningCaseStage =
  | "observation"
  | "decision"
  | "report"
  | "complete";

export type OpeningCaseChoiceId = "protect" | "callClub" | "verify";

export interface OpeningCaseState {
  id: string;
  scoutId: string;
  youthId: string;
  playerId: string;
  playerPoolIds: string[];
  sourceContactId?: string;
  sourceContactName: string;
  briefId?: string;
  clubId?: string;
  stage: OpeningCaseStage;
  startedWeek: number;
  startedSeason: number;
  claimedWeek?: number;
  claimedSeason?: number;
  discoveryRecordCreated: boolean;
  selectedChoiceId?: OpeningCaseChoiceId;
  decisionId?: string;
}

export interface OpeningCaseProjection {
  id: string;
  playerId: string;
  playerName: string;
  position: string;
  age: number;
  country: string;
  sourceContactName: string;
  stage: OpeningCaseStage;
  selectedChoiceId?: OpeningCaseChoiceId;
  eyebrow: string;
  venueLabel: string;
  headline: string;
  uncertainty: string;
  signalLabel: string;
  questionLabel: string;
  premise?: string;
  pressure?: string;
  deadline?: string;
  stakeholderConflict?: string;
}

export interface OpeningCaseChoiceProjection {
  id: OpeningCaseChoiceId;
  label: string;
  description: string;
  knownTradeoffs: readonly string[];
  effect?: string;
}
