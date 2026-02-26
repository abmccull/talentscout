"use client";

import { useState } from "react";
import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Wrench,
  Users,
  Building2,
  DollarSign,
  Bell,
  Globe,
  Trophy,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  calculateAgencyOverhead,
  calculateInfrastructureEffects,
  MAX_ASSISTANT_SCOUTS,
} from "@/engine/finance";
import { InfrastructureTab } from "./agency/InfrastructureTab";
import { AssistantScoutsTab } from "./agency/AssistantScoutsTab";
import { OfficeTab } from "./agency/OfficeTab";
import { ClientsTab } from "./agency/ClientsTab";
import { EventsTab } from "./agency/EventsTab";
import { OfficesTab } from "./agency/OfficesTab";
import { LegacyTab } from "./agency/LegacyTab";

// ─── Tab system ──────────────────────────────────────────────────────────────

type TabId = "infrastructure" | "assistants" | "office" | "clients" | "events" | "satellites" | "legacy";

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ElementType;
  minTier: number;
  independentOnly: boolean;
  badge?: number;
}

// ─── Roadmap data ────────────────────────────────────────────────────────────

const ROADMAP_TIERS = [
  { tier: 1, name: "Freelance Scout", desc: "Sell reports on the marketplace. Build your reputation one assignment at a time.", unlocks: ["Report marketplace", "Manual report sales"] },
  { tier: 2, name: "Established Freelancer", desc: "Clubs start noticing your work. Your first retainer contract slot opens.", unlocks: ["1 retainer slot", "Agency preview access", "Client pitching"] },
  { tier: 3, name: "Agency Founder", desc: "Open an office. Hire your first employee. Your agency is born.", unlocks: ["Office upgrades", "Hire employees", "3 retainer slots", "Full agency management"] },
  { tier: 4, name: "Professional Agency", desc: "Consulting contracts. International expansion. Your name carries weight.", unlocks: ["Consulting contracts", "6 retainer slots", "Satellite offices", "Relationship managers"] },
  { tier: 5, name: "Elite Firm", desc: "Industry leader. Awards ceremonies. Platinum-tier clients. Legacy.", unlocks: ["Unlimited retainers", "12 employees", "Industry awards", "Mentee system", "Platinum clients"] },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function AgencyScreen() {
  const gameState = useGameStore((s) => s.gameState);
  const [activeTab, setActiveTab] = useState<TabId>("infrastructure");
  const [roadmapOpen, setRoadmapOpen] = useState(false);

  const pendingEvents = gameState?.finances?.pendingEmployeeEvents ?? [];
  const clientRelationships = gameState?.finances?.clientRelationships ?? [];
  const satelliteOffices = gameState?.finances?.satelliteOffices ?? [];
  const awards = gameState?.finances?.awards ?? [];
  const countries = gameState?.countries ?? [];

  if (!gameState?.finances) return null;

  const { finances, scout } = gameState;
  const careerPath = scout.careerPath ?? "club";
  const isIndependent = careerPath === "independent";
  const careerTier = scout.careerTier ?? 1;
  const independentTier = finances.independentTier ?? scout.independentTier ?? 1;

  const infrastructure = gameState.scoutingInfrastructure;
  const infraEffects = calculateInfrastructureEffects(infrastructure);
  const assistantScouts = gameState.assistantScouts ?? [];

  // ── Tab definitions ────────────────────────────────────────────────────────
  const tabs: TabDef[] = [
    { id: "infrastructure", label: "Infrastructure", icon: Wrench, minTier: 1, independentOnly: false },
    { id: "assistants", label: "Assistants", icon: Users, minTier: 1, independentOnly: false },
    { id: "office", label: "Office & Staff", icon: Building2, minTier: 3, independentOnly: true },
    { id: "clients", label: "Clients", icon: DollarSign, minTier: 3, independentOnly: true },
    {
      id: "events",
      label: "Events",
      icon: Bell,
      minTier: 3,
      independentOnly: false,
      badge: pendingEvents.length > 0 ? pendingEvents.length : undefined,
    },
    { id: "satellites", label: "Satellite Offices", icon: Globe, minTier: 4, independentOnly: true },
    { id: "legacy", label: "Legacy", icon: Trophy, minTier: 5, independentOnly: false },
  ];

  // Filter tabs by tier and career path
  const visibleTabs = tabs.filter((t) => {
    // Independent-only tabs use independentTier and require independent path
    if (t.independentOnly) {
      return isIndependent && independentTier >= t.minTier;
    }
    // Universal tabs use careerTier
    return careerTier >= t.minTier;
  });

  // Ensure activeTab is valid
  const activeTabVisible = visibleTabs.some((t) => t.id === activeTab);
  const resolvedTab = activeTabVisible ? activeTab : visibleTabs[0]?.id ?? "infrastructure";

  // ── Summary bar data ──────────────────────────────────────────────────────
  const showFullAgencySummary = isIndependent && independentTier >= 3;

  return (
    <GameLayout>
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-1">Agency</h1>
        <p className="text-sm text-zinc-400 mb-4">
          {isIndependent
            ? "Manage your scouting agency — infrastructure, staff, and operations."
            : "Manage your scouting infrastructure and assistants."}
        </p>

        {/* Roadmap card for independent Tier 1-2 (collapsible, informational) */}
        {isIndependent && independentTier < 3 && (
          <div className="mb-4">
            <button
              onClick={() => setRoadmapOpen(!roadmapOpen)}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 flex items-center justify-between text-left transition hover:border-zinc-700"
            >
              <div>
                <p className="text-sm font-medium text-zinc-300">Agency Roadmap</p>
                <p className="text-xs text-zinc-500">
                  Tier {independentTier}/5 — Unlock full agency management at Tier 3
                </p>
              </div>
              {roadmapOpen ? <ChevronUp size={16} className="text-zinc-500" /> : <ChevronDown size={16} className="text-zinc-500" />}
            </button>
            {roadmapOpen && (
              <Card className="mt-2">
                <CardContent className="pt-4 space-y-4">
                  {ROADMAP_TIERS.map(({ tier: t, name, desc, unlocks }) => {
                    const isCurrent = independentTier === t;
                    const isComplete = independentTier > t;
                    return (
                      <div key={t} className={`rounded-lg border p-4 ${isCurrent ? "border-emerald-500/50 bg-emerald-500/5" : isComplete ? "border-zinc-700 bg-zinc-800/30" : "border-zinc-800 bg-zinc-900/50 opacity-60"}`}>
                        <div className="flex items-center gap-3">
                          <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${isComplete ? "bg-emerald-500 text-black" : isCurrent ? "bg-emerald-500/20 text-emerald-400 ring-2 ring-emerald-500/50" : "bg-zinc-800 text-zinc-500"}`}>
                            {isComplete ? "✓" : t}
                          </div>
                          <div>
                            <h4 className={`text-sm font-semibold ${isCurrent ? "text-emerald-400" : isComplete ? "text-zinc-300" : "text-zinc-500"}`}>Tier {t}: {name}</h4>
                            <p className="text-xs text-zinc-500">{desc}</p>
                          </div>
                        </div>
                        {(isCurrent || isComplete) && (
                          <div className="mt-2 flex flex-wrap gap-1.5 pl-11">
                            {unlocks.map((u) => (
                              <span key={u} className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${isComplete ? "bg-zinc-700 text-zinc-400" : "bg-emerald-500/10 text-emerald-400"}`}>{u}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Tier Progress */}
                  <div className="border-t border-zinc-800 pt-4 space-y-3">
                    <p className="text-sm font-medium text-zinc-300">Progress to Tier {independentTier + 1}</p>
                    {(() => {
                      const requirements = independentTier === 1
                        ? [
                            { label: "Reputation", current: scout.reputation ?? 0, target: 20 },
                            { label: "Balance", current: finances.balance ?? 0, target: 1000, isCurrency: true },
                            { label: "Reports Submitted", current: scout.reportsSubmitted ?? 0, target: 5 },
                          ]
                        : [
                            { label: "Reputation", current: scout.reputation ?? 0, target: 40 },
                            { label: "Balance", current: finances.balance ?? 0, target: 5000, isCurrency: true },
                            { label: "Reports Submitted", current: scout.reportsSubmitted ?? 0, target: 20 },
                            { label: "Active Retainers", current: finances.retainerContracts?.filter((r: { status: string }) => r.status === "active").length ?? 0, target: 1 },
                          ];
                      return requirements.map(({ label, current, target, isCurrency }) => {
                        const pct = Math.min(100, (current / target) * 100);
                        const met = current >= target;
                        return (
                          <div key={label}>
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className={met ? "text-emerald-400" : "text-zinc-400"}>{label}</span>
                              <span className={`font-mono ${met ? "text-emerald-400" : "text-zinc-300"}`}>
                                {isCurrency ? `£${current.toLocaleString()}` : current} / {isCurrency ? `£${target.toLocaleString()}` : target}
                                {met && " ✓"}
                              </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${met ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Summary bar */}
        {showFullAgencySummary ? (
          <div className="mb-4 grid grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-3">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Monthly Overhead</p>
                <p className="text-base font-bold text-amber-400">£{calculateAgencyOverhead(finances).toLocaleString()}/mo</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Employees</p>
                <p className="text-base font-bold">
                  {finances.employees.length}{" "}
                  <span className="text-sm font-normal text-zinc-500">/ {finances.office.maxEmployees}</span>
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Quality Bonus</p>
                <p className="text-base font-bold text-emerald-400">+{Math.round(finances.office.qualityBonus * 100)}%</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Active Clients</p>
                <p className="text-base font-bold">{clientRelationships.filter((c: { status: string }) => c.status === "active").length}</p>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="mb-4 grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-3">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Weekly Infrastructure Cost</p>
                <p className="text-base font-bold text-red-400">£{infraEffects.weeklyCost.toLocaleString()}/wk</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Report Quality Bonus</p>
                <p className="text-base font-bold text-emerald-400">+{(infraEffects.reportQualityBonus * 100).toFixed(0)}%</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Assistant Scouts</p>
                <p className="text-base font-bold">
                  {assistantScouts.length}{" "}
                  <span className="text-sm font-normal text-zinc-500">/ {MAX_ASSISTANT_SCOUTS}</span>
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tab bar */}
        <div
          className="mb-4 flex items-center gap-1 border-b border-zinc-800 overflow-x-auto"
          role="tablist"
          aria-label="Agency management tabs"
        >
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = resolvedTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                aria-controls={`tabpanel-${tab.id}`}
                id={`tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition whitespace-nowrap border-b-2 -mb-px ${
                  isActive
                    ? "border-emerald-500 text-emerald-400"
                    : "border-transparent text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <Icon size={13} aria-hidden="true" />
                {tab.label}
                {tab.badge !== undefined && (
                  <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-black">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab panels */}
        <div
          role="tabpanel"
          id={`tabpanel-${resolvedTab}`}
          aria-labelledby={`tab-${resolvedTab}`}
        >
          {resolvedTab === "infrastructure" && <InfrastructureTab />}

          {resolvedTab === "assistants" && <AssistantScoutsTab />}

          {resolvedTab === "office" && <OfficeTab />}

          {resolvedTab === "clients" && (
            <ClientsTab
              clientRelationships={clientRelationships}
              clubs={gameState.clubs}
            />
          )}

          {resolvedTab === "events" && (
            <EventsTab
              pendingEvents={pendingEvents}
              employees={finances.employees}
              currentWeek={gameState.currentWeek}
              currentSeason={gameState.currentSeason}
            />
          )}

          {resolvedTab === "satellites" && (
            <OfficesTab
              mainOffice={finances.office}
              satelliteOffices={satelliteOffices}
              employees={finances.employees}
              countries={countries}
              balance={finances.balance}
            />
          )}

          {resolvedTab === "legacy" && (
            <LegacyTab
              awards={awards}
              finances={finances}
              currentSeason={gameState.currentSeason}
            />
          )}
        </div>
      </div>
    </GameLayout>
  );
}
