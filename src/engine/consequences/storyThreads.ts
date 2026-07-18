import type { GameDate, GameState } from "@/engine/core/types";
import type { EntityRef } from "./types";
import {
  buildAccessAgreementStoryEntries,
  getActiveAccessAgreementsForStakeholder,
  type AccessAgreementStoryThreadEntry as AccessStoryThreadEntry,
} from "./accessAgreements";

export interface StoryThreadEntry extends AccessStoryThreadEntry {}

export interface StoryThread {
  stakeholder: EntityRef;
  entries: StoryThreadEntry[];
}

function sameEntity(left: EntityRef, right: EntityRef): boolean {
  return left.kind === right.kind && left.id === right.id;
}

function readableLabel(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

function hasTag(tags: readonly string[], ...candidates: readonly string[]): boolean {
  return candidates.some((candidate) => tags.includes(candidate));
}

function pickMetadataLabel(
  metadata: Record<string, unknown> | undefined,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function stakeholderLabel(stakeholder: EntityRef): string {
  switch (stakeholder.kind) {
    case "family":
      return "the family";
    case "journalist":
      return "the journalist";
    case "employee":
      return "your staff";
    case "agent":
      return "the agent";
    case "rival":
      return "the rival scout";
    case "club":
      return "the club";
    case "contact":
      return "the contact";
    default:
      return "this relationship";
  }
}

function describeMemory(
  stakeholder: EntityRef,
  tags: readonly string[],
  metadata: Record<string, unknown> | undefined,
): { title: string; description: string } {
  const playerLabel = pickMetadataLabel(metadata, ["playerName", "subjectName", "targetLabel", "prospectName"]);
  const clubLabel = pickMetadataLabel(metadata, ["clubName", "destinationClubName", "pathwayClubName"]);
  const rivalLabel = pickMetadataLabel(metadata, ["rivalName", "competitorName"]);
  const audience = stakeholderLabel(stakeholder);

  if (hasTag(tags, "exclusiveAccess", "confidentiality", "protectedFamily", "trustedUnderPressure")) {
    return {
      title: "Protected confidence shared",
      description: playerLabel
        ? `${audience} still remembers that you handled ${playerLabel} as protected information when the market was circling.`
        : `${audience} still remembers that you kept sensitive information inside a protected channel when pressure rose.`,
    };
  }

  if (hasTag(tags, "promiseBroken", "abandonedLead", "creditDenied", "exposedFamily")) {
    if (hasTag(tags, "familyPrivacy", "protectedFamily", "exposedFamily")) {
      return {
        title: "Family trust damaged",
        description: playerLabel
          ? `The family still measures you against how ${playerLabel}'s privacy and welfare were handled when the stakes rose.`
          : "The family still measures you against how a vulnerable prospect was protected once the situation became public.",
      };
    }
    if (hasTag(tags, "mediaAccess", "sourceRelationship")) {
      return {
        title: "Source promise broken",
        description: "A journalist still remembers a deadline or assurance that was not honored, making future exclusives more conditional.",
      };
    }
    if (hasTag(tags, "agentExclusivity", "sourceAttribution", "creditDispute")) {
      return {
        title: "Agency trust broken",
        description: playerLabel
          ? `An agent still frames the ${playerLabel} case as proof that your word can shift when ownership or access is contested.`
          : "An agent still frames a past case as proof that your word can shift when ownership or access is contested.",
      };
    }
    if (hasTag(tags, "employeeCredit", "leadership")) {
      return {
        title: "Staff trust damaged",
        description: "Your staff still judges whether you protect the people who do the work when public credit is being assigned.",
      };
    }
    return {
      title: "Promise broken",
      description: `${audience} still remembers a commitment that collapsed under pressure.`,
    };
  }

  if (hasTag(tags, "promiseKept", "reciprocity", "creditedWork", "goodFaithAdvice")) {
    if (hasTag(tags, "agentExclusivity", "sourceAttribution")) {
      return {
        title: "Agent trust reinforced",
        description: playerLabel
          ? `The agent still connects you with the way you backed the ${playerLabel} opportunity when it would have been easier to step away.`
          : "The agent still connects you with a moment when you protected their access instead of choosing the easier exit.",
      };
    }
    if (hasTag(tags, "employeeCredit", "creditedWork", "leadership")) {
      return {
        title: "Staff loyalty reinforced",
        description: "Your staff remembers that you credited real work publicly instead of hiding it behind politics.",
      };
    }
    if (hasTag(tags, "familyPrivacy", "playerWelfare", "independentAdvice")) {
      return {
        title: "Family trust reinforced",
        description: clubLabel
          ? `The family still remembers that your advice around ${clubLabel}'s pathway felt independent and protective of the player's future.`
          : "The family still remembers that your advice felt independent and protective of the player's future.",
      };
    }
    return {
      title: "Trust reinforced",
      description: `${audience} still remembers that you followed through when the relationship was being tested.`,
    };
  }

  if (hasTag(tags, "rivalry", "directCompetition", "ceasefireRejected")) {
    return {
      title: "Rivalry escalated",
      description: playerLabel && rivalLabel
        ? `${rivalLabel} still treats the ${playerLabel} case as a line you chose to contest rather than leave alone.`
        : "This line still carries heat from a contested recruitment race that neither side chose to soften.",
    };
  }

  if (hasTag(tags, "rivalry", "ceasefire", "negotiatedBoundary")) {
    return {
      title: "Boundary remembered",
      description: rivalLabel
        ? `${rivalLabel} still remembers the terms of a boundary that kept a wider scout war from breaking open.`
        : "A negotiated boundary still shapes how much competitive pressure this relationship expects from you.",
    };
  }

  if (hasTag(tags, "playerWelfare", "fastTrack", "pathway", "clubFit", "independentAdvice")) {
    return {
      title: "Pathway advice remembered",
      description: playerLabel && clubLabel
        ? `${audience} still ties your judgment to whether ${playerLabel} truly fit ${clubLabel}'s pathway and timing.`
        : "This relationship still circles back to whether your advice matched the right pathway, timing, and developmental context.",
    };
  }

  if (hasTag(tags, "mediaAccess", "informationLeak")) {
    return {
      title: "Information leak remembered",
      description: "A media-facing confidence was tested, and that still affects how safely this relationship believes it can talk to you.",
    };
  }

  if (hasTag(tags, "mutualComplicity", "integrityConflict", "dishonest", "exposedMisconduct")) {
    return {
      title: "Integrity line remembered",
      description: "This relationship still carries a memory of where you drew the line when influence, secrecy, or misconduct became part of the ask.",
    };
  }

  if (hasTag(tags, "employeeCredit", "leadership")) {
    return {
      title: "Leadership call remembered",
      description: "Your handling of ownership, recognition, and internal politics still colors how this relationship reads your leadership.",
    };
  }

  if (hasTag(tags, "meetingPositive", "listened", "evidencePresented", "strategicVision")) {
    return {
      title: "Credibility established",
      description: "A prior meeting left the sense that you could explain your judgment clearly when scrutiny increased.",
    };
  }

  if (hasTag(tags, "meetingNegative", "professionalChallenge", "accountability", "costDiscipline")) {
    return {
      title: "Scrutiny remembered",
      description: "A difficult prior meeting still shapes how cautiously this stakeholder receives your judgment.",
    };
  }

  return {
    title: tags[0] ? readableLabel(tags[0]) : "Shared history",
    description: "A past episode still shapes how this relationship reads your judgment and reliability.",
  };
}

function describeObligation(kind: string, terms: string): { title: string; description: string } {
  switch (kind) {
    case "familyPrivacy":
      return {
        title: "Family privacy request",
        description: "A family is still relying on you to keep a prospect's circumstances out of the wrong spotlight.",
      };
    case "mediaAccess":
      return {
        title: "Media deadline",
        description: "A journalist still expects a clear answer before deciding whether you remain part of the trusted circle.",
      };
    case "confidentiality":
      return {
        title: "Confidentiality promise",
        description: "Sensitive access remains conditional on whether you keep the line private.",
      };
    case "agentAttribution":
    case "agentExclusive":
      return {
        title: "Agent understanding",
        description: "An agent still expects you to honor the agreed lane around credit, access, or timing.",
      };
    case "employeeCredit":
      return {
        title: "Staff credit promise",
        description: "A staff relationship is still waiting to see whether you will stand behind the people who did the work.",
      };
    default:
      return {
        title: readableLabel(kind),
        description: terms,
      };
  }
}

export function buildStoryThread(input: {
  state: Pick<GameState, "consequenceState" | "accessAgreements">;
  stakeholder: EntityRef;
  now: GameDate;
}): StoryThread {
  const memories = Object.values(input.state.consequenceState.memories)
    .filter((memory) => sameEntity(memory.stakeholder, input.stakeholder))
    .map((memory) => ({
      id: memory.id,
      kind: "memory" as const,
      season: memory.createdAt.season,
      week: memory.createdAt.week,
      ...describeMemory(
        input.stakeholder,
        memory.tags,
        memory.metadata as Record<string, unknown> | undefined,
      ),
    }));
  const obligations = Object.values(input.state.consequenceState.obligations)
    .filter((obligation) =>
      sameEntity(obligation.creditor, input.stakeholder) || sameEntity(obligation.debtor, input.stakeholder),
    )
    .map((obligation) => ({
      id: obligation.id,
      kind: "obligation" as const,
      season: obligation.createdAt.season,
      week: obligation.createdAt.week,
      ...describeObligation(obligation.kind, obligation.terms),
    }));
  const access = buildAccessAgreementStoryEntries(
    getActiveAccessAgreementsForStakeholder(
      input.state.accessAgreements,
      input.stakeholder,
      input.now,
    ),
  );
  const entries = [...memories, ...obligations, ...access]
    .sort((left, right) =>
      right.season - left.season || right.week - left.week || left.id.localeCompare(right.id),
    );
  return {
    stakeholder: { ...input.stakeholder },
    entries,
  };
}
