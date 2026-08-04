import type {
  CulturalInsight,
  FootballCultureInsightEffects,
} from "@/engine/core/types";
import {
  getCountryDisplayName,
  getShippedCountryKeys,
  normalizeCountryKey,
} from "@/lib/country";

export type InsightType = CulturalInsight["type"];
export type InsightEffectAdjustment = Partial<Omit<FootballCultureInsightEffects, "version">>;

export interface FootballCulturePlaybookInsightDefinition {
  type: InsightType;
  description: string;
  gameplayEffect: string;
  effectAdjustment?: InsightEffectAdjustment;
}

export interface FootballCultureCalendarWindowDefinition {
  id: string;
  label: string;
  startWeek: number;
  endWeek: number;
  maxWeekShift?: number;
  intensityVariance?: number;
  signalByDomain?: Partial<Record<"technical" | "physical" | "mental" | "tactical" | "hidden", number>>;
  uncertaintyMultiplier?: number;
  misleadingSignalRiskDelta?: number;
  contextTags?: string[];
  biasWarnings?: string[];
  reasons?: string[];
}

export interface FootballCulturePlaybookNotes {
  institutions: readonly string[];
  pathways: readonly string[];
  accessPoints: readonly string[];
  evidenceTraps: readonly string[];
}

export interface FootballCulturePlaybook {
  countryId: string;
  displayName: string;
  explicit: boolean;
  notes: FootballCulturePlaybookNotes;
  insightOrder: readonly InsightType[];
  insightsByType: Readonly<Record<InsightType, FootballCulturePlaybookInsightDefinition>>;
  calendarWindows: readonly FootballCultureCalendarWindowDefinition[];
}

export const DEFAULT_INSIGHT_ORDER = Object.freeze([
  "playingStyle",
  "developmentCulture",
  "mentalityPattern",
  "physicalTrait",
] as const);

export const ATTRIBUTE_DOMAINS = ["technical", "physical", "mental", "tactical", "hidden"] as const;

export function canonicalCountry(countryId?: string): string | undefined {
  const normalized = normalizeCountryKey(countryId);
  if (normalized) return normalized;
  const compact = countryId?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return compact || undefined;
}

function insight(
  type: InsightType,
  description: string,
  gameplayEffect: string,
  effectAdjustment?: InsightEffectAdjustment,
): FootballCulturePlaybookInsightDefinition {
  return { type, description, gameplayEffect, effectAdjustment };
}

function window(
  id: string,
  label: string,
  startWeek: number,
  endWeek: number,
  options: Omit<FootballCultureCalendarWindowDefinition, "id" | "label" | "startWeek" | "endWeek"> = {},
): FootballCultureCalendarWindowDefinition {
  return {
    id,
    label,
    startWeek,
    endWeek,
    maxWeekShift: options.maxWeekShift ?? 1,
    intensityVariance: options.intensityVariance ?? 0.015,
    ...options,
  };
}

function definePlaybook(input: {
  countryId: string;
  notes: FootballCulturePlaybookNotes;
  insights: readonly FootballCulturePlaybookInsightDefinition[];
  calendarWindows: readonly FootballCultureCalendarWindowDefinition[];
  insightOrder?: readonly InsightType[];
}): FootballCulturePlaybook {
  const countryId = canonicalCountry(input.countryId) ?? input.countryId;
  const insightOrder = input.insightOrder ?? DEFAULT_INSIGHT_ORDER;
  const insightsByType = Object.fromEntries(
    input.insights.map((entry) => [entry.type, entry]),
  ) as Record<InsightType, FootballCulturePlaybookInsightDefinition>;

  return Object.freeze({
    countryId,
    displayName: getCountryDisplayName(countryId),
    explicit: true,
    notes: input.notes,
    insightOrder,
    insightsByType,
    calendarWindows: input.calendarWindows,
  });
}

export const EXPLICIT_FOOTBALL_CULTURE_PLAYBOOKS_BY_COUNTRY: Readonly<Record<string, FootballCulturePlaybook>> = Object.freeze({
  england: definePlaybook({
    countryId: "england",
    notes: {
      institutions: ["EPPP academy structure sits alongside a dense lower-league pyramid and school football."],
      pathways: ["Academy minutes, school fixtures, and lower-tier loans all create different evidence quality."],
      accessPoints: ["Academy festivals, youth cup rounds, and regional grassroots circuits surface talent."],
      evidenceTraps: ["Direct lower-tier football can overstate duel value and understate combination play."],
    },
    insights: [
      insight("playingStyle", "English youth and lower-tier football expose duel-winning, pressing recovery, and second-ball habits quickly, but combination play can be hidden in direct samples.", "Live reads on physical and tactical repeat actions arrive faster in direct competitions.", { signalByDomain: { physical: 0.07, tactical: 0.05 }, contextTags: ["direct-pyramid", "second-ball-sample"], biasWarnings: ["Direct lower-tier matches can overstate aerial utility and transition value."] }),
      insight("developmentCulture", "Academy players often move through tightly scheduled games programs, while late developers can still surface through schools, non-league, and release-rebound routes.", "Knowing the academy-versus-release pathway makes development evidence easier to sort.", { signalByDomain: { technical: 0.05, tactical: 0.04, hidden: 0.03 }, uncertaintyMultiplier: 0.95, contextTags: ["academy-release-funnel"] }),
      insight("mentalityPattern", "Selection pressure is constant because contracts, loans, and squad turnover arrive early, so repeated response-to-pressure samples matter more than one polished showcase.", "Repeated high-pressure samples improve mental-context confidence.", { signalByDomain: { mental: 0.08, hidden: 0.04 }, contextTags: ["contract-pressure"], biasWarnings: ["A polished academy event is not proof the player handles senior weekly pressure."] }),
      insight("physicalTrait", "Early-maturing players can dominate academy or school football, but senior utility still depends on whether their edge survives faster, more physical adult play.", "Physical samples are most useful when paired with level and age-context awareness.", { signalByDomain: { physical: 0.08 }, uncertaintyMultiplier: 0.98, contextTags: ["early-maturity-check"], biasWarnings: ["Youth duel dominance can fade once opponents catch up physically."] }),
    ],
    calendarWindows: [
      window("midlands-youth-circuit", "Mid-season regional youth circuit", 5, 10, { signalByDomain: { physical: 0.03, tactical: 0.02 }, uncertaintyMultiplier: 0.97, contextTags: ["regional-cup-run"], reasons: ["Regional cup rounds create repeatable game states before the academy spring run."] }),
      window("academy-festival-band", "Academy festival and alliance band", 12, 18, { signalByDomain: { technical: 0.03, tactical: 0.04 }, uncertaintyMultiplier: 0.95, misleadingSignalRiskDelta: -0.01, contextTags: ["academy-festival"], reasons: ["Clustered academy fixtures improve comparability across coached environments."] }),
      window("late-grassroots-showcase", "Late grassroots and school showcase band", 25, 36, { signalByDomain: { mental: 0.02, hidden: 0.02 }, uncertaintyMultiplier: 1.02, misleadingSignalRiskDelta: 0.02, contextTags: ["late-showcase"], biasWarnings: ["Late-season standout matches can mix fatigue, release anxiety, and uneven opposition."], reasons: ["Late-season school and grassroots finals create noisy but revealing selection pressure."] }),
    ],
  }),
  spain: definePlaybook({
    countryId: "spain",
    notes: {
      institutions: ["Club academies and regional competitions emphasize positional habits and receiving quality."],
      pathways: ["Cantera minutes, regional school events, and elite youth cups create different tactical clarity."],
      accessPoints: ["Youth technical festivals, regional cups, and champions phases provide comparison points."],
      evidenceTraps: ["System strength can flatter circulation specialists when space and coaching are ideal."],
    },
    insights: [
      insight("playingStyle", "Spanish youth matches often produce many possession sequences, letting a scout see first touch, body shape, scanning, and combination timing more often than in transition-heavy samples.", "Possession-heavy environments sharpen technical and tactical interpretation.", { signalByDomain: { technical: 0.09, tactical: 0.09 }, contextTags: ["positional-rhythm", "receiving-under-pressure"], biasWarnings: ["Strong club structure can make off-ball flaws easier to hide than the ball work suggests."] }),
      insight("developmentCulture", "Regional and club academies usually coach spacing and support angles early, so context helps separate system literacy from truly portable invention.", "Understanding academy spacing norms improves portability reads.", { signalByDomain: { technical: 0.05, tactical: 0.06, hidden: 0.02 }, uncertaintyMultiplier: 0.95, contextTags: ["cantera-structure"] }),
      insight("mentalityPattern", "Patient circulation is normal, so a scout can learn more from how a player reacts when pressed or when tempo breaks than from clean possession alone.", "Pressure-response moments become more meaningful once the local rhythm is understood.", { signalByDomain: { mental: 0.07, hidden: 0.04 }, contextTags: ["patience-under-pressure"] }),
      insight("physicalTrait", "Physical edges can be under-tested in youth possession environments, especially for defenders and transition forwards who face fewer chaotic duels.", "Physical projections need cross-context checking when the game stays orderly.", { signalByDomain: { physical: 0.06 }, uncertaintyMultiplier: 1.01, contextTags: ["orderly-sample"], biasWarnings: ["Orderly possession football can hide recovery speed and duel ceiling."] }),
    ],
    calendarWindows: [
      window("technical-festival-band", "Technical youth festival band", 6, 14, { signalByDomain: { technical: 0.04, tactical: 0.03 }, uncertaintyMultiplier: 0.95, contextTags: ["technical-festival"], reasons: ["Early technical tournaments create repeatable first-touch and combination samples."] }),
      window("regional-juvenil-circuit", "Regional juvenil cup circuit", 18, 24, { signalByDomain: { tactical: 0.03, mental: 0.02 }, uncertaintyMultiplier: 0.98, contextTags: ["regional-juvenil"], reasons: ["Regional competition increases tactical contrast without fully losing structure."] }),
      window("champions-phase", "National juvenile champions phase", 28, 34, { signalByDomain: { mental: 0.03, hidden: 0.02 }, uncertaintyMultiplier: 0.96, misleadingSignalRiskDelta: -0.01, contextTags: ["champions-phase"], reasons: ["Late champions rounds improve pressure reads against peer-level opposition."] }),
    ],
  }),
  germany: definePlaybook({
    countryId: "germany",
    notes: {
      institutions: ["Club academies and regional federation structures create organized high-volume comparison points."],
      pathways: ["Academy league matches, federation cups, and regional finals show system repeatability clearly."],
      accessPoints: ["Junior cup rounds and state tournaments create dense evidence windows."],
      evidenceTraps: ["Organized pressing structures can make average decision-makers look cleaner than they are."],
    },
    insights: [
      insight("playingStyle", "German environments often expose pressing triggers, recovery running, and spacing discipline clearly because team structure repeats them frequently.", "Structured pressing samples improve tactical and mental reads.", { signalByDomain: { tactical: 0.09, mental: 0.06 }, contextTags: ["pressing-structure"], biasWarnings: ["System discipline can flatter players who rely on coaching prompts more than self-direction."] }),
      insight("developmentCulture", "The academy network creates strong baseline organization, making it easier to compare role discipline across clubs and state competitions.", "High-structure academy contexts reduce pathway noise.", { signalByDomain: { technical: 0.04, tactical: 0.06, hidden: 0.03 }, uncertaintyMultiplier: 0.94, contextTags: ["academy-network"] }),
      insight("mentalityPattern", "Selection often rewards consistency and task completion, so repeated medium-pressure samples can tell more than one spectacular game.", "Consistency signals become easier to trust with local context.", { signalByDomain: { mental: 0.08, hidden: 0.04 }, contextTags: ["consistency-market"] }),
      insight("physicalTrait", "Sports-science-heavy development can make physical curves look smoother, but some players are still protected from open chaos until later competition jumps.", "Physical projection is clearer, but chaos translation still needs checking.", { signalByDomain: { physical: 0.07 }, uncertaintyMultiplier: 0.96, contextTags: ["managed-physical-load"] }),
    ],
    calendarWindows: [
      window("junioren-pokal-band", "Junior cup phase", 6, 9, { signalByDomain: { tactical: 0.03, mental: 0.02 }, uncertaintyMultiplier: 0.96, contextTags: ["junior-cup"], reasons: ["Cup rounds create clear role-discipline evidence under result pressure."] }),
      window("bundesliga-youth-band", "Bundesliga youth program band", 14, 22, { signalByDomain: { technical: 0.02, tactical: 0.04 }, uncertaintyMultiplier: 0.95, contextTags: ["academy-league-band"], reasons: ["League-format academy football gives strong like-for-like comparability."] }),
      window("state-finals-band", "State and regional finals band", 28, 36, { signalByDomain: { physical: 0.02, mental: 0.03 }, uncertaintyMultiplier: 0.98, contextTags: ["state-finals"], reasons: ["Regional finals add pressure without fully losing structural clarity."] }),
    ],
  }),
  france: definePlaybook({
    countryId: "france",
    notes: {
      institutions: ["Academy centers, regional identification, and school-to-club routes create layered entry points."],
      pathways: ["Elite academies coexist with strong regional catchment and later bloomers from non-elite routes."],
      accessPoints: ["National youth cups and regional tournaments surface varied player backgrounds."],
      evidenceTraps: ["High-end athletes can dominate transitional samples before their decision speed fully matures."],
    },
    insights: [
      insight("playingStyle", "French youth football often combines open transitions with coached tactical tasks, producing useful simultaneous reads on athletic execution and role discipline.", "Transition-rich structured matches improve physical and tactical interpretation.", { signalByDomain: { physical: 0.06, tactical: 0.06 }, contextTags: ["transition-structure"] }),
      insight("developmentCulture", "National and club pathways create broad comparison points, but players arrive through different local funnels, so context helps separate polish from raw upside.", "Knowing the pathway clarifies whether a clean sample reflects development support or portable quality.", { signalByDomain: { technical: 0.04, tactical: 0.04, hidden: 0.04 }, uncertaintyMultiplier: 0.95, contextTags: ["academy-regional-funnel"] }),
      insight("mentalityPattern", "Because selection windows are competitive and mobile, the best mental samples often come from reaction-to-error, off-ball work, and second-game energy rather than first-game flair.", "Competitive pathway context improves mental and hidden reads.", { signalByDomain: { mental: 0.08, hidden: 0.05 }, contextTags: ["competitive-selection"] }),
      insight("physicalTrait", "Explosive profiles show early, but a scout still needs context on body control, repeat sprinting, and how the player functions when opponents match the pace.", "Physical samples are strong, but repeatability matters more than first-glance burst.", { signalByDomain: { physical: 0.08 }, uncertaintyMultiplier: 0.97, contextTags: ["repeat-sprint-check"] }),
    ],
    calendarWindows: [
      window("gambardella-band", "National youth cup band", 10, 14, { signalByDomain: { tactical: 0.03, mental: 0.03 }, uncertaintyMultiplier: 0.96, contextTags: ["gambardella-band"], reasons: ["National cup rounds provide pressure against mixed pathway opposition."] }),
      window("regional-evaluation-band", "Regional evaluation tournament band", 16, 18, { signalByDomain: { hidden: 0.02, technical: 0.02 }, uncertaintyMultiplier: 0.98, contextTags: ["regional-evaluation"], reasons: ["Regional events put academy and non-academy backgrounds into the same viewing frame."] }),
      window("late-national-u17-band", "Late national U17 band", 24, 32, { signalByDomain: { physical: 0.02, mental: 0.02 }, uncertaintyMultiplier: 0.97, contextTags: ["u17-finals-band"], reasons: ["Late elite-youth rounds tighten the physical and pressure comparison set."] }),
    ],
  }),
  brazil: definePlaybook({
    countryId: "brazil",
    notes: {
      institutions: ["Club academies sit beside strong local tournaments, futsal roots, and uneven formal infrastructure."],
      pathways: ["Some prospects arrive through elite clubs early; others surface through local competition and later intake."],
      accessPoints: ["National junior cups, state tournaments, and regional circuits create showcase spikes."],
      evidenceTraps: ["Open attacking games can overstate ball-carrying value and under-test defensive reliability."],
    },
    insights: [
      insight("playingStyle", "Brazilian youth environments often produce repeated 1v1s, improvisation, and transition attacks, giving a scout many visible ball actions but not always stable tactical frames.", "Ball-dominant technical actions become easier to read than role discipline in open games.", { signalByDomain: { technical: 0.08, physical: 0.03 }, uncertaintyMultiplier: 1.01, contextTags: ["open-attack-sample"], biasWarnings: ["Open attacking samples can flatter dribbling and disguise off-ball responsibility."] }),
      insight("developmentCulture", "Formal academy coaching and informal development routes coexist, so context is essential when deciding whether polish, rawness, or decision gaps are pathway-driven.", "Mixed pathways make development context more valuable than one-size assumptions.", { signalByDomain: { technical: 0.09, tactical: -0.04, hidden: 0.03 }, uncertaintyMultiplier: 1.02, contextTags: ["mixed-formal-informal-pathways"] }),
      insight("mentalityPattern", "The strongest mental evidence often appears when the game stops being expressive and becomes competitive, defensive, or selection-heavy.", "Pressure-phase behaviour is more telling than highlight-ball confidence.", { signalByDomain: { mental: 0.07, hidden: 0.04 }, contextTags: ["highlight-vs-pressure"] }),
      insight("physicalTrait", "Physical trajectories can look uneven because workloads, surfaces, and training resources vary widely across routes.", "Physical projection needs repeat samples across competition levels and support contexts.", { signalByDomain: { physical: 0.08 }, uncertaintyMultiplier: 1.03, contextTags: ["uneven-load-history"], biasWarnings: ["One elite tournament may not represent the player's week-to-week physical environment."] }),
    ],
    calendarWindows: [
      window("copinha-band", "National junior cup band", 2, 5, { signalByDomain: { technical: 0.04, mental: 0.03 }, uncertaintyMultiplier: 0.97, contextTags: ["copinha"], reasons: ["The early national junior cup creates intense exposure against varied pathways."] }),
      window("regional-state-band", "State and regional youth circuit", 10, 20, { signalByDomain: { technical: 0.03, physical: 0.02 }, uncertaintyMultiplier: 1.01, contextTags: ["state-circuit"], biasWarnings: ["Quality can swing sharply between clubs and local event bands."], reasons: ["Regional tournaments broaden the sample but increase pathway variance."] }),
      window("late-showcase-cups", "Late showcase cup band", 24, 36, { signalByDomain: { hidden: 0.02, mental: 0.02 }, uncertaintyMultiplier: 1.02, misleadingSignalRiskDelta: 0.02, contextTags: ["showcase-cup-band"], reasons: ["Late showcase events surface upside but can amplify highlight bias and fatigue."] }),
    ],
  }),
  argentina: definePlaybook({
    countryId: "argentina",
    notes: {
      institutions: ["Major-club academies coexist with hard competitive regional football and strong informal roots."],
      pathways: ["Street and neighborhood competition often precede formal academy polishing."],
      accessPoints: ["AFA youth competitions and interior tournaments produce different sample pressures."],
      evidenceTraps: ["Emotionally intense matches can make one game feel more decisive than it really is."],
    },
    insights: [
      insight("playingStyle", "Argentine samples often reveal close control, traffic navigation, and competitive problem-solving, especially when the game turns contested.", "Tight-space technical and composure reads become clearer in contested local football.", { signalByDomain: { technical: 0.07, mental: 0.04 }, contextTags: ["tight-space-competition"] }),
      insight("developmentCulture", "Formal development often arrives after heavy competitive repetition, so context helps distinguish raw edge from coached portability.", "Understanding when polish entered the pathway improves development interpretation.", { signalByDomain: { technical: 0.05, tactical: 0.03, hidden: 0.03 }, uncertaintyMultiplier: 0.98, contextTags: ["late-polish-pathway"] }),
      insight("mentalityPattern", "High-stakes local football makes response to setbacks, crowd swings, and repeated contests more valuable than one clean technical display.", "Pressure-response behaviour is especially revealing in the local competitive climate.", { signalByDomain: { mental: 0.09, hidden: 0.06 }, contextTags: ["high-pressure-competition"] }),
      insight("physicalTrait", "Physical samples vary because role craft can hide average raw tools, while emotional tempo can make average athletes look faster than they are.", "Physical judgment is strongest when the scout separates tempo from true movement ceiling.", { signalByDomain: { physical: 0.06 }, uncertaintyMultiplier: 1.01, contextTags: ["tempo-vs-tools"], biasWarnings: ["Chaotic match tempo can exaggerate perceived speed and duel influence."] }),
    ],
    calendarWindows: [
      window("afa-youth-band", "AFA youth season launch", 3, 7, { signalByDomain: { technical: 0.03, tactical: 0.02 }, uncertaintyMultiplier: 0.98, contextTags: ["afa-youth-band"], reasons: ["Early national youth rounds quickly separate polished academy groups from raw competitive routes."] }),
      window("interior-cup-band", "Interior and provincial cup band", 10, 16, { signalByDomain: { mental: 0.02, hidden: 0.02 }, uncertaintyMultiplier: 1.01, contextTags: ["interior-cup-band"], reasons: ["Provincial competition broadens the sample and reveals adaptation outside major-club structure."] }),
      window("late-buenos-aires-band", "Late showcase and city finals band", 22, 32, { signalByDomain: { mental: 0.03, technical: 0.02 }, uncertaintyMultiplier: 0.99, contextTags: ["showcase-finals-band"], reasons: ["Late finals put reputation, crowd pressure, and execution into the same sample."] }),
    ],
  }),
  usa: definePlaybook({
    countryId: "usa",
    notes: {
      institutions: ["MLS academies, school soccer, pay-to-play clubs, and showcase circuits overlap."],
      pathways: ["The route to exposure matters because competition quality can vary sharply between events."],
      accessPoints: ["National showcases and elite club playoffs concentrate cross-market comparison."],
      evidenceTraps: ["Showcase settings can reward athletic self-presentation more than repeatable football decisions."],
    },
    insights: [
      insight("playingStyle", "American youth samples often mix organized pressing and athletic transition play, but role detail can vary sharply by event tier.", "Athletic transition actions become clearer than universal tactical portability.", { signalByDomain: { physical: 0.06, mental: 0.03 }, contextTags: ["showcase-transition"] }),
      insight("developmentCulture", "Because academy, school, and club-showcase routes differ, pathway context is essential before projecting consistency or decision speed.", "Knowing the route to competition improves development-context accuracy.", { signalByDomain: { technical: 0.04, tactical: 0.04, hidden: 0.04 }, uncertaintyMultiplier: 1.01, contextTags: ["multi-route-market"] }),
      insight("mentalityPattern", "The strongest mentality evidence often comes when players move from curated events into multi-game, travel-heavy, selection-stress environments.", "Travel and showcase pressure create more meaningful mental reads than isolated workouts.", { signalByDomain: { mental: 0.08, hidden: 0.05 }, contextTags: ["showcase-pressure"] }),
      insight("physicalTrait", "Elite event samples can over-reward players who look ready early, even when their football adaptation still lags.", "Physical dominance needs context from role craft and event quality.", { signalByDomain: { physical: 0.08 }, uncertaintyMultiplier: 1.01, contextTags: ["early-readiness-bias"], biasWarnings: ["Showcase athletics can hide processing and off-ball gaps."] }),
    ],
    calendarWindows: [
      window("ga-cup-band", "National academy showcase band", 10, 12, { signalByDomain: { technical: 0.03, mental: 0.02 }, uncertaintyMultiplier: 0.97, contextTags: ["academy-showcase"], reasons: ["National academy showcases create strong cross-market comparison in a compressed window."] }),
      window("travel-circuit-band", "Travel and tournament circuit", 16, 20, { signalByDomain: { physical: 0.03, hidden: 0.02 }, uncertaintyMultiplier: 1.01, contextTags: ["travel-circuit"], reasons: ["Travel-heavy tournament play reveals stamina, adaptation, and support-context differences."] }),
      window("playoff-showcase-band", "Elite club playoff band", 28, 36, { signalByDomain: { mental: 0.03, tactical: 0.02 }, uncertaintyMultiplier: 0.99, contextTags: ["playoff-showcase"], reasons: ["Late-season playoff events produce higher stakes than routine club showcase games."] }),
    ],
  }),
  mexico: definePlaybook({
    countryId: "mexico",
    notes: {
      institutions: ["Club youth systems and strong regional football cultures create layered exposure routes."],
      pathways: ["League youth competition and city-region events can tell different stories about readiness."],
      accessPoints: ["National youth league bands and regional tournaments surface technical attackers and adaptable defenders."],
      evidenceTraps: ["Strong possession or local-star roles can hide whether actions translate against faster pressure."],
    },
    insights: [
      insight("playingStyle", "Mexican youth football often gives repeated combination and wide-attack actions, but the tempo jump between events can be large.", "Combination-play reads are useful, but portability depends on pressure context.", { signalByDomain: { technical: 0.07, tactical: 0.04 }, contextTags: ["combination-wide-attack"] }),
      insight("developmentCulture", "Club academy structure matters, but some prospects still arrive through regional tournaments with different tactical schooling.", "Pathway awareness improves development-context interpretation.", { signalByDomain: { technical: 0.05, tactical: 0.04, hidden: 0.03 }, uncertaintyMultiplier: 0.98, contextTags: ["academy-regional-split"] }),
      insight("mentalityPattern", "Competitive identity shows up best when matches become transitional, away-heavy, or selection-loaded rather than technically clean.", "Stressful competition states improve mental and hidden reads.", { signalByDomain: { mental: 0.08, hidden: 0.04 }, contextTags: ["transition-pressure"] }),
      insight("physicalTrait", "Technical comfort can sometimes hide whether the player handles repeated accelerations, recovery work, and contact under faster pressure.", "Physical interpretation is strongest when paired with level-adjusted tempo context.", { signalByDomain: { physical: 0.07 }, uncertaintyMultiplier: 1.01, contextTags: ["tempo-jump-check"] }),
    ],
    calendarWindows: [
      window("promesas-band", "National youth promises band", 8, 10, { signalByDomain: { technical: 0.03, tactical: 0.02 }, uncertaintyMultiplier: 0.97, contextTags: ["promesas-band"], reasons: ["Early national youth events provide clean technical comparison points."] }),
      window("regional-club-band", "Regional club youth band", 16, 18, { signalByDomain: { hidden: 0.02, mental: 0.02 }, uncertaintyMultiplier: 0.99, contextTags: ["regional-club-band"], reasons: ["Regional youth matches add pathway contrast and stress adaptation."] }),
      window("liga-mx-youth-finals", "Youth league finals band", 24, 34, { signalByDomain: { mental: 0.03, tactical: 0.03 }, uncertaintyMultiplier: 0.98, contextTags: ["youth-finals-band"], reasons: ["Late youth league finals sharpen decision reads under result pressure."] }),
    ],
  }),
  canada: definePlaybook({
    countryId: "canada",
    notes: {
      institutions: ["Club, school, and academy routes remain mixed, with long-distance travel shaping event quality."],
      pathways: ["Regional concentration and seasonality matter as much as club label when reading evidence."],
      accessPoints: ["National youth championships and interprovincial events create the strongest comparison windows."],
      evidenceTraps: ["Sparse competition density can make one dominant weekend look more representative than it is."],
    },
    insights: [
      insight("playingStyle", "Canadian youth football often mixes direct transition play with improving academy structure, so samples can be athletic and organized in uneven proportions.", "Transition and adaptation evidence is often clearer than fine-grain role detail.", { signalByDomain: { physical: 0.05, tactical: 0.03 }, contextTags: ["travel-spread-sample"] }),
      insight("developmentCulture", "Because geography and season length shape repetition, the route and event density matter heavily when judging polish or upside.", "Competition density context improves development interpretation.", { signalByDomain: { technical: 0.04, hidden: 0.04 }, uncertaintyMultiplier: 1.02, contextTags: ["season-density-context"] }),
      insight("mentalityPattern", "Travel, climate, and small-sample selection events often reveal resilience and adaptability more than routine local matches do.", "Travel-context events improve mental reads.", { signalByDomain: { mental: 0.07, hidden: 0.04 }, contextTags: ["travel-adaptation"] }),
      insight("physicalTrait", "Early physical dominance can be exaggerated by uneven local competition density, so interregional comparison matters.", "Physical projection is strongest when the player is seen outside their usual competition pocket.", { signalByDomain: { physical: 0.07 }, uncertaintyMultiplier: 1.02, contextTags: ["interregional-check"] }),
    ],
    calendarWindows: [
      window("national-youth-championship", "National youth championship band", 18, 20, { signalByDomain: { mental: 0.02, hidden: 0.02 }, uncertaintyMultiplier: 0.99, contextTags: ["national-youth-band"], reasons: ["National events compress a wide geography into one comparison window."] }),
      window("late-interregional-band", "Late interregional showcase band", 24, 32, { signalByDomain: { physical: 0.02, tactical: 0.02 }, uncertaintyMultiplier: 1.01, contextTags: ["interregional-showcase"], reasons: ["Later showcases reveal adaptation across unfamiliar opponents and travel conditions."] }),
    ],
  }),
  nigeria: definePlaybook({
    countryId: "nigeria",
    notes: {
      institutions: ["Formal academies, school competitions, and independent organizers coexist with uneven support structures."],
      pathways: ["Local organizer networks and regional competitions can matter as much as club badge."],
      accessPoints: ["National school events and city youth finals surface high-upside players."],
      evidenceTraps: ["One tournament can mix elite upside with uneven tactical structure and broad age-context noise."],
    },
    insights: [
      insight("playingStyle", "Nigerian youth environments often produce open attacking phases and repeated transition actions, making acceleration, recovery, and front-foot intent easy to see.", "Open transition football sharpens physical-action reads more than controlled tactical ones.", { signalByDomain: { physical: 0.07, technical: 0.04 }, contextTags: ["open-transition-market"] }),
      insight("developmentCulture", "Because pathway quality varies, local context matters heavily when separating raw upside from polished repeatability.", "Mixed support structures make pathway context central to development reads.", { signalByDomain: { physical: 0.07, technical: 0.04, tactical: -0.03 }, uncertaintyMultiplier: 1.03, contextTags: ["uneven-pathways"], biasWarnings: ["Strong raw tools in one event can overstate week-to-week tactical readiness."] }),
      insight("mentalityPattern", "Competitive resilience shows up most clearly when a player has to solve travel, organization, or game-state instability without losing intensity.", "Adaptation under unstable conditions improves mental-context judgment.", { signalByDomain: { mental: 0.08, hidden: 0.05 }, contextTags: ["adaptation-under-instability"] }),
      insight("physicalTrait", "Physical samples can be vivid early, but repeatability, load history, and role understanding still need confirmation.", "Explosive physical evidence is useful when paired with repeatability checks.", { signalByDomain: { physical: 0.09 }, uncertaintyMultiplier: 1.02, contextTags: ["repeatability-check"] }),
    ],
    calendarWindows: [
      window("school-championship-band", "National school championship band", 12, 14, { signalByDomain: { physical: 0.03, mental: 0.02 }, uncertaintyMultiplier: 1.0, contextTags: ["school-championship"], reasons: ["National school events create a broad, high-upside but uneven comparison set."] }),
      window("city-finals-band", "Regional city finals band", 26, 28, { signalByDomain: { hidden: 0.02, physical: 0.02 }, uncertaintyMultiplier: 1.02, contextTags: ["city-finals-band"], reasons: ["Regional finals reveal competitive edge and local organizer networks."] }),
      window("lagos-showcase-band", "Late Lagos and metropolitan showcase band", 34, 36, { signalByDomain: { mental: 0.02 }, uncertaintyMultiplier: 1.03, misleadingSignalRiskDelta: 0.02, contextTags: ["late-metropolitan-showcase"], reasons: ["Late metropolitan showcases raise visibility and selection stress at the same time."] }),
    ],
  }),
  ghana: definePlaybook({
    countryId: "ghana",
    notes: {
      institutions: ["Academy projects and independent youth organizers both shape the market."],
      pathways: ["Elite academy routes sit beside strong local competition and organizer-driven opportunity."],
      accessPoints: ["National youth leagues and academy-led showcase cups create the clearest windows."],
      evidenceTraps: ["Organizer reputation can shape who gets seen and how polished the sample looks."],
    },
    insights: [
      insight("playingStyle", "Ghanaian youth football often creates repeated transition and duel moments, but academy-linked events can add more coached possession than local play suggests.", "Physical and adaptation reads arrive quickly, while tactical certainty depends on event type.", { signalByDomain: { physical: 0.06, mental: 0.03 }, contextTags: ["academy-vs-local-transition"] }),
      insight("developmentCulture", "Pathway context matters because academy-led polish and local rawness can appear in the same tournament.", "Knowing the route to the event improves development interpretation.", { signalByDomain: { technical: 0.05, hidden: 0.04 }, uncertaintyMultiplier: 1.01, contextTags: ["mixed-organizer-market"] }),
      insight("mentalityPattern", "Competitive self-belief is common, but the truest mental reads come when a player has to adapt to stronger structure or stricter roles.", "Adaptation to structure improves mentality interpretation.", { signalByDomain: { mental: 0.08, hidden: 0.04 }, contextTags: ["adaptation-to-structure"] }),
      insight("physicalTrait", "Athletic samples can stand out early, but body control and repeat sprinting against organized peers matter more than first-glance explosiveness.", "Physical interpretation improves when the sample includes organized peer opposition.", { signalByDomain: { physical: 0.08 }, uncertaintyMultiplier: 1.01, contextTags: ["peer-organization-check"] }),
    ],
    calendarWindows: [
      window("colts-band", "National colts competition band", 10, 12, { signalByDomain: { physical: 0.02, mental: 0.02 }, uncertaintyMultiplier: 1.0, contextTags: ["colts-band"], reasons: ["National colts competitions provide broad youth exposure with mixed structure."] }),
      window("academy-showcase-band", "Academy showcase cup band", 24, 26, { signalByDomain: { technical: 0.03, hidden: 0.02 }, uncertaintyMultiplier: 0.99, contextTags: ["academy-showcase-band"], reasons: ["Academy showcase cups create cleaner context for pathway-adjusted comparison."] }),
    ],
  }),
  ivorycoast: definePlaybook({
    countryId: "ivorycoast",
    notes: {
      institutions: ["Club-linked academies and local youth competitions create overlapping talent routes."],
      pathways: ["A scout often needs organizer and academy context to judge how supported the sample really is."],
      accessPoints: ["National youth cups create the clearest authored event layer."],
      evidenceTraps: ["One clean academy showcase can hide how a player adapts outside supported structure."],
    },
    insights: [
      insight("playingStyle", "Ivory Coast youth samples often emphasize open-space attacks and duel play, though academy-linked events can be much cleaner than local weekly competition.", "Transition and duel actions are easy to see, but role translation depends on context.", { signalByDomain: { physical: 0.06, technical: 0.03 }, contextTags: ["open-space-attack"] }),
      insight("developmentCulture", "Support structure varies by route, so pathway knowledge helps separate polished execution from portable habits.", "Pathway support context reduces development guesswork.", { signalByDomain: { hidden: 0.04, technical: 0.04 }, uncertaintyMultiplier: 1.01, contextTags: ["support-structure-variance"] }),
      insight("mentalityPattern", "The best mental reads come when the player moves from comfort environments into tighter, more role-disciplined matches.", "Adaptation outside comfort structure improves mental interpretation.", { signalByDomain: { mental: 0.08, hidden: 0.04 }, contextTags: ["comfort-vs-role-discipline"] }),
      insight("physicalTrait", "Raw physical value can be obvious early, but body control and repeatability matter more than one explosive showcase.", "Repeatability checks keep physical projections grounded.", { signalByDomain: { physical: 0.08 }, uncertaintyMultiplier: 1.01, contextTags: ["repeatability-over-flash"] }),
    ],
    calendarWindows: [
      window("jeunesse-cup-band", "National jeunesse cup band", 10, 12, { signalByDomain: { physical: 0.02, hidden: 0.02 }, uncertaintyMultiplier: 1.0, contextTags: ["jeunesse-cup-band"], reasons: ["National youth cup windows create broad visibility across pathways."] }),
      window("late-regional-band", "Late regional youth band", 24, 30, { signalByDomain: { mental: 0.02 }, uncertaintyMultiplier: 1.02, contextTags: ["late-regional-youth-band"], reasons: ["Later regional play reveals how players hold up once expectation and fatigue rise."] }),
    ],
  }),
  egypt: definePlaybook({
    countryId: "egypt",
    notes: {
      institutions: ["Club youth structures and school competitions both matter, especially around major urban centers."],
      pathways: ["City-school football and club routes can show different tempo and support levels."],
      accessPoints: ["Youth cup windows and school championships provide the strongest scheduled comparisons."],
      evidenceTraps: ["Structured possession in one event can hide whether the player handles faster transition stress."],
    },
    insights: [
      insight("playingStyle", "Egyptian youth football often alternates between controlled possession stretches and abrupt transition moments, so useful evidence comes from seeing both.", "Balanced contexts improve tactical reads when the scout knows where the rhythm shifts.", { signalByDomain: { tactical: 0.06, technical: 0.04 }, contextTags: ["control-to-transition"] }),
      insight("developmentCulture", "Club and school pathways can prepare players differently, making route awareness important for judging polish and repeatability.", "School-versus-club context improves development interpretation.", { signalByDomain: { technical: 0.04, hidden: 0.03 }, uncertaintyMultiplier: 0.99, contextTags: ["school-club-pathway"] }),
      insight("mentalityPattern", "Selection pressure is clearest in city-school and knockout environments where crowd expectation and reputation both matter.", "High-visibility school and cup events sharpen mental-context reads.", { signalByDomain: { mental: 0.08, hidden: 0.04 }, contextTags: ["urban-pressure-band"] }),
      insight("physicalTrait", "Physical value is easiest to trust when the sample includes repeated transition recovery, not just on-ball authority.", "Recovery and repeat action context improves physical projection.", { signalByDomain: { physical: 0.07 }, uncertaintyMultiplier: 1.0, contextTags: ["recovery-run-check"] }),
    ],
    calendarWindows: [
      window("youth-cup-band", "National youth cup band", 12, 14, { signalByDomain: { tactical: 0.02, mental: 0.02 }, uncertaintyMultiplier: 0.98, contextTags: ["youth-cup-band"], reasons: ["National youth cup rounds add result pressure without losing route diversity."] }),
      window("cairo-school-band", "Cairo school championship band", 26, 28, { signalByDomain: { hidden: 0.02, mental: 0.02 }, uncertaintyMultiplier: 1.0, contextTags: ["school-championship-band"], reasons: ["Major-city school finals reveal pressure handling and local reputation effects."] }),
    ],
  }),
  southafrica: definePlaybook({
    countryId: "southafrica",
    notes: {
      institutions: ["School football, club pathways, and regional showcase events overlap."],
      pathways: ["Travel and regional inequality can shape who reaches major events and how prepared they look."],
      accessPoints: ["National U17 and COSAFA-linked showcase windows provide the best comparison opportunities."],
      evidenceTraps: ["Travel-heavy events can reward adaptation and athletic freshness as much as pure football quality."],
    },
    insights: [
      insight("playingStyle", "South African youth football often exposes pace, open-field actions, and transition defending, but event structure can vary widely.", "Transition-heavy matches clarify physical and recovery actions faster than full role detail.", { signalByDomain: { physical: 0.06, mental: 0.03 }, contextTags: ["open-field-transition"] }),
      insight("developmentCulture", "Because pathway support varies, route awareness matters when comparing polished academy samples to broader school or regional ones.", "Support-context knowledge improves development interpretation.", { signalByDomain: { technical: 0.04, hidden: 0.04 }, uncertaintyMultiplier: 1.02, contextTags: ["support-context-market"] }),
      insight("mentalityPattern", "The strongest mental evidence often comes in interregional travel and selection settings where players lose familiar support.", "Travel and selection stress improve mental-context reads.", { signalByDomain: { mental: 0.08, hidden: 0.04 }, contextTags: ["interregional-selection"] }),
      insight("physicalTrait", "Athletic actions show clearly, but sustained decision quality in repeated transition phases matters more than one explosive carry or chase.", "Repeat-transition context improves physical interpretation.", { signalByDomain: { physical: 0.08 }, uncertaintyMultiplier: 1.01, contextTags: ["repeat-transition-check"] }),
    ],
    calendarWindows: [
      window("u17-showcase-band", "National and COSAFA U17 band", 14, 16, { signalByDomain: { physical: 0.03, mental: 0.02 }, uncertaintyMultiplier: 1.0, contextTags: ["u17-showcase-band"], reasons: ["National U17 windows combine exposure, travel, and stronger peer-level comparison."] }),
      window("late-regional-showcase", "Late regional showcase band", 24, 32, { signalByDomain: { hidden: 0.02 }, uncertaintyMultiplier: 1.02, contextTags: ["late-regional-showcase"], reasons: ["Later showcase windows reveal adaptation and support-context differences more clearly."] }),
    ],
  }),
  senegal: definePlaybook({
    countryId: "senegal",
    notes: {
      institutions: ["Academy projects and local youth football both feed the market."],
      pathways: ["Some players arrive well-coached early; others surface through competitive local circuits."],
      accessPoints: ["Youth grassroots cups and academy-linked events produce the clearest windows."],
      evidenceTraps: ["A polished academy event can mask how the player behaves in looser weekly competition."],
    },
    insights: [
      insight("playingStyle", "Senegalese youth football often gives a scout repeated transition and duel evidence, with academy environments adding clearer structure when available.", "Transition actions are visible quickly, but structure level changes portability reads.", { signalByDomain: { physical: 0.06, technical: 0.03 }, contextTags: ["academy-vs-local-duel"] }),
      insight("developmentCulture", "Pathway quality can differ sharply, so context matters when judging how much of a clean sample belongs to the player versus the support structure.", "Support-context awareness improves development reads.", { signalByDomain: { hidden: 0.04, technical: 0.04 }, uncertaintyMultiplier: 1.01, contextTags: ["support-context-awareness"] }),
      insight("mentalityPattern", "Adaptation to structure and repeated competitive intensity tells more than one expressive attacking display.", "Competitive adaptation improves mental interpretation.", { signalByDomain: { mental: 0.08, hidden: 0.04 }, contextTags: ["competitive-adaptation"] }),
      insight("physicalTrait", "Physical edge can appear early, but repeat action quality and role discipline still decide whether it scales.", "Physical projection is stronger when repeated actions stay sharp under coaching and pressure.", { signalByDomain: { physical: 0.08 }, uncertaintyMultiplier: 1.01, contextTags: ["repeat-action-quality"] }),
    ],
    calendarWindows: [
      window("navetanes-band", "Navetanes youth band", 20, 22, { signalByDomain: { mental: 0.02, physical: 0.02 }, uncertaintyMultiplier: 1.01, contextTags: ["navetanes-band"], reasons: ["Community youth cup windows expose competitive edge and local football identity."] }),
      window("late-academy-band", "Late academy and regional band", 26, 32, { signalByDomain: { hidden: 0.02 }, uncertaintyMultiplier: 1.0, contextTags: ["late-academy-regional-band"], reasons: ["Later mixed-pathway windows help compare academy polish to broader local competition."] }),
    ],
  }),
  cameroon: definePlaybook({
    countryId: "cameroon",
    notes: {
      institutions: ["Academy pathways and local organizer competition both influence visibility."],
      pathways: ["Prospects can look very different depending on whether they arrive through structured or informal routes."],
      accessPoints: ["National youth championships and late regional events provide the key authored windows."],
      evidenceTraps: ["One big-event sample can exaggerate raw tools if the support context is much stronger than weekly football."],
    },
    insights: [
      insight("playingStyle", "Cameroonian youth environments often reveal front-foot running, transition defending, and duel actions early, while structured tactical reads depend on event quality.", "Physical-action reads come quickly; tactical certainty depends on context.", { signalByDomain: { physical: 0.06, mental: 0.03 }, contextTags: ["front-foot-transition"] }),
      insight("developmentCulture", "Support structure varies, so pathway context helps a scout separate raw upside from coached repeatability.", "Knowing the route improves development-context judgment.", { signalByDomain: { technical: 0.04, hidden: 0.04 }, uncertaintyMultiplier: 1.02, contextTags: ["pathway-support-variance"] }),
      insight("mentalityPattern", "The best mental evidence comes when a player must adapt from open local football into tighter role expectations.", "Adaptation into structure improves mentality reads.", { signalByDomain: { mental: 0.08, hidden: 0.04 }, contextTags: ["adaptation-into-structure"] }),
      insight("physicalTrait", "Physical authority can be real, but repeated decision quality under pressure matters more than one dominant carry or duel sample.", "Repeated pressure samples keep physical judgments grounded.", { signalByDomain: { physical: 0.08 }, uncertaintyMultiplier: 1.01, contextTags: ["pressure-repeatability"] }),
    ],
    calendarWindows: [
      window("youth-championship-band", "National youth championship band", 24, 26, { signalByDomain: { physical: 0.02, mental: 0.02 }, uncertaintyMultiplier: 1.0, contextTags: ["youth-championship-band"], reasons: ["National youth championship windows broaden comparison across support structures."] }),
      window("late-regional-finals", "Late regional finals band", 30, 34, { signalByDomain: { hidden: 0.02 }, uncertaintyMultiplier: 1.02, contextTags: ["late-regional-finals"], reasons: ["Late regional finals reveal how prospects respond when local expectation rises."] }),
    ],
  }),
  japan: definePlaybook({
    countryId: "japan",
    notes: {
      institutions: ["School football and club academies both carry real weight in the pathway."],
      pathways: ["The school-versus-club route matters because both can produce strong but different samples."],
      accessPoints: ["National school and youth cup windows create clean comparison bands."],
      evidenceTraps: ["Strong collective structure can hide whether creativity survives outside coached patterns."],
    },
    insights: [
      insight("playingStyle", "Japanese youth football often repeats collective movement, support play, and clean circulation, making combination timing and role discipline easy to see.", "Collective structure improves technical and tactical interpretation.", { signalByDomain: { technical: 0.06, tactical: 0.06 }, contextTags: ["collective-movement", "clean-circulation"], biasWarnings: ["Strong structure can hide whether invention survives in more chaotic football."] }),
      insight("developmentCulture", "School and club routes both matter, so pathway context helps a scout decide whether polish comes from repetition volume, coaching detail, or both.", "School-versus-club context sharpens development interpretation.", { signalByDomain: { technical: 0.06, mental: 0.05, tactical: 0.06 }, uncertaintyMultiplier: 0.94, contextTags: ["school-club-pathway"] }),
      insight("mentalityPattern", "The strongest mental evidence often comes when the player must solve unexpected chaos, not just execute in a disciplined team shape.", "Disruption response is more revealing than routine compliance.", { signalByDomain: { mental: 0.08, hidden: 0.04 }, contextTags: ["disruption-response"] }),
      insight("physicalTrait", "Collective structure can protect weaker raw power or speed, so physical projection improves when the scout checks open-field and recovery moments closely.", "Physical interpretation needs open-field verification outside the collective pattern.", { signalByDomain: { physical: 0.06 }, uncertaintyMultiplier: 1.0, contextTags: ["open-field-verification"] }),
    ],
    calendarWindows: [
      window("kanto-school-band", "Regional school and youth band", 6, 8, { signalByDomain: { tactical: 0.03, technical: 0.02 }, uncertaintyMultiplier: 0.96, contextTags: ["school-youth-band"], reasons: ["Early school and regional youth windows reveal route differences within strong structure."] }),
      window("national-youth-band", "National youth championship band", 14, 16, { signalByDomain: { technical: 0.03, mental: 0.02 }, uncertaintyMultiplier: 0.95, contextTags: ["national-youth-band"], reasons: ["National youth championships create clean, highly coached comparison samples."] }),
      window("j-youth-cup-band", "J-Youth and late cup band", 28, 30, { signalByDomain: { mental: 0.02, hidden: 0.02 }, uncertaintyMultiplier: 0.97, contextTags: ["j-youth-cup-band"], reasons: ["Late youth cup pressure helps reveal adaptation beyond routine structure."] }),
    ],
  }),
  southkorea: definePlaybook({
    countryId: "southkorea",
    notes: {
      institutions: ["School and club-linked youth systems create disciplined competitive environments."],
      pathways: ["Route context matters because school prestige and club support can shape sample quality."],
      accessPoints: ["National youth championships and city showcase cups provide the clearest windows."],
      evidenceTraps: ["Collective discipline can flatter system-fit players whose individual invention is less portable."],
    },
    insights: [
      insight("playingStyle", "South Korean youth football often produces intense running, disciplined spacing, and quick transition reactions, giving clear evidence on role execution.", "Discipline-heavy transition environments sharpen tactical and mental reads.", { signalByDomain: { tactical: 0.07, mental: 0.05 }, contextTags: ["disciplined-transition"] }),
      insight("developmentCulture", "School and club routes both build structured habits, so pathway context helps separate coached discipline from transferable creativity.", "Pathway awareness improves development interpretation.", { signalByDomain: { technical: 0.04, tactical: 0.05, hidden: 0.03 }, uncertaintyMultiplier: 0.96, contextTags: ["school-club-discipline"] }),
      insight("mentalityPattern", "The best mentality evidence often appears when the game departs from plan and the player must improvise without losing work rate or shape.", "Out-of-script moments are the best mental test in disciplined systems.", { signalByDomain: { mental: 0.08, hidden: 0.04 }, contextTags: ["out-of-script-response"] }),
      insight("physicalTrait", "High running output is common, so physical projection is strongest when the scout separates engine, recovery, and duel utility from simple effort volume.", "Running volume alone is not the same as physical ceiling.", { signalByDomain: { physical: 0.07 }, uncertaintyMultiplier: 0.99, contextTags: ["engine-vs-ceiling"] }),
    ],
    calendarWindows: [
      window("k-league-youth-band", "National youth championship band", 16, 18, { signalByDomain: { tactical: 0.03, mental: 0.02 }, uncertaintyMultiplier: 0.97, contextTags: ["national-youth-championship"], reasons: ["National youth championship windows provide disciplined, high-intensity comparison."] }),
      window("seoul-cup-band", "Seoul and metropolitan youth band", 30, 32, { signalByDomain: { hidden: 0.02 }, uncertaintyMultiplier: 0.99, contextTags: ["metropolitan-youth-band"], reasons: ["Late metropolitan cups add local pressure and denser competition."] }),
    ],
  }),
  saudiarabia: definePlaybook({
    countryId: "saudiarabia",
    notes: {
      institutions: ["Club youth leagues and school-linked football create the clearest scheduled route."],
      pathways: ["A scout needs context on club support and competition intensity to judge readiness properly."],
      accessPoints: ["Youth league finals and metropolitan club events provide the best comparison windows."],
      evidenceTraps: ["Supported club environments can make routine actions look more stable than they are in broader competition."],
    },
    insights: [
      insight("playingStyle", "Saudi youth football often offers clear wide attacks and transition patterns, but tactical sharpness can vary by club support level.", "Transition and wide-play actions are readable, but portability depends on structure.", { signalByDomain: { technical: 0.04, tactical: 0.05 }, contextTags: ["wide-transition-attack"] }),
      insight("developmentCulture", "Club support level matters heavily, so pathway awareness is important when judging polish and repeatability.", "Support-context knowledge improves development interpretation.", { signalByDomain: { hidden: 0.04, technical: 0.03 }, uncertaintyMultiplier: 1.0, contextTags: ["club-support-context"] }),
      insight("mentalityPattern", "Selection and reputation pressure often reveal more than routine league control, especially when the player has to carry expectation.", "High-visibility selection windows sharpen mentality reads.", { signalByDomain: { mental: 0.08, hidden: 0.04 }, contextTags: ["expectation-pressure"] }),
      insight("physicalTrait", "Physical reads are strongest when the scout checks repeat effort and recovery in faster transitions, not only isolated power actions.", "Repeat transition work improves physical projection.", { signalByDomain: { physical: 0.07 }, uncertaintyMultiplier: 1.0, contextTags: ["repeat-transition-work"] }),
    ],
    calendarWindows: [
      window("youth-league-finals", "Youth league finals band", 16, 18, { signalByDomain: { mental: 0.02, tactical: 0.02 }, uncertaintyMultiplier: 0.98, contextTags: ["youth-league-finals"], reasons: ["Youth league finals provide the strongest routine-versus-pressure comparison."] }),
      window("late-club-showcase", "Late club showcase band", 24, 30, { signalByDomain: { hidden: 0.02 }, uncertaintyMultiplier: 1.0, contextTags: ["late-club-showcase"], reasons: ["Late showcase fixtures reveal how players handle expectation and evaluation."] }),
    ],
  }),
  china: definePlaybook({
    countryId: "china",
    notes: {
      institutions: ["School and club development routes both matter, with event quality varying by region and support level."],
      pathways: ["Competition context is essential because support structure and repetition can differ sharply."],
      accessPoints: ["National youth super cup bands and major city school events offer the best scheduled windows."],
      evidenceTraps: ["One strong support environment can exaggerate polish relative to broader weekly competition."],
    },
    insights: [
      insight("playingStyle", "Chinese youth football can alternate between structured possession aims and abrupt transitional sequences, so context matters when reading decision speed.", "Mixed-rhythm environments reward scouts who know where structure helps or stops helping.", { signalByDomain: { tactical: 0.05, technical: 0.04 }, contextTags: ["mixed-rhythm-environment"] }),
      insight("developmentCulture", "Support structure varies by route, so knowing the player's competition density and coaching environment improves development reads.", "Competition-density context reduces pathway guesswork.", { signalByDomain: { technical: 0.04, hidden: 0.04 }, uncertaintyMultiplier: 1.01, contextTags: ["competition-density-context"] }),
      insight("mentalityPattern", "The clearest mental evidence often arrives in travel, selection, or knockout settings rather than routine controlled matches.", "Selection-pressure windows improve mental interpretation.", { signalByDomain: { mental: 0.08, hidden: 0.04 }, contextTags: ["selection-pressure-window"] }),
      insight("physicalTrait", "Physical action is easiest to trust when the sample includes repeated open transitions instead of isolated power moments.", "Open-transition verification improves physical projection.", { signalByDomain: { physical: 0.07 }, uncertaintyMultiplier: 1.0, contextTags: ["open-transition-verification"] }),
    ],
    calendarWindows: [
      window("super-cup-band", "Youth super cup band", 22, 24, { signalByDomain: { tactical: 0.02, mental: 0.02 }, uncertaintyMultiplier: 0.98, contextTags: ["super-cup-band"], reasons: ["National youth cup windows produce cleaner comparison across structured programs."] }),
      window("late-metropolitan-band", "Late metropolitan school and club band", 28, 34, { signalByDomain: { hidden: 0.02 }, uncertaintyMultiplier: 1.01, contextTags: ["late-metropolitan-band"], reasons: ["Late city-heavy events reveal how players handle stronger local visibility."] }),
    ],
  }),
  australia: definePlaybook({
    countryId: "australia",
    notes: {
      institutions: ["Academy, school, and state-level competition overlap with long-distance travel effects."],
      pathways: ["State concentration and travel load matter heavily when judging how stable a sample is."],
      accessPoints: ["National youth championships and interstate showcases create the best comparison windows."],
      evidenceTraps: ["Travel-heavy events can reward freshness and adaptation as much as pure football quality."],
    },
    insights: [
      insight("playingStyle", "Australian youth football often gives clear transition, aerial, and open-field samples, with academy contexts adding more structured possession work.", "Open-field actions are readable quickly, while tactical certainty depends on route and event level.", { signalByDomain: { physical: 0.06, tactical: 0.03 }, contextTags: ["open-field-academy-mix"] }),
      insight("developmentCulture", "Pathway context matters because state and academy support can differ in repetition quality and tactical coaching.", "State-versus-academy context improves development reads.", { signalByDomain: { technical: 0.04, hidden: 0.04 }, uncertaintyMultiplier: 1.01, contextTags: ["state-academy-context"] }),
      insight("mentalityPattern", "Travel and selection windows often reveal more than routine local football because support structures and fatigue change.", "Travel-adjusted pressure events sharpen mentality interpretation.", { signalByDomain: { mental: 0.08, hidden: 0.04 }, contextTags: ["travel-adjusted-pressure"] }),
      insight("physicalTrait", "Athletic profiles can stand out early, but repeat sprinting and recovery quality across travel-heavy schedules matter more than one explosive match.", "Travel and repeat-action context improve physical projection.", { signalByDomain: { physical: 0.08 }, uncertaintyMultiplier: 1.01, contextTags: ["repeat-sprint-travel-context"] }),
    ],
    calendarWindows: [
      window("national-youth-band", "National youth championship band", 12, 14, { signalByDomain: { physical: 0.02, mental: 0.02 }, uncertaintyMultiplier: 0.99, contextTags: ["national-youth-championship"], reasons: ["National youth championship windows create the strongest interstate comparison set."] }),
      window("interstate-showcase-band", "Interstate showcase band", 20, 28, { signalByDomain: { hidden: 0.02, tactical: 0.02 }, uncertaintyMultiplier: 1.01, contextTags: ["interstate-showcase"], reasons: ["Interstate events reveal adaptation, travel handling, and structural differences between pathways."] }),
    ],
  }),
  newzealand: definePlaybook({
    countryId: "newzealand",
    notes: {
      institutions: ["School, club, and regional representative football create the main exposure route."],
      pathways: ["Competition density and travel shape sample stability as much as club identity."],
      accessPoints: ["National youth cups and regional representative events provide the key windows."],
      evidenceTraps: ["Sparse event density can make one elite weekend look more representative than it is."],
    },
    insights: [
      insight("playingStyle", "New Zealand youth football often provides open-field transition samples, but event density means the scout must weigh opposition quality carefully.", "Transition actions are readable, but opposition calibration matters more than usual.", { signalByDomain: { physical: 0.05, mental: 0.03 }, contextTags: ["sparse-event-density"] }),
      insight("developmentCulture", "Because sample frequency can be limited, route and repetition context are critical before judging polish or upside.", "Repetition-density awareness improves development interpretation.", { signalByDomain: { technical: 0.04, hidden: 0.04 }, uncertaintyMultiplier: 1.02, contextTags: ["repetition-density-context"] }),
      insight("mentalityPattern", "Representative events often reveal the strongest mentality evidence because players leave familiar local environments and face sharper comparison.", "Representative-event pressure improves mental reads.", { signalByDomain: { mental: 0.08, hidden: 0.04 }, contextTags: ["representative-event-pressure"] }),
      insight("physicalTrait", "Physical impressions need cross-event confirmation because local dominance can come from sparse peer-level exposure.", "Cross-event comparison keeps physical projections honest.", { signalByDomain: { physical: 0.07 }, uncertaintyMultiplier: 1.02, contextTags: ["cross-event-verification"] }),
    ],
    calendarWindows: [
      window("youth-cup-band", "National youth cup band", 18, 20, { signalByDomain: { mental: 0.02, hidden: 0.02 }, uncertaintyMultiplier: 1.0, contextTags: ["national-youth-cup"], reasons: ["National youth cup windows create the clearest broad comparison in a sparse calendar."] }),
      window("representative-band", "Late representative event band", 24, 30, { signalByDomain: { physical: 0.02 }, uncertaintyMultiplier: 1.02, contextTags: ["representative-event-band"], reasons: ["Late representative events reveal adaptation outside routine local competition."] }),
    ],
  }),
});

export const FOOTBALL_CULTURE_PLAYBOOK_CATALOG = Object.freeze(
  Object.values(EXPLICIT_FOOTBALL_CULTURE_PLAYBOOKS_BY_COUNTRY),
);
