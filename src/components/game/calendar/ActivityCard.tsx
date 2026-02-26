"use client";

import { Badge } from "@/components/ui/badge";
import type { Activity, ActivityType, ScoutSkill, ScoutAttribute } from "@/engine/core/types";
import {
  ACTIVITY_FATIGUE_COSTS,
  ACTIVITY_SKILL_XP,
  ACTIVITY_ATTRIBUTE_XP,
} from "@/engine/core/calendar";
import {
  Eye,
  Video,
  FileText,
  Users,
  Book,
  Moon,
  GraduationCap,
  Trophy,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const SKILL_LABELS: Record<string, string> = {
  technicalEye: "Tech Eye",
  physicalAssessment: "Physical",
  psychologicalRead: "Psych Read",
  tacticalUnderstanding: "Tactical",
  dataLiteracy: "Data Lit",
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

/** Icon + color per activity type for display. */
export const ACTIVITY_DISPLAY: Record<
  ActivityType,
  { label: string; icon: LucideIcon; color: string }
> = {
  attendMatch:          { label: "Attend Match",          icon: Eye,            color: "text-emerald-400" },
  watchVideo:           { label: "Watch Video",           icon: Video,          color: "text-blue-400" },
  writeReport:          { label: "Write Report",          icon: FileText,       color: "text-amber-400" },
  networkMeeting:       { label: "Network Meeting",       icon: Users,          color: "text-purple-400" },
  trainingVisit:        { label: "Training Visit",        icon: Eye,            color: "text-orange-400" },
  travel:               { label: "Travel",                icon: ChevronRight,   color: "text-zinc-400" },
  study:                { label: "Study",                 icon: Book,           color: "text-cyan-400" },
  rest:                 { label: "Rest",                  icon: Moon,           color: "text-zinc-400" },
  academyVisit:         { label: "Academy Visit",         icon: GraduationCap,  color: "text-pink-400" },
  youthTournament:      { label: "Youth Tournament",      icon: Trophy,         color: "text-yellow-400" },
  reviewNPCReport:      { label: "Review NPC Report",     icon: FileText,       color: "text-teal-400" },
  managerMeeting:       { label: "Manager Meeting",       icon: Users,          color: "text-rose-400" },
  boardPresentation:    { label: "Board Presentation",    icon: Users,          color: "text-indigo-400" },
  assignTerritory:      { label: "Assign Territory",      icon: ChevronRight,   color: "text-lime-400" },
  internationalTravel:  { label: "Int'l Travel",          icon: ChevronRight,   color: "text-sky-400" },
  schoolMatch:          { label: "School Match",          icon: Eye,            color: "text-green-400" },
  grassrootsTournament: { label: "Grassroots Tournament", icon: Trophy,         color: "text-lime-400" },
  streetFootball:       { label: "Street Football",       icon: Eye,            color: "text-orange-400" },
  academyTrialDay:      { label: "Academy Trial Day",     icon: GraduationCap,  color: "text-pink-400" },
  youthFestival:        { label: "Youth Festival",        icon: Trophy,         color: "text-yellow-400" },
  followUpSession:      { label: "Follow-Up Session",     icon: Eye,            color: "text-teal-400" },
  parentCoachMeeting:   { label: "Parent/Coach Meeting",  icon: Users,          color: "text-purple-400" },
  writePlacementReport: { label: "Placement Report",      icon: FileText,       color: "text-amber-400" },
  reserveMatch:         { label: "Reserve Match",         icon: Eye,            color: "text-emerald-400" },
  scoutingMission:      { label: "Scouting Mission",      icon: ChevronRight,   color: "text-sky-400" },
  oppositionAnalysis:   { label: "Opposition Analysis",   icon: Eye,            color: "text-rose-400" },
  agentShowcase:        { label: "Agent Showcase",        icon: Users,          color: "text-purple-400" },
  trialMatch:           { label: "Trial Match",           icon: Eye,            color: "text-emerald-400" },
  contractNegotiation:  { label: "Contract Negotiation",  icon: Users,          color: "text-amber-400" },
  databaseQuery:        { label: "Database Query",        icon: Book,           color: "text-cyan-400" },
  deepVideoAnalysis:    { label: "Deep Video Analysis",   icon: Video,          color: "text-blue-400" },
  statsBriefing:        { label: "Stats Briefing",        icon: FileText,       color: "text-teal-400" },
  dataConference:       { label: "Data Conference",       icon: Users,          color: "text-indigo-400" },
  algorithmCalibration: { label: "Algorithm Calibration", icon: Book,           color: "text-cyan-400" },
  marketInefficiency:   { label: "Market Scan",           icon: Book,           color: "text-lime-400" },
  analyticsTeamMeeting: { label: "Analytics Meeting",     icon: Users,          color: "text-purple-400" },
};

interface ActivityCardProps {
  activity: Activity;
  canScheduleAt: (activity: Activity, dayIndex: number) => boolean;
  onSchedule: (activity: Activity, dayIndex: number) => void;
  highlighted?: boolean;
}

export function ActivityCard({ activity, canScheduleAt, onSchedule, highlighted }: ActivityCardProps) {
  const display = ACTIVITY_DISPLAY[activity.type];
  const Icon = display.icon;
  const fatigueCost = ACTIVITY_FATIGUE_COSTS[activity.type];
  const skillXp = ACTIVITY_SKILL_XP[activity.type];
  const attrXp = ACTIVITY_ATTRIBUTE_XP[activity.type];

  // Sort XP entries by value descending, take top 3 skills + top 2 attributes
  const topSkills = skillXp
    ? (Object.entries(skillXp) as [ScoutSkill, number][])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
    : [];
  const topAttrs = attrXp
    ? (Object.entries(attrXp) as [ScoutAttribute, number][])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
    : [];

  const fatigueColor =
    fatigueCost < 0
      ? "text-emerald-400"
      : fatigueCost <= 5
        ? "text-zinc-400"
        : fatigueCost <= 8
          ? "text-amber-400"
          : "text-red-400";

  return (
    <div className={`rounded-md border px-2.5 py-2 ${highlighted ? "border-emerald-500/60 bg-emerald-500/5 ring-1 ring-emerald-500/20" : "border-[#27272a] bg-[#141414]"}`}>
      {/* Header: icon + label + slot badge */}
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon size={13} className={`${display.color} shrink-0`} aria-hidden="true" />
          <span className={`text-[11px] font-medium truncate ${display.color}`}>
            {display.label}
          </span>
        </div>
        <Badge variant="outline" className="text-[9px] shrink-0 ml-1">
          {activity.slots}s
        </Badge>
      </div>

      {/* Fatigue + XP badges */}
      <div className="mb-1.5 flex flex-wrap gap-0.5">
        <span className={`inline-flex items-center rounded px-1 py-px text-[9px] font-medium bg-[#1a1a1a] ${fatigueColor}`}>
          {fatigueCost >= 0 ? "+" : ""}{fatigueCost}f
        </span>
        {topSkills.map(([skill, xp]) => (
          <span
            key={skill}
            className="inline-flex items-center rounded bg-blue-500/10 px-1 py-px text-[9px] font-medium text-blue-400"
          >
            {SKILL_LABELS[skill] ?? skill} +{xp}
          </span>
        ))}
        {topAttrs.map(([attr, xp]) => (
          <span
            key={attr}
            className="inline-flex items-center rounded bg-purple-500/10 px-1 py-px text-[9px] font-medium text-purple-300"
          >
            {ATTR_LABELS[attr] ?? attr} +{xp}
          </span>
        ))}
      </div>

      {/* Day buttons */}
      <div className="flex gap-0.5">
        {DAY_LABELS.map((day, dayIdx) => {
          const canPlace = canScheduleAt(activity, dayIdx);
          return (
            <button
              key={day}
              disabled={!canPlace}
              onClick={() => onSchedule(activity, dayIdx)}
              className={`flex-1 rounded px-0 py-px text-[9px] font-medium transition ${
                !canPlace
                  ? "cursor-not-allowed bg-[#27272a] text-zinc-600"
                  : "bg-[#27272a] text-zinc-300 hover:bg-emerald-500/20 hover:text-emerald-400"
              }`}
              aria-label={`Schedule ${display.label} on ${day}`}
            >
              {day.charAt(0)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
