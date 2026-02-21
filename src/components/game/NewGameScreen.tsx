"use client";

import { useState } from "react";
import { useGameStore } from "@/stores/gameStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { Specialization, NewGameConfig } from "@/engine/core/types";
import { getCountryOptions } from "@/data/index";

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------

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

const NATIONALITY_OPTIONS: string[] = [
  "English",
  "Spanish",
  "German",
  "French",
  "Brazilian",
  "Argentine",
  "Italian",
  "Dutch",
  "Portuguese",
  "Belgian",
];

/**
 * Top-league clubs per country key, matching the static data IDs exactly.
 * Used to populate the "Starting Club" dropdown before the world is generated.
 * We only list the first-tier clubs since a starting club scout would realistically
 * begin at a top-flight club.
 */
const TOP_LEAGUE_CLUBS: Record<string, { id: string; name: string }[]> = {
  england: [
    { id: "club-northford-city",     name: "Northford City" },
    { id: "club-red-vale-united",    name: "Red Vale United" },
    { id: "club-westbridge-fc",      name: "Westbridge FC" },
    { id: "club-merseyton-fc",       name: "Merseyton FC" },
    { id: "club-southern-arsenal",   name: "Southern Arsenal" },
    { id: "club-spire-hotspur",      name: "Spire Hotspur" },
    { id: "club-london-wanderers",   name: "London Wanderers" },
    { id: "club-midfield-villa",     name: "Midfield Villa" },
    { id: "club-newcastle-blues",    name: "Newcastle Blues" },
    { id: "club-eastham-city",       name: "Eastham City" },
    { id: "club-westgate-united",    name: "Westgate United" },
    { id: "club-brighton-rovers",    name: "Brighton Rovers" },
    { id: "club-fulton-town",        name: "Fulton Town" },
    { id: "club-brentfield-fc",      name: "Brentfield FC" },
    { id: "club-crystalwood-palace", name: "Crystalwood Palace" },
    { id: "club-everton-cross",      name: "Everton Cross" },
    { id: "club-wolves-run",         name: "Wolves Run" },
    { id: "club-nottham-forest",     name: "Nottham Forest" },
    { id: "club-burnton-fc",         name: "Burnton FC" },
    { id: "club-lesterham-city",     name: "Lesterham City" },
  ],
  spain: [
    { id: "club-royal-madrid-fc",           name: "Royal Madrid FC" },
    { id: "club-barcelona-eagles",          name: "Barcelona Eagles" },
    { id: "club-atletico-reds",             name: "Atletico Reds" },
    { id: "club-sevilla-toreros",           name: "Sevilla Toreros" },
    { id: "club-valencia-bats",             name: "Valencia Bats" },
    { id: "club-real-sociedad-north",       name: "Real Sociedad North" },
    { id: "club-bilbao-lions",              name: "Bilbao Lions" },
    { id: "club-betis-greens",              name: "Betis Greens" },
    { id: "club-villarreal-yellows",        name: "Villarreal Yellows" },
    { id: "club-osasuna-reds",             name: "Osasuna Reds" },
    { id: "club-celta-vigo-blues",          name: "Celta Vigo Blues" },
    { id: "club-granada-pomegranates",      name: "Granada Pomegranates" },
    { id: "club-getafe-blues",              name: "Getafe Blues" },
    { id: "club-mallorca-islands",          name: "Mallorca Islands" },
    { id: "club-alaves-cats",               name: "Alaves Cats" },
    { id: "club-rayo-vallecano-rays",       name: "Rayo Vallecano Rays" },
    { id: "club-almeria-reds",              name: "Almeria Reds" },
    { id: "club-cadiz-yellows",             name: "Cadiz Yellows" },
    { id: "club-girona-reds",               name: "Girona Reds" },
    { id: "club-las-palmas-canaries",       name: "Las Palmas Canaries" },
  ],
  germany: [
    { id: "club-munich-bayern-fc",           name: "Munich Bayern FC" },
    { id: "club-dortmund-bees",              name: "Dortmund Bees" },
    { id: "club-leipzig-bulls",              name: "Leipzig Bulls" },
    { id: "club-bayer-leverkusen-giants",    name: "Bayer Leverkusen Giants" },
    { id: "club-frankfurt-eagles",           name: "Frankfurt Eagles" },
    { id: "club-wolfsburg-wolves",           name: "Wolfsburg Wolves" },
    { id: "club-gladbach-foals",             name: "Gladbach Foals" },
    { id: "club-berlin-irons",               name: "Berlin Irons" },
    { id: "club-berlin-old-town",            name: "Berlin Old Town" },
    { id: "club-freiburg-blacks",            name: "Freiburg Blacks" },
    { id: "club-mainz-carnies",              name: "Mainz Carnies" },
    { id: "club-hoffenheim-hopes",           name: "Hoffenheim Hopes" },
    { id: "club-bremen-anchors",             name: "Bremen Anchors" },
    { id: "club-augsburg-fuggars",           name: "Augsburg Fuggars" },
    { id: "club-koln-goats",                 name: "Koln Goats" },
    { id: "club-stuttgart-swans",            name: "Stuttgart Swans" },
    { id: "club-heidenheim-cannons",         name: "Heidenheim Cannons" },
    { id: "club-darmstadt-lilies",           name: "Darmstadt Lilies" },
  ],
  france: [
    { id: "club-paris-sg-fc",              name: "Paris Saint-Germain FC" },
    { id: "club-marseille-blues",          name: "Marseille Blues" },
    { id: "club-lyon-lions",               name: "Lyon Lions" },
    { id: "club-monaco-princes",           name: "Monaco Princes" },
    { id: "club-lille-dogues",             name: "Lille Dogues" },
    { id: "club-nice-eagles",              name: "Nice Eagles" },
    { id: "club-lens-miners",              name: "Lens Miners" },
    { id: "club-rennes-bretons",           name: "Rennes Bretons" },
    { id: "club-strasbourg-storks",        name: "Strasbourg Storks" },
    { id: "club-nantes-canaries",          name: "Nantes Canaries" },
    { id: "club-bordeaux-girondins",       name: "Bordeaux Girondins" },
    { id: "club-montpellier-paillade",     name: "Montpellier Paillade" },
    { id: "club-toulouse-violets",         name: "Toulouse Violets" },
    { id: "club-brest-pirates",            name: "Brest Pirates" },
    { id: "club-reims-champagne",          name: "Reims Champagne" },
    { id: "club-lorient-merlus",           name: "Lorient Merlus" },
    { id: "club-troyes-cotton",            name: "Troyes Cotton" },
    { id: "club-clermont-volcanoes",       name: "Clermont Volcanoes" },
    { id: "club-metz-moselle",             name: "Metz Moselle" },
    { id: "club-auxerre-abbey",            name: "Auxerre Abbey" },
  ],
  brazil: [
    { id: "club-flamengo-reds",                      name: "Flamengo Reds" },
    { id: "club-palmeiras-greens",                   name: "Palmeiras Greens" },
    { id: "club-atletico-mineiro-roosters",          name: "Atletico Mineiro Roosters" },
    { id: "club-sao-paulo-tricolor",                 name: "São Paulo Tricolor" },
    { id: "club-corinthians-faithful",               name: "Corinthians Faithful" },
    { id: "club-santos-fish",                        name: "Santos Fish" },
    { id: "club-fluminense-tricolor",                name: "Fluminense Tricolor" },
    { id: "club-internacional-colorados",            name: "Internacional Colorados" },
    { id: "club-gremio-grizzlies",                   name: "Grêmio Grizzlies" },
    { id: "club-botafogo-star",                      name: "Botafogo Star" },
    { id: "club-vasco-crosses",                      name: "Vasco Crosses" },
    { id: "club-cruzeiro-foxes",                     name: "Cruzeiro Foxes" },
    { id: "club-athletico-paranaense-hurricane",     name: "Athletico Paranaense Hurricane" },
    { id: "club-fortaleza-lions",                    name: "Fortaleza Lions" },
    { id: "club-bahia-sailors",                      name: "Bahia Sailors" },
    { id: "club-goias-esmeraldino",                  name: "Goias Esmeraldino" },
    { id: "club-sport-recife-lions",                 name: "Sport Recife Lions" },
    { id: "club-cuiaba-golden",                      name: "Cuiabá Golden" },
    { id: "club-ceara-sharks",                       name: "Ceará Sharks" },
    { id: "club-america-mineiro-rabbits",            name: "América Mineiro Rabbits" },
  ],
  argentina: [
    { id: "club-river-plate-reds",                    name: "River Plate Reds" },
    { id: "club-boca-blues",                          name: "Boca Blues" },
    { id: "club-racing-whites",                       name: "Racing Whites" },
    { id: "club-independiente-reds",                  name: "Independiente Reds" },
    { id: "club-san-lorenzo-crows",                   name: "San Lorenzo Crows" },
    { id: "club-huracan-balloon",                     name: "Huracán Balloon" },
    { id: "club-lanus-pomegranates",                  name: "Lanús Pomegranates" },
    { id: "club-estudiantes-pinchas",                 name: "Estudiantes Pinchas" },
    { id: "club-banfield-greens",                     name: "Banfield Greens" },
    { id: "club-arsenal-sarandi-reds",                name: "Arsenal Sarandí Reds" },
    { id: "club-godoy-cruz-tombinos",                 name: "Godoy Cruz Tombinos" },
    { id: "club-talleres-cordoba-talleres",           name: "Talleres Córdoba" },
    { id: "club-atletico-tucuman-decano",             name: "Atlético Tucumán Decano" },
    { id: "club-belgrano-pirates",                    name: "Belgrano Pirates" },
    { id: "club-velez-sarsfield-whites",              name: "Vélez Sarsfield Whites" },
    { id: "club-colon-santa-fe-sabaleros",            name: "Colón Santa Fé Sabaleros" },
    { id: "club-union-santa-fe-tatengues",            name: "Unión Santa Fé Tatengues" },
    { id: "club-central-cordoba-ferroviarios",        name: "Central Córdoba Ferroviarios" },
    { id: "club-platense-calamares",                  name: "Platense Calamares" },
    { id: "club-tigre-matadores",                     name: "Tigre Matadores" },
  ],
};

const COUNTRY_OPTIONS = getCountryOptions();

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NewGameScreen() {
  const { setScreen, startNewGame } = useGameStore();

  // Identity
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [age, setAge] = useState(28);
  const [nationality, setNationality] = useState<string>("English");

  // Specialization
  const [specialization, setSpecialization] = useState<Specialization>("youth");

  // Starting position
  const [startingPosition, setStartingPosition] = useState<"freelance" | "club">("freelance");
  const [startingClubId, setStartingClubId] = useState<string>("");

  // Football world
  const [selectedCountries, setSelectedCountries] = useState<string[]>(["england"]);
  const [startingCountry, setStartingCountry] = useState<string>("england");

  // World settings
  const [seed, setSeed] = useState(() => Math.random().toString(36).substring(2, 10));
  const [difficulty, setDifficulty] = useState<"easy" | "normal" | "hard">("normal");

  const totalClubs = COUNTRY_OPTIONS
    .filter((c) => selectedCountries.includes(c.key))
    .reduce((sum, c) => sum + c.clubCount, 0);

  const handleToggleCountry = (key: string) => {
    if (key === "england") return;

    setSelectedCountries((prev) => {
      const isSelected = prev.includes(key);
      if (isSelected && prev.length === 1) return prev;
      const next = isSelected ? prev.filter((k) => k !== key) : [...prev, key];

      if (!next.includes(startingCountry)) {
        setStartingCountry("england");
      }

      // If the currently-chosen starting club is no longer in any selected country,
      // clear the selection so the player must re-choose.
      const stillValid = next.flatMap((k) => TOP_LEAGUE_CLUBS[k] ?? []).some(
        (c) => c.id === startingClubId,
      );
      if (!stillValid) setStartingClubId("");

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
      nationality,
      ...(specialization === "regional" && { startingCountry }),
      ...(startingPosition === "club" && startingClubId && { startingClubId }),
    };
    startNewGame(config);
  };

  const canStart =
    firstName.trim() !== "" &&
    lastName.trim() !== "" &&
    (startingPosition === "freelance" || startingClubId !== "");

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

        {/* ── Game Introduction Banner ───────────────────────────────────── */}
        <Card className="mb-6 border-emerald-800/40 bg-emerald-950/30">
          <CardContent className="pt-6">
            <div className="flex gap-4 items-start">
              <div
                className="mt-0.5 flex-shrink-0 w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center"
                aria-hidden="true"
              >
                <svg
                  className="w-5 h-5 text-emerald-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
                  />
                </svg>
              </div>
              <div>
                <h2 className="font-semibold text-emerald-300 mb-1">
                  Your scouting career starts here
                </h2>
                <p className="text-sm text-zinc-300 leading-relaxed">
                  You are a football scout building your career from the ground up. Scout matches,
                  observe players, write reports, and build your reputation — until the biggest
                  clubs come calling. Start freelance and earn per report, or join a club straight
                  away for a steady salary. Every career decision is yours to make.
                </p>
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-400">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" aria-hidden="true" />
                    Scout matches &amp; observe players
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" aria-hidden="true" />
                    Write reports &amp; convince clubs
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" aria-hidden="true" />
                    Build contacts &amp; grow your network
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" aria-hidden="true" />
                    Rise through the ranks
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Scout Identity ─────────────────────────────────────────────── */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Your Identity</CardTitle>
            <CardDescription>Who are you in the scouting world?</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <label htmlFor="scout-first-name" className="mb-1 block text-sm text-zinc-400">
                First Name
              </label>
              <input
                id="scout-first-name"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
                placeholder="Alex"
                autoComplete="given-name"
              />
            </div>
            <div>
              <label htmlFor="scout-last-name" className="mb-1 block text-sm text-zinc-400">
                Last Name
              </label>
              <input
                id="scout-last-name"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
                placeholder="Morgan"
                autoComplete="family-name"
              />
            </div>
            <div>
              <label htmlFor="scout-age" className="mb-1 block text-sm text-zinc-400">
                Age
              </label>
              <input
                id="scout-age"
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
            <div>
              <label htmlFor="scout-nationality" className="mb-1 block text-sm text-zinc-400">
                Nationality
              </label>
              <select
                id="scout-nationality"
                value={nationality}
                onChange={(e) => setNationality(e.target.value)}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
              >
                {NATIONALITY_OPTIONS.map((nat) => (
                  <option key={nat} value={nat}>
                    {nat}
                  </option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>

        {/* ── Specialization ─────────────────────────────────────────────── */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Specialization</CardTitle>
            <CardDescription>
              Choose your scouting focus. This shapes your career path and which clubs want you.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            {SPECIALIZATIONS.map((spec) => (
              <button
                key={spec.id}
                onClick={() => setSpecialization(spec.id)}
                aria-pressed={specialization === spec.id}
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

        {/* ── Starting Position ──────────────────────────────────────────── */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Starting Position</CardTitle>
            <CardDescription>
              How do you want to begin your career?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Freelance option */}
              <button
                onClick={() => {
                  setStartingPosition("freelance");
                  setStartingClubId("");
                }}
                aria-pressed={startingPosition === "freelance"}
                className={`cursor-pointer rounded-lg border p-4 text-left transition ${
                  startingPosition === "freelance"
                    ? "border-emerald-500 bg-emerald-500/10"
                    : "border-[var(--border)] hover:border-zinc-600"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={`inline-flex w-4 h-4 rounded-full border-2 items-center justify-center flex-shrink-0 ${
                      startingPosition === "freelance"
                        ? "border-emerald-500 bg-emerald-500"
                        : "border-zinc-500"
                    }`}
                    aria-hidden="true"
                  >
                    {startingPosition === "freelance" && (
                      <span className="w-1.5 h-1.5 rounded-full bg-white" />
                    )}
                  </span>
                  <h3 className="font-semibold text-white">Freelance Scout</h3>
                </div>
                <p className="text-sm text-zinc-400">
                  Start independent. Earn per-report fees. Build your reputation from scratch and
                  wait for club offers to arrive.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-[var(--secondary)] px-2 py-0.5 text-xs text-zinc-300">
                    No salary
                  </span>
                  <span className="rounded-full bg-[var(--secondary)] px-2 py-0.5 text-xs text-zinc-300">
                    Report fees
                  </span>
                  <span className="rounded-full bg-[var(--secondary)] px-2 py-0.5 text-xs text-zinc-300">
                    Full freedom
                  </span>
                </div>
              </button>

              {/* Club Scout option */}
              <button
                onClick={() => setStartingPosition("club")}
                aria-pressed={startingPosition === "club"}
                className={`cursor-pointer rounded-lg border p-4 text-left transition ${
                  startingPosition === "club"
                    ? "border-emerald-500 bg-emerald-500/10"
                    : "border-[var(--border)] hover:border-zinc-600"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={`inline-flex w-4 h-4 rounded-full border-2 items-center justify-center flex-shrink-0 ${
                      startingPosition === "club"
                        ? "border-emerald-500 bg-emerald-500"
                        : "border-zinc-500"
                    }`}
                    aria-hidden="true"
                  >
                    {startingPosition === "club" && (
                      <span className="w-1.5 h-1.5 rounded-full bg-white" />
                    )}
                  </span>
                  <h3 className="font-semibold text-white">Club Scout</h3>
                </div>
                <p className="text-sm text-zinc-400">
                  Start employed by a club. Receive a steady salary of £800/week but you must
                  follow the club&apos;s scouting priorities and earn manager trust.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-[var(--secondary)] px-2 py-0.5 text-xs text-zinc-300">
                    £800/week salary
                  </span>
                  <span className="rounded-full bg-[var(--secondary)] px-2 py-0.5 text-xs text-zinc-300">
                    Club directives
                  </span>
                  <span className="rounded-full bg-[var(--secondary)] px-2 py-0.5 text-xs text-zinc-300">
                    Starter trust
                  </span>
                </div>
              </button>
            </div>

            {/* Club selector — only visible when "Club Scout" is chosen */}
            {startingPosition === "club" && (
              <div>
                <label htmlFor="starting-club" className="mb-1.5 block text-sm text-zinc-400">
                  Choose your club
                  <span className="ml-1 text-zinc-500 text-xs">(from your selected countries)</span>
                </label>
                <select
                  id="starting-club"
                  value={startingClubId}
                  onChange={(e) => setStartingClubId(e.target.value)}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
                >
                  <option value="">-- Select a club --</option>
                  {selectedCountries.map((countryKey) => {
                    const clubs = TOP_LEAGUE_CLUBS[countryKey];
                    const countryLabel = COUNTRY_OPTIONS.find((c) => c.key === countryKey)?.name ?? countryKey;
                    if (!clubs || clubs.length === 0) return null;
                    return (
                      <optgroup key={countryKey} label={countryLabel}>
                        {clubs.map((club) => (
                          <option key={club.id} value={club.id}>
                            {club.name}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
                {startingPosition === "club" && startingClubId === "" && (
                  <p className="mt-1 text-xs text-amber-400" role="alert">
                    You must select a club to begin as a Club Scout.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Football World ─────────────────────────────────────────────── */}
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
                    <p className="text-xs text-zinc-400">{country.clubCount} clubs</p>
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

        {/* ── Starting Region — only for Regional specialization ─────────── */}
        {specialization === "regional" && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Starting Region</CardTitle>
              <CardDescription>
                Choose which country your Regional Expert begins their career in.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p id="starting-region-label" className="mb-2 block text-sm text-zinc-400">
                Starting Region
              </p>
              <div
                className="flex flex-wrap gap-2"
                role="radiogroup"
                aria-labelledby="starting-region-label"
              >
                {COUNTRY_OPTIONS.filter((c) => selectedCountries.includes(c.key)).map((country) => (
                  <button
                    key={country.key}
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

        {/* ── World Settings ─────────────────────────────────────────────── */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>World Settings</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="world-seed" className="mb-1 block text-sm text-zinc-400">
                World Seed
              </label>
              <input
                id="world-seed"
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
                    aria-pressed={difficulty === d}
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
          disabled={!canStart}
        >
          Begin Career
        </Button>

        {/* Accessible validation summary shown below the button */}
        {!canStart && (firstName.trim() !== "" || lastName.trim() !== "") && (
          <p className="mt-3 text-center text-sm text-zinc-500" role="status">
            {firstName.trim() === "" || lastName.trim() === ""
              ? "Enter your first and last name to continue."
              : "Select a club to begin as a Club Scout."}
          </p>
        )}
      </div>
    </div>
  );
}
