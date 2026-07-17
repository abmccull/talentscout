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

export function ScoutingCaseTimelineView({
  timeline,
}: {
  timeline: ScoutingCaseTimeline;
}) {
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
