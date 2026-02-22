"use client";

import { useState } from "react";
import { useGameStore } from "@/stores/gameStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { Specialization, NewGameConfig, ScoutSkill } from "@/engine/core/types";
import { getCountryOptions } from "@/data/index";
import {
  BASE_SKILLS,
  SKILL_MINIMUMS,
  ALLOCATION_MAX,
  BONUS_POINTS,
} from "@/engine/scout/creation";

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------

const SPECIALIZATIONS: {
  id: Specialization;
  name: string;
  tagline: string;
  desc: string;
  playstyle: string;
  exclusiveFeatures: string[];
  exclusiveActivities: string[];
  keyStrength: string;
}[] = [
  {
    id: "youth",
    name: "Youth Scout",
    tagline: "The long game",
    desc: "Find the wonderkids before anyone else. Visit academies, attend youth tournaments, and project which 16-year-olds will become world-class players.",
    playstyle: "Patient, intuitive gameplay. You won't see results for seasons — but when your discovery becomes a star, nothing beats it.",
    exclusiveFeatures: [
      "Academy visits & youth tournament scouting",
      "Gut feelings — intuitive reads on young talent",
      "Player placement — recommend youth to clubs",
      "Alumni tracking — watch your discoveries grow",
      "Venue discovery — find hidden training grounds",
      "Home country scouting advantage",
    ],
    exclusiveActivities: ["Academy Visit", "Youth Tournament", "Training Visit"],
    keyStrength: "Potential Assessment — the best at projecting a player's ceiling",
  },
  {
    id: "firstTeam",
    name: "First Team Scout",
    tagline: "High stakes, immediate impact",
    desc: "Your manager needs a left-back who fits the system, is under 28, and costs less than £20M. Find them — or your job is on the line.",
    playstyle: "High-pressure, results-driven gameplay. Your manager sets transfer targets and you must deliver players who fit the tactical system and perform immediately.",
    exclusiveFeatures: [
      "Manager directives — fulfil specific transfer briefs",
      "Club response pipeline — see your picks signed or rejected",
      "System fit analysis — tactical compatibility scoring",
      "Transfer tracker — monitor your signings' performance",
      "Trial matches — prove a player's quality in-house",
      "Contract negotiation assists",
    ],
    exclusiveActivities: ["Reserve Match", "Scouting Mission", "Opposition Analysis", "Agent Showcase", "Trial Match", "Contract Negotiation"],
    keyStrength: "Player Judgment — the best at assessing current ability level",
  },
  {
    id: "regional",
    name: "Regional Expert",
    tagline: "Know every pitch, every prospect",
    desc: "Deep knowledge of a specific region gives you connections and insights no outsider can match. You find hidden gems before the big clubs even know they exist.",
    playstyle: "Network-focused gameplay. Your local contacts, cultural expertise, and regional reputation open doors that other scouts can't access.",
    exclusiveFeatures: [
      "Regional reputation & territory bonuses",
      "Stronger local contact network",
      "Hidden gem discovery advantage",
      "Choose your starting region",
      "Cross-league transfer insights",
      "Cultural scouting expertise",
    ],
    exclusiveActivities: ["Match Attendance", "Networking", "Study"],
    keyStrength: "Balanced skills — strong generalist with deep regional knowledge",
  },
  {
    id: "data",
    name: "Data Scout",
    tagline: "Numbers reveal what eyes miss",
    desc: "Query statistical databases, detect anomalies in player data, and make predictions about who's about to break out — or break down.",
    playstyle: "Analytical, systems-driven gameplay. You manage an analytics team, build statistical profiles, and earn 'Oracle' status by making accurate predictions.",
    exclusiveFeatures: [
      "Database queries — filter players by statistical criteria",
      "Statistical profiling with percentile rankings",
      "Prediction system — forecast breakouts, declines & transfers",
      "Oracle status — earn prestige through prediction accuracy",
      "Analytics team — hire & manage NPC data analysts",
      "Market inefficiency scanner",
    ],
    exclusiveActivities: ["Database Query", "Deep Video Analysis", "Stats Briefing", "Data Conference", "Algorithm Calibration", "Market Inefficiency Scan", "Analytics Team Meeting"],
    keyStrength: "Data Literacy — the best at interpreting statistics and spotting anomalies",
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
  const [specialization, setSpecializationRaw] = useState<Specialization>("youth");
  const setSpecialization = (spec: Specialization) => {
    setSpecializationRaw(spec);
    setSkillAllocations({});
  };

  // Skill allocations
  const [skillAllocations, setSkillAllocations] = useState<Partial<Record<ScoutSkill, number>>>({});

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
      ...(Object.keys(skillAllocations).length > 0 && { skillAllocations }),
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
            {SPECIALIZATIONS.map((spec) => {
              const isSelected = specialization === spec.id;
              return (
                <button
                  key={spec.id}
                  onClick={() => setSpecialization(spec.id)}
                  aria-pressed={isSelected}
                  className={`cursor-pointer rounded-lg border p-4 text-left transition ${
                    isSelected
                      ? "border-emerald-500 bg-emerald-500/10"
                      : "border-[var(--border)] hover:border-zinc-600"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold text-white">{spec.name}</h3>
                    <span className="text-[10px] uppercase tracking-wider text-zinc-500">{spec.tagline}</span>
                  </div>
                  <p className="mb-3 text-sm text-zinc-400">{spec.desc}</p>

                  {/* Expanded detail when selected */}
                  {isSelected && (
                    <div className="mt-3 space-y-3 border-t border-zinc-800 pt-3">
                      <div>
                        <p className="text-xs font-semibold text-zinc-300 mb-1">How it plays</p>
                        <p className="text-xs text-zinc-500 leading-relaxed">{spec.playstyle}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-zinc-300 mb-1.5">Exclusive features</p>
                        <ul className="space-y-1">
                          {spec.exclusiveFeatures.map((f) => (
                            <li key={f} className="flex items-start gap-1.5 text-xs text-zinc-400">
                              <span className="mt-1 w-1 h-1 rounded-full bg-emerald-500 shrink-0" aria-hidden="true" />
                              {f}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-zinc-300 mb-1.5">Exclusive activities</p>
                        <div className="flex flex-wrap gap-1">
                          {spec.exclusiveActivities.map((a) => (
                            <span key={a} className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300">
                              {a}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="rounded bg-emerald-950/40 border border-emerald-900/30 px-2.5 py-1.5">
                        <p className="text-[10px] text-emerald-400">
                          <span className="font-semibold">Key strength:</span>{" "}
                          <span className="text-emerald-300">{spec.keyStrength}</span>
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Collapsed summary when not selected */}
                  {!isSelected && (
                    <div className="flex flex-wrap gap-1.5">
                      {spec.exclusiveActivities.slice(0, 3).map((a) => (
                        <span
                          key={a}
                          className="rounded-full bg-[var(--secondary)] px-2 py-0.5 text-xs text-zinc-300"
                        >
                          {a}
                        </span>
                      ))}
                      {spec.exclusiveActivities.length > 3 && (
                        <span className="rounded-full bg-[var(--secondary)] px-2 py-0.5 text-xs text-zinc-500">
                          +{spec.exclusiveActivities.length - 3} more
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </CardContent>
        </Card>

        {/* ── Skill Allocation ─────────────────────────────────────────── */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Customize Your Skills</CardTitle>
            <CardDescription>
              Allocate {BONUS_POINTS} bonus points across your scouting skills. Your specialization
              sets the baseline — bonus points let you shape your strengths.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(() => {
              const base = BASE_SKILLS[specialization];
              const mins = SKILL_MINIMUMS[specialization];
              const totalUsed = Object.values(skillAllocations).reduce(
                (s, v) => s + (v ?? 0),
                0,
              );
              const remaining = BONUS_POINTS - totalUsed;

              const SKILL_DESCRIPTIONS: Record<ScoutSkill, string> = {
                technicalEye: "Reading technical attributes",
                physicalAssessment: "Evaluating physical traits",
                psychologicalRead: "Assessing mental and hidden attributes",
                tacticalUnderstanding: "Analysing tactical attributes",
                dataLiteracy: "Interpreting statistics",
                playerJudgment: "Gauging overall current ability",
                potentialAssessment: "Projecting a player's ceiling",
              };

              const skills = Object.keys(base) as ScoutSkill[];

              return (
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-zinc-500">Remaining Points</span>
                    <span
                      className={`text-sm font-bold ${
                        remaining > 0 ? "text-amber-400" : "text-emerald-400"
                      }`}
                    >
                      {remaining} / {BONUS_POINTS}
                    </span>
                  </div>

                  {skills.map((skill) => {
                    const baseVal = base[skill];
                    const bonus = skillAllocations[skill] ?? 0;
                    const current = baseVal + bonus;
                    const canDecrease = bonus > 0 && current - 1 >= mins[skill];
                    const canIncrease = remaining > 0 && current < ALLOCATION_MAX;

                    return (
                      <div key={skill} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <span className="text-sm text-zinc-300">
                              {SKILL_DESCRIPTIONS[skill].split(" ")[0] === "Reading"
                                ? skill.replace(/([A-Z])/g, " $1").trim().replace(/^\w/, (c) => c.toUpperCase())
                                : skill.replace(/([A-Z])/g, " $1").trim().replace(/^\w/, (c) => c.toUpperCase())}
                            </span>
                            <span className="ml-2 text-[10px] text-zinc-500">
                              {SKILL_DESCRIPTIONS[skill]}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() =>
                                setSkillAllocations((prev) => ({
                                  ...prev,
                                  [skill]: Math.max(0, bonus - 1),
                                }))
                              }
                              disabled={!canDecrease}
                              className={`w-6 h-6 rounded text-xs font-bold border transition ${
                                canDecrease
                                  ? "border-zinc-600 text-zinc-300 hover:bg-zinc-800 cursor-pointer"
                                  : "border-zinc-800 text-zinc-700 cursor-not-allowed"
                              }`}
                              aria-label={`Decrease ${skill}`}
                            >
                              −
                            </button>
                            <span className="w-8 text-center text-sm font-mono font-bold text-white">
                              {current}
                            </span>
                            <button
                              onClick={() =>
                                setSkillAllocations((prev) => ({
                                  ...prev,
                                  [skill]: bonus + 1,
                                }))
                              }
                              disabled={!canIncrease}
                              className={`w-6 h-6 rounded text-xs font-bold border transition ${
                                canIncrease
                                  ? "border-zinc-600 text-zinc-300 hover:bg-zinc-800 cursor-pointer"
                                  : "border-zinc-800 text-zinc-700 cursor-not-allowed"
                              }`}
                              aria-label={`Increase ${skill}`}
                            >
                              +
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-[#27272a] overflow-hidden">
                            <div
                              className="h-full rounded-full bg-emerald-500 transition-all"
                              style={{ width: `${(current / 20) * 100}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-zinc-600 w-16 shrink-0">
                            (base {baseVal}{bonus > 0 ? ` +${bonus}` : ""})
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
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
