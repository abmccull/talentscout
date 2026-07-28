export interface QuickScoutPriorities {
  targetPlayerIds: string[];
  trainWeakSkills: boolean;
  maintainContacts: boolean;
  writeReports: boolean;
}

export interface BatchWeekSummary {
  week: number;
  season: number;
  fatigueChange: number;
  matchesAttended: number;
  reportsWritten: number;
  meetingsHeld: number;
  newMessages: number;
  playersDiscovered: number;
  observationsGenerated: number;
  keyEvents: string[];
}

export interface BatchAdvanceResult {
  weekSummaries: BatchWeekSummary[];
  weeksAdvanced: number;
  startingFatigue: number;
  endingFatigue: number;
  totalSkillXp: Record<string, number>;
  totalAttributeXp: Record<string, number>;
  totalNewMessages: number;
  totalPlayersDiscovered: number;
  totalObservationsGenerated: number;
  seasonTransitionOccurred: boolean;
}
