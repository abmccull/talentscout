import type { PlayerDevelopmentEnvironmentProjection } from "@/engine/world/developmentEnvironment";

// Accept the public explanation only; player ability and simulation mechanics
// never enter this view. The environment describes a setting, not a forecast.
type DevelopmentContext = Pick<PlayerDevelopmentEnvironmentProjection,
  "clubName" | "headline" | "summary" | "factors" | "reviewPrompt">;

const IMPACT_LABELS = {
  "strong-positive": "Strong support",
  positive: "Support",
  neutral: "Context",
  negative: "Constraint",
  "strong-negative": "Major constraint",
} as const;

export function PlayerDevelopmentEnvironmentCard({ environment }: {
  environment: DevelopmentContext;
}) {
  return (
    <section
      className="dossier-section mb-6"
      data-testid="development-environment"
      aria-labelledby="player-development-environment-title"
    >
      <p className="dossier-eyebrow">Development environment · {environment.clubName}</p>
      <h2 id="player-development-environment-title" className="font-editorial mt-2 text-2xl text-[var(--foreground)]">
        {environment.headline}
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--foreground)]">{environment.summary}</p>
      <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">
        Current conditions can help or limit progress. They do not predict the player&apos;s ceiling.
      </p>
      {environment.factors.length > 0 && (
        <details className="mt-4 border-t border-[var(--border)]">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-[var(--foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ring)]">
            What shapes this environment
          </summary>
          <dl className="grid gap-x-6 gap-y-4 pb-4 sm:grid-cols-2">
            {environment.factors.map((factor) => (
              <div key={factor.id}>
                <dt className="text-sm font-medium text-[var(--foreground)]">
                  {factor.label}
                  <span className="ml-2 text-xs font-normal text-[var(--muted-foreground)]">{IMPACT_LABELS[factor.impact]}</span>
                </dt>
                <dd className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">{factor.summary}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      <div className="mt-4 border-t border-[var(--border)] pt-4">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">What to check next</h3>
        <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">{environment.reviewPrompt}</p>
      </div>
    </section>
  );
}
