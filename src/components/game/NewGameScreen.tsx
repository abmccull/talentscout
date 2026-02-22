"use client";

import { useState } from "react";
import { useGameStore } from "@/stores/gameStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { Specialization, NewGameConfig, ScoutSkill } from "@/engine/core/types";
import { getCountryOptions, getSecondaryCountryOptions } from "@/data/index";
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
  /** For specs whose depth comes from systemic bonuses rather than unique activities. */
  systemBonuses?: string[];
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
    exclusiveActivities: [
      "Academy Visit",
      "Youth Tournament",
      "School Match",
      "Grassroots Tournament",
      "Academy Trial Day",
      "Youth Festival",
      "Follow-Up Session",
      "Parent Coach Meeting",
      "Write Placement Report",
    ],
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
    exclusiveActivities: [],
    systemBonuses: [
      "Scouting accuracy +25% in your home region",
      "Contact relationships build 2x faster locally",
      "Sub-region familiarity unlocks hidden venues",
      "Higher hidden gem discovery rate",
      "Cross-league intel from regional contacts",
    ],
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
  // Secondary regions
  "American",
  "Mexican",
  "Canadian",
  "Nigerian",
  "Ghanaian",
  "Ivorian",
  "Egyptian",
  "South African",
  "Senegalese",
  "Cameroonian",
  "Japanese",
  "South Korean",
  "Saudi",
  "Chinese",
  "Australian",
  "New Zealander",
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
const SECONDARY_OPTIONS = getSecondaryCountryOptions();

/** Group secondary countries by region for the info panel. */
const SECONDARY_REGIONS = (() => {
  const grouped: Record<string, { name: string; clubCount: number }[]> = {};
  for (const c of SECONDARY_OPTIONS) {
    if (!grouped[c.region]) grouped[c.region] = [];
    grouped[c.region].push({ name: c.name, clubCount: c.clubCount });
  }
  return Object.entries(grouped).map(([name, countries]) => ({ name, countries }));
})();

// ---------------------------------------------------------------------------
// Wizard step definitions
// ---------------------------------------------------------------------------

const STEPS = [
  { id: 1, label: "Identity" },
  { id: 2, label: "Specialization" },
  { id: 3, label: "Skills" },
  { id: 4, label: "Position" },
  { id: 5, label: "World" },
  { id: 6, label: "Review" },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NewGameScreen() {
  const { setScreen, startNewGame } = useGameStore();

  // Wizard navigation
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<"forward" | "back">("forward");

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

  const canStart =
    firstName.trim() !== "" &&
    lastName.trim() !== "" &&
    (startingPosition === "freelance" || startingClubId !== "");

  const handleStart = () => {
    if (!canStart) return;

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

  // ---------------------------------------------------------------------------
  // Wizard navigation helpers
  // ---------------------------------------------------------------------------

  function canAdvance(s: number): boolean {
    switch (s) {
      case 1: return firstName.trim() !== "" && lastName.trim() !== "";
      case 2: return true;
      case 3: return true;
      case 4: return startingPosition === "freelance" || startingClubId !== "";
      case 5: return true;
      case 6: return canStart;
      default: return false;
    }
  }

  function goNext() {
    if (!canAdvance(step)) return;
    setDirection("forward");
    setStep((s) => Math.min(s + 1, 6));
  }

  function goBack() {
    setDirection("back");
    setStep((s) => Math.max(s - 1, 1));
  }

  function goToStep(target: number) {
    if (target < 1 || target > 6) return;
    setDirection(target > step ? "forward" : "back");
    setStep(target);
  }

  // ---------------------------------------------------------------------------
  // Skill helpers (used in steps 3 & 6)
  // ---------------------------------------------------------------------------

  const SKILL_DESCRIPTIONS: Record<ScoutSkill, string> = {
    technicalEye: "Reading technical attributes",
    physicalAssessment: "Evaluating physical traits",
    psychologicalRead: "Assessing mental and hidden attributes",
    tacticalUnderstanding: "Analysing tactical attributes",
    dataLiteracy: "Interpreting statistics",
    playerJudgment: "Gauging overall current ability",
    potentialAssessment: "Projecting a player's ceiling",
  };

  const base = BASE_SKILLS[specialization];
  const mins = SKILL_MINIMUMS[specialization];
  const totalUsed = Object.values(skillAllocations).reduce(
    (s, v) => s + (v ?? 0),
    0,
  );
  const remaining = BONUS_POINTS - totalUsed;
  const skills = Object.keys(base) as ScoutSkill[];

  function formatSkillName(skill: string): string {
    return skill.replace(/([A-Z])/g, " $1").trim().replace(/^\w/, (c) => c.toUpperCase());
  }

  // ---------------------------------------------------------------------------
  // Review helpers
  // ---------------------------------------------------------------------------

  const specInfo = SPECIALIZATIONS.find((s) => s.id === specialization)!;
  const startingClubName =
    startingClubId
      ? Object.values(TOP_LEAGUE_CLUBS).flat().find((c) => c.id === startingClubId)?.name ?? startingClubId
      : null;

  const worldCountryNames = selectedCountries
    .map((k) => COUNTRY_OPTIONS.find((c) => c.key === k)?.name ?? k)
    .join(", ");

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col">
      {/* Top bar */}
      <div className="px-8 pt-6">
        <div className="mx-auto max-w-4xl">
          <button
            onClick={() => setScreen("mainMenu")}
            className="text-sm text-zinc-400 hover:text-white transition cursor-pointer"
          >
            &larr; Back to Menu
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-8 pt-6 pb-2">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-between">
            {STEPS.map((s, i) => {
              const isCompleted = s.id < step;
              const isCurrent = s.id === step;
              const isFuture = s.id > step;

              return (
                <div key={s.id} className="flex items-center flex-1 last:flex-none">
                  {/* Dot */}
                  <button
                    onClick={() => isCompleted && goToStep(s.id)}
                    disabled={isFuture}
                    className={`
                      relative flex items-center justify-center rounded-full transition-all shrink-0
                      ${isCurrent ? "w-10 h-10 bg-emerald-500 text-white" : ""}
                      ${isCompleted ? "w-8 h-8 border-2 border-emerald-500 text-emerald-400 cursor-pointer hover:bg-emerald-500/10" : ""}
                      ${isFuture ? "w-8 h-8 border-2 border-zinc-700 text-zinc-600 cursor-default" : ""}
                    `}
                  >
                    {isCompleted ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span className={`text-xs font-bold ${isCurrent ? "text-white" : ""}`}>{s.id}</span>
                    )}
                  </button>

                  {/* Connecting line */}
                  {i < STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-2 ${s.id < step ? "bg-emerald-500" : "bg-zinc-800"}`} />
                  )}
                </div>
              );
            })}
          </div>
          {/* Step labels */}
          <div className="hidden sm:flex items-center justify-between mt-2">
            {STEPS.map((s, i) => (
              <div key={s.id} className={`text-xs text-center flex-1 last:flex-none ${s.id === step ? "text-emerald-400 font-medium" : "text-zinc-600"}`}>
                {i < STEPS.length - 1 ? (
                  <span className="inline-block" style={{ width: "calc(100% - 1rem)" }}>{s.label}</span>
                ) : (
                  <span className="inline-block w-8 text-center">{s.label}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 px-8 py-6 overflow-y-auto">
        <div className="mx-auto max-w-4xl">
          <div
            key={step}
            className={direction === "forward" ? "animate-[slideInRight_300ms_ease-out]" : "animate-[slideInLeft_300ms_ease-out]"}
          >
            {step === 1 && (
              <>
                {/* Welcome banner */}
                <Card className="mb-6 border-emerald-800/40 bg-emerald-950/30">
                  <CardContent className="pt-6">
                    <div className="flex gap-4 items-start">
                      <div
                        className="mt-0.5 flex-shrink-0 w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center"
                        aria-hidden="true"
                      >
                        <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                        </svg>
                      </div>
                      <div>
                        <h2 className="font-semibold text-emerald-300 mb-1">Your scouting career starts here</h2>
                        <p className="text-sm text-zinc-300 leading-relaxed">
                          You are a football scout building your career from the ground up. Scout matches,
                          observe players, write reports, and build your reputation — until the biggest
                          clubs come calling.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Identity form */}
                <Card>
                  <CardHeader>
                    <CardTitle>Your Identity</CardTitle>
                    <CardDescription>Who are you in the scouting world?</CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div>
                      <label htmlFor="scout-first-name" className="mb-1 block text-sm text-zinc-400">First Name</label>
                      <input
                        id="scout-first-name"
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="w-full rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
                        placeholder="Alex"
                        autoComplete="given-name"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label htmlFor="scout-last-name" className="mb-1 block text-sm text-zinc-400">Last Name</label>
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
                      <label htmlFor="scout-age" className="mb-1 block text-sm text-zinc-400">Age</label>
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
                      <label htmlFor="scout-nationality" className="mb-1 block text-sm text-zinc-400">Nationality</label>
                      <select
                        id="scout-nationality"
                        value={nationality}
                        onChange={(e) => setNationality(e.target.value)}
                        className="w-full rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
                      >
                        {NATIONALITY_OPTIONS.map((nat) => (
                          <option key={nat} value={nat}>{nat}</option>
                        ))}
                      </select>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            {step === 2 && (
              <Card>
                <CardHeader>
                  <CardTitle>Choose Your Path</CardTitle>
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
                            {spec.exclusiveActivities.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-zinc-300 mb-1.5">
                                  Exclusive activities
                                  {spec.exclusiveActivities.length > 5 && (
                                    <span className="ml-1.5 font-normal text-zinc-500">— some unlock with progression</span>
                                  )}
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {spec.exclusiveActivities.map((a) => (
                                    <span key={a} className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300">{a}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {spec.systemBonuses && (
                              <div>
                                <p className="text-xs font-semibold text-zinc-300 mb-1.5">System bonuses</p>
                                <ul className="space-y-1">
                                  {spec.systemBonuses.map((b) => (
                                    <li key={b} className="flex items-start gap-1.5 text-xs text-zinc-400">
                                      <span className="mt-1 w-1 h-1 rounded-full bg-amber-500 shrink-0" aria-hidden="true" />
                                      {b}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            <div className="rounded bg-emerald-950/40 border border-emerald-900/30 px-2.5 py-1.5">
                              <p className="text-[10px] text-emerald-400">
                                <span className="font-semibold">Key strength:</span>{" "}
                                <span className="text-emerald-300">{spec.keyStrength}</span>
                              </p>
                            </div>
                          </div>
                        )}

                        {!isSelected && (
                          <div className="flex flex-wrap gap-1.5">
                            {spec.exclusiveActivities.length > 0 ? (
                              <>
                                {spec.exclusiveActivities.slice(0, 3).map((a) => (
                                  <span key={a} className="rounded-full bg-[var(--secondary)] px-2 py-0.5 text-xs text-zinc-300">{a}</span>
                                ))}
                                {spec.exclusiveActivities.length > 3 && (
                                  <span className="rounded-full bg-[var(--secondary)] px-2 py-0.5 text-xs text-zinc-500">
                                    +{spec.exclusiveActivities.length - 3} more
                                  </span>
                                )}
                              </>
                            ) : spec.systemBonuses ? (
                              <>
                                {spec.systemBonuses.slice(0, 2).map((b) => (
                                  <span key={b} className="rounded-full bg-[var(--secondary)] px-2 py-0.5 text-xs text-zinc-300">{b}</span>
                                ))}
                                <span className="rounded-full bg-[var(--secondary)] px-2 py-0.5 text-xs text-zinc-500">
                                  +{spec.systemBonuses.length - 2} more
                                </span>
                              </>
                            ) : null}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {step === 3 && (
              <Card>
                <CardHeader>
                  <CardTitle>Customize Your Skills</CardTitle>
                  <CardDescription>
                    Allocate {BONUS_POINTS} bonus points across your scouting skills.
                    <span className="ml-2 inline-flex items-center gap-1.5 text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" aria-hidden="true" />
                      {specInfo.name}
                    </span>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-zinc-500">Remaining Points</span>
                      <span className={`text-sm font-bold ${remaining > 0 ? "text-amber-400" : "text-emerald-400"}`}>
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
                              <span className="text-sm text-zinc-300">{formatSkillName(skill)}</span>
                              <span className="ml-2 text-[10px] text-zinc-500">{SKILL_DESCRIPTIONS[skill]}</span>
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
                              <span className="w-8 text-center text-sm font-mono font-bold text-white">{current}</span>
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
                </CardContent>
              </Card>
            )}

            {step === 4 && (
              <Card>
                <CardHeader>
                  <CardTitle>Starting Position</CardTitle>
                  <CardDescription>How do you want to begin your career?</CardDescription>
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
                        <span className="rounded-full bg-[var(--secondary)] px-2 py-0.5 text-xs text-zinc-300">No salary</span>
                        <span className="rounded-full bg-[var(--secondary)] px-2 py-0.5 text-xs text-zinc-300">Report fees</span>
                        <span className="rounded-full bg-[var(--secondary)] px-2 py-0.5 text-xs text-zinc-300">Full freedom</span>
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
                        <span className="rounded-full bg-[var(--secondary)] px-2 py-0.5 text-xs text-zinc-300">£800/week salary</span>
                        <span className="rounded-full bg-[var(--secondary)] px-2 py-0.5 text-xs text-zinc-300">Club directives</span>
                        <span className="rounded-full bg-[var(--secondary)] px-2 py-0.5 text-xs text-zinc-300">Starter trust</span>
                      </div>
                    </button>
                  </div>

                  {/* Club selector */}
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
                                <option key={club.id} value={club.id}>{club.name}</option>
                              ))}
                            </optgroup>
                          );
                        })}
                      </select>
                      {startingClubId === "" && (
                        <p className="mt-1 text-xs text-amber-400" role="alert">
                          You must select a club to begin as a Club Scout.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Starting Region — only for Regional specialization */}
                  {specialization === "regional" && (
                    <div className="border-t border-zinc-800 pt-4">
                      <p className="text-sm font-medium text-zinc-300 mb-2">Starting Region</p>
                      <p className="text-xs text-zinc-500 mb-3">Choose which country your Regional Expert begins their career in.</p>
                      <div
                        className="flex flex-wrap gap-2"
                        role="radiogroup"
                        aria-label="Starting region"
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
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {step === 5 && (
              <Card>
                <CardHeader>
                  <CardTitle>Build Your World</CardTitle>
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
                            {isLocked && <span className="text-xs text-zinc-500">Home</span>}
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

                  {/* Secondary regions */}
                  <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--muted)]/50 p-4">
                    <h4 className="text-sm font-semibold text-zinc-300 mb-2">
                      Global Talent Pools
                      <span className="ml-2 text-xs font-normal text-zinc-500">
                        (always active — {SECONDARY_OPTIONS.reduce((sum, c) => sum + c.clubCount, 0)} clubs)
                      </span>
                    </h4>
                    <p className="text-xs text-zinc-500 mb-3">
                      Players from these regions are discoverable, signable, and developable — but leagues do not simulate fixtures.
                    </p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                      {SECONDARY_REGIONS.map((region) => (
                        <div key={region.name}>
                          <p className="text-xs font-medium text-zinc-400">{region.name}</p>
                          <p className="text-xs text-zinc-500">
                            {region.countries.map((c) => `${c.name} (${c.clubCount})`).join(", ")}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* World seed + difficulty */}
                  <div className="mt-6 grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="world-seed" className="mb-1 block text-sm text-zinc-400">World Seed</label>
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
                  </div>
                </CardContent>
              </Card>
            )}

            {step === 6 && (
              <>
                <h2 className="text-2xl font-bold mb-6">Review &amp; Begin</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {/* Scout identity */}
                  <Card>
                    <CardContent className="pt-5">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-zinc-300">Scout</h3>
                        <button onClick={() => goToStep(1)} className="text-xs text-emerald-400 hover:text-emerald-300 cursor-pointer">Edit</button>
                      </div>
                      <p className="text-white font-medium">{firstName} {lastName}</p>
                      <p className="text-sm text-zinc-400">Age {age}, {nationality}</p>
                    </CardContent>
                  </Card>

                  {/* Specialization */}
                  <Card>
                    <CardContent className="pt-5">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-zinc-300">Specialization</h3>
                        <button onClick={() => goToStep(2)} className="text-xs text-emerald-400 hover:text-emerald-300 cursor-pointer">Edit</button>
                      </div>
                      <p className="text-white font-medium">{specInfo.name}</p>
                      <p className="text-sm text-zinc-400">{specInfo.tagline}</p>
                    </CardContent>
                  </Card>

                  {/* Skills */}
                  <Card>
                    <CardContent className="pt-5">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-zinc-300">Skills</h3>
                        <button onClick={() => goToStep(3)} className="text-xs text-emerald-400 hover:text-emerald-300 cursor-pointer">Edit</button>
                      </div>
                      <div className="space-y-1.5">
                        {skills.map((skill) => {
                          const current = base[skill] + (skillAllocations[skill] ?? 0);
                          return (
                            <div key={skill} className="flex items-center gap-2">
                              <span className="text-xs text-zinc-400 w-32 truncate">{formatSkillName(skill)}</span>
                              <div className="flex-1 h-1 rounded-full bg-zinc-800 overflow-hidden">
                                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(current / 20) * 100}%` }} />
                              </div>
                              <span className="text-xs font-mono text-zinc-300 w-6 text-right">{current}</span>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Position */}
                  <Card>
                    <CardContent className="pt-5">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-zinc-300">Position</h3>
                        <button onClick={() => goToStep(4)} className="text-xs text-emerald-400 hover:text-emerald-300 cursor-pointer">Edit</button>
                      </div>
                      <p className="text-white font-medium">
                        {startingPosition === "freelance" ? "Freelance Scout" : `Club Scout`}
                      </p>
                      {startingClubName && (
                        <p className="text-sm text-zinc-400">{startingClubName}</p>
                      )}
                      {specialization === "regional" && (
                        <p className="text-sm text-zinc-400">
                          Region: {COUNTRY_OPTIONS.find((c) => c.key === startingCountry)?.name ?? startingCountry}
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  {/* World */}
                  <Card>
                    <CardContent className="pt-5">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-zinc-300">World</h3>
                        <button onClick={() => goToStep(5)} className="text-xs text-emerald-400 hover:text-emerald-300 cursor-pointer">Edit</button>
                      </div>
                      <p className="text-white font-medium">{worldCountryNames}</p>
                      <p className="text-sm text-zinc-400">{totalClubs} clubs</p>
                    </CardContent>
                  </Card>

                  {/* Settings */}
                  <Card>
                    <CardContent className="pt-5">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-zinc-300">Settings</h3>
                        <button onClick={() => goToStep(5)} className="text-xs text-emerald-400 hover:text-emerald-300 cursor-pointer">Edit</button>
                      </div>
                      <p className="text-white font-medium capitalize">{difficulty} difficulty</p>
                      <p className="text-sm text-zinc-400">Seed: {seed}</p>
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Bottom navigation */}
      <div className="border-t border-zinc-800 bg-[var(--background)] px-8 py-4">
        <div className="mx-auto max-w-4xl flex items-center justify-between">
          {step > 1 ? (
            <Button variant="outline" onClick={goBack} className="cursor-pointer">
              Back
            </Button>
          ) : (
            <div />
          )}

          {step < 6 ? (
            <Button onClick={goNext} disabled={!canAdvance(step)} className="cursor-pointer">
              Continue
            </Button>
          ) : (
            <Button
              size="lg"
              onClick={handleStart}
              disabled={!canStart}
              className="bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
            >
              Begin Career
            </Button>
          )}
        </div>
      </div>

      {/* Animation keyframes */}
      <style>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(30px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideInLeft {
          from { opacity: 0; transform: translateX(-30px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
