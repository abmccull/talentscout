import type {
  ScoutingCaseTimeline,
  ScoutingCaseTimelineEntryKind,
} from "@/engine/reports/scoutingCaseTimeline";

const KIND_LABELS: Record<ScoutingCaseTimelineEntryKind, string> = {
  discovery: "Discovery",
  reflection: "Reflection",
  judgment: "Judgment",
  report: "Report",
  delivery: "Delivery",
  decision: "Decision",
  alumni: "Alumni",
  movement: "Career move",
  review: "Review",
  milestone: "Milestone",
};

const KIND_COLORS: Record<ScoutingCaseTimelineEntryKind, string> = {
  discovery: "bg-cyan-400",
  reflection: "bg-violet-400",
  judgment: "bg-rose-400",
  report: "bg-sky-400",
  delivery: "bg-amber-400",
  decision: "bg-orange-400",
  alumni: "bg-emerald-400",
  movement: "bg-blue-400",
  review: "bg-fuchsia-400",
  milestone: "bg-yellow-400",
};

const ACCOUNTABILITY_LABELS: Record<ScoutingCaseTimeline["accountability"]["status"], string> = {
  buildingEvidence: "Building the read",
  awaitingDecision: "Decision needed",
  activeDecision: "Your judgment is live",
  awaitingOutcome: "Waiting for the outcome",
  vindicated: "Judgment vindicated",
  mixed: "Mixed outcome",
  challenged: "Judgment challenged",
  closed: "Case closed",
};

export function ScoutingCaseTimelineView({
  timeline,
}: {
  timeline: ScoutingCaseTimeline;
}) {
  const openUnknowns = timeline.unknowns.filter((unknown) => unknown.status === "open");
  const latestComparison = timeline.comparisons.at(-1);
  const latestCallback = timeline.callbacks.at(-1);
  return (
    <section
      className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.04] p-4"
      aria-labelledby={`casebook-${timeline.caseId}`}
      data-testid="scouting-case-timeline"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300">
            Living casebook
          </p>
          <h3 id={`casebook-${timeline.caseId}`} className="mt-1 text-sm font-bold text-white">
            From first evidence to career consequence
          </h3>
        </div>
        <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-medium capitalize text-zinc-300">
          {timeline.status}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-cyan-300/15 bg-black/20 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-200">
            The question this case must answer
          </p>
          <p className="mt-1 text-sm font-semibold leading-5 text-white">
            {timeline.centralQuestion.text}
          </p>
        </div>
        <div className="rounded-xl border border-amber-300/15 bg-black/20 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200">
            Accountability
          </p>
          <p className="mt-1 text-sm font-semibold text-white">
            {ACCOUNTABILITY_LABELS[timeline.accountability.status]}
          </p>
          <p className="mt-1 text-[11px] leading-4 text-zinc-400">
            {timeline.accountability.summary}
          </p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-zinc-300">
        <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1">
          {openUnknowns.length} open question{openUnknowns.length === 1 ? "" : "s"}
        </span>
        <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1">
          {timeline.comparisons.length} comparison{timeline.comparisons.length === 1 ? "" : "s"}
        </span>
        <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1">
          {timeline.callbacks.length} consequence update{timeline.callbacks.length === 1 ? "" : "s"}
        </span>
      </div>

      {(openUnknowns.length > 0 || latestComparison || latestCallback) && (
        <details className="group mt-3 rounded-xl border border-white/10 bg-black/20">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">
            What the next follow-up needs to settle
            <span className="font-normal text-zinc-500 group-open:hidden">Show case intelligence</span>
            <span className="hidden font-normal text-zinc-500 group-open:inline">Hide case intelligence</span>
          </summary>
          <div className="grid gap-3 border-t border-white/10 p-3 md:grid-cols-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-200">Still unknown</p>
              {openUnknowns.length > 0 ? (
                <ul className="mt-2 space-y-2 text-[11px] leading-4 text-zinc-300">
                  {openUnknowns.slice(0, 4).map((unknown) => (
                    <li key={unknown.id} className="border-l border-amber-300/30 pl-2">{unknown.statement}</li>
                  ))}
                </ul>
              ) : <p className="mt-2 text-[11px] text-zinc-500">No material unknown remains open.</p>}
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-cyan-200">Latest comparison</p>
              <p className="mt-2 text-[11px] leading-4 text-zinc-300">
                {latestComparison?.summary ?? "A second independent setting has not been compared yet."}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-200">Latest consequence</p>
              {latestCallback ? (
                <>
                  <p className="mt-2 text-[11px] font-semibold text-zinc-200">{latestCallback.title}</p>
                  <p className="mt-1 text-[11px] leading-4 text-zinc-400">{latestCallback.detail}</p>
                </>
              ) : <p className="mt-2 text-[11px] text-zinc-500">No later career consequence has arrived yet.</p>}
            </div>
          </div>
        </details>
      )}

      {timeline.entries.length === 0 ? (
        <p className="mt-3 text-xs text-zinc-400">
          The case is open. Its first durable event will appear here.
        </p>
      ) : (
        <ol className="relative mt-4 space-y-0 pl-5 before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-px before:bg-white/10">
          {timeline.entries.map((entry) => (
            <li key={entry.id} className="relative pb-4 last:pb-0">
              <span
                className={`absolute -left-5 top-1 h-[11px] w-[11px] rounded-full border-2 border-[#11161c] ${KIND_COLORS[entry.kind]}`}
                aria-hidden="true"
              />
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <p className="text-xs font-semibold text-white">{entry.title}</p>
                <span className="text-[10px] text-zinc-500">
                  S{entry.season} W{entry.week} · {KIND_LABELS[entry.kind]}
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-zinc-300">{entry.description}</p>
              {entry.details && entry.details.length > 0 && (
                <ul className="mt-2 space-y-1 text-[11px] leading-4 text-zinc-400">
                  {entry.details.map((detail) => (
                    <li key={`${entry.id}:${detail}`}>{detail}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
