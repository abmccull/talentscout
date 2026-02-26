"use client";

import { useState } from "react";
import { useGameStore } from "@/stores/gameStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Globe, Building2, X, Plus } from "lucide-react";
import type { SatelliteOffice, Office, AgencyEmployee } from "@/engine/core/types";

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
}

export function OfficesTab({
  mainOffice,
  satelliteOffices,
  employees,
  countries,
  balance,
}: OfficesTabProps) {
  const openAgencySatelliteOffice = useGameStore((s) => s.openAgencySatelliteOffice);
  const closeAgencySatelliteOffice = useGameStore((s) => s.closeAgencySatelliteOffice);
  const assignEmployeeToAgencySatellite = useGameStore((s) => s.assignEmployeeToAgencySatellite);

  const [newRegion, setNewRegion] = useState<string>("");
  const [confirmClose, setConfirmClose] = useState<string | null>(null);

  const existingRegions = new Set(satelliteOffices.map((o) => o.region));
  const availableRegions = countries.filter((c) => !existingRegions.has(c));
  const canAffordSetup = balance >= SETUP_COST;

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
              <span className="text-sm font-medium text-white capitalize">{mainOffice.tier.replace(/([A-Z])/g, " $1")}</span>
              <span className="text-xs text-emerald-400">
                +{Math.round(mainOffice.qualityBonus * 100)}% quality
              </span>
            </div>
            <div className="flex gap-4 mt-1 text-xs text-zinc-500">
              <span>£{mainOffice.monthlyCost.toLocaleString()}/mo</span>
              <span>{mainOffice.maxEmployees} staff max</span>
            </div>
          </div>
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
                const isConfirm = confirmClose === office.id;
                const spotsLeft = office.maxEmployees - office.employeeIds.length;

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
                  Select Region
                </label>
                <select
                  id="new-office-region"
                  value={newRegion}
                  onChange={(e) => setNewRegion(e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">— Choose a region —</option>
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
