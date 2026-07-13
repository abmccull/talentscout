"use client";

import { useCallback, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import type {
  Activity,
  ActivityType,
  ScoutAttribute,
  ScoutSkill,
} from "@/engine/core/types";
import {
  ACTIVITY_ATTRIBUTE_XP,
  ACTIVITY_FATIGUE_COSTS,
  ACTIVITY_SKILL_XP,
} from "@/engine/core/calendar";
import {
  Book,
  ChevronRight,
  Eye,
  FileText,
  GraduationCap,
  Moon,
  Trophy,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const SKILL_LABELS: Record<string, string> = {
  technicalEye: "Tech Eye",
  physicalAssessment: "Physical",
  psychologicalRead: "Psych Read",
  tacticalUnderstanding: "Tactical",
  dataLiteracy: "Data",
  playerJudgment: "Judgment",
  potentialAssessment: "Potential",
};

const ATTR_LABELS: Record<string, string> = {
  networking: "Network",
  persuasion: "Persuasion",
  endurance: "Endurance",
  adaptability: "Adapt",
  memory: "Memory",
  intuition: "Intuition",
};

type ActivityGuide = {
  context: string;
  question: string;
};

const ACTIVITY_GUIDANCE: Partial<Record<ActivityType, ActivityGuide>> = {
  attendMatch: {
    context: "Full match context with team structure and level of opponent.",
    question: "Who actually changes the game when the rhythm and stakes rise?",
  },
  trainingVisit: {
    context: "Controlled environment for repetitions, habits, and coach demands.",
    question: "Does the player's technique and focus survive repetition?",
  },
  watchVideo: {
    context: "Desk review that sharpens the next live assignment.",
    question: "What should you verify in person before writing anything firm?",
  },
  schoolMatch: {
    context: "Raw youth football where physical edge and instinct show quickly.",
    question: "Is the player simply ahead early, or carrying traits that travel?",
  },
  grassrootsTournament: {
    context: "Dense prospect pool across multiple games and contrasting styles.",
    question: "Who keeps standing out when the samples stack up?",
  },
  streetFootball: {
    context: "Loose environment that exposes improvisation and technical bravery.",
    question: "Which actions come naturally without structure doing the work?",
  },
  academyTrialDay: {
    context: "Organised trial setting with stronger coaching scrutiny.",
    question: "Does the player look coachable as well as talented?",
  },
  youthFestival: {
    context: "Higher-profile youth gathering with broader comparison points.",
    question: "Who looks repeatable against better-calibrated opposition?",
  },
  youthTournament: {
    context: "Tournament football with faster reads, fatigue, and pressure.",
    question: "Which players hold their level across short-turnaround games?",
  },
  followUpSession: {
    context: "A narrow revisit to test whether the first impression still holds.",
    question: "What remains unresolved after your first watch?",
  },
  parentCoachMeeting: {
    context: "Off-pitch background on mentality, habits, and support structure.",
    question: "What character or context could change the projection?",
  },
  writeReport: {
    context: "Convert observations into a call somebody else can act on.",
    question: "What are you prepared to say clearly, and with how much conviction?",
  },
  writePlacementReport: {
    context: "Match a prospect to a club environment and pathway.",
    question: "Which destination makes the recommendation believable right now?",
  },
  networkMeeting: {
    context: "Relationship work that unlocks future leads and private intel.",
    question: "Which contact can improve next week's opportunity quality?",
  },
  study: {
    context: "Quiet development time that improves future reads.",
    question: "Which weakness in your craft is costing you the most today?",
  },
  rest: {
    context: "Recovery time that protects observation accuracy and judgment.",
    question: "Are you risking poor reads by pushing through fatigue?",
  },
};

/** Icon + color per activity type for display. */
export const ACTIVITY_DISPLAY: Record<
  ActivityType,
  { label: string; icon: LucideIcon; color: string }
> = {
  attendMatch: { label: "Attend Match", icon: Eye, color: "text-emerald-400" },
  watchVideo: { label: "Watch Video", icon: Video, color: "text-blue-400" },
  writeReport: { label: "Write Report", icon: FileText, color: "text-amber-400" },
  networkMeeting: { label: "Network Meeting", icon: Users, color: "text-purple-400" },
  trainingVisit: { label: "Training Visit", icon: Eye, color: "text-orange-400" },
  travel: { label: "Travel", icon: ChevronRight, color: "text-zinc-400" },
  study: { label: "Study", icon: Book, color: "text-cyan-400" },
  rest: { label: "Rest", icon: Moon, color: "text-zinc-400" },
  academyVisit: {
    label: "Academy Visit",
    icon: GraduationCap,
    color: "text-pink-400",
  },
  youthTournament: {
    label: "Youth Tournament",
    icon: Trophy,
    color: "text-yellow-400",
  },
  reviewNPCReport: {
    label: "Review NPC Report",
    icon: FileText,
    color: "text-teal-400",
  },
  managerMeeting: {
    label: "Manager Meeting",
    icon: Users,
    color: "text-rose-400",
  },
  boardPresentation: {
    label: "Board Presentation",
    icon: Users,
    color: "text-indigo-400",
  },
  assignTerritory: {
    label: "Assign Territory",
    icon: ChevronRight,
    color: "text-lime-400",
  },
  internationalTravel: {
    label: "Int'l Travel",
    icon: ChevronRight,
    color: "text-sky-400",
  },
  schoolMatch: { label: "School Match", icon: Eye, color: "text-green-400" },
  grassrootsTournament: {
    label: "Grassroots Tournament",
    icon: Trophy,
    color: "text-lime-400",
  },
  streetFootball: {
    label: "Street Football",
    icon: Eye,
    color: "text-orange-400",
  },
  academyTrialDay: {
    label: "Academy Trial Day",
    icon: GraduationCap,
    color: "text-pink-400",
  },
  youthFestival: {
    label: "Youth Festival",
    icon: Trophy,
    color: "text-yellow-400",
  },
  followUpSession: {
    label: "Follow-Up Session",
    icon: Eye,
    color: "text-teal-400",
  },
  parentCoachMeeting: {
    label: "Parent/Coach Meeting",
    icon: Users,
    color: "text-purple-400",
  },
  writePlacementReport: {
    label: "Placement Report",
    icon: FileText,
    color: "text-amber-400",
  },
  agencyShowcase: {
    label: "Agency Showcase",
    icon: Trophy,
    color: "text-amber-400",
  },
  reserveMatch: { label: "Reserve Match", icon: Eye, color: "text-emerald-400" },
  scoutingMission: {
    label: "Scouting Mission",
    icon: ChevronRight,
    color: "text-sky-400",
  },
  oppositionAnalysis: {
    label: "Opposition Analysis",
    icon: Eye,
    color: "text-rose-400",
  },
  agentShowcase: {
    label: "Agent Showcase",
    icon: Users,
    color: "text-purple-400",
  },
  trialMatch: { label: "Trial Match", icon: Eye, color: "text-emerald-400" },
  contractNegotiation: {
    label: "Contract Negotiation",
    icon: Users,
    color: "text-amber-400",
  },
  databaseQuery: {
    label: "Database Query",
    icon: Book,
    color: "text-cyan-400",
  },
  deepVideoAnalysis: {
    label: "Deep Video Analysis",
    icon: Video,
    color: "text-blue-400",
  },
  statsBriefing: {
    label: "Stats Briefing",
    icon: FileText,
    color: "text-teal-400",
  },
  dataConference: {
    label: "Data Conference",
    icon: Users,
    color: "text-indigo-400",
  },
  algorithmCalibration: {
    label: "Algorithm Calibration",
    icon: Book,
    color: "text-cyan-400",
  },
  marketInefficiency: {
    label: "Market Scan",
    icon: Book,
    color: "text-lime-400",
  },
  analyticsTeamMeeting: {
    label: "Analytics Meeting",
    icon: Users,
    color: "text-purple-400",
  },
  freeAgentOutreach: {
    label: "Free Agent Outreach",
    icon: Users,
    color: "text-amber-400",
  },
  loanMonitoring: {
    label: "Loan Monitoring",
    icon: Eye,
    color: "text-sky-400",
  },
  loanRecommendation: {
    label: "Loan Recommendation",
    icon: FileText,
    color: "text-sky-400",
  },
};

interface ActivityCardProps {
  activity: Activity;
  canScheduleAt: (activity: Activity, dayIndex: number) => boolean;
  onSchedule: (activity: Activity, dayIndex: number) => void;
  highlighted?: boolean;
  isSelected?: boolean;
  onSelect?: (activity: Activity | null) => void;
  openDayCount: number;
}

function getBestReturns(activity: Activity): string[] {
  const skillXp = ACTIVITY_SKILL_XP[activity.type];
  const attrXp = ACTIVITY_ATTRIBUTE_XP[activity.type];

  const skillReturns = skillXp
    ? (Object.entries(skillXp) as [ScoutSkill, number][])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([skill, xp]) => `${SKILL_LABELS[skill] ?? skill} +${xp}`)
    : [];

  const attrReturns = attrXp
    ? (Object.entries(attrXp) as [ScoutAttribute, number][])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 1)
        .map(([attr, xp]) => `${ATTR_LABELS[attr] ?? attr} +${xp}`)
    : [];

  return [...skillReturns, ...attrReturns].slice(0, 3);
}

function getTargetPoolLabel(activity: Activity): string | null {
  if (!activity.targetPool?.length) return null;

  const suffix =
    activity.type === "networkMeeting"
      ? "contacts"
      : activity.type === "watchVideo"
        ? "clips"
        : "targets";

  return `${activity.targetPool.length} ${suffix}`;
}

function getGuide(activity: Activity): ActivityGuide {
  return (
    ACTIVITY_GUIDANCE[activity.type] ?? {
      context: activity.description || "A scouting task for the current week.",
      question: "What new information can this slot buy for you this week?",
    }
  );
}

export function ActivityCard({
  activity,
  canScheduleAt,
  onSchedule,
  highlighted,
  isSelected,
  onSelect,
  openDayCount,
}: ActivityCardProps) {
  const display = ACTIVITY_DISPLAY[activity.type];
  const Icon = display.icon;
  const fatigueCost = ACTIVITY_FATIGUE_COSTS[activity.type];
  const guide = getGuide(activity);
  const returns = getBestReturns(activity);
  const targetPoolLabel = getTargetPoolLabel(activity);

  const availableDays = useMemo(
    () => DAY_LABELS.filter((_, dayIndex) => canScheduleAt(activity, dayIndex)),
    [activity, canScheduleAt],
  );

  const firstAvailableDayIndex = useMemo(
    () => DAY_LABELS.findIndex((_, dayIndex) => canScheduleAt(activity, dayIndex)),
    [activity, canScheduleAt],
  );

  const handlePrimaryAction = useCallback(() => {
    if (onSelect) {
      onSelect(isSelected ? null : activity);
      return;
    }

    if (firstAvailableDayIndex >= 0) {
      onSchedule(activity, firstAvailableDayIndex);
    }
  }, [activity, firstAvailableDayIndex, isSelected, onSchedule, onSelect]);

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLElement>) => {
      e.dataTransfer.setData("application/json", JSON.stringify(activity));
      e.dataTransfer.effectAllowed = "move";
    },
    [activity],
  );

  const availabilityLabel =
    availableDays.length === 0
      ? "No open window this week"
      : availableDays.length === 1
        ? `Open ${availableDays[0]} only`
        : `${availableDays.length} start windows`;

  const fatigueTone =
    fatigueCost < 0
      ? "text-emerald-300"
      : fatigueCost <= 5
        ? "text-zinc-300"
        : fatigueCost <= 8
          ? "text-amber-300"
          : "text-red-300";

  const opportunityCost = openDayCount === 0
    ? `Needs ${activity.slots} day${activity.slots === 1 ? "" : "s"}; none open`
    : activity.slots === 1
      ? `Uses 1 of ${openDayCount} open day${openDayCount === 1 ? "" : "s"}`
      : `Uses ${activity.slots} of ${openDayCount} open days`;

  return (
    <article
      draggable
      onDragStart={handleDragStart}
      aria-grabbed={isSelected}
      className={`overflow-hidden rounded-xl border transition ${
        isSelected
          ? "border-blue-500/60 bg-blue-500/10 shadow-[0_0_0_1px_rgba(59,130,246,0.25)]"
          : highlighted
            ? "border-emerald-500/50 bg-emerald-500/10"
            : "border-[#27272a] bg-[#111111]/95 hover:border-zinc-600 hover:bg-white/[0.025]"
      }`}
    >
      <button
        type="button"
        onClick={handlePrimaryAction}
        disabled={!onSelect && availableDays.length === 0}
        aria-expanded={!!isSelected}
        aria-label={isSelected
          ? `Cancel selection for ${display.label}`
          : `${activity.targetPool?.length ? "Choose Day and Target" : "Choose Day"} for ${display.label}`}
        className="flex min-h-20 w-full items-center gap-3 px-3 py-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-emerald-400 disabled:cursor-not-allowed disabled:opacity-55 sm:px-4"
      >
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/30 ${display.color}`}
        >
          <Icon size={18} aria-hidden="true" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <h3 className={`text-sm font-semibold ${display.color}`}>{display.label}</h3>
            {targetPoolLabel && (
              <Badge variant="secondary" className="border-white/10 bg-white/5 text-[10px] text-zinc-300">
                {targetPoolLabel}
              </Badge>
            )}
          </span>
          <span className="mt-1 block truncate text-xs text-zinc-300">
            {activity.description || guide.context}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-400">
            <span>{opportunityCost}</span>
            <span className={fatigueTone}>
              {fatigueCost < 0 ? `${Math.abs(fatigueCost)} fatigue recovered` : `+${fatigueCost} fatigue`}
            </span>
            <span>{availabilityLabel}</span>
          </span>
        </span>

        <span
          className={`shrink-0 rounded-lg border px-2.5 py-2 text-xs font-semibold ${
            isSelected
              ? "border-blue-400/35 bg-blue-500/15 text-blue-100"
              : "border-white/10 bg-white/5 text-zinc-200"
          }`}
        >
          {isSelected ? "Cancel" : "Choose day"}
        </span>
      </button>

      {isSelected && (
        <div className="border-t border-blue-400/20 px-3 pb-4 pt-3 sm:px-4">
          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded-lg border border-white/8 bg-black/20 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                What this context reveals
              </p>
              <p className="mt-1.5 text-sm leading-5 text-zinc-200">{guide.context}</p>
            </div>
            <div className="rounded-lg border border-white/8 bg-black/20 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Decision to test
              </p>
              <p className="mt-1.5 text-sm leading-5 text-zinc-200">{guide.question}</p>
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-3 rounded-lg border border-amber-400/15 bg-amber-400/[0.04] p-3 sm:flex-row sm:items-center sm:justify-between">
            <span
              className="text-xs leading-5 text-amber-100/85"
            >
              <strong className="font-semibold text-amber-200">Tradeoff:</strong>{" "}
              {opportunityCost}; {fatigueCost < 0
                ? `recovers ${Math.abs(fatigueCost)} fatigue but gathers no new evidence.`
                : `adds ${fatigueCost} fatigue and leaves ${Math.max(0, openDayCount - activity.slots)} open days for other priorities.`}
            </span>

            {returns.length > 0 && (
              <div className="flex shrink-0 flex-wrap gap-1.5">
                {returns.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-1 text-[11px] text-blue-200"
                  >
                    {item}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-col gap-2 border-t border-white/8 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs text-zinc-400">
              {activity.targetPool?.length
                ? "Choose an open day above, then choose the target."
                : "Choose any highlighted open day in the sticky itinerary."}
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onSelect?.(null)}
                className="min-h-11 rounded-lg border border-white/10 px-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/5"
              >
                Cancel
              </button>
              {!activity.targetPool?.length && firstAvailableDayIndex >= 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onSchedule(activity, firstAvailableDayIndex);
                    onSelect?.(null);
                  }}
                  className="min-h-11 rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-4 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/20"
                >
                  Add to {DAY_LABELS[firstAvailableDayIndex]}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
