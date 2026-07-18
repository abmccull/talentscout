"use client";

import { ArrowRight, BriefcaseBusiness, CalendarClock, ShieldCheck, WalletCards } from "lucide-react";
import type { Club, FinancialRecord, PerformanceReview, Scout } from "@/engine/core/types";
import {
  deriveCareerRoleProfile,
  type CareerRoleProfile,
} from "@/engine/career/roleProfile";
import { usePersistentDisclosure } from "@/lib/usePersistentDisclosure";

interface CareerSituationPanelProps {
  scout: Scout;
  finances: FinancialRecord | null;
  currentSeason: number;
  currentClub?: Club;
  jobOfferCount: number;
  latestReview?: PerformanceReview;
  monthlyIncome: number;
  monthlyExpenses: number;
  onPlanWeek: () => void;
}

interface SituationSignal {
  label: string;
  value: string;
  detail: string;
  tone: "emerald" | "amber" | "red" | "blue";
}

const TONE_CLASSES: Record<SituationSignal["tone"], string> = {
  emerald: "border-emerald-400/20 bg-emerald-400/[0.045] text-emerald-200",
  amber: "border-amber-400/20 bg-amber-400/[0.045] text-amber-200",
  red: "border-red-400/20 bg-red-400/[0.045] text-red-200",
  blue: "border-sky-400/20 bg-sky-400/[0.045] text-sky-200",
};

function employmentSecurity(scout: Scout, latestReview?: PerformanceReview): SituationSignal {
  if (scout.careerPath === "independent") {
    return {
      label: "Career security",
      value: "Self-employed",
      detail: "Your client pipeline and cash position decide how much freedom you have.",
      tone: "blue",
    };
  }

  if (latestReview?.outcome === "warning" || scout.clubTrust < 35) {
    return {
      label: "Role security",
      value: "At risk",
      detail: "Your next reports and conversations will carry unusual weight.",
      tone: "red",
    };
  }
  if (scout.clubTrust < 55) {
    return {
      label: "Role security",
      value: "Under review",
      detail: "The club needs clearer evidence and more dependable delivery.",
      tone: "amber",
    };
  }
  return {
    label: "Role security",
    value: scout.clubTrust >= 75 ? "Trusted" : "Stable",
    detail: scout.clubTrust >= 75
      ? "You have room to challenge assumptions, but trust still has to be defended."
      : "Your position is sound while you keep meeting the club's brief.",
    tone: "emerald",
  };
}

function financialRunway(
  finances: FinancialRecord | null,
  monthlyIncome: number,
  monthlyExpenses: number,
): SituationSignal {
  if (!finances) {
    return {
      label: "Financial runway",
      value: "Not available",
      detail: "This older career has no complete financial record.",
      tone: "amber",
    };
  }
  const monthlyBurn = monthlyExpenses - monthlyIncome;
  if (monthlyBurn <= 0) {
    return {
      label: "Financial runway",
      value: "Cash-flow positive",
      detail: "Current committed income covers your regular monthly costs.",
      tone: "emerald",
    };
  }
  const months = Math.max(0, finances.balance / monthlyBurn);
  return {
    label: "Financial runway",
    value: months >= 24 ? "24+ months" : `${months.toFixed(months < 4 ? 1 : 0)} months`,
    detail: months < 2
      ? "A missed payment or expensive trip could force a career decision."
      : months < 5
        ? "You can keep operating, but speculative work now carries real risk."
        : "You have time to invest selectively without ignoring recurring costs.",
    tone: months < 2 ? "red" : months < 5 ? "amber" : "blue",
  };
}

function currentBrief(
  scout: Scout,
  finances: FinancialRecord | null,
  role: CareerRoleProfile,
): SituationSignal {
  const contract = scout.employmentContract;
  if (scout.careerPath === "club") {
    const employerNeed = role.employerNeeds[0];
    return {
      label: "Employer need",
      value: employerNeed?.label ?? contract?.role ?? "Deliver defensible decisions",
      detail: employerNeed?.reason
        ?? (contract
          ? `${contract.objectives.reportsPerSeason} reports, ${contract.objectives.minimumAverageQuality}+ quality, and ${contract.objectives.successfulRecommendations} successful recommendations this season.`
          : "Answer the club's current brief with evidence that can survive challenge."),
      tone: "blue",
    };
  }

  const activeRetainers = finances?.retainerContracts.filter((contract) => contract.status === "active") ?? [];
  const reportsDue = activeRetainers.reduce(
    (total, contract) => total + Math.max(0, contract.requiredReportsPerMonth - contract.reportsDeliveredThisMonth),
    0,
  );
  return {
    label: "Practice need",
    value: activeRetainers.length > 0
      ? `${activeRetainers.length} active client${activeRetainers.length === 1 ? "" : "s"}`
      : "Build recurring work",
    detail: activeRetainers.length > 0
      ? `${reportsDue} client report${reportsDue === 1 ? "" : "s"} remain before the next settlement cycle.`
      : "One-off work pays today; trusted retainers create room to choose better cases tomorrow.",
    tone: reportsDue > 4 ? "amber" : "blue",
  };
}

function nextMilestone(
  scout: Scout,
  finances: FinancialRecord | null,
  currentSeason: number,
  jobOfferCount: number,
  role: CareerRoleProfile,
): SituationSignal {
  if (jobOfferCount > 0) {
    return {
      label: "Next milestone",
      value: `Decide on ${jobOfferCount} offer${jobOfferCount === 1 ? "" : "s"}`,
      detail: "Compare authority, expectations, security, and development support before moving.",
      tone: "amber",
    };
  }
  if (scout.careerPath === "club" && scout.contractEndSeason !== undefined
    && scout.contractEndSeason <= currentSeason + 1) {
    return {
      label: "Next milestone",
      value: "Earn the next contract",
      detail: `Your current agreement runs through Season ${scout.contractEndSeason}.`,
      tone: "amber",
    };
  }
  if (scout.careerPath === "independent" && (finances?.pendingRetainerOffers.length ?? 0) > 0) {
    const offerCount = finances?.pendingRetainerOffers.length ?? 0;
    return {
      label: "Next milestone",
      value: `Choose ${offerCount} client offer${offerCount === 1 ? "" : "s"}`,
      detail: "Every new client adds income, obligations, and concentration risk.",
      tone: "amber",
    };
  }
  return {
    label: "Next milestone",
    value: role.promotion.nextRole ?? "Shape your legacy",
    detail: role.promotion.requirements[0]
      ?? "A defensible judgment with a remembered outcome matters more than raw activity volume.",
    tone: "emerald",
  };
}

export function CareerSituationPanel({
  scout,
  finances,
  currentSeason,
  currentClub,
  jobOfferCount,
  latestReview,
  monthlyIncome,
  monthlyExpenses,
  onPlanWeek,
}: CareerSituationPanelProps) {
  const [roleDetailsOpen, setRoleDetailsOpen] = usePersistentDisclosure(
    "career.role-responsibilities",
  );
  const role = deriveCareerRoleProfile({
    scout,
    finances: finances ?? undefined,
    club: currentClub,
  });
  const signals = [
    employmentSecurity(scout, latestReview),
    currentBrief(scout, finances, role),
    nextMilestone(scout, finances, currentSeason, jobOfferCount, role),
    financialRunway(finances, monthlyIncome, monthlyExpenses),
  ];

  return (
    <section
      className="rounded-2xl border border-emerald-400/20 bg-[radial-gradient(circle_at_top_right,rgba(52,211,153,0.08),transparent_38%),rgba(17,22,28,0.95)] p-4 sm:p-5"
      aria-labelledby="career-situation-title"
      data-testid="career-situation-panel"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
            <BriefcaseBusiness size={14} aria-hidden="true" />
            Current appointment
          </p>
          <h2 id="career-situation-title" className="mt-1 text-lg font-bold text-white">
            {role.title}
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            {currentClub?.name ?? "Your own practice"} · Season {currentSeason}
          </p>
        </div>
        <button
          type="button"
          onClick={onPlanWeek}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-emerald-400 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
        >
          Plan the next move
          <ArrowRight size={15} className="ml-2" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {signals.map((signal, index) => {
          const Icon = index === 0
            ? ShieldCheck
            : index === 1
              ? BriefcaseBusiness
              : index === 2
                ? CalendarClock
                : WalletCards;
          return (
            <article key={signal.label} className={`rounded-xl border p-3.5 ${TONE_CLASSES[signal.tone]}`}>
              <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] opacity-80">
                <Icon size={14} aria-hidden="true" />
                {signal.label}
              </p>
              <p className="mt-2 text-sm font-bold text-white">{signal.value}</p>
              <p className="mt-1 text-xs leading-5 text-zinc-400">{signal.detail}</p>
            </article>
          );
        })}
      </div>

      <details
        className="group mt-3 rounded-xl border border-white/10 bg-black/20"
        open={roleDetailsOpen}
        onToggle={(event) => setRoleDetailsOpen(event.currentTarget.open)}
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300">
          What this role asks of you
          <span className="text-xs font-normal text-zinc-400 group-open:hidden">Responsibilities, authority, and risk</span>
          <span className="hidden text-xs font-normal text-zinc-400 group-open:inline">Hide role brief</span>
        </summary>
        <div className="grid gap-4 border-t border-white/10 p-4 lg:grid-cols-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">Your responsibilities</h3>
            <ul className="mt-2 space-y-2 text-xs leading-5 text-zinc-300">
              {role.responsibilities.map((responsibility) => (
                <li key={responsibility} className="flex gap-2">
                  <span className="text-emerald-300" aria-hidden="true">&bull;</span>
                  <span>{responsibility}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-300">Your authority</h3>
            <ul className="mt-2 space-y-2 text-xs leading-5 text-zinc-300">
              {role.authorities.map((authority) => (
                <li key={authority} className="flex gap-2">
                  <span className="text-sky-300" aria-hidden="true">&bull;</span>
                  <span>{authority}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-300">What can cost you</h3>
            <ul className="mt-2 space-y-2 text-xs leading-5 text-zinc-300">
              {role.failureModes.map((failure) => (
                <li key={failure.id}>
                  <p className="font-semibold text-zinc-200">{failure.label}</p>
                  <p className="text-zinc-500">{failure.consequence}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </details>
    </section>
  );
}
