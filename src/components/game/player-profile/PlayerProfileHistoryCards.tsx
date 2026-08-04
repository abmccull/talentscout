import { AlertTriangle, CalendarPlus, HeartPulse, TrendingUp } from "lucide-react";
import type { DisciplinaryRecord, Player } from "@/engine/core/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasObservableRecurringInjuryConcern } from "@/engine/scout/playerFacingIntel";
import { buildRetirementOutlookPresentation } from "@/engine/transfers";

function formLabel(form: number): { text: string; color: string; arrow: string } {
  if (form >= 2) return { text: "Excellent", color: "text-emerald-400", arrow: "\u2191" };
  if (form === 1) return { text: "Good", color: "text-emerald-500", arrow: "\u2197" };
  if (form === 0) return { text: "Average", color: "text-zinc-400", arrow: "\u2192" };
  if (form === -1) return { text: "Poor", color: "text-orange-400", arrow: "\u2198" };
  return { text: "Bad", color: "text-red-400", arrow: "\u2193" };
}

function ratingBarColor(rating: number): string {
  if (rating >= 8.0) return "bg-emerald-500";
  if (rating >= 7.0) return "bg-emerald-600/80";
  if (rating >= 6.0) return "bg-amber-500";
  if (rating >= 5.0) return "bg-orange-500";
  return "bg-red-500";
}

const INJURY_TYPE_LABELS: Record<string, string> = {
  muscle: "Muscle",
  ligament: "Ligament",
  fracture: "Fracture",
  concussion: "Concussion",
  knock: "Knock",
  fatigue: "Fatigue",
};

const SEVERITY_COLORS: Record<string, string> = {
  minor: "text-amber-400",
  moderate: "text-orange-400",
  serious: "text-red-400",
  "career-threatening": "text-red-600",
};

export function InjuryStatusCard({ player }: { player: Player }) {
  const currentInjury = player.currentInjury;
  const history = player.injuryHistory;
  const injuries = history?.injuries ?? [];
  const totalWeeksMissed = history?.totalWeeksMissed ?? 0;
  const recurringConcern = hasObservableRecurringInjuryConcern(history);

  if (!currentInjury && injuries.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <HeartPulse size={14} className={currentInjury ? "text-red-500" : "text-zinc-500"} />
          Injury Status
          {recurringConcern && (
            <Badge variant="destructive" className="ml-auto text-[10px]">
              Recurring Injury History
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {currentInjury && (
          <div className="rounded-md border border-red-500/20 bg-red-500/5 p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold text-red-400">Currently Injured</span>
              <Badge variant="outline" className="text-[10px]">
                {currentInjury.weeksRemaining}w remaining
              </Badge>
            </div>
            <p className="text-xs text-zinc-300">
              {INJURY_TYPE_LABELS[currentInjury.type] ?? currentInjury.type} {"\u2014"}{" "}
              <span className={SEVERITY_COLORS[currentInjury.severity] ?? "text-zinc-400"}>
                {currentInjury.severity}
              </span>
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-red-500 transition-all"
                style={{
                  width: `${((currentInjury.recoveryWeeks - currentInjury.weeksRemaining) / Math.max(1, currentInjury.recoveryWeeks)) * 100}%`,
                }}
              />
            </div>
            <p className="mt-1 text-[10px] text-zinc-500">
              Recovery: {currentInjury.recoveryWeeks - currentInjury.weeksRemaining}/{currentInjury.recoveryWeeks} weeks
            </p>
          </div>
        )}

        {!currentInjury && recurringConcern && (
          <div className="flex items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 p-2">
            <AlertTriangle size={12} className="shrink-0 text-amber-400" />
            <p className="text-[10px] text-amber-300">
              The visible injury record warrants a dedicated medical follow-up.
            </p>
          </div>
        )}

        {injuries.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[10px] text-zinc-500">Total Injuries</p>
              <p className="text-sm font-semibold text-white">{injuries.length}</p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-500">Weeks Missed</p>
              <p className="text-sm font-semibold text-white">{totalWeeksMissed}</p>
            </div>
          </div>
        )}

        {injuries.length > 0 && (
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
              History
            </p>
            <div className="space-y-1.5">
              {injuries.slice(-5).reverse().map((injury) => (
                <div
                  key={injury.id}
                  className="flex items-center justify-between rounded border border-[#27272a] bg-[#141414] px-2 py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-medium ${SEVERITY_COLORS[injury.severity] ?? "text-zinc-400"}`}>
                      {INJURY_TYPE_LABELS[injury.type] ?? injury.type}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      {injury.recoveryWeeks}w
                    </span>
                  </div>
                  <span className="text-[10px] text-zinc-600">
                    S{injury.occurredSeason} W{injury.occurredWeek}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function FormPerformanceCard({ player }: { player: Player }) {
  const recentRatings = player.recentMatchRatings ?? [];
  const seasonRatings = player.seasonRatings ?? [];
  const form = formLabel(player.form);

  const avgRating = recentRatings.length > 0
    ? (recentRatings.reduce((sum, rating) => sum + rating.rating, 0) / recentRatings.length).toFixed(1)
    : null;

  if (recentRatings.length === 0 && seasonRatings.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <TrendingUp size={14} className="text-zinc-500" />
            Form & Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-zinc-500">No match data available yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <TrendingUp size={14} className="text-emerald-500" />
          Form & Performance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-400">Current Form</span>
          <span className={`text-sm font-semibold ${form.color}`}>
            {form.arrow} {form.text}
          </span>
        </div>

        {avgRating && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">Recent Average</span>
            <span className="text-sm font-bold text-white">{avgRating}</span>
          </div>
        )}

        {recentRatings.length > 0 && (
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
              Recent Matches
            </p>
            <div className="flex h-10 items-end gap-1">
              {recentRatings.map((entry, index) => {
                const heightPct = ((entry.rating - 1) / 9) * 100;
                return (
                  <div
                    key={entry.fixtureId + index}
                    className="flex h-full flex-1 flex-col items-center justify-end"
                    title={`Week ${entry.week}: ${entry.rating.toFixed(1)}`}
                  >
                    <div
                      className={`w-full rounded-sm ${ratingBarColor(entry.rating)}`}
                      style={{ height: `${Math.max(8, heightPct)}%` }}
                    />
                    <span className="mt-0.5 font-mono text-[9px] text-zinc-600">
                      {entry.rating.toFixed(1)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {seasonRatings.length > 0 && (
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
              Season History
            </p>
            <div className="text-[10px]">
              <div className="mb-1 grid grid-cols-6 gap-1 font-medium text-zinc-600">
                <span>Season</span>
                <span className="text-right">Avg</span>
                <span className="text-right">Apps</span>
                <span className="text-right">Goals</span>
                <span className="text-right">Ast</span>
                <span className="text-right">CS</span>
              </div>
              {seasonRatings.map((seasonRating) => (
                <div key={seasonRating.season} className="grid grid-cols-6 gap-1 text-zinc-300">
                  <span>{seasonRating.season}</span>
                  <span className="text-right font-bold">{seasonRating.avgRating.toFixed(1)}</span>
                  <span className="text-right">{seasonRating.appearances}</span>
                  <span className="text-right">{seasonRating.goals}</span>
                  <span className="text-right">{seasonRating.assists}</span>
                  <span className="text-right">{seasonRating.cleanSheets > 0 ? seasonRating.cleanSheets : "-"}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function RetirementOutlookCard({
  player,
  currentSeason,
}: {
  player: Player;
  currentSeason: number;
}) {
  const outlook = buildRetirementOutlookPresentation(player, currentSeason);
  if (!outlook) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <CalendarPlus size={14} className="text-amber-400" />
          Retirement Outlook
          <Badge variant="outline" className={`ml-auto text-[10px] ${outlook.badgeClassName}`}>
            {outlook.badgeLabel}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border border-[#27272a] bg-[#141414] p-3">
          <p className="text-xs font-semibold text-zinc-100">{outlook.headline}</p>
          <p className="mt-1 text-[11px] text-zinc-400">{outlook.timingLabel}</p>
          <p className="mt-2 text-[10px] uppercase tracking-wider text-zinc-500">
            {outlook.updatedLabel}
          </p>
        </div>
        {outlook.reasons.length > 0 && (
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
              Recorded Signals
            </p>
            <div className="space-y-1.5">
              {outlook.reasons.map((reason, index) => (
                <div
                  key={`${outlook.badgeLabel}-${index}`}
                  className="rounded border border-[#27272a] bg-[#141414] px-2 py-1.5 text-[11px] text-zinc-300"
                >
                  {reason}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function DisciplinaryCard({
  record,
  gameState,
}: {
  record: DisciplinaryRecord | undefined;
  gameState: { currentSeason: number };
}) {
  const yellows = record?.yellowCards ?? 0;
  const reds = record?.redCards ?? 0;
  const suspWeeks = record?.suspensionWeeksRemaining ?? 0;
  const season = record?.season ?? gameState.currentSeason;
  const nearFiveYellow = yellows >= 3 && yellows < 5;
  const nearTenYellow = yellows >= 8 && yellows < 10;

  if (yellows === 0 && reds === 0 && suspWeeks === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <AlertTriangle size={14} className="text-zinc-500" aria-hidden="true" />
            Discipline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-zinc-500">Clean record this season.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <AlertTriangle size={14} className={suspWeeks > 0 ? "text-red-500" : "text-amber-500"} aria-hidden="true" />
          Discipline
          {suspWeeks > 0 && (
            <Badge variant="destructive" className="ml-auto text-[10px]">
              SUSPENDED ({suspWeeks} match{suspWeeks > 1 ? "es" : ""})
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-2 rounded-sm bg-amber-400" title="Yellow cards" />
            <span className="text-xs text-zinc-400">
              Yellows: <span className="font-semibold text-white">{yellows}</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-2 rounded-sm bg-red-500" title="Red cards" />
            <span className="text-xs text-zinc-400">
              Reds: <span className="font-semibold text-white">{reds}</span>
            </span>
          </div>
          <span className="ml-auto text-[10px] text-zinc-600">Season {season}</span>
        </div>

        {nearFiveYellow && (
          <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5">
            <p className="text-[10px] text-amber-300">
              Warning: {yellows}/5 yellows &mdash; {5 - yellows} more yellow card{5 - yellows > 1 ? "s" : ""} triggers a 1-match ban.
            </p>
          </div>
        )}
        {nearTenYellow && (
          <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5">
            <p className="text-[10px] text-amber-300">
              Warning: {yellows}/10 yellows &mdash; {10 - yellows} more yellow card{10 - yellows > 1 ? "s" : ""} triggers a 2-match ban.
            </p>
          </div>
        )}

        {record && record.cardHistory.length > 0 && (
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
              Recent Cards
            </p>
            <div className="space-y-1">
              {record.cardHistory.slice(-5).reverse().map((card, index) => (
                <div key={index} className="flex items-center gap-2 text-[10px]">
                  <div
                    className={`h-2.5 w-1.5 rounded-sm ${
                      card.type === "red" ? "bg-red-500" : "bg-amber-400"
                    }`}
                  />
                  <span className="text-zinc-400">
                    {card.minute}&apos; &mdash; {card.reason.replace(/([A-Z])/g, " $1").toLowerCase().trim()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
