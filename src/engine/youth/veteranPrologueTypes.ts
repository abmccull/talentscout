import type {
  ActivityType,
  NewGameConfig,
  PlayerAttribute,
  Scout,
} from "@/engine/core/types";
import type { PlayerMoment } from "@/engine/observation/types";
import type {
  OpeningCaseChoiceId,
  OpeningCaseState,
} from "./openingCaseTypes";

export type VeteranPrologueTemplateId =
  | "school-tournament-tip"
  | "released-academy-player"
  | "rival-already-watching"
  | "family-discretion"
  | "injury-return"
  | "data-anomaly"
  | "agent-exaggeration"
  | "international-limited-access"
  | "contradictory-sources"
  | "club-deadline";

export type VeteranPrologueSourceArchetype =
  | "school-coach"
  | "academy-insider"
  | "touchline-contact"
  | "family-gatekeeper"
  | "rehab-coach"
  | "analyst"
  | "agent"
  | "regional-fixer"
  | "split-network"
  | "recruitment-executive";

export interface VeteranScoutPersona {
  specialization?: Scout["primarySpecialization"];
  careerPath?: Scout["careerPath"];
  originId?: NewGameConfig["originId"];
  flawId?: NewGameConfig["flawId"];
  doctrineIds?: NewGameConfig["doctrineIds"];
  nationality?: string;
  startingCountry?: string;
}

export interface VeteranPrologueChoice {
  /** Maps directly to the existing opening-case consequence option. */
  id: OpeningCaseChoiceId;
  label: string;
  description: string;
  knownTradeoffs: [string, string, string];
  effect: string;
}

export interface VeteranPrologueEvidenceBeat {
  type: PlayerMoment["momentType"];
  quality: number;
  /** Attribute categories this beat can support; never a true numeric rating. */
  attributesHinted: [PlayerAttribute, ...PlayerAttribute[]];
  focused: string;
  peripheral: string;
  pressure?: boolean;
}

export interface VeteranPrologueCase {
  /** Real opening case, suitable for the existing discovery/consequence flow. */
  openingCase: OpeningCaseState;
  id: string;
  playerId: string;
  playerPoolIds: string[];
  sourceContactId?: string;
  briefId?: string;
  clubId?: string;
  templateId: VeteranPrologueTemplateId;
  title: string;
  premise: string;
  activityType: ActivityType;
  activityInstanceId: string;
  venueLabel: string;
  setting: string;
  sourceArchetype: VeteranPrologueSourceArchetype;
  sourceContactName: string;
  pressure: string;
  evidenceBeats: readonly [VeteranPrologueEvidenceBeat, VeteranPrologueEvidenceBeat, VeteranPrologueEvidenceBeat];
  contradiction: string;
  deadline: string;
  stakeholderConflict: string;
  choices: readonly [VeteranPrologueChoice, VeteranPrologueChoice, VeteranPrologueChoice];
  presentation: {
    eyebrow: string;
    venue: string;
    headline: string;
    uncertainty: string;
    signalLabel: string;
    questionLabel: string;
    background: string;
  };
  player: {
    id: string;
    name: string;
    age: number;
    position: string;
    country: string;
  };
  /** Stable identifier for replay diagnostics; contains no hidden player data. */
  variationKey: string;
}
