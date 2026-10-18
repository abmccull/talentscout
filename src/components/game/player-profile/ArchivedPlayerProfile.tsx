"use client";

import type { GameState } from "@/engine/core/types";
import { Button } from "@/components/ui/button";
import { PlayerAgeTimeline } from "../PlayerAgeTimeline";
import { buildPlayerArchive } from "./playerArchiveModel";

export function ArchivedPlayerProfile({ state, playerId, onBack, onReports }: {
  state: GameState; playerId: string; onBack: () => void; onReports: () => void;
}) {
  const archive = buildPlayerArchive(state, playerId);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button variant="outline" onClick={onBack}>Back to prospects</Button>
      <header className="space-y-2 border-b border-white/10 pb-5">
        <p className="text-xs uppercase tracking-wider text-zinc-400">Archived dossier</p>
        <h1 className="text-2xl font-semibold text-white">{archive?.name ?? "Player record unavailable"}</h1>
        <p className="text-sm text-zinc-400">
          {archive ? "The full player record is no longer retained. Your recorded history remains below."
            : "No retained dossier or scouting record was found for this player."}
        </p>
      </header>
      {archive && <>
        <PlayerAgeTimeline playerId={playerId} />
        <section aria-label="Your archived reports" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Your reports ({archive.reports.length})</h2>
            <Button variant="outline" onClick={onReports}>Open report history</Button>
          </div>
          {archive.reports.length === 0 && <p className="text-sm text-zinc-400">No filed reports remain in this dossier.</p>}
          {archive.reports.map(report => <article key={report.id} className="border-t border-white/10 py-4">
            <p className="text-xs text-zinc-400">Season {report.submittedSeason} · Week {report.submittedWeek}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">{report.summary}</p>
          </article>)}
        </section>
      </>}
    </div>
  );
}
