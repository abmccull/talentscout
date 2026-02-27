"use client";

import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState, useMemo } from "react";
import { ArrowLeft, AlertTriangle, Handshake, XCircle, TrendingUp, DollarSign, Users, Gavel } from "lucide-react";
import type { TransferNegotiation, TransferAddOn, NegotiationRound, ClubNegotiationPersonality } from "@/engine/core/types";
import { getRecommendedOffer, getPersonalityDescription } from "@/engine/firstTeam/negotiation";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { ClubCrest } from "@/components/game/ClubCrest";
import { ScreenBackground } from "@/components/ui/screen-background";

// =============================================================================
// HELPERS
// =============================================================================

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) return `\u00A3${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `\u00A3${(amount / 1_000).toFixed(0)}K`;
  return `\u00A3${amount}`;
}

function personalityBadgeColor(personality: ClubNegotiationPersonality): string {
  switch (personality) {
    case "hardball": return "bg-red-500/20 text-red-400 border-red-500/40";
    case "reasonable": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/40";
    case "desperate": return "bg-amber-500/20 text-amber-400 border-amber-500/40";
    case "prestige": return "bg-violet-500/20 text-violet-400 border-violet-500/40";
  }
}

function personalityLabel(personality: ClubNegotiationPersonality): string {
  switch (personality) {
    case "hardball": return "Hardball";
    case "reasonable": return "Reasonable";
    case "desperate": return "Eager to Sell";
    case "prestige": return "Prestige Club";
  }
}

function roundResponseBadge(response: NegotiationRound["response"]) {
  switch (response) {
    case "accepted":
      return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40">Accepted</Badge>;
    case "rejected":
      return <Badge className="bg-red-500/20 text-red-400 border-red-500/40">Rejected</Badge>;
    case "countered":
      return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40">Countered</Badge>;
  }
}

function addOnLabel(type: TransferAddOn["type"]): string {
  switch (type) {
    case "appearanceBonus": return "Appearance Bonus";
    case "sellOnClause": return "Sell-On Clause";
    case "performanceBonus": return "Performance Bonus";
    case "relegationClause": return "Relegation Clause";
  }
}

// =============================================================================
// ADD-ON BUILDER
// =============================================================================

interface AddOnBuilderProps {
  addOns: TransferAddOn[];
  setAddOns: (addOns: TransferAddOn[]) => void;
}

function AddOnBuilder({ addOns, setAddOns }: AddOnBuilderProps) {
  const addOnTypes: TransferAddOn["type"][] = [
    "appearanceBonus",
    "sellOnClause",
    "performanceBonus",
    "relegationClause",
  ];

  const toggleAddOn = (type: TransferAddOn["type"]) => {
    const existing = addOns.find((a) => a.type === type);
    if (existing) {
      setAddOns(addOns.filter((a) => a.type !== type));
    } else {
      const defaultValues: Record<TransferAddOn["type"], { value: number; trigger: string }> = {
        appearanceBonus: { value: 500_000, trigger: "After 25 appearances" },
        sellOnClause: { value: 15, trigger: "15% of future sale price" },
        performanceBonus: { value: 1_000_000, trigger: "10 goals or 10 assists" },
        relegationClause: { value: 2_000_000, trigger: "If buying club is relegated" },
      };
      const def = defaultValues[type];
      setAddOns([...addOns, { type, value: def.value, trigger: def.trigger }]);
    }
  };

  const updateValue = (type: TransferAddOn["type"], value: number) => {
    setAddOns(addOns.map((a) => (a.type === type ? { ...a, value } : a)));
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Add-On Clauses</p>
      <div className="grid grid-cols-2 gap-2">
        {addOnTypes.map((type) => {
          const active = addOns.find((a) => a.type === type);
          return (
            <button
              key={type}
              onClick={() => toggleAddOn(type)}
              className={`rounded-lg border p-2 text-left text-xs transition ${
                active
                  ? "border-blue-500/50 bg-blue-500/10 text-blue-300"
                  : "border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600"
              }`}
            >
              <span className="font-medium">{addOnLabel(type)}</span>
              {active && (
                <div className="mt-1">
                  <input
                    type="number"
                    value={active.value}
                    onChange={(e) => updateValue(type, Number(e.target.value))}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full rounded bg-zinc-900 border border-zinc-700 px-2 py-0.5 text-xs text-white"
                    min={0}
                  />
                  <p className="mt-0.5 text-[10px] text-zinc-500">{active.trigger}</p>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// ROUND HISTORY
// =============================================================================

function RoundHistory({ rounds }: { rounds: NegotiationRound[] }) {
  if (rounds.length === 0) {
    return (
      <p className="text-sm text-zinc-500 italic">No offers submitted yet.</p>
    );
  }

  return (
    <div className="space-y-2">
      {rounds.map((round) => (
        <div
          key={round.roundNumber}
          className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 p-3"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold text-zinc-400">
              {round.roundNumber}
            </span>
            <div>
              <p className="text-sm">
                Your offer: <span className="font-semibold text-emerald-400">{formatCurrency(round.offerAmount)}</span>
              </p>
              <p className="text-xs text-zinc-500">
                Asking: {formatCurrency(round.askingAmount)}
                {round.addOns && round.addOns.length > 0 && (
                  <span className="ml-2 text-blue-400">
                    + {round.addOns.length} add-on{round.addOns.length > 1 ? "s" : ""}
                  </span>
                )}
              </p>
            </div>
          </div>
          {roundResponseBadge(round.response)}
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// RIVAL BIDS PANEL
// =============================================================================

function RivalBidsPanel({ negotiation }: { negotiation: TransferNegotiation }) {
  const clubs = useGameStore((s) => s.gameState?.clubs ?? {});

  if (negotiation.rivalBids.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <AlertTriangle size={14} className="text-amber-400" />
          Rival Bids
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {negotiation.rivalBids.map((bid, i) => {
          const club = clubs[bid.clubId];
          return (
            <div key={i} className="flex items-center justify-between rounded border border-amber-500/30 bg-amber-500/5 p-2">
              <div className="flex items-center gap-2">
                {club && <ClubCrest clubId={club.id} clubName={club.name} size={32} />}
                <span className="text-sm">{club?.name ?? "Unknown Club"}</span>
              </div>
              <span className="font-semibold text-amber-400">{formatCurrency(bid.amount)}</span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function NegotiationScreen() {
  const gameState = useGameStore((s) => s.gameState);
  const activeNegotiationId = useGameStore((s) => s.activeNegotiationId);
  const submitTransferOffer = useGameStore((s) => s.submitTransferOffer);
  const acceptNegotiation = useGameStore((s) => s.acceptNegotiation);
  const walkAway = useGameStore((s) => s.walkAway);
  const setScreen = useGameStore((s) => s.setScreen);

  const [offerAmount, setOfferAmount] = useState<number>(0);
  const [addOns, setAddOns] = useState<TransferAddOn[]>([]);

  const negotiation = useMemo(() => {
    if (!gameState || !activeNegotiationId) return null;
    return (gameState.activeNegotiations ?? []).find((n) => n.id === activeNegotiationId) ?? null;
  }, [gameState, activeNegotiationId]);

  const player = useMemo(() => {
    if (!gameState || !negotiation) return null;
    return gameState.players[negotiation.playerId] ?? null;
  }, [gameState, negotiation]);

  const fromClub = useMemo(() => {
    if (!gameState || !negotiation) return null;
    return gameState.clubs[negotiation.fromClubId] ?? null;
  }, [gameState, negotiation]);

  const toClub = useMemo(() => {
    if (!gameState || !negotiation) return null;
    return gameState.clubs[negotiation.toClubId] ?? null;
  }, [gameState, negotiation]);

  // Initialize offer amount to recommended value
  const recommendedOffer = useMemo(() => {
    if (!negotiation) return 0;
    return getRecommendedOffer(negotiation);
  }, [negotiation]);

  // Set initial offer only once
  useState(() => {
    if (recommendedOffer > 0 && offerAmount === 0) {
      setOfferAmount(recommendedOffer);
    }
  });

  if (!gameState || !negotiation || !player || !fromClub || !toClub) {
    return (
      <GameLayout>
        <div className="flex items-center justify-center p-12">
          <p className="text-zinc-500">No active negotiation found.</p>
        </div>
      </GameLayout>
    );
  }

  const isActive = negotiation.phase !== "completed" && negotiation.phase !== "collapsed";
  const isCompleted = negotiation.phase === "completed";
  const isCollapsed = negotiation.phase === "collapsed";

  const currentAsking = negotiation.rounds.length > 0
    ? negotiation.rounds[negotiation.rounds.length - 1].askingAmount
    : negotiation.initialAskingPrice;

  const roundsRemaining = negotiation.maxRounds - negotiation.rounds.length;
  const weeksRemaining = negotiation.deadline - gameState.currentWeek;

  const handleSubmitOffer = () => {
    if (!activeNegotiationId || offerAmount <= 0) return;
    submitTransferOffer(activeNegotiationId, offerAmount, addOns.length > 0 ? addOns : undefined);
  };

  const handleAccept = () => {
    if (!activeNegotiationId) return;
    acceptNegotiation(activeNegotiationId);
  };

  const handleWalkAway = () => {
    if (!activeNegotiationId) return;
    walkAway(activeNegotiationId);
  };

  return (
    <GameLayout>
      <div className="relative p-6">
        <ScreenBackground src="/images/backgrounds/negotiation-boardroom.png" opacity={0.78} />
        <div className="relative z-10">
        {/* Back button */}
        <button
          onClick={() => setScreen("dashboard")}
          className="mb-4 flex items-center gap-1 text-sm text-zinc-500 hover:text-white transition"
        >
          <ArrowLeft size={14} />
          Back to Dashboard
        </button>

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Handshake size={24} className="text-blue-400" />
            Transfer Negotiation
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            {fromClub.name} &rarr; {toClub.name}
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left column: Player info and status */}
          <div className="space-y-4">
            {/* Player Card */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <PlayerAvatar playerId={player.id} nationality={player.nationality} size={48} />
                  <div>
                    <p className="font-semibold">{player.firstName} {player.lastName}</p>
                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                      <Badge variant="secondary" className="text-[10px]">{player.position}</Badge>
                      <span>Age {player.age}</span>
                    </div>
                    <p className="mt-1 text-sm text-emerald-400 font-medium">
                      Market Value: {formatCurrency(player.marketValue)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Negotiation Status */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Negotiation Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">Phase</span>
                  <Badge className={
                    isCompleted ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" :
                    isCollapsed ? "bg-red-500/20 text-red-400 border-red-500/40" :
                    "bg-blue-500/20 text-blue-400 border-blue-500/40"
                  }>
                    {negotiation.phase === "initial" ? "Initial Offer" :
                     negotiation.phase === "counterOffer" ? "Counter-Offer" :
                     negotiation.phase === "finalOffer" ? "Final Offer" :
                     negotiation.phase === "completed" ? "Deal Agreed" :
                     "Collapsed"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">Current Asking</span>
                  <span className="font-semibold text-amber-400">{formatCurrency(currentAsking)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">Rounds Remaining</span>
                  <span className={`font-medium ${roundsRemaining <= 1 ? "text-red-400" : "text-zinc-300"}`}>
                    {roundsRemaining} / {negotiation.maxRounds}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">Deadline</span>
                  <span className={`font-medium ${weeksRemaining <= 1 ? "text-red-400" : "text-zinc-300"}`}>
                    Week {negotiation.deadline} ({weeksRemaining}w left)
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">Club Style</span>
                  <Badge className={personalityBadgeColor(negotiation.clubPersonality)}>
                    {personalityLabel(negotiation.clubPersonality)}
                  </Badge>
                </div>
                <p className="text-[11px] text-zinc-500 italic">
                  {getPersonalityDescription(negotiation.clubPersonality)}
                </p>
              </CardContent>
            </Card>

            {/* Agent Demands */}
            {negotiation.agentInvolved && negotiation.agentDemands && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Users size={14} className="text-violet-400" />
                    Agent Demands
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500">Wage Premium</span>
                    <span className="font-medium text-violet-400">
                      +{Math.round(negotiation.agentDemands.wagePremium * 100)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500">Signing Bonus</span>
                    <span className="font-medium text-violet-400">
                      {formatCurrency(negotiation.agentDemands.signingBonus)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Rival Bids */}
            <RivalBidsPanel negotiation={negotiation} />
          </div>

          {/* Middle column: Round history */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Gavel size={14} />
                  Negotiation Rounds
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RoundHistory rounds={negotiation.rounds} />
              </CardContent>
            </Card>

            {/* Clubs involved */}
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <CardContent className="p-3">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Selling Club</p>
                  <div className="flex items-center gap-2">
                    <ClubCrest clubId={fromClub.id} clubName={fromClub.name} size={32} />
                    <div>
                      <p className="text-sm font-medium">{fromClub.name}</p>
                      <p className="text-[10px] text-zinc-500">Rep: {fromClub.reputation}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Buying Club</p>
                  <div className="flex items-center gap-2">
                    <ClubCrest clubId={toClub.id} clubName={toClub.name} size={32} />
                    <div>
                      <p className="text-sm font-medium">{toClub.name}</p>
                      <p className="text-[10px] text-zinc-500">Budget: {formatCurrency(toClub.budget)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Right column: Offer form */}
          <div className="space-y-4">
            {isActive && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <DollarSign size={14} className="text-emerald-400" />
                    Submit Offer
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Offer amount input */}
                  <div>
                    <label className="text-xs text-zinc-500 block mb-1">
                      Transfer Fee
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={offerAmount}
                        onChange={(e) => setOfferAmount(Math.max(0, Number(e.target.value)))}
                        className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                        placeholder="Enter amount"
                        min={0}
                        step={100000}
                      />
                    </div>
                    <div className="mt-2 flex gap-2">
                      {[0.7, 0.8, 0.9, 1.0].map((pct) => (
                        <button
                          key={pct}
                          onClick={() => setOfferAmount(Math.round(currentAsking * pct))}
                          className="rounded bg-zinc-800 px-2 py-1 text-[10px] text-zinc-400 hover:bg-zinc-700 hover:text-white transition"
                        >
                          {Math.round(pct * 100)}%
                        </button>
                      ))}
                    </div>
                    <p className="mt-1 text-[10px] text-zinc-600">
                      Suggested: {formatCurrency(recommendedOffer)} | Asking: {formatCurrency(currentAsking)}
                    </p>
                  </div>

                  {/* Add-ons */}
                  <AddOnBuilder addOns={addOns} setAddOns={setAddOns} />

                  {/* Summary */}
                  <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-3 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-500">Base Offer</span>
                      <span className="text-white">{formatCurrency(offerAmount)}</span>
                    </div>
                    {addOns.length > 0 && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-500">Add-Ons ({addOns.length})</span>
                        <span className="text-blue-400">
                          +{formatCurrency(addOns.reduce((s, a) => s + a.value, 0))}
                        </span>
                      </div>
                    )}
                    <div className="border-t border-zinc-800 pt-1 flex items-center justify-between text-xs font-medium">
                      <span className="text-zinc-400">Total Package</span>
                      <span className="text-emerald-400">
                        {formatCurrency(offerAmount + addOns.reduce((s, a) => s + a.value, 0))}
                      </span>
                    </div>
                  </div>

                  {/* Submit / Walk Away buttons */}
                  <div className="flex gap-2">
                    <Button
                      onClick={handleSubmitOffer}
                      disabled={offerAmount <= 0}
                      className="flex-1"
                    >
                      <TrendingUp size={14} className="mr-2" />
                      Submit Offer
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleWalkAway}
                      className="text-red-400 hover:text-red-300"
                    >
                      <XCircle size={14} className="mr-2" />
                      Walk Away
                    </Button>
                  </div>

                  {negotiation.phase === "finalOffer" && (
                    <p className="text-xs text-red-400 flex items-center gap-1">
                      <AlertTriangle size={12} />
                      This is the final round. Make it count.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Completed: Accept personal terms */}
            {isCompleted && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm text-emerald-400">
                    <Handshake size={14} />
                    Fee Agreed
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-zinc-300">
                    The selling club has accepted your offer. Proceed to finalise personal terms with the player.
                  </p>
                  <Button onClick={handleAccept} className="w-full">
                    <Handshake size={14} className="mr-2" />
                    Finalise Transfer
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Collapsed: Show outcome */}
            {isCollapsed && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm text-red-400">
                    <XCircle size={14} />
                    Negotiation Failed
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-zinc-400">
                    This negotiation has collapsed. The deal cannot be completed.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setScreen("dashboard")}
                    className="mt-3 w-full"
                  >
                    Return to Dashboard
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
        </div>
      </div>
    </GameLayout>
  );
}
