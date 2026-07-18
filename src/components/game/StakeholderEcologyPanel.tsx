import type { StakeholderEcologyProfile } from "@/engine/consequences";
import { memoryPersistenceLabel } from "./stakeholderEcologyPresentation";

function gameDate(date: { week: number; season: number }): string {
  return `S${date.season} W${date.week}`;
}

const TONE_CLASS = {
  positive: "border-emerald-400/20 bg-emerald-400/5 text-emerald-100",
  mixed: "border-amber-400/20 bg-amber-400/5 text-amber-100",
  negative: "border-red-400/20 bg-red-400/5 text-red-100",
};

export function StakeholderEcologyPanel({
  profile,
  title = "Relationship history",
}: {
  profile: StakeholderEcologyProfile;
  title?: string;
}) {
  const hasHistory = profile.memories.length > 0
    || profile.obligations.length > 0
    || profile.decisions.length > 0;

  return (
    <section
      className="rounded-lg border border-sky-400/15 bg-sky-400/[0.035] p-3"
      aria-label={title}
    >
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-sky-200">
          {title}
        </h4>
        {profile.trust.memoryDelta !== 0 && (
          <span className={profile.trust.memoryDelta > 0 ? "text-emerald-300" : "text-red-300"}>
            <span className="text-[10px]">
              Memory {profile.trust.memoryDelta > 0 ? "+" : ""}{profile.trust.memoryDelta}
            </span>
          </span>
        )}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md border border-white/10 bg-black/20 p-2">
          <p className="text-[10px] uppercase tracking-wide text-zinc-400">Trust signal</p>
          <p className="mt-0.5 font-medium text-white">{profile.trust.label}</p>
          {profile.trust.effective !== undefined && (
            <p className="mt-0.5 text-[10px] text-zinc-400">
              {profile.trust.effective}/100 after remembered dealings
            </p>
          )}
        </div>
        <div className="rounded-md border border-white/10 bg-black/20 p-2">
          <p className="text-[10px] uppercase tracking-wide text-zinc-400">Influence</p>
          <p className="mt-0.5 font-medium text-white">{profile.influence.label}</p>
          <p className="mt-0.5 text-[10px] text-zinc-400">
            {profile.influence.score}/100 · {profile.influence.activeObligations} active promise{profile.influence.activeObligations === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {!hasHistory ? (
        <p className="mt-3 text-xs leading-5 text-zinc-400">
          No consequential shared history yet. Specific choices, promises, and competitive encounters will appear here.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {profile.memories.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                What they remember
              </p>
              <ul className="space-y-1.5">
                {profile.memories.map((memory) => (
                  <li
                    key={memory.id}
                    className={`rounded-md border px-2 py-1.5 text-[11px] leading-4 ${TONE_CLASS[memory.tone]}`}
                  >
                    <p>{memory.summary}</p>
                    <p className="mt-0.5 text-[10px] text-zinc-300">
                      {gameDate(memory.occurredAt)} · {memoryPersistenceLabel(memory.effectiveSalience)}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {profile.obligations.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                Promises and debts
              </p>
              <ul className="space-y-1 text-[11px] text-zinc-300">
                {profile.obligations.map((obligation) => (
                  <li key={obligation.id} className="rounded-md border border-white/10 bg-black/20 px-2 py-1.5">
                    <span className="font-medium text-white">
                      {obligation.role === "owedByYou"
                        ? "You owe: "
                        : obligation.role === "owedToYou"
                          ? "They owe: "
                          : "Involved: "}
                    </span>
                    {obligation.terms}
                    <span className="ml-1 text-zinc-300">
                      ({obligation.status}{obligation.dueAt ? ` · due ${gameDate(obligation.dueAt)}` : ""})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {profile.decisions.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                Recent decisions
              </p>
              <ul className="space-y-1 text-[11px] text-zinc-400">
                {profile.decisions.map((decision) => (
                  <li key={decision.id} className="flex items-start justify-between gap-2">
                    <span>
                      <span className="text-zinc-200">{decision.summary}</span>
                      {decision.selectedOption ? ` — ${decision.selectedOption}` : ""}
                      {decision.nextConsequenceAt
                        ? ` · next consequence ${gameDate(decision.nextConsequenceAt)}`
                        : ""}
                    </span>
                    <span className="shrink-0 text-[10px] text-zinc-300">{gameDate(decision.offeredAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
