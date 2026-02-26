"use client";

import * as React from "react";
import { Sparkles, AlertTriangle, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import type { InsightAction, InsightActionId } from "@/engine/insight/types";
import type { Specialization } from "@/engine/core/types";

// =============================================================================
// TYPES
// =============================================================================

interface InsightActionPanelProps {
  availableActions: InsightAction[];
  currentPoints: number;
  cooldownRemaining: number;
  onSelectAction: (actionId: InsightActionId) => void;
  onCancel: () => void;
}

// =============================================================================
// SPECIALIZATION LABELS
// =============================================================================

const SPEC_LABELS: Record<Specialization | "universal", string> = {
  universal: "Universal",
  youth: "Youth",
  firstTeam: "First-Team",
  regional: "Regional",
  data: "Data",
};

// =============================================================================
// ICON MAP — maps InsightActionId to a simple emoji / SVG label
// Kept as text symbols to avoid large icon bundle additions.
// =============================================================================

const ACTION_ICONS: Record<InsightActionId, string> = {
  clarityOfVision: "👁",
  hiddenNature: "🔮",
  theVerdict: "📋",
  secondLook: "🔄",
  diamondInTheRough: "💎",
  generationalWhisper: "✨",
  perfectFit: "🎯",
  pressureTest: "⚡",
  networkPulse: "📡",
  territoryMastery: "🗺",
  algorithmicEpiphany: "🧮",
  marketBlindSpot: "📊",
};

// =============================================================================
// SINGLE ACTION CARD
// =============================================================================

interface ActionCardProps {
  action: InsightAction;
  canAfford: boolean;
  isOnCooldown: boolean;
  onSelect: () => void;
}

function ActionCard({ action, canAfford, isOnCooldown, onSelect }: ActionCardProps) {
  const isDisabled = !canAfford || isOnCooldown;
  const disabledReason = isOnCooldown
    ? "Insight is on cooldown"
    : `Requires ${action.cost} IP`;

  const cardContent = (
    <div
      className={[
        "group rounded-xl border p-4 transition-colors",
        isDisabled
          ? "border-zinc-700/50 bg-zinc-800/30 opacity-60"
          : "border-amber-500/20 bg-zinc-800/60 hover:border-amber-500/50 hover:bg-zinc-800",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <span
          className="text-2xl leading-none"
          aria-hidden="true"
        >
          {ACTION_ICONS[action.id]}
        </span>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              className={[
                "text-sm font-semibold leading-tight",
                isDisabled ? "text-zinc-400" : "text-zinc-100",
              ].join(" ")}
            >
              {action.name}
            </h3>

            {/* Cost badge */}
            <Badge
              variant="warning"
              className="shrink-0 border-amber-500/30 bg-amber-500/15 text-amber-400"
            >
              {action.cost} IP
            </Badge>
          </div>

          <p className="mt-1 text-xs leading-relaxed text-zinc-400">
            {action.description}
          </p>

          {/* Risk description */}
          <p className="mt-1.5 flex items-start gap-1 text-xs leading-relaxed text-orange-400/80">
            <AlertTriangle
              size={11}
              className="mt-0.5 shrink-0"
              aria-hidden="true"
            />
            {action.riskDescription}
          </p>
        </div>

        {/* Use button */}
        <button
          onClick={onSelect}
          disabled={isDisabled}
          aria-label={`Use ${action.name} for ${action.cost} IP`}
          className={[
            "shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400",
            isDisabled
              ? "cursor-not-allowed bg-zinc-700 text-zinc-500"
              : "bg-amber-500 text-amber-950 hover:bg-amber-400",
          ].join(" ")}
        >
          Use
        </button>
      </div>
    </div>
  );

  if (isDisabled) {
    return (
      <Tooltip content={disabledReason} side="left">
        <div className="block w-full">{cardContent}</div>
      </Tooltip>
    );
  }

  return cardContent;
}

// =============================================================================
// ACTION GROUP
// =============================================================================

interface ActionGroupProps {
  label: string;
  actions: InsightAction[];
  canAfford: (cost: number) => boolean;
  isOnCooldown: boolean;
  onSelect: (id: InsightActionId) => void;
}

function ActionGroup({
  label,
  actions,
  canAfford,
  isOnCooldown,
  onSelect,
}: ActionGroupProps) {
  if (actions.length === 0) return null;

  return (
    <section aria-labelledby={`insight-group-${label}`}>
      <h2
        id={`insight-group-${label}`}
        className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500"
      >
        {label}
      </h2>
      <div className="space-y-2">
        {actions.map((action) => (
          <ActionCard
            key={action.id}
            action={action}
            canAfford={canAfford(action.cost)}
            isOnCooldown={isOnCooldown}
            onSelect={() => onSelect(action.id)}
          />
        ))}
      </div>
    </section>
  );
}

// =============================================================================
// MAIN PANEL
// =============================================================================

export function InsightActionPanel({
  availableActions,
  currentPoints,
  cooldownRemaining,
  onSelectAction,
  onCancel,
}: InsightActionPanelProps) {
  const isOnCooldown = cooldownRemaining > 0;
  const canAfford = (cost: number) => currentPoints >= cost;

  const universalActions = availableActions.filter(
    (a) => a.specialization === "universal"
  );
  const specializedActions = availableActions.filter(
    (a) => a.specialization !== "universal"
  );

  // Group specialized by specialization label
  const specGroups = specializedActions.reduce<
    Partial<Record<Specialization, InsightAction[]>>
  >((acc, action) => {
    const spec = action.specialization as Specialization;
    if (!acc[spec]) acc[spec] = [];
    acc[spec]!.push(action);
    return acc;
  }, {});

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="insight-action-title"
    >
      {/* Panel */}
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-amber-500/20 bg-zinc-900 shadow-2xl">
        {/* Amber glow */}
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl"
          style={{
            background:
              "radial-gradient(ellipse at 50% 0%, rgba(245,158,11,0.10) 0%, transparent 65%)",
          }}
          aria-hidden="true"
        />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <Sparkles
              size={18}
              className="text-amber-400"
              aria-hidden="true"
            />
            <h1
              id="insight-action-title"
              className="text-base font-semibold text-zinc-100"
            >
              Use Insight
            </h1>
          </div>

          {/* Available IP */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Available:</span>
            <span className="text-sm font-bold text-amber-400">
              {currentPoints} IP
            </span>
          </div>
        </div>

        {/* Cooldown banner */}
        {isOnCooldown && (
          <div
            className="flex items-center gap-2 border-b border-red-500/20 bg-red-950/30 px-5 py-3"
            role="alert"
          >
            <AlertTriangle
              size={14}
              className="shrink-0 text-red-400"
              aria-hidden="true"
            />
            <p className="text-xs text-red-300">
              Insight on cooldown &mdash;{" "}
              <span className="font-semibold">
                {cooldownRemaining}{" "}
                {cooldownRemaining === 1 ? "week" : "weeks"} remaining
              </span>
            </p>
          </div>
        )}

        {/* Action list */}
        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          <div className="space-y-5">
            {universalActions.length > 0 && (
              <ActionGroup
                label="Universal"
                actions={universalActions}
                canAfford={canAfford}
                isOnCooldown={isOnCooldown}
                onSelect={onSelectAction}
              />
            )}

            {(Object.keys(specGroups) as Specialization[]).map((spec) => (
              <ActionGroup
                key={spec}
                label={SPEC_LABELS[spec]}
                actions={specGroups[spec] ?? []}
                canAfford={canAfford}
                isOnCooldown={isOnCooldown}
                onSelect={onSelectAction}
              />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-800 px-5 py-4">
          <button
            onClick={onCancel}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-700 py-2.5 text-sm font-medium text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-zinc-400"
          >
            <X size={14} aria-hidden="true" />
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
