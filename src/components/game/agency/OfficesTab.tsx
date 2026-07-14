"use client";

import { useState } from "react";
import { useGameStore } from "@/stores/gameStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Globe, Building2, X, Plus } from "lucide-react";
import type { SatelliteOffice, Office, AgencyEmployee, Scout } from "@/engine/core/types";
import type { RegionalPresenceSnapshot } from "@/engine/world/regionalPresence";
import { getCountryDisplayName } from "@/lib/country";
import {
  getHomeBaseRelocationQuote,
  SATELLITE_OFFICE_CLOSURE_BASE_COST,
} from "@/engine/finance";

// ─── Constants ────────────────────────────────────────────────────────────────

const SETUP_COST = 8000;
const MONTHLY_COST = 1200;

// ─── Component ────────────────────────────────────────────────────────────────

interface OfficesTabProps {
  mainOffice: Office;
  satelliteOffices: SatelliteOffice[];
  employees: AgencyEmployee[];
  countries: string[];
  balance: number;
  presenceByOfficeId: Record<string, RegionalPresenceSnapshot>;
  homeCountry: string;
  scout: Scout;
  currentWeek: number;
  currentSeason: number;
}

export function OfficesTab({
  mainOffice,
  satelliteOffices,
  employees,
  countries,
  balance,
  presenceByOfficeId,
  homeCountry,
  scout,
  currentWeek,
  currentSeason,
}: OfficesTabProps) {
  const openAgencySatelliteOffice = useGameStore((s) => s.openAgencySatelliteOffice);
  const closeAgencySatelliteOffice = useGameStore((s) => s.closeAgencySatelliteOffice);
  const assignEmployeeToAgencySatellite = useGameStore((s) => s.assignEmployeeToAgencySatellite);
  const relocateAgencyHomeBase = useGameStore((s) => s.relocateAgencyHomeBase);

  const [newRegion, setNewRegion] = useState<string>("");
  const [confirmClose, setConfirmClose] = useState<string | null>(null);
  const [relocationTarget, setRelocationTarget] = useState("");
  const [confirmRelocation, setConfirmRelocation] = useState(false);

  const existingRegions = new Set(satelliteOffices.map((o) => o.region));
  const availableRegions = countries.filter((c) => !existingRegions.has(c));
  const canAffordSetup = balance >= SETUP_COST;
  const relocationQuote = relocationTarget
    ? getHomeBaseRelocationQuote(
        { office: mainOffice, satelliteOffices, balance },
        scout,
        relocationTarget,
        currentWeek,
        currentSeason,
      )
    : undefined;

  function handleOpen() {
    if (!newRegion || !canAffordSetup) return;
    openAgencySatelliteOffice(newRegion);
    setNewRegion("");
  }

  function handleAssign(employeeId: string, officeId: string) {
    assignEmployeeToAgencySatellite(employeeId, officeId);
  }

  // Employees not already in a satellite office
  const assignedEmployeeIds = new Set(satelliteOffices.flatMap((o) => o.employeeIds));
  const unassignedEmployees = employees.filter((e) => !assignedEmployeeIds.has(e.id));

  return (
    <div className="space-y-4">
      {/* Main office summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Building2 size={14} className="text-zinc-400" aria-hidden="true" />
            Main Office
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-emerald-600/30 bg-emerald-950/10 p-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-white capitalize">{mainOffice.tier.replace(/([A-Z])/g, " $1")}</span>
                <p className="mt-0.5 text-[10px] text-zinc-500">
                  Permanent base · {getCountryDisplayName(homeCountry)}
                </p>
              </div>
              <span className="text-xs text-emerald-400">
                +{Math.round(mainOffice.qualityBonus * 100)}% quality
              </span>
            </div>
            <div className="flex gap-4 mt-1 text-xs text-zinc-500">
              <span>£{mainOffice.monthlyCost.toLocaleString()}/mo</span>
              <span>{mainOffice.maxEmployees} staff max</span>
            </div>
            {(scout.homeBaseRelocations?.length ?? 0) > 0 && (
              <p className="mt-2 border-t border-emerald-500/10 pt-2 text-[10px] text-zinc-500">
                Last relocated in season {scout.homeBaseRelocations!.at(-1)!.season} from {getCountryDisplayName(scout.homeBaseRelocations!.at(-1)!.fromCountry)}.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Globe size={14} className="text-cyan-400" aria-hidden="true" />
            Relocate Headquarters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs leading-relaxed text-zinc-400">
            Turn an established satellite into your permanent base. This changes home travel economics and regional access; the old base remains as an unstaffed satellite.
          </p>
          {satelliteOffices.length === 0 ? (
            <p className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-500">
              Establish a satellite office first. Headquarters cannot jump into a market where the agency has no operating history.
            </p>
          ) : (
            <>
              <div>
                <label htmlFor="headquarters-relocation-target" className="mb-1 block text-xs text-zinc-400">
                  Established destination
                </label>
                <select
                  id="headquarters-relocation-target"
                  value={relocationTarget}
                  onChange={(event) => {
                    setRelocationTarget(event.target.value);
                    setConfirmRelocation(false);
                  }}
                  className="w-full min-h-11 rounded border border-zinc-700 bg-zinc-900 px-3 text-sm text-white focus:border-cyan-500 focus:outline-none"
                >
                  <option value="">Choose an office</option>
                  {satelliteOffices.map((office) => (
                    <option key={office.id} value={office.region}>
                      {getCountryDisplayName(office.region)}
                    </option>
                  ))}
                </select>
              </div>
              {relocationQuote && (
                <div className={`rounded-lg border p-3 ${relocationQuote.eligible ? "border-cyan-500/20 bg-cyan-500/5" : "border-amber-500/20 bg-amber-500/5"}`}>
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-medium text-zinc-200">Relocation cost</span>
                    <span className="font-mono font-semibold text-white">£{relocationQuote.cost.toLocaleString()}</span>
                  </div>
                  <p className="mt-2 text-[10px] leading-relaxed text-zinc-400">{relocationQuote.reason}</p>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-[10px] text-zinc-500">
                    <li>Permanent home-travel origin changes immediately.</li>
                    <li>The destination satellite is absorbed into headquarters.</li>
                    <li>The former base loses staffed-office effects until reassigned.</li>
                    <li>Another headquarters move is locked until next season.</li>
                  </ul>
                </div>
              )}
              {relocationQuote?.eligible && (
                confirmRelocation ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      className="min-h-11"
                      onClick={() => setConfirmRelocation(false)}
                    >
                      Keep current base
                    </Button>
                    <Button
                      className="min-h-11"
                      onClick={() => {
                        relocateAgencyHomeBase(relocationTarget);
                        setRelocationTarget("");
                        setConfirmRelocation(false);
                      }}
                    >
                      Confirm relocation
                    </Button>
                  </div>
                ) : (
                  <Button className="min-h-11 w-full" onClick={() => setConfirmRelocation(true)}>
                    Review and commit
                  </Button>
                )
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Satellite offices */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Globe size={14} className="text-zinc-400" aria-hidden="true" />
            Satellite Offices
            <span className="ml-auto text-xs font-normal text-zinc-500">
              {satelliteOffices.length} active
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {satelliteOffices.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-4">
              No satellite offices yet. Open one below to expand internationally.
            </p>
          ) : (
            <div className="space-y-3">
              {satelliteOffices.map((office) => {
                const assignedEmps = employees.filter((e) => office.employeeIds.includes(e.id));
                const presence = presenceByOfficeId[office.id];
                const isConfirm = confirmClose === office.id;
                const spotsLeft = office.maxEmployees - office.employeeIds.length;
                const closureCost = SATELLITE_OFFICE_CLOSURE_BASE_COST + office.employeeIds.length * 500;

                return (
                  <div key={office.id} className="rounded-lg border border-zinc-800 p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-sm font-medium text-white">{office.region}</span>
                        <div className="flex gap-3 mt-0.5 text-xs text-zinc-500">
                          <span>£{office.monthlyCost.toLocaleString()}/mo</span>
                          <span>
                            {office.employeeIds.length}/{office.maxEmployees} staff
                          </span>
                          <span className="text-emerald-400">
                            +{Math.round(office.qualityBonus * 100)}% quality
                          </span>
                        </div>
                      </div>
                      {isConfirm ? (
                        <div className="flex gap-1 shrink-0">
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-6 text-xs px-2"
                            onClick={() => {
                              closeAgencySatelliteOffice(office.id);
                              setConfirmClose(null);
                            }}
                          >
                            Confirm Close
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-xs px-2"
                            onClick={() => setConfirmClose(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-red-400 hover:text-red-300 shrink-0"
                          onClick={() => setConfirmClose(office.id)}
                          aria-label={`Close ${office.region} office`}
                        >
                          <X size={12} aria-hidden="true" />
                        </Button>
                      )}
                    </div>

                    {isConfirm && (
                      <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-2 text-[10px] leading-relaxed text-red-200/80">
                        Closing costs £{closureCost.toLocaleString()}. {office.employeeIds.length > 0
                          ? `${office.employeeIds.length} assigned employee${office.employeeIds.length === 1 ? "" : "s"} will be reassigned with a morale penalty.`
                          : "No employees are assigned."} Regional access and passive knowledge fall immediately.
                      </div>
                    )}

                    {/* Assigned employees */}
                    {assignedEmps.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {assignedEmps.map((e) => (
                          <span
                            key={e.id}
                            className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400"
                          >
                            {e.name}
                          </span>
                        ))}
                      </div>
                    )}

                    {presence && (
                      <div className="rounded-lg border border-cyan-500/15 bg-cyan-500/5 p-2">
                        <div className="flex items-center justify-between gap-2 text-[10px]">
                          <span className="font-medium capitalize text-cyan-200">
                            {presence.accessTier} presence · {presence.accessScore}/100
                          </span>
                          <span className="text-zinc-500">
                            Knowledge +{presence.effects.passiveKnowledgeGain.toFixed(1)}/wk
                          </span>
                        </div>
                        <div className="mt-1 grid grid-cols-2 gap-1 text-[9px] text-zinc-500">
                          <span>Discovery ×{presence.effects.discoveryMultiplier.toFixed(2)}</span>
                          <span>Evidence +{Math.round(presence.effects.observationConfidenceBonus * 100)}%</span>
                          <span>Leads ×{presence.effects.opportunityMultiplier.toFixed(2)}</span>
                          <span>Trip cost −{Math.round((1 - presence.effects.travelCostMultiplier) * 100)}%</span>
                        </div>
                        {office.employeeIds.length === 0 && (
                          <p className="mt-1 text-[9px] leading-relaxed text-amber-300/80">
                            Assign staff to unlock route planning, stronger passive knowledge, and the office&apos;s full local effect.
                          </p>
                        )}
                      </div>
                    )}

                    {/* Assign employee */}
                    {spotsLeft > 0 && unassignedEmployees.length > 0 && (
                      <div className="flex items-center gap-2">
                        <label htmlFor={`assign-sat-${office.id}`} className="text-[10px] text-zinc-500 shrink-0">
                          Assign:
                        </label>
                        <select
                          id={`assign-sat-${office.id}`}
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value) {
                              handleAssign(e.target.value, office.id);
                              e.target.value = "";
                            }
                          }}
                          className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
                        >
                          <option value="">— Select employee —</option>
                          {unassignedEmployees.map((emp) => (
                            <option key={emp.id} value={emp.id}>
                              {emp.name} ({emp.role})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Open new office */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Plus size={14} className="text-zinc-400" aria-hidden="true" />
            Open New Office
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border border-zinc-800 p-2 text-xs text-zinc-500 flex justify-between">
            <span>Setup cost</span>
            <span className={balance >= SETUP_COST ? "text-zinc-300" : "text-red-400"}>
              £{SETUP_COST.toLocaleString()}
            </span>
          </div>
          <div className="rounded-lg border border-zinc-800 p-2 text-xs text-zinc-500 flex justify-between">
            <span>Monthly cost</span>
            <span className="text-zinc-300">£{MONTHLY_COST.toLocaleString()}/mo</span>
          </div>

          {availableRegions.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-2">
              You have offices in all available regions.
            </p>
          ) : (
            <>
              <div>
                <label htmlFor="new-office-region" className="block text-xs text-zinc-400 mb-1">
                  Select Country
                </label>
                <select
                  id="new-office-region"
                  value={newRegion}
                  onChange={(e) => setNewRegion(e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">— Choose a country —</option>
                  {availableRegions.map((region) => (
                    <option key={region} value={region}>
                      {region}
                    </option>
                  ))}
                </select>
              </div>

              {!canAffordSetup && (
                <p className="text-xs text-red-400">
                  You need at least £{SETUP_COST.toLocaleString()} to open a new office.
                </p>
              )}

              <Button
                size="sm"
                onClick={handleOpen}
                disabled={!newRegion || !canAffordSetup}
                className="w-full"
              >
                Open Office
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
