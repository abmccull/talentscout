import type {
  CareerPath,
  CareerTier,
  Club,
  FinancialRecord,
  Scout,
  ScoutingPhilosophy,
  Specialization,
} from "@/engine/core/types";
import type { LeadershipPortfolioState } from "@/engine/career/leadership";
import {
  deriveCareerRoleProfile,
  type CareerAuthorityLevel,
  type CareerOperatingModel,
} from "./roleProfile";

export type CareerRoleTrack =
  | "craft"
  | "territory"
  | "leadership"
  | "politics"
  | "business"
  | "staff";

export interface CareerRoleDuty {
  id: string;
  label: string;
  track: CareerRoleTrack;
  summary: string;
  weeklyDecision: string;
  successSignals: string[];
  failureModes: string[];
}

export interface CareerRolePressure {
  id: string;
  label: string;
  severity: "low" | "medium" | "high";
  reason: string;
  mitigation: string;
}

export interface CareerRolePackage {
  title: string;
  operatingModel: CareerOperatingModel;
  authorityLevel: CareerAuthorityLevel;
  stage:
    | "apprentice"
    | "specialist"
    | "territoryOwner"
    | "leader"
    | "executive"
    | "independentBuilder"
    | "agencyLeader";
  path: CareerPath;
  tier: CareerTier;
  summary: string;
  responsibilities: CareerRoleDuty[];
  authorityUnlocked: string[];
  failureModes: string[];
  decisionThemes: string[];
  pressures: CareerRolePressure[];
}

export interface CareerRolePackageInput {
  scout: Pick<
    Scout,
    | "careerPath"
    | "careerTier"
    | "primarySpecialization"
    | "reputation"
    | "clubTrust"
    | "currentClubId"
    | "employmentContract"
  >;
  finances?: Pick<
    FinancialRecord,
    | "balance"
    | "independentTier"
    | "retainerContracts"
    | "employees"
    | "pendingEmployeeEvents"
    | "office"
    | "clientRelationships"
  >;
  club?: Pick<Club, "id" | "name" | "scoutingPhilosophy" | "reputation">;
  leadershipPortfolio?: Pick<
    LeadershipPortfolioState,
    "attentionCapacity" | "attentionUsed" | "responsibilities" | "trackRecord"
  >;
}

const SPECIALIZATION_CRAFT_LABEL: Record<Specialization, string> = {
  youth: "finding and placing prospects before the market settles on them",
  firstTeam: "identifying players who can change a squad now",
  regional: "owning a territory and interpreting its football economy",
  data: "turning noisy performance evidence into selection advantage",
};

const PHILOSOPHY_EXPECTATION: Record<ScoutingPhilosophy, string> = {
  academyFirst: "The employer expects patience, pathway design, and defensible youth conviction.",
  winNow: "The employer expects immediate utility, faster certainty, and low tolerance for dead time.",
  marketSmart: "The employer expects price discipline and repeatable value extraction.",
  globalRecruiter: "The employer expects wider reach, stronger access, and comfort with adaptation risk.",
};

function specializationSummary(specialization: Specialization): string {
  return SPECIALIZATION_CRAFT_LABEL[specialization];
}

function activeRetainers(input: CareerRolePackageInput): number {
  return input.finances?.retainerContracts.filter((contract) => contract.status === "active").length ?? 0;
}

function suspendedRetainers(input: CareerRolePackageInput): number {
  return input.finances?.retainerContracts.filter((contract) => contract.status === "suspended").length ?? 0;
}

function lowMoraleStaff(input: CareerRolePackageInput): number {
  return input.finances?.employees.filter((employee) => employee.morale < 45).length ?? 0;
}

function activeLeadershipLoad(input: CareerRolePackageInput): number {
  return Object.values(input.leadershipPortfolio?.responsibilities ?? {}).filter((responsibility) =>
    responsibility.status === "open"
    || responsibility.status === "owned"
    || responsibility.status === "delegated"
    || responsibility.status === "deferred"
  ).length;
}

function specialistResponsibilities(input: CareerRolePackageInput): CareerRoleDuty[] {
  return [
    {
      id: "craft-standard",
      label: "Defend the quality of your read",
      track: "craft",
      summary: `Your job is still primarily about ${specializationSummary(input.scout.primarySpecialization)}.`,
      weeklyDecision: "Choose which case deserves your best live evidence and which can remain provisional.",
      successSignals: [
        "Reports answer a real question rather than repeat the same watch",
        "Confidence matches the amount of evidence you actually have",
      ],
      failureModes: [
        "Volume without distinct judgment",
        "Overclaiming before the context changes",
      ],
    },
  ];
}

function territoryResponsibilities(input: CareerRolePackageInput): CareerRoleDuty[] {
  const clubExpectation = input.club?.scoutingPhilosophy
    ? PHILOSOPHY_EXPECTATION[input.club.scoutingPhilosophy]
    : "You are now judged on whether your coverage creates a strategic edge, not only a good individual report.";
  return [
    ...specialistResponsibilities(input),
    {
      id: "territory-ownership",
      label: "Own a scouting lane",
      track: "territory",
      summary: clubExpectation,
      weeklyDecision: "Decide whether to deepen one region, protect a relationship, or broaden coverage for the next cycle.",
      successSignals: [
        "Coverage reaches more than one useful context",
        "Your region produces differentiated leads rather than generic names",
      ],
      failureModes: [
        "Domestic comfort replacing useful breadth",
        "Travel volume that does not change access or evidence quality",
      ],
    },
  ];
}

function leadershipResponsibilities(
  input: CareerRolePackageInput,
  effectiveTier: CareerTier,
): CareerRoleDuty[] {
  const activeLoad = activeLeadershipLoad(input);
  return [
    ...territoryResponsibilities(input),
    {
      id: "delegation-standard",
      label: "Turn staff output into decisions",
      track: "leadership",
      summary: `Tier ${effectiveTier} work now includes delegation, review, and timing. ${activeLoad > 0 ? `${activeLoad} live leadership responsibility${activeLoad === 1 ? " is" : "ies are"} currently open.` : "The leadership lane is available even if the weekly queue is light right now."}`,
      weeklyDecision: "Choose what you own personally, what you delegate, and what is too important to defer.",
      successSignals: [
        "Delegated work arrives on time and is still useful when it lands",
        "Leadership attention is spent on the cases that change outcomes",
      ],
      failureModes: [
        "Deferring difficult calls until the window closes",
        "Treating delegated work as free instead of politically attributable",
      ],
    },
  ];
}

function executiveResponsibilities(input: CareerRolePackageInput): CareerRoleDuty[] {
  return [
    ...leadershipResponsibilities(input, 5),
    {
      id: "political-ownership",
      label: "Carry the department's football politics",
      track: "politics",
      summary: "At the top tier, your job includes doctrine, board trust, and the consequences of other people's mistakes.",
      weeklyDecision: "Balance manager urgency, board priorities, staff morale, and the evidence standard you want the whole department to live by.",
      successSignals: [
        "Department output stays coherent under pressure",
        "Club stakeholders trust the process as well as the recommendations",
      ],
      failureModes: [
        "Short-term political wins that break long-term scouting standards",
        "Letting staff conflict or board pressure set doctrine by default",
      ],
    },
  ];
}

function independentResponsibilities(input: CareerRolePackageInput): CareerRoleDuty[] {
  const retainers = activeRetainers(input);
  return [
    {
      id: "business-craft-balance",
      label: "Protect judgment while earning the next month",
      track: "business",
      summary: `Independent work is a business, not just a looser club job. ${retainers > 0 ? `${retainers} active retainer${retainers === 1 ? " is" : "s are"} shaping your workload.` : "No active retainer is currently smoothing the income curve."}`,
      weeklyDecision: "Choose whether to chase stable revenue, speculative upside, or higher-trust relationships.",
      successSignals: [
        "Paid work does not consume all report capacity",
        "The next client does not force lower standards on current work",
      ],
      failureModes: [
        "One client or one payday dominating the whole practice",
        "Accepting more promises than the desk can realistically deliver",
      ],
    },
  ];
}

function agencyResponsibilities(input: CareerRolePackageInput): CareerRoleDuty[] {
  const staffCount = input.finances?.employees.length ?? 0;
  return [
    ...independentResponsibilities(input),
    {
      id: "staff-quality-debt",
      label: "Manage a scouting operation, not just your own calendar",
      track: "staff",
      summary: `${staffCount} employee${staffCount === 1 ? "" : "s"} now sit between your standards and your outcomes.`,
      weeklyDecision: "Decide whether to use capacity for delivery, training, retention, or market expansion.",
      successSignals: [
        "Staff quality rises without the agency missing promises",
        "Growth creates better access instead of noisier output",
      ],
      failureModes: [
        "Resentful or overworked staff eroding quality behind the scenes",
        "Expansion without enough runway or leadership attention",
      ],
    },
  ];
}

function derivePressures(
  input: CareerRolePackageInput,
  profile: ReturnType<typeof deriveCareerRoleProfile>,
): CareerRolePressure[] {
  const pressures: CareerRolePressure[] = [];
  if (profile.operatingModel === "club") {
    if (input.scout.clubTrust < 45) {
      pressures.push({
        id: "club-trust",
        label: "Employer trust is thin",
        severity: "high",
        reason: "Low club trust means one poor recommendation or one missed political signal can cost authority quickly.",
        mitigation: "Deliver a cleaner recommendation or reduce visible overreach before escalating the next case.",
      });
    }
    if (profile.tier >= 4 && activeLeadershipLoad(input) >= 2) {
      pressures.push({
        id: "leadership-attention",
        label: "Leadership attention is saturated",
        severity: "medium",
        reason: "Open responsibilities now compete with live scouting time.",
        mitigation: "Own only the calls that change department credibility; delegate or reject the rest.",
      });
    }
  } else {
    const balance = input.finances?.balance ?? 0;
    if (balance < 4_000) {
      pressures.push({
        id: "runway",
        label: "Cash runway is short",
        severity: "high",
        reason: "Independent work can force bad recommendations when cash is thin.",
        mitigation: "Bias toward contracted revenue or smaller, faster-closing work until the runway improves.",
      });
    }
    if (suspendedRetainers(input) > 0) {
      pressures.push({
        id: "client-trust",
        label: "Revenue is already at risk",
        severity: "medium",
        reason: "Suspended retainers mean existing promises are under pressure before any new work is accepted.",
        mitigation: "Repair delivery discipline before chasing expansion.",
      });
    }
    if (lowMoraleStaff(input) > 0) {
      pressures.push({
        id: "staff-fragility",
        label: "Staff morale is fragile",
        severity: "medium",
        reason: "Weak morale turns capacity into quality debt and resignation risk.",
        mitigation: "Reduce overload, address compensation, or stop using staff as generic throughput.",
      });
    }
  }
  return pressures;
}

function determineStage(
  profile: ReturnType<typeof deriveCareerRoleProfile>,
): CareerRolePackage["stage"] {
  if (profile.operatingModel === "agency") {
    return profile.tier >= 5 ? "agencyLeader" : "independentBuilder";
  }
  if (profile.operatingModel === "independent") {
    return profile.tier >= 2 ? "independentBuilder" : "apprentice";
  }
  if (profile.authorityLevel === "executive") return "executive";
  if (profile.authorityLevel === "department") return "leader";
  if (profile.authorityLevel === "portfolio") return "territoryOwner";
  if (profile.tier >= 2) return "specialist";
  return "apprentice";
}

export function deriveCareerRolePackage(
  input: CareerRolePackageInput,
): CareerRolePackage {
  const profile = deriveCareerRoleProfile({
    scout: input.scout as Scout,
    finances: input.finances as FinancialRecord | undefined,
    club: input.club as Club | undefined,
  });
  const stage = determineStage(profile);
  const title = profile.title;
  const responsibilities =
    profile.operatingModel === "independent" || profile.operatingModel === "agency"
      ? profile.operatingModel === "agency"
        ? agencyResponsibilities(input)
        : independentResponsibilities(input)
      : profile.tier >= 5
        ? executiveResponsibilities(input)
        : profile.tier >= 4
          ? leadershipResponsibilities(input, profile.tier)
          : profile.tier >= 3
            ? territoryResponsibilities(input)
            : specialistResponsibilities(input);

  const decisionThemes = responsibilities.map((responsibility) => responsibility.weeklyDecision);
  const summary = profile.operatingModel === "club"
    ? `Your remit has changed. The club still values ${specializationSummary(input.scout.primarySpecialization)}, but Tier ${profile.tier} work is increasingly judged by how you allocate authority and consequence.`
    : profile.operatingModel === "agency"
    ? `Your work is now judged as a practice. The job is no longer just ${specializationSummary(input.scout.primarySpecialization)}; it is choosing which business pressure you will accept to keep doing it well.`
    : `You still own the read, but independence now means deciding which work deserves your runway before the market decides for you.`;

  return {
    title,
    operatingModel: profile.operatingModel,
    authorityLevel: profile.authorityLevel,
    stage,
    path: input.scout.careerPath,
    tier: profile.tier,
    summary,
    responsibilities,
    authorityUnlocked: profile.authorities,
    failureModes: profile.failureModes.map((failureMode) => failureMode.label),
    decisionThemes,
    pressures: derivePressures(input, profile),
  };
}
