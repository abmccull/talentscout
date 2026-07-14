import type { NarrativeEvent, NarrativeEventType } from "@/engine/core/types";
import type { GameScreen } from "@/stores/gameStore";

export type NarrativeAudioMoment = "politicalTension" | "discovery" | "vindication";

export interface AudioDirectorInput {
  screen: GameScreen;
  weather?: string;
  narrativeMoment?: NarrativeAudioMoment;
  isTraveling?: boolean;
}

export interface AudioScene {
  context:
    | "title"
    | "desk"
    | "readingRoom"
    | "liveObservation"
    | "reportRoom"
    | "politicalTension"
    | "discovery"
    | "vindication"
    | "travel"
    | "seasonReflection"
    | "career"
    | "agency"
    | "network"
    | "preserve";
  /** undefined preserves the current channel; null stops it. */
  music?: string | null;
  ambience?: string | null;
  /** Non-persistent scene gains, multiplied by the player's channel volumes. */
  musicGain: number;
  ambienceGain: number;
}

const POLITICAL_TENSION_TYPES = new Set<NarrativeEventType>([
  "rivalPoach", "rivalPoachBid", "managerFired", "targetInjured",
  "rivalRecruitment", "agentDeception", "burnout", "familyEmergency",
  "healthScare", "boardroomCoup", "budgetCut", "scoutingDeptRestructure",
  "rivalClubPoach", "managerSacked", "clubFinancialTrouble", "wonderkidPressure",
  "playerHomesick", "playerControversy", "youthProdigyDilemma", "injurySetback",
  "contactBetrayal", "agentDoubleDealing", "journalistExpose",
  "youthAcademyScandal", "financialFairPlayImpact", "careerCrossroads",
  "confidentialityDilemma",
]);

const VINDICATION_TYPES = new Set<NarrativeEventType>([
  "debutHatTrick", "reportCitedInBoardMeeting", "hiddenGemVindication",
  "debutBrilliance", "lateBloomingSurprise", "scoutingAwardNomination",
]);

const DISCOVERY_TYPES = new Set<NarrativeEventType>([
  "exclusiveTip", "scoutingConference", "mentorOffer", "exclusiveAccess",
  "networkExpansion", "dataRevolution", "internationalTournament",
]);

/**
 * Reduces persistent narrative state into one musical moment. Tension wins so
 * a celebration cannot mask a dilemma that still needs the player's attention.
 */
export function classifyNarrativeAudioMoment(
  events: readonly NarrativeEvent[] | undefined,
): NarrativeAudioMoment | undefined {
  const active = (events ?? []).filter((event) => !event.acknowledged);
  if (active.some((event) => POLITICAL_TENSION_TYPES.has(event.type))) {
    return "politicalTension";
  }
  if (active.some((event) => VINDICATION_TYPES.has(event.type))) {
    return "vindication";
  }
  if (active.some((event) => DISCOVERY_TYPES.has(event.type))) {
    return "discovery";
  }
  return undefined;
}

const MOMENT_SCREENS = new Set<GameScreen>([
  "dashboard", "inbox", "career", "rivals", "agency", "negotiation",
  "playerProfile", "discoveries",
]);

const TRAVEL_SCREENS = new Set<GameScreen>([
  "dashboard", "calendar", "internationalView", "inbox", "playerDatabase",
  "youthScouting",
]);

const READING_SCREENS = new Set<GameScreen>([
  "reportHistory", "reportComparison", "playerProfile", "handbook", "futureRoadmap",
  "analytics", "performance",
]);

const SEASON_REFLECTION_SCREENS = new Set<GameScreen>([
  "seasonAwards", "leaderboard", "hallOfFame", "demoEnd",
]);

function scene(
  context: AudioScene["context"],
  music: string | null | undefined,
  ambience: string | null | undefined,
  musicGain = 1,
  ambienceGain = 1,
): AudioScene {
  return { context, music, ambience, musicGain, ambienceGain };
}

/** Pure, deterministic mapping from game meaning to an adaptive audio scene. */
export function directAudioScene(input: AudioDirectorInput): AudioScene {
  const { screen, weather, narrativeMoment, isTraveling = false } = input;

  if (screen === "settings") return scene("preserve", undefined, undefined);
  if (screen === "matchSummary") return scene("preserve", undefined, null);

  if (screen === "mainMenu" || screen === "newGame" || screen === "scenarioSelect") {
    return scene("title", "title-anthem", null, 0.8, 0);
  }

  if (screen === "openingDiscovery") {
    return scene("discovery", "wonderkid", "stadium-crowd", 0.66, 0.22);
  }

  // Task-specific focus takes precedence over ambient narrative events.
  if (screen === "match" || screen === "observation") {
    const wetWeather = weather === "rain" || weather === "heavyRain" || weather === "snow";
    return scene(
      "liveObservation",
      "observation",
      wetWeather ? "rain-stadium" : "stadium-crowd",
      0.72,
      0.72,
    );
  }
  if (screen === "reportWriter") {
    return scene("reportRoom", "report-writing", "office", 0.42, 0.4);
  }
  if (SEASON_REFLECTION_SCREENS.has(screen)) {
    return scene("seasonReflection", "season-review", null, 0.62, 0);
  }
  if (isTraveling && TRAVEL_SCREENS.has(screen)) {
    return scene("travel", "network-groove", null, 0.58, 0);
  }

  if (MOMENT_SCREENS.has(screen)) {
    if (narrativeMoment === "politicalTension") {
      return scene("politicalTension", "transfer-pressure", "office", 0.68, 0.24);
    }
    if (narrativeMoment === "vindication") {
      return scene("vindication", "wonderkid", null, 0.72, 0);
    }
    if (narrativeMoment === "discovery") {
      return scene("discovery", "wonderkid", null, 0.6, 0);
    }
  }

  if (screen === "discoveries" || screen === "achievements") {
    return scene("discovery", "wonderkid", null, 0.58, 0);
  }
  if (screen === "career" || screen === "training" || screen === "equipment") {
    return scene("career", "career-hub", null, 0.55, 0);
  }
  if (screen === "agency" || screen === "npcManagement" || screen === "finances") {
    return scene("agency", "agency-theme", "office", 0.52, 0.28);
  }
  if (screen === "network" || screen === "rivals" || screen === "negotiation") {
    return scene("network", "network-groove", "office", 0.58, 0.25);
  }
  if (READING_SCREENS.has(screen)) {
    return scene("readingRoom", null, "office", 0, 0.34);
  }
  return scene("desk", "youth-scouting", "office", 0.5, 0.32);
}
