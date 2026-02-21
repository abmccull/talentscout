"use client";

import { useState } from "react";
import { useGameStore } from "@/stores/gameStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { Specialization, NewGameConfig } from "@/engine/core/types";
import { getCountryOptions } from "@/data/index";

const SPECIALIZATIONS: {
  id: Specialization;
  name: string;
  desc: string;
  traits: string[];
}[] = [
  {
    id: "youth",
    name: "Youth Scout",
    desc: "Find the wonderkids before anyone else. Patience and projection are your tools.",
    traits: ["Academy Access", "Growth Projection", "Long-term payoff"],
  },
  {
    id: "firstTeam",
    name: "First Team Scout",
    desc: "Identify the right player for the right system. High stakes, immediate impact.",
    traits: ["System Fit Analysis", "Transfer Market Sense", "High pressure"],
  },
  {
    id: "regional",
    name: "Regional Expert",
    desc: "Deep knowledge of a specific region. You know every pitch and every prospect.",
    traits: ["Local Network", "Hidden Gem Finder", "Cultural expertise"],
  },
  {
    id: "data",
    name: "Data Scout",
    desc: "Numbers don't lie. Find market inefficiencies through statistical analysis.",
    traits: ["Statistical Baseline", "Anomaly Detection", "Modern approach"],
  },
];

const COUNTRY_OPTIONS = getCountryOptions();

export function NewGameScreen() {
  const { setScreen, startNewGame } = useGameStore();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [age, setAge] = useState(28);
  const [specialization, setSpecialization] = useState<Specialization>("youth");
  const [seed, setSeed] = useState(() => Math.random().toString(36).substring(2, 10));
  const [difficulty, setDifficulty] = useState<"easy" | "normal" | "hard">("normal");
  const [selectedCountries, setSelectedCountries] = useState<string[]>(["england"]);
  const [startingCountry, setStartingCountry] = useState<string>("england");

  const totalClubs = COUNTRY_OPTIONS
    .filter((c) => selectedCountries.includes(c.key))
    .reduce((sum, c) => sum + c.clubCount, 0);

  const handleToggleCountry = (key: string) => {
    // England cannot be deselected
    if (key === "england") return;

    setSelectedCountries((prev) => {
      const isSelected = prev.includes(key);
      // Must keep at least 1 country
      if (isSelected && prev.length === 1) return prev;
      const next = isSelected ? prev.filter((k) => k !== key) : [...prev, key];

      // If the startingCountry is no longer selected, reset to "england"
      if (!next.includes(startingCountry)) {
        setStartingCountry("england");
      }

      return next;
    });
  };

  const handleStart = () => {
    if (!firstName.trim() || !lastName.trim()) return;
    const config: NewGameConfig = {
      scoutFirstName: firstName.trim(),
      scoutLastName: lastName.trim(),
      scoutAge: age,
      specialization,
      difficulty,
      worldSeed: seed,
      selectedCountries,
      ...(specialization === "regional" && { startingCountry }),
    };
    startNewGame(config);
  };

  return (
    <div className="min-h-screen bg-[var(--background)] p-8">
      <div className="mx-auto max-w-4xl">
        <button
          onClick={() => setScreen("mainMenu")}
          className="mb-6 text-sm text-zinc-400 hover:text-white transition cursor-pointer"
        >
          &larr; Back to Menu
        </button>

        <h1 className="mb-8 text-3xl font-bold">New Career</h1>

        {/* Scout Identity */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Your Identity</CardTitle>
            <CardDescription>Who are you in the scouting world?</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-4">
            <div>
              <label className="mb-1 block text-sm text-zinc-400">First Name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
                placeholder="Alex"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-zinc-400">Last Name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
                placeholder="Morgan"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-zinc-400">Age</label>
              <input
                type="number"
                value={age}
                onChange={(e) => {
                  const v = parseInt(e.target.value) || 28;
                  setAge(Math.max(22, Math.min(65, v)));
                }}
                min={22}
                max={65}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
              />
            </div>
          </CardContent>
        </Card>

        {/* Specialization */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Specialization</CardTitle>
            <CardDescription>Choose your scouting focus. This shapes your career path and which clubs want you.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            {SPECIALIZATIONS.map((spec) => (
              <button
                key={spec.id}
                onClick={() => setSpecialization(spec.id)}
                className={`cursor-pointer rounded-lg border p-4 text-left transition ${
                  specialization === spec.id
                    ? "border-emerald-500 bg-emerald-500/10"
                    : "border-[var(--border)] hover:border-zinc-600"
                }`}
              >
                <h3 className="mb-1 font-semibold text-white">{spec.name}</h3>
                <p className="mb-3 text-sm text-zinc-400">{spec.desc}</p>
                <div className="flex flex-wrap gap-1.5">
                  {spec.traits.map((trait) => (
                    <span
                      key={trait}
                      className="rounded-full bg-[var(--secondary)] px-2 py-0.5 text-xs text-zinc-300"
                    >
                      {trait}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Football World */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Football World</CardTitle>
            <CardDescription>
              Select which countries to include. More countries = larger world.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {COUNTRY_OPTIONS.map((country) => {
                const isSelected = selectedCountries.includes(country.key);
                const isLocked = country.key === "england";
                return (
                  <button
                    key={country.key}
                    onClick={() => handleToggleCountry(country.key)}
                    disabled={isLocked}
                    aria-pressed={isSelected}
                    className={`cursor-pointer rounded-lg border p-3 text-left transition ${
                      isSelected
                        ? "border-emerald-500 bg-emerald-500/10"
                        : "border-[var(--border)] hover:border-zinc-600"
                    } ${isLocked ? "opacity-75 cursor-default" : ""}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-semibold text-white text-sm">{country.name}</h3>
                      {isLocked && (
                        <span className="text-xs text-zinc-500">Home</span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-400">
                      {country.leagueCount} league{country.leagueCount !== 1 ? "s" : ""}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {country.clubCount} clubs
                    </p>
                  </button>
                );
              })}
            </div>
            <p className="text-sm text-zinc-400">
              Total clubs selected:{" "}
              <span className="font-semibold text-white">{totalClubs}</span>
            </p>
          </CardContent>
        </Card>

        {/* Starting Region — only visible for regional specialization */}
        {specialization === "regional" && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Starting Region</CardTitle>
              <CardDescription>
                Choose which country your regional expert begins their career in.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <label htmlFor="startingCountry" className="mb-2 block text-sm text-zinc-400">
                Starting Region
              </label>
              <div className="flex flex-wrap gap-2">
                {COUNTRY_OPTIONS.filter((c) => selectedCountries.includes(c.key)).map((country) => (
                  <button
                    key={country.key}
                    id={country.key === selectedCountries[0] ? "startingCountry" : undefined}
                    onClick={() => setStartingCountry(country.key)}
                    aria-pressed={startingCountry === country.key}
                    className={`cursor-pointer rounded-md border px-4 py-2 text-sm transition ${
                      startingCountry === country.key
                        ? "border-emerald-500 bg-emerald-500/10 text-white"
                        : "border-[var(--border)] text-zinc-400 hover:text-white"
                    }`}
                  >
                    {country.name}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* World Settings */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>World Settings</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm text-zinc-400">World Seed</label>
              <input
                type="text"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
              />
              <p className="mt-1 text-xs text-zinc-500">Same seed = same world. Share with friends.</p>
            </div>
            <div>
              <label className="mb-1 block text-sm text-zinc-400">Difficulty</label>
              <div className="flex gap-2">
                {(["easy", "normal", "hard"] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDifficulty(d)}
                    className={`cursor-pointer flex-1 rounded-md border px-3 py-2 text-sm capitalize transition ${
                      difficulty === d
                        ? "border-emerald-500 bg-emerald-500/10 text-white"
                        : "border-[var(--border)] text-zinc-400 hover:text-white"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Button
          size="lg"
          className="w-full text-base"
          onClick={handleStart}
          disabled={!firstName.trim() || !lastName.trim()}
        >
          Begin Career
        </Button>
      </div>
    </div>
  );
}
