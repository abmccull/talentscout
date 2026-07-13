"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useGameStore } from "@/stores/gameStore";
import { useTutorialStore } from "@/stores/tutorialStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import {
  OpeningModeSelector,
  type VeteranOpeningMode,
} from "@/components/game/new-game/OpeningModeSelector";
import type { Specialization, NewGameConfig, ScoutSkill, DifficultyLevel } from "@/engine/core/types";
import { DIFFICULTY_DESCRIPTIONS } from "@/engine/core/difficulty";
import { getCountryOptions, getSecondaryCountryOptions } from "@/data/index";
import {
  IS_DEMO,
  IS_YOUTH_EARLY_ACCESS,
  YOUTH_EARLY_ACCESS_ALLOWED_SPECS,
} from "@/lib/demo";
import {
  BASE_SKILLS,
  SKILL_MINIMUMS,
  ALLOCATION_MAX,
  BONUS_POINTS,
  validateSkillAllocations,
} from "@/engine/scout/creation";
import { ScreenBackground } from "@/components/ui/screen-background";
import {
  readLegacyProfile,
  getAvailablePerks,
  hasCompletedCareer,
  MAX_ACTIVE_PERKS,
} from "@/engine/career/legacy";
import {
  DEFAULT_SCOUT_DOCTRINE_ID,
  DEFAULT_SCOUT_FLAW_ID,
  DEFAULT_SCOUT_ORIGIN_ID,
  SCOUT_DOCTRINES,
  SCOUT_FLAWS,
  SCOUT_ORIGINS,
  type ScoutDoctrineId,
  type ScoutFlawId,
  type ScoutOriginId,
} from "@/engine/run";

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

/** Income focus descriptions per spec, shown during specialization selection. */
const SPEC_INCOME_INFO: Record<Specialization, { focus: string; tier3: string }> = {
  youth: {
    focus: "Placement Fees +50% | Report Sales -25%",
    tier3: "Academy Advisory partnerships (500/mo each)",
  },
  firstTeam: {
    focus: "Transfer Bonuses +50% | Placement Fees -25%",
    tier3: "Transfer Window Bonus (2% of transfer fees)",
  },
  regional: {
    focus: "Report Sales +50% | Transfer Bonuses -25%",
    tier3: "Regional Expertise Fee (300/mo)",
  },
  data: {
    focus: "Consulting Fees +50% | Placement Fees -25%",
    tier3: "Predictive Reports (2x price + consulting)",
  },
};

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

const FULL_GAME_STEPS = [
  { id: 1, label: "Identity" },
  { id: 2, label: "Specialization" },
  { id: 3, label: "Skills" },
  { id: 4, label: "Position" },
  { id: 5, label: "World" },
  { id: 6, label: "Review" },
] as const;

const YOUTH_EA_STEPS = [
  { id: 1, label: "Identity" },
  { id: 3, label: "Skills" },
  { id: 5, label: "World" },
  { id: 6, label: "Review" },
] as const;

type YouthSkillPresetId = "potential" | "technical" | "character" | "balanced" | "custom";

const YOUTH_SKILL_PRESETS: Array<{
  id: Exclude<YouthSkillPresetId, "custom">;
  name: string;
  description: string;
  firstCaseRead: string;
  originId: ScoutOriginId;
  flawId: ScoutFlawId;
  doctrineId: ScoutDoctrineId;
  allocations: Partial<Record<ScoutSkill, number>>;
}> = [
  {
    id: "potential",
    name: "Projection Specialist",
    description: "Best at estimating ceilings and revising long-term potential calls.",
    firstCaseRead: "You will notice the player's long-term runway before the polish is obvious.",
    originId: "academy-apprentice",
    flawId: "stubborn-convictions",
    doctrineId: "evidence-first",
    allocations: { potentialAssessment: 5, psychologicalRead: 2, playerJudgment: 1 },
  },
  {
    id: "technical",
    name: "Technical Spotter",
    description: "Finds unusual technique early, with less emphasis on physical evidence.",
    firstCaseRead: "You will catch the disguised touch and passing detail others at the rail miss.",
    originId: "former-player",
    flawId: "unknown-quantity",
    doctrineId: "move-before-market",
    allocations: { technicalEye: 5, playerJudgment: 2, potentialAssessment: 1 },
  },
  {
    id: "character",
    name: "Character Reader",
    description: "Prioritizes mentality, temperament, and responses to pressure.",
    firstCaseRead: "You will read how the player responds when the match turns against him.",
    originId: "grassroots-organizer",
    flawId: "fragile-network",
    doctrineId: "relationships-first",
    allocations: { psychologicalRead: 6, potentialAssessment: 1, playerJudgment: 1 },
  },
  {
    id: "balanced",
    name: "Field Investigator",
    description: "A flexible evidence-gatherer with no dominant blind spot.",
    firstCaseRead: "You will build the broadest first hypothesis, but certainty will take more work.",
    originId: "video-analyst",
    flawId: "travel-worn",
    doctrineId: "contrarian-eye",
    allocations: {
      technicalEye: 2,
      physicalAssessment: 1,
      psychologicalRead: 1,
      tacticalUnderstanding: 1,
      dataLiteracy: 1,
      playerJudgment: 1,
      potentialAssessment: 1,
    },
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NewGameScreen() {
  const setScreen = useGameStore((state) => state.setScreen);
  const startNewGame = useGameStore((state) => state.startNewGame);
  const startNewGamePlus = useGameStore((state) => state.startNewGamePlus);
  const guidedSessionCompleted = useTutorialStore((state) => state.guidedSessionCompleted);
  const tutorialsDismissed = useTutorialStore((state) => state.dismissed);
  const isExperiencedYouthPlayer = IS_YOUTH_EARLY_ACCESS
    && (guidedSessionCompleted || tutorialsDismissed);

  // Legacy profile (read once on mount)
  const legacyProfile = useMemo(() => readLegacyProfile(), []);
  const isNewGamePlusAvailable = hasCompletedCareer(legacyProfile);
  const availablePerks = useMemo(() => getAvailablePerks(legacyProfile), [legacyProfile]);

  // New Game+ state
  const [isNewGamePlusMode, setIsNewGamePlusMode] = useState(false);
  const [selectedPerkIds, setSelectedPerkIds] = useState<string[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const startInFlightRef = useRef(false);
  const [openingMode, setOpeningMode] = useState<"auto" | VeteranOpeningMode>(() =>
    isExperiencedYouthPlayer ? "dynamic" : "auto",
  );
  const effectiveOpeningMode: "auto" | VeteranOpeningMode = isExperiencedYouthPlayer
    ? openingMode === "auto" ? "dynamic" : openingMode
    : "auto";

  const togglePerk = (perkId: string) => {
    setSelectedPerkIds((prev) => {
      if (prev.includes(perkId)) {
        return prev.filter((id) => id !== perkId);
      }
      if (prev.length >= MAX_ACTIVE_PERKS) return prev;
      return [...prev, perkId];
    });
  };

  // Wizard navigation
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<"forward" | "back">("forward");

  // Identity
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [age, setAge] = useState(28);
  const [nationality, setNationality] = useState<string>("English");
  const [avatarId, setAvatarId] = useState(1);

  // Specialization
  const [specialization, setSpecializationRaw] = useState<Specialization>("youth");
  const setSpecialization = (spec: Specialization) => {
    const nextSpecialization =
      IS_YOUTH_EARLY_ACCESS && !YOUTH_EARLY_ACCESS_ALLOWED_SPECS.includes(spec)
        ? "youth"
        : spec;
    setSpecializationRaw(nextSpecialization);
    setSkillAllocations({});
    setSelectedSkillPreset("custom");
  };

  // Skill allocations
  const [skillAllocations, setSkillAllocations] = useState<Partial<Record<ScoutSkill, number>>>({});
  const [selectedSkillPreset, setSelectedSkillPreset] = useState<YouthSkillPresetId>("custom");
  const [originId, setOriginId] = useState<ScoutOriginId>(DEFAULT_SCOUT_ORIGIN_ID);
  const [flawId, setFlawId] = useState<ScoutFlawId>(DEFAULT_SCOUT_FLAW_ID);
  const [doctrineId, setDoctrineId] = useState<ScoutDoctrineId>(DEFAULT_SCOUT_DOCTRINE_ID);

  const applyYouthPersona = (preset: (typeof YOUTH_SKILL_PRESETS)[number]) => {
    setSelectedSkillPreset(preset.id);
    setSkillAllocations({ ...preset.allocations });
    setOriginId(preset.originId);
    setFlawId(preset.flawId);
    setDoctrineId(preset.doctrineId);
  };

  // Starting position
  const [startingPosition, setStartingPosition] = useState<"freelance" | "club">("freelance");
  const [startingClubId, setStartingClubId] = useState<string>("");

  useEffect(() => {
    if (IS_YOUTH_EARLY_ACCESS) {
      setStartingPosition("freelance");
      setStartingClubId("");
    }
  }, []);

  // Football world
  const [selectedCountries, setSelectedCountries] = useState<string[]>(["england"]);
  const [startingCountry, setStartingCountry] = useState<string>("england");

  // World settings
  const [seed, setSeed] = useState(() => Math.random().toString(36).substring(2, 10));
  const [difficulty, setDifficulty] = useState<DifficultyLevel>("normal");

  const availableSpecializations = IS_YOUTH_EARLY_ACCESS
    ? SPECIALIZATIONS.filter((spec) => YOUTH_EARLY_ACCESS_ALLOWED_SPECS.includes(spec.id))
    : SPECIALIZATIONS;
  const comingSoonSpecializations = IS_YOUTH_EARLY_ACCESS
    ? SPECIALIZATIONS.filter((spec) => !YOUTH_EARLY_ACCESS_ALLOWED_SPECS.includes(spec.id))
    : [];
  const effectiveSpecialization: Specialization = IS_YOUTH_EARLY_ACCESS
    ? YOUTH_EARLY_ACCESS_ALLOWED_SPECS[0]
    : specialization;
  const effectiveStartingPosition: "freelance" | "club" = IS_YOUTH_EARLY_ACCESS
    ? "freelance"
    : startingPosition;
  const steps = IS_YOUTH_EARLY_ACCESS ? YOUTH_EA_STEPS : FULL_GAME_STEPS;
  const currentStepIndex = Math.max(
    0,
    steps.findIndex((candidate) => candidate.id === step),
  );
  const lastStepId = steps[steps.length - 1]?.id ?? 6;

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

  const SKILL_DESCRIPTIONS: Record<ScoutSkill, string> = {
    technicalEye: "Reading technical attributes",
    physicalAssessment: "Evaluating physical traits",
    psychologicalRead: "Assessing mental and hidden attributes",
    tacticalUnderstanding: "Analysing tactical attributes",
    dataLiteracy: "Interpreting statistics",
    playerJudgment: "Gauging overall current ability",
    potentialAssessment: "Projecting a player's ceiling",
  };

  const base = BASE_SKILLS[effectiveSpecialization];
  const mins = SKILL_MINIMUMS[effectiveSpecialization];
  const skills = Object.keys(base) as ScoutSkill[];
  const totalUsed = skills.reduce((sum, skill) => sum + (skillAllocations[skill] ?? 0), 0);
  const remaining = BONUS_POINTS - totalUsed;
  const skillAllocationValidation = validateSkillAllocations(
    effectiveSpecialization,
    skillAllocations,
  );
  const skillAllocationMessage =
    totalUsed < BONUS_POINTS
      ? `Assign all ${BONUS_POINTS} bonus skill points to continue. ${remaining} point${remaining === 1 ? "" : "s"} remaining.`
      : totalUsed > BONUS_POINTS
        ? `Remove ${totalUsed - BONUS_POINTS} bonus skill point${totalUsed - BONUS_POINTS === 1 ? "" : "s"} so you are using exactly ${BONUS_POINTS}.`
        : skillAllocationValidation.reason
          ? `Fix your skill allocation before continuing. ${skillAllocationValidation.reason}.`
          : `All ${BONUS_POINTS} bonus skill points assigned.`;

  const startRequirements: string[] = [];
  if (firstName.trim() === "") startRequirements.push("Enter a first name.");
  if (lastName.trim() === "") startRequirements.push("Enter a last name.");
  if (!skillAllocationValidation.valid) startRequirements.push(skillAllocationMessage);
  if (!SCOUT_ORIGINS.some((definition) => definition.id === originId)) {
    startRequirements.push("Choose a valid scout origin.");
  }
  if (!SCOUT_FLAWS.some((definition) => definition.id === flawId)) {
    startRequirements.push("Choose a valid scout flaw.");
  }
  if (!SCOUT_DOCTRINES.some((definition) => definition.id === doctrineId)) {
    startRequirements.push("Choose a valid scouting doctrine.");
  }
  if (IS_YOUTH_EARLY_ACCESS && startingClubId !== "") {
    startRequirements.push("Club starts are disabled in Youth Early Access.");
  }
  if (effectiveStartingPosition === "club" && startingClubId === "") {
    startRequirements.push("Choose a starting club or switch back to Freelance Scout.");
  }

  const canStart = startRequirements.length === 0;
  const canQuickStart = IS_YOUTH_EARLY_ACCESS
    && firstName.trim() !== ""
    && lastName.trim() !== ""
    && selectedSkillPreset !== "custom"
    && canStart;
  const startRequirementMessage = canStart
    ? "All requirements met. Ready to begin."
    : `Before you can begin: ${startRequirements.join(" ")}`;

  const handleStart = async () => {
    if (!canStart || startInFlightRef.current) return;

    const config: NewGameConfig = {
      scoutFirstName: firstName.trim(),
      scoutLastName: lastName.trim(),
      scoutAge: age,
      specialization: effectiveSpecialization,
      difficulty,
      worldSeed: seed,
      selectedCountries,
      nationality,
      avatarId,
      skillAllocations,
      originId,
      flawId,
      doctrineIds: [doctrineId],
      openingMode: effectiveOpeningMode,
      ...(effectiveSpecialization === "regional" && { startingCountry }),
      ...(effectiveStartingPosition === "club" && startingClubId && { startingClubId }),
    };

    startInFlightRef.current = true;
    setIsStarting(true);
    setStartError(null);
    try {
      if (isNewGamePlusMode && selectedPerkIds.length > 0) {
        await startNewGamePlus(config, selectedPerkIds);
      } else {
        await startNewGame(config);
      }
    } catch (error) {
      console.error("[NewGame] Career creation failed:", error);
      setStartError(
        error instanceof Error
          ? error.message
          : "Career creation failed. Your existing saves are unchanged.",
      );
    } finally {
      startInFlightRef.current = false;
      setIsStarting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Wizard navigation helpers
  // ---------------------------------------------------------------------------

  function canAdvance(s: number): boolean {
    switch (s) {
      case 1: return firstName.trim() !== "" && lastName.trim() !== "";
      case 2: return true;
      case 3: return skillAllocationValidation.valid
        && SCOUT_ORIGINS.some((definition) => definition.id === originId)
        && SCOUT_FLAWS.some((definition) => definition.id === flawId)
        && SCOUT_DOCTRINES.some((definition) => definition.id === doctrineId);
      case 4: return effectiveStartingPosition === "freelance" || startingClubId !== "";
      case 5: return true;
      case 6: return canStart;
      default: return false;
    }
  }

  function goNext() {
    if (!canAdvance(step)) return;
    setDirection("forward");
    const nextStep = steps[currentStepIndex + 1];
    if (nextStep) setStep(nextStep.id);
  }

  function goBack() {
    setDirection("back");
    const previousStep = steps[currentStepIndex - 1];
    if (previousStep) setStep(previousStep.id);
  }

  function goToStep(target: number) {
    if (!steps.some((candidate) => candidate.id === target)) return;
    setDirection(target > step ? "forward" : "back");
    setStep(target);
  }

  function formatSkillName(skill: string): string {
    return skill.replace(/([A-Z])/g, " $1").trim().replace(/^\w/, (c) => c.toUpperCase());
  }

  // ---------------------------------------------------------------------------
  // Review helpers
  // ---------------------------------------------------------------------------

  const specInfo = SPECIALIZATIONS.find((s) => s.id === effectiveSpecialization)!;
  const selectedOrigin = SCOUT_ORIGINS.find((definition) => definition.id === originId)!;
  const selectedFlaw = SCOUT_FLAWS.find((definition) => definition.id === flawId)!;
  const selectedDoctrine = SCOUT_DOCTRINES.find((definition) => definition.id === doctrineId)!;
  const selectedYouthPreset = YOUTH_SKILL_PRESETS.find(
    (preset) => preset.id === selectedSkillPreset,
  );
  const startingClubName =
    startingClubId
      ? Object.values(TOP_LEAGUE_CLUBS).flat().find((c) => c.id === startingClubId)?.name ?? startingClubId
      : null;
  const roleSummary =
    effectiveStartingPosition === "freelance"
      ? "Freelance Youth Scout"
      : "Club Scout";

  const worldCountryNames = selectedCountries
    .map((k) => COUNTRY_OPTIONS.find((c) => c.key === k)?.name ?? k)
    .join(", ");

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="relative h-screen bg-[var(--background)] flex flex-col overflow-hidden">
      <ScreenBackground src="/images/backgrounds/menu-bg-2.png" opacity={0.8} />
      <main
        aria-labelledby="new-game-heading"
        className="relative z-10 flex min-h-0 flex-1 flex-col"
      >
      {/* Top bar */}
      <div className="px-8 pt-6">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <button
            onClick={() => setScreen("mainMenu")}
            className="flex min-h-11 items-center rounded-md px-2 text-sm text-zinc-300 transition hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
          >
            &larr; Back to Menu
          </button>
          <h1 id="new-game-heading" className="text-lg font-semibold tracking-tight text-white sm:text-xl">
            Create Your Scout
          </h1>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-8 pt-6 pb-2">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-between">
            {steps.map((s, i) => {
              const isCompleted = i < currentStepIndex;
              const isCurrent = i === currentStepIndex;
              const isFuture = i > currentStepIndex;

              return (
                <div key={s.id} className="flex items-center flex-1 last:flex-none">
                  {/* Dot */}
                  <button
                    onClick={() => isCompleted && goToStep(s.id)}
                    disabled={!isCompleted}
                    aria-current={isCurrent ? "step" : undefined}
                    aria-label={`${s.label}${
                      isCompleted ? " — completed" : isCurrent ? " — current step" : " — upcoming"
                    }`}
                    className={`
                      relative flex items-center justify-center rounded-full transition-all shrink-0
                      h-11 w-11
                      ${isCurrent ? "bg-emerald-700 text-white" : ""}
                      ${isCompleted ? "border-2 border-emerald-500 text-emerald-300 cursor-pointer hover:bg-emerald-500/10" : ""}
                      ${isFuture ? "border-2 border-zinc-600 text-zinc-400 cursor-default" : ""}
                    `}
                  >
                    {isCompleted ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span className={`text-xs font-bold ${isCurrent ? "text-white" : ""}`}>{i + 1}</span>
                    )}
                  </button>

                  {/* Connecting line */}
                  {i < steps.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-2 ${i < currentStepIndex ? "bg-emerald-500" : "bg-zinc-800"}`} />
                  )}
                </div>
              );
            })}
          </div>
          {/* Step labels */}
          <div className="hidden sm:flex items-center justify-between mt-2">
            {steps.map((s, i) => (
              <div key={s.id} className={`text-xs text-center flex-1 last:flex-none ${i === currentStepIndex ? "text-emerald-300 font-medium" : "text-zinc-400"}`}>
                {i < steps.length - 1 ? (
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
      <div className="min-h-0 flex-1 px-8 py-6 overflow-y-auto">
        <div className="mx-auto max-w-4xl">
          <div
            key={step}
            className={direction === "forward" ? "animate-[slideInRight_300ms_ease-out]" : "animate-[slideInLeft_300ms_ease-out]"}
          >
            {step === 1 && (
              <>
                {/* New Game+ banner (only shown when legacy profile exists) */}
                {isNewGamePlusAvailable && (
                  <Card className={`mb-6 transition-all ${isNewGamePlusMode ? "border-amber-500/60 bg-amber-950/30" : "border-zinc-700/40 bg-zinc-900/30"}`}>
                    <CardContent className="pt-6">
                      <div className="flex gap-4 items-start">
                        <div
                          className={`mt-0.5 flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                            isNewGamePlusMode ? "bg-amber-500/20" : "bg-zinc-700/20"
                          }`}
                          aria-hidden="true"
                        >
                          <svg className={`w-5 h-5 ${isNewGamePlusMode ? "text-amber-400" : "text-zinc-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <h2 className={`font-semibold ${isNewGamePlusMode ? "text-amber-300" : "text-zinc-400"}`}>
                              New Game+ Available
                            </h2>
                            <button
                              onClick={() => setIsNewGamePlusMode(!isNewGamePlusMode)}
                              className={`px-3 py-1 rounded-full text-xs font-medium transition cursor-pointer ${
                                isNewGamePlusMode
                                  ? "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
                                  : "bg-zinc-700/30 text-zinc-400 hover:bg-zinc-700/50"
                              }`}
                            >
                              {isNewGamePlusMode ? "NG+ Active" : "Enable NG+"}
                            </button>
                          </div>
                          <p className="text-sm text-zinc-400 leading-relaxed">
                            {legacyProfile && legacyProfile.completedCareers.length > 0
                              ? `${legacyProfile.completedCareers.length} career${legacyProfile.completedCareers.length > 1 ? "s" : ""} completed. ${legacyProfile.legacyPerks.length} perk${legacyProfile.legacyPerks.length !== 1 ? "s" : ""} unlocked.`
                              : "Complete a career to unlock legacy perks."}
                          </p>
                        </div>
                      </div>

                      {/* Perk selection (only when NG+ mode is active) */}
                      {isNewGamePlusMode && (
                        <div className="mt-4 border-t border-amber-800/30 pt-4">
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-semibold text-amber-300/80">
                              Select up to {MAX_ACTIVE_PERKS} legacy perks
                            </p>
                            <p className="text-xs text-zinc-500">
                              {selectedPerkIds.length}/{MAX_ACTIVE_PERKS} selected
                            </p>
                          </div>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {availablePerks.map((perk) => {
                              const isSelected = selectedPerkIds.includes(perk.id);
                              const isFull = selectedPerkIds.length >= MAX_ACTIVE_PERKS && !isSelected;
                              return (
                                <button
                                  key={perk.id}
                                  onClick={() => perk.isUnlocked && !isFull && togglePerk(perk.id)}
                                  disabled={!perk.isUnlocked || (isFull && !isSelected)}
                                  className={`cursor-pointer rounded-lg border p-3 text-left transition ${
                                    !perk.isUnlocked
                                      ? "cursor-not-allowed border-zinc-800/50 opacity-40"
                                      : isSelected
                                        ? "border-amber-500/60 bg-amber-500/10"
                                        : isFull
                                          ? "cursor-not-allowed border-zinc-700/40 opacity-50"
                                          : "border-zinc-700/40 hover:border-zinc-600"
                                  }`}
                                >
                                  <div className="flex items-start gap-2">
                                    <div className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
                                      isSelected ? "border-amber-500 bg-amber-500" : "border-zinc-600"
                                    }`}>
                                      {isSelected && (
                                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                      )}
                                    </div>
                                    <div>
                                      <p className={`text-sm font-medium ${perk.isUnlocked ? "text-zinc-200" : "text-zinc-500"}`}>
                                        {perk.name}
                                      </p>
                                      <p className="text-xs text-zinc-500 mt-0.5">
                                        {perk.isUnlocked ? perk.description : `Locked: ${perk.unlockedBy.replace(/_/g, " ")}`}
                                      </p>
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>

                          {/* Career history summary */}
                          {legacyProfile && legacyProfile.completedCareers.length > 0 && (
                            <div className="mt-3 rounded-lg border border-zinc-700/40 bg-zinc-900/50 p-3">
                              <p className="text-xs font-semibold text-zinc-400 mb-2">Career History</p>
                              <div className="space-y-1.5">
                                {legacyProfile.completedCareers.slice(0, 5).map((career, i) => (
                                  <div key={`career-${i}`} className="flex items-center justify-between text-xs">
                                    <span className="text-zinc-300">{career.scoutName}</span>
                                    <span className="text-zinc-500">
                                      Tier {career.finalTier} &middot; {career.seasonsPlayed}s &middot; {career.specialization} &middot; Score {career.legacyScoreTotal}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* The Youth EA quick start below is the orientation. */}
                {!IS_YOUTH_EARLY_ACCESS && <Card className="mb-6 border-emerald-800/40 bg-emerald-950/30">
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
                </Card>}

                {/* Identity form */}
                <Card>
                  <CardHeader>
                    <h2 className="font-semibold leading-none tracking-tight">Your Identity</h2>
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
                        className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
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
                        className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
                        placeholder="Morgan"
                        autoComplete="family-name"
                      />
                    </div>
                    <details className="group col-span-2 rounded-lg border border-zinc-700/70 bg-zinc-950/35 sm:col-span-4" open={!IS_YOUTH_EARLY_ACCESS}>
                      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 py-2 text-sm font-medium text-zinc-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400">
                        <span>{IS_YOUTH_EARLY_ACCESS ? "Customize age, nationality, and portrait" : "Scout details"}</span>
                        <span className="text-xs text-emerald-300 group-open:hidden">Optional</span>
                        <span className="hidden text-xs text-zinc-500 group-open:inline">Hide</span>
                      </summary>
                      <div className="grid gap-4 border-t border-zinc-800 p-4 sm:grid-cols-2">
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
                            className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
                          />
                        </div>
                        <div>
                          <label htmlFor="scout-nationality" className="mb-1 block text-sm text-zinc-400">Nationality</label>
                          <select
                            id="scout-nationality"
                            value={nationality}
                            onChange={(e) => setNationality(e.target.value)}
                            className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
                          >
                            {NATIONALITY_OPTIONS.map((nat) => (
                              <option key={nat} value={nat}>{nat}</option>
                            ))}
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <span className="mb-2 block text-sm text-zinc-400">Your Portrait</span>
                          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                            {[1, 2, 3, 4, 5, 6].map((id) => (
                              <button
                                key={id}
                                type="button"
                                onClick={() => setAvatarId(id)}
                                className={`overflow-hidden rounded-full border-2 transition-all ${
                                  avatarId === id
                                    ? "border-emerald-500 ring-2 ring-emerald-500/40"
                                    : "border-zinc-700 hover:border-zinc-500"
                                }`}
                                aria-label={`Choose portrait ${id}`}
                                aria-pressed={avatarId === id}
                              >
                                <Image
                                  src={`/images/avatars/scout-${id}.png`}
                                  alt=""
                                  width={64}
                                  height={64}
                                  unoptimized
                                  className="h-16 w-16 object-cover"
                                  draggable={false}
                                />
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </details>
                  </CardContent>
                </Card>

                {IS_YOUTH_EARLY_ACCESS && (
                  <Card className="mt-6 overflow-hidden border-emerald-500/40 bg-zinc-950/80 shadow-2xl shadow-emerald-950/30">
                    <div className="border-b border-emerald-500/20 bg-gradient-to-r from-emerald-950/90 via-zinc-950 to-zinc-950 px-6 py-5">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">
                            {isExperiencedYouthPlayer
                              ? "Returning scout · choose your opening"
                              : "Quick start · first decision in under five minutes"}
                          </p>
                          <h2 className="mt-2 text-xl font-semibold text-white">
                            {isExperiencedYouthPlayer
                              ? "No two scouting careers need to start alike."
                              : "A trusted contact has a name for you."}
                          </h2>
                          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-300">
                            {isExperiencedYouthPlayer
                              ? "Open on an unfamiliar lead, take command at the Desk, or replay the guided discovery case."
                              : "The school match has already started. Choose the instinct you trust, take the call, and make your first live scouting judgment before the wider market notices."}
                          </p>
                        </div>
                        <span className="w-fit rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-200">
                          {isExperiencedYouthPlayer
                            ? "Your career · your opening"
                            : "3 observation beats · 1 irreversible call"}
                        </span>
                      </div>
                    </div>
                    <CardContent className="space-y-4 pt-5">
                      {isExperiencedYouthPlayer && effectiveOpeningMode !== "auto" && (
                        <OpeningModeSelector value={effectiveOpeningMode} onChange={setOpeningMode} />
                      )}

                      <fieldset>
                        <legend className="text-sm font-semibold text-white">What kind of scout are you?</legend>
                        <p className="mt-1 text-xs text-zinc-400">
                          This sets your permanent career DNA and changes what you notice in the opening case.
                          You can use Advanced setup below if you want every control.
                        </p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          {YOUTH_SKILL_PRESETS.map((preset) => {
                            const isSelected = selectedSkillPreset === preset.id;
                            return (
                              <button
                                key={`quick-${preset.id}`}
                                type="button"
                                aria-pressed={isSelected}
                                onClick={() => applyYouthPersona(preset)}
                                className={`min-h-24 rounded-xl border p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 ${
                                  isSelected
                                    ? "border-emerald-400 bg-emerald-500/12 shadow-lg shadow-emerald-950/40"
                                    : "border-zinc-700 bg-zinc-900/70 hover:border-zinc-500 hover:bg-zinc-900"
                                }`}
                              >
                                <span className="flex items-center justify-between gap-3">
                                  <span className="font-semibold text-white">{preset.name}</span>
                                  <span
                                    aria-hidden="true"
                                    className={`h-3 w-3 rounded-full border ${isSelected ? "border-emerald-300 bg-emerald-400" : "border-zinc-500"}`}
                                  />
                                </span>
                                <span className="mt-1 block text-xs leading-relaxed text-zinc-300">{preset.description}</span>
                                <span className="mt-2 block border-l-2 border-amber-400/50 pl-2 text-xs leading-relaxed text-amber-100/90">
                                  First case: {preset.firstCaseRead}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </fieldset>

                      <div className="rounded-xl border border-zinc-700/70 bg-black/25 p-4">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-medium text-white">
                              {selectedYouthPreset
                                ? `${selectedYouthPreset.name}: ready to begin`
                                : "Choose a scouting instinct to begin"}
                            </p>
                            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                              {effectiveOpeningMode === "desk"
                                ? "You will begin at the Desk with your first week open for planning. No opening assignment will be created."
                                : "You will enter a generated case, gather uncertain evidence, flag the moment that changes your opinion, then decide who to tell. The game will remember it."}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handleStart}
                            disabled={!canQuickStart || isStarting}
                            aria-describedby="quick-start-requirements"
                            className="min-h-12 shrink-0 rounded-lg bg-emerald-500 px-6 py-3 text-sm font-bold text-zinc-950 shadow-lg shadow-emerald-950/40 transition hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            {isStarting
                              ? "Creating your football world…"
                              : effectiveOpeningMode === "dynamic"
                              ? "Follow a fresh lead"
                              : effectiveOpeningMode === "desk"
                                ? "Start at the Desk"
                                : effectiveOpeningMode === "tutorial"
                                  ? "Replay the discovery case"
                                  : "Take the call — get to the match"}
                          </button>
                        </div>
                        <p id="quick-start-requirements" className="mt-2 text-xs text-zinc-400" role="status" aria-live="polite">
                          {startError ?? (isStarting
                            ? "Generating clubs, players, contacts, and your opening assignment…"
                            : firstName.trim() === "" || lastName.trim() === ""
                            ? "Enter your name, then choose a scouting instinct."
                            : selectedSkillPreset === "custom"
                              ? "Choose one of the four scouting instincts above."
                              : `Ready to ${
                                  effectiveOpeningMode === "desk"
                                    ? "take control of your first week"
                                    : effectiveOpeningMode === "dynamic"
                                      ? "follow a fresh lead"
                                      : effectiveOpeningMode === "tutorial"
                                        ? "replay the guided case"
                                        : "take the call"
                                }. Advanced setup remains available through Continue.`)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            {step === 2 && (
              <Card>
                <CardHeader>
                  <h2 className="font-semibold leading-none tracking-tight">Choose Your Path</h2>
                  <CardDescription>
                    Choose your scouting focus. This shapes your career path and which clubs want you.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {IS_YOUTH_EARLY_ACCESS && (
                    <div className="rounded-lg border border-emerald-800/40 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-200">
                      Youth Early Access is live. Start as a Youth Scout now. First Team Scout,
                      Regional Expert, and Data Scout are coming in a later build.
                    </div>
                  )}
                  {IS_DEMO && (
                    <div className="rounded-lg border border-amber-800/40 bg-amber-950/20 px-4 py-2.5 text-xs text-amber-300">
                      Demo mode is active. Career length is capped at 2 seasons and only the Rescue Job scenario is available.
                    </div>
                  )}
                  <div className={IS_YOUTH_EARLY_ACCESS ? "grid grid-cols-1 gap-4" : "grid grid-cols-2 gap-4"}>
                    {availableSpecializations.map((spec) => {
                      const isSelected = effectiveSpecialization === spec.id;
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
                              <div className="rounded-md border border-[var(--border)] bg-[var(--muted)] p-2">
                                <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-1">
                                  Income Focus
                                </p>
                                <p className="text-xs text-emerald-400">{SPEC_INCOME_INFO[spec.id].focus}</p>
                                <p className="text-[10px] text-blue-400 mt-0.5">Tier 3: {SPEC_INCOME_INFO[spec.id].tier3}</p>
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
                  </div>
                  {IS_YOUTH_EARLY_ACCESS && comingSoonSpecializations.length > 0 && (
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <h3 className="text-sm font-semibold text-zinc-200">Coming Later</h3>
                        <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                          Full game modes
                        </span>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        {comingSoonSpecializations.map((spec) => (
                          <div
                            key={spec.id}
                            className="rounded-lg border border-zinc-800/80 bg-zinc-900/60 p-3"
                          >
                            <p className="font-semibold text-white">{spec.name}</p>
                            <p className="mt-1 text-xs uppercase tracking-wider text-zinc-500">
                              {spec.tagline}
                            </p>
                            <p className="mt-2 text-xs leading-relaxed text-zinc-400">{spec.desc}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {step === 3 && (
              <Card>
                <CardHeader>
                  <h2 className="font-semibold leading-none tracking-tight">Customize Your Skills</h2>
                  <CardDescription>
                    Choose the background, weakness, and philosophy that shape this career, then allocate {BONUS_POINTS} bonus skill points.
                    <span className="ml-2 inline-flex items-center gap-1.5 text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" aria-hidden="true" />
                      {specInfo.name}
                    </span>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <section
                    aria-labelledby="career-dna-heading"
                    className="mb-5 rounded-lg border border-zinc-700/70 bg-zinc-950/40 p-4"
                  >
                    <h3 id="career-dna-heading" className="text-sm font-semibold text-white">
                      Career DNA
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-300">
                      These are permanent run conditions. Origins change your starting strengths,
                      flaws impose real liabilities, and doctrines alter the ongoing football world.
                    </p>
                    <div className="mt-4 grid gap-3 lg:grid-cols-3">
                      <fieldset className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                        <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-emerald-300">
                          Origin
                        </legend>
                        <label htmlFor="scout-origin" className="mb-1 block text-sm font-medium text-white">
                          Where you learned the trade
                        </label>
                        <select
                          id="scout-origin"
                          value={originId}
                          onChange={(event) => setOriginId(event.target.value as ScoutOriginId)}
                          aria-describedby="scout-origin-detail"
                          className="min-h-11 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                          {SCOUT_ORIGINS.map((definition) => (
                            <option key={definition.id} value={definition.id}>{definition.name}</option>
                          ))}
                        </select>
                        <div id="scout-origin-detail" className="mt-2 space-y-2">
                          <p className="text-xs leading-relaxed text-zinc-300">{selectedOrigin.description}</p>
                          <ul className="list-disc space-y-1 pl-4">
                            {selectedOrigin.playerFacingEffects.map((effect) => (
                              <li key={effect} className="text-xs leading-relaxed text-emerald-300">{effect}</li>
                            ))}
                          </ul>
                        </div>
                      </fieldset>

                      <fieldset className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                        <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-amber-300">
                          Flaw
                        </legend>
                        <label htmlFor="scout-flaw" className="mb-1 block text-sm font-medium text-white">
                          What makes the job harder
                        </label>
                        <select
                          id="scout-flaw"
                          value={flawId}
                          onChange={(event) => setFlawId(event.target.value as ScoutFlawId)}
                          aria-describedby="scout-flaw-detail"
                          className="min-h-11 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                        >
                          {SCOUT_FLAWS.map((definition) => (
                            <option key={definition.id} value={definition.id}>{definition.name}</option>
                          ))}
                        </select>
                        <div id="scout-flaw-detail" className="mt-2 space-y-2">
                          <p className="text-xs leading-relaxed text-zinc-300">{selectedFlaw.description}</p>
                          <ul className="list-disc space-y-1 pl-4">
                            {selectedFlaw.playerFacingEffects.map((effect) => (
                              <li key={effect} className="text-xs leading-relaxed text-amber-300">{effect}</li>
                            ))}
                          </ul>
                        </div>
                      </fieldset>

                      <fieldset className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                        <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-sky-300">
                          Doctrine
                        </legend>
                        <label htmlFor="scout-doctrine" className="mb-1 block text-sm font-medium text-white">
                          How you approach uncertainty
                        </label>
                        <select
                          id="scout-doctrine"
                          value={doctrineId}
                          onChange={(event) => setDoctrineId(event.target.value as ScoutDoctrineId)}
                          aria-describedby="scout-doctrine-detail"
                          className="min-h-11 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                        >
                          {SCOUT_DOCTRINES.map((definition) => (
                            <option key={definition.id} value={definition.id}>{definition.name}</option>
                          ))}
                        </select>
                        <div id="scout-doctrine-detail" className="mt-2 space-y-2">
                          <p className="text-xs leading-relaxed text-zinc-300">{selectedDoctrine.description}</p>
                          <ul className="list-disc space-y-1 pl-4">
                            {selectedDoctrine.playerFacingEffects.map((effect) => (
                              <li key={effect} className="text-xs leading-relaxed text-sky-300">{effect}</li>
                            ))}
                          </ul>
                        </div>
                      </fieldset>
                    </div>
                  </section>
                  <div className="space-y-3">
                    {IS_YOUTH_EARLY_ACCESS && (
                      <fieldset className="space-y-2 rounded-lg border border-zinc-700/70 bg-zinc-950/40 p-3">
                        <legend className="px-1 text-sm font-semibold text-white">Starting scouting style</legend>
                        <p className="text-xs leading-relaxed text-zinc-300">
                          Presets only allocate the same eight visible points. Choose one, then customize freely.
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {YOUTH_SKILL_PRESETS.map((preset) => (
                            <button
                              key={preset.id}
                              type="button"
                              aria-pressed={selectedSkillPreset === preset.id}
                              onClick={() => applyYouthPersona(preset)}
                              className={`min-h-11 rounded-lg border p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 ${
                                selectedSkillPreset === preset.id
                                  ? "border-emerald-500 bg-emerald-500/10"
                                  : "border-zinc-700 bg-zinc-900/60 hover:border-zinc-500"
                              }`}
                            >
                              <span className="block text-sm font-semibold text-white">{preset.name}</span>
                              <span className="mt-1 block text-xs leading-relaxed text-zinc-300">{preset.description}</span>
                            </button>
                          ))}
                          <button
                            type="button"
                            aria-pressed={selectedSkillPreset === "custom"}
                            onClick={() => setSelectedSkillPreset("custom")}
                            className={`min-h-11 rounded-lg border p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 ${
                              selectedSkillPreset === "custom"
                                ? "border-emerald-500 bg-emerald-500/10"
                                : "border-zinc-700 bg-zinc-900/60 hover:border-zinc-500"
                            }`}
                          >
                            <span className="block text-sm font-semibold text-white">Custom</span>
                            <span className="mt-1 block text-xs text-zinc-300">Build your own emphasis point by point.</span>
                          </button>
                        </div>
                      </fieldset>
                    )}
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-zinc-300">Remaining Points</span>
                      <span className={`text-sm font-bold ${remaining === 0 ? "text-emerald-400" : "text-amber-400"}`}>
                        {remaining} / {BONUS_POINTS}
                      </span>
                    </div>
                    <p
                      className={`text-xs ${skillAllocationValidation.valid ? "text-emerald-400" : "text-amber-400"}`}
                      role="status"
                      aria-live="polite"
                    >
                      {skillAllocationMessage}
                    </p>

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
                              <span className="ml-2 text-[10px] text-zinc-300">{SKILL_DESCRIPTIONS[skill]}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => {
                                  setSelectedSkillPreset("custom");
                                  setSkillAllocations((prev) => ({
                                    ...prev,
                                    [skill]: Math.max(0, bonus - 1),
                                  }));
                                }}
                                disabled={!canDecrease}
                                className={`h-11 w-11 rounded text-sm font-bold border transition ${
                                  canDecrease
                                    ? "border-zinc-600 text-zinc-300 hover:bg-zinc-800 cursor-pointer"
                                    : "border-zinc-700 text-zinc-400 cursor-not-allowed"
                                }`}
                                aria-label={`Decrease ${skill}`}
                              >
                                −
                              </button>
                              <span className="w-8 text-center text-sm font-mono font-bold text-white">{current}</span>
                              <button
                                onClick={() => {
                                  setSelectedSkillPreset("custom");
                                  setSkillAllocations((prev) => ({
                                    ...prev,
                                    [skill]: bonus + 1,
                                  }));
                                }}
                                disabled={!canIncrease}
                                className={`h-11 w-11 rounded text-sm font-bold border transition ${
                                  canIncrease
                                    ? "border-zinc-600 text-zinc-300 hover:bg-zinc-800 cursor-pointer"
                                    : "border-zinc-700 text-zinc-400 cursor-not-allowed"
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
                            <span className="w-16 shrink-0 text-[10px] text-zinc-300">
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
                  <h2 className="font-semibold leading-none tracking-tight">Starting Position</h2>
                  <CardDescription>How do you want to begin your career?</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {IS_YOUTH_EARLY_ACCESS && (
                    <div className="rounded-lg border border-emerald-800/40 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-200">
                      Youth Early Access starts as a Freelance Youth Scout only. Club-employed starts are coming later once that career branch is verified.
                    </div>
                  )}
                  <div className={IS_YOUTH_EARLY_ACCESS ? "grid grid-cols-1 gap-3" : "grid grid-cols-1 gap-3 sm:grid-cols-2"}>
                    {/* Freelance option */}
                    <button
                      onClick={() => {
                        setStartingPosition("freelance");
                        setStartingClubId("");
                      }}
                      aria-pressed={effectiveStartingPosition === "freelance"}
                      className={`cursor-pointer rounded-lg border p-4 text-left transition ${
                        effectiveStartingPosition === "freelance"
                          ? "border-emerald-500 bg-emerald-500/10"
                          : "border-[var(--border)] hover:border-zinc-600"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className={`inline-flex w-4 h-4 rounded-full border-2 items-center justify-center flex-shrink-0 ${
                            effectiveStartingPosition === "freelance"
                              ? "border-emerald-500 bg-emerald-500"
                              : "border-zinc-500"
                          }`}
                          aria-hidden="true"
                        >
                          {effectiveStartingPosition === "freelance" && (
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
                    {IS_YOUTH_EARLY_ACCESS && (
                      <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-950/40 p-4 text-left opacity-80">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <h3 className="font-semibold text-white">Club Scout</h3>
                          <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                            Coming later
                          </span>
                        </div>
                        <p className="text-sm text-zinc-400">
                          Club-employed starts are disabled in Youth Early Access while the first-report
                          to marketplace flow stays on one verified career path.
                        </p>
                        {IS_YOUTH_EARLY_ACCESS && (
                          <p className="mt-2 text-xs leading-relaxed text-emerald-200">
                            This build begins on one verified path: Freelance Youth Scout.
                            Identity, Skills, World, and Review are the only setup steps.
                          </p>
                        )}
                      </div>
                    )}
                    {!IS_YOUTH_EARLY_ACCESS && (
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
                        Start employed by a club. Receive a steady salary of GBP 800/week but you must
                        follow the club&apos;s scouting priorities and earn manager trust.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="rounded-full bg-[var(--secondary)] px-2 py-0.5 text-xs text-zinc-300">GBP 800/week salary</span>
                        <span className="rounded-full bg-[var(--secondary)] px-2 py-0.5 text-xs text-zinc-300">Club directives</span>
                        <span className="rounded-full bg-[var(--secondary)] px-2 py-0.5 text-xs text-zinc-300">Starter trust</span>
                      </div>
                    </button>
                    )}
                  </div>

                  {/* Club selector */}
                  {!IS_YOUTH_EARLY_ACCESS && effectiveStartingPosition === "club" && (
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
                  {effectiveSpecialization === "regional" && (
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
                  <h2 className="font-semibold leading-none tracking-tight">Build Your World</h2>
                  <CardDescription>
                    Choose which countries run full weekly simulation. Global talent pools stay active in every save.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                          } ${isLocked ? "cursor-default" : ""}`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <h3 className="font-semibold text-white text-sm">{country.name}</h3>
                            {isLocked && <span className="text-xs text-zinc-300">Home</span>}
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
                      <span className="ml-2 text-xs font-normal text-zinc-400">
                        (always active — {SECONDARY_OPTIONS.reduce((sum, c) => sum + c.clubCount, 0)} clubs)
                      </span>
                    </h4>
                    <p className="mb-3 text-xs text-zinc-400">
                      Players from these regions are discoverable, signable, and developable — but leagues do not simulate fixtures.
                    </p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                      {SECONDARY_REGIONS.map((region) => (
                        <div key={region.name}>
                          <p className="text-xs font-medium text-zinc-400">{region.name}</p>
                          <p className="text-xs text-zinc-400">
                            {region.countries.map((c) => `${c.name} (${c.clubCount})`).join(", ")}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Difficulty */}
                  <div className="mt-6 mb-6">
                    <p className="mb-2 text-sm font-semibold text-zinc-300">Difficulty</p>
                    <div className="grid grid-cols-2 gap-4">
                      {(["casual", "normal", "hard", "ironman"] as const).map((d) => {
                        const info = DIFFICULTY_DESCRIPTIONS[d];
                        return (
                          <button
                            key={d}
                            onClick={() => setDifficulty(d)}
                            className={`cursor-pointer rounded-lg border p-4 text-left transition ${
                              difficulty === d
                                ? "border-emerald-500 bg-emerald-500/10"
                                : "border-[var(--border)] hover:border-zinc-600"
                            }`}
                          >
                            <h3 className="mb-1 font-semibold text-white">{info.name}</h3>
                            <p className="text-sm text-zinc-400">{info.description}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* World seed */}
                  <div>
                    <label htmlFor="world-seed" className="mb-1 block text-sm text-zinc-400">World Seed</label>
                    <input
                      id="world-seed"
                      type="text"
                      value={seed}
                      onChange={(e) => setSeed(e.target.value)}
                      className="w-full rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
                    />
                    <p className="mt-1 text-xs text-zinc-400">Same seed = same world. Share with friends.</p>
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
                        <button onClick={() => goToStep(1)} className="min-h-11 min-w-11 text-xs text-emerald-300 hover:text-emerald-200 cursor-pointer">Edit</button>
                      </div>
                      <div className="flex items-center gap-3">
                        <Image
                          src={`/images/avatars/scout-${avatarId}.png`}
                          alt="Scout portrait"
                          width={48}
                          height={48}
                          unoptimized
                          className="h-12 w-12 rounded-full object-cover"
                        />
                        <div>
                          <p className="text-white font-medium">{firstName} {lastName}</p>
                          <p className="text-sm text-zinc-400">Age {age}, {nationality}</p>
                          {IS_YOUTH_EARLY_ACCESS && (
                            <p className="text-sm text-emerald-300">{roleSummary}</p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Specialization */}
                  {!IS_YOUTH_EARLY_ACCESS && (
                    <Card>
                      <CardContent className="pt-5">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold text-zinc-300">Specialization</h3>
                          <button onClick={() => goToStep(2)} className="min-h-11 min-w-11 text-xs text-emerald-300 hover:text-emerald-200 cursor-pointer">Edit</button>
                        </div>
                        <p className="text-white font-medium">{specInfo.name}</p>
                        <p className="text-sm text-zinc-400">{specInfo.tagline}</p>
                      </CardContent>
                    </Card>
                  )}

                  {/* Skills */}
                  <Card>
                    <CardContent className="pt-5">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-zinc-300">Skills</h3>
                        <button onClick={() => goToStep(3)} className="min-h-11 min-w-11 text-xs text-emerald-300 hover:text-emerald-200 cursor-pointer">Edit</button>
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

                  {/* Run-defining scout identity */}
                  <Card>
                    <CardContent className="pt-5">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-zinc-300">Career DNA</h3>
                        <button onClick={() => goToStep(3)} className="min-h-11 min-w-11 cursor-pointer text-xs text-emerald-300 hover:text-emerald-200">Edit</button>
                      </div>
                      <dl className="space-y-2 text-sm">
                        <div>
                          <dt className="text-xs uppercase tracking-wider text-zinc-300">Origin</dt>
                          <dd className="font-medium text-white">{selectedOrigin.name}</dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase tracking-wider text-zinc-300">Flaw</dt>
                          <dd className="font-medium text-amber-300">{selectedFlaw.name}</dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase tracking-wider text-zinc-300">Doctrine</dt>
                          <dd className="font-medium text-sky-300">{selectedDoctrine.name}</dd>
                        </div>
                      </dl>
                    </CardContent>
                  </Card>

                  {/* Position */}
                  {!IS_YOUTH_EARLY_ACCESS && (
                    <Card>
                      <CardContent className="pt-5">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold text-zinc-300">Position</h3>
                          <button onClick={() => goToStep(4)} className="min-h-11 min-w-11 text-xs text-emerald-300 hover:text-emerald-200 cursor-pointer">Edit</button>
                        </div>
                        <p className="text-white font-medium">
                          {effectiveStartingPosition === "freelance" ? "Freelance Scout" : "Club Scout"}
                        </p>
                        {startingClubName && (
                          <p className="text-sm text-zinc-400">{startingClubName}</p>
                        )}
                        {effectiveSpecialization === "regional" && (
                          <p className="text-sm text-zinc-400">
                            Region: {COUNTRY_OPTIONS.find((c) => c.key === startingCountry)?.name ?? startingCountry}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* World */}
                  <Card>
                    <CardContent className="pt-5">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-zinc-300">World</h3>
                        <button onClick={() => goToStep(5)} className="min-h-11 min-w-11 text-xs text-emerald-300 hover:text-emerald-200 cursor-pointer">Edit</button>
                      </div>
                      <p className="text-white font-medium">{worldCountryNames}</p>
                      <p className="text-sm text-zinc-400">{totalClubs} clubs</p>
                    </CardContent>
                  </Card>

                  {/* Settings */}
                  <Card>
                    <CardContent className="pt-5">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-zinc-300">Difficulty</h3>
                        <button onClick={() => goToStep(5)} className="min-h-11 min-w-11 text-xs text-emerald-300 hover:text-emerald-200 cursor-pointer">Edit</button>
                      </div>
                      <p className="text-white font-medium capitalize">{difficulty} difficulty</p>
                      <p className="text-sm text-zinc-400">Seed: {seed}</p>
                    </CardContent>
                  </Card>

                  {/* Returning-player opening */}
                  {IS_YOUTH_EARLY_ACCESS && isExperiencedYouthPlayer && effectiveOpeningMode !== "auto" && (
                    <Card>
                      <CardContent className="pt-5">
                        <div className="mb-3 flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-zinc-300">Career Opening</h3>
                          <button
                            type="button"
                            onClick={() => goToStep(1)}
                            className="min-h-11 min-w-11 cursor-pointer text-xs text-emerald-300 hover:text-emerald-200"
                          >
                            Edit
                          </button>
                        </div>
                        <p className="font-medium text-white">
                          {effectiveOpeningMode === "dynamic"
                            ? "Dynamic prologue"
                            : effectiveOpeningMode === "desk"
                              ? "Start at the Desk"
                              : "Replay tutorial"}
                        </p>
                        <p className="mt-1 text-sm text-zinc-400">
                          {effectiveOpeningMode === "dynamic"
                            ? "A new lead will be assembled from this career's world seed."
                            : effectiveOpeningMode === "desk"
                              ? "Your career opens in the weekly planning workspace."
                              : "The authored school-match discovery case will guide your first judgment."}
                        </p>
                      </CardContent>
                    </Card>
                  )}

                  {/* New Game+ Perks (only shown when NG+ mode is active) */}
                  {isNewGamePlusMode && selectedPerkIds.length > 0 && (
                    <Card className="sm:col-span-2 border-amber-800/40 bg-amber-950/20">
                      <CardContent className="pt-5">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold text-amber-300">New Game+ Perks</h3>
                          <button onClick={() => goToStep(1)} className="min-h-11 min-w-11 text-xs text-amber-300 hover:text-amber-200 cursor-pointer">Edit</button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {selectedPerkIds.map((perkId) => {
                            const perk = availablePerks.find((p) => p.id === perkId);
                            return perk ? (
                              <span
                                key={perkId}
                                className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300"
                              >
                                {perk.name}
                              </span>
                            ) : null;
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Bottom navigation */}
      <div className="border-t border-zinc-800 bg-[var(--background)] px-8 py-4">
        <div className="mx-auto max-w-4xl flex items-center justify-between">
          {currentStepIndex > 0 ? (
            <Button variant="outline" onClick={goBack} className="min-h-11 cursor-pointer">
              Back
            </Button>
          ) : (
            <div />
          )}

          <div className="flex flex-col items-end gap-2">
            {step !== lastStepId ? (
              <Button onClick={goNext} disabled={!canAdvance(step)} className="min-h-11 cursor-pointer">
                Continue
              </Button>
            ) : (
              <button
                type="button"
                onClick={handleStart}
                disabled={!canStart || isStarting}
                aria-describedby="start-requirements"
                className={`min-h-11 cursor-pointer rounded-md px-8 py-2 text-sm font-semibold shadow transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 ${
                  isNewGamePlusMode
                    ? "bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 hover:from-amber-400 hover:to-yellow-300"
                    : "bg-emerald-700 text-white hover:bg-emerald-800"
                }`}
              >
                {isStarting
                  ? "Creating your football world…"
                  : isNewGamePlusMode
                    ? "Begin New Game+"
                    : "Begin Career"}
              </button>
            )}
            {step === lastStepId && (
              <p
                id="start-requirements"
                role="status"
                aria-live="polite"
                className={`max-w-md text-right text-xs ${startError || !canStart ? "text-amber-300" : "text-zinc-300"}`}
              >
                {startError ?? (isStarting ? "Generating clubs, players, contacts, and your opening assignment…" : startRequirementMessage)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Animation keyframes */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(30px); }
          to { transform: translateX(0); }
        }
        @keyframes slideInLeft {
          from { transform: translateX(-30px); }
          to { transform: translateX(0); }
        }
      `}</style>
      </main>
    </div>
  );
}
