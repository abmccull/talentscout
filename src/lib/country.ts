/**
 * Canonical country identity helpers.
 *
 * Persist country keys (for example `southkorea`) in game state and derive
 * display labels at the UI boundary. This keeps spaces, hyphens, casing, and
 * demonyms from silently splitting geography systems into incompatible maps.
 */

export const COUNTRY_DISPLAY_NAMES: Record<string, string> = {
  england: "England",
  spain: "Spain",
  germany: "Germany",
  france: "France",
  brazil: "Brazil",
  argentina: "Argentina",
  usa: "USA",
  mexico: "Mexico",
  canada: "Canada",
  nigeria: "Nigeria",
  ghana: "Ghana",
  ivorycoast: "Ivory Coast",
  egypt: "Egypt",
  southafrica: "South Africa",
  senegal: "Senegal",
  cameroon: "Cameroon",
  japan: "Japan",
  southkorea: "South Korea",
  saudiarabia: "Saudi Arabia",
  china: "China",
  australia: "Australia",
  newzealand: "New Zealand",
};

const COUNTRY_ALIASES: Record<string, string> = Object.fromEntries(
  Object.entries(COUNTRY_DISPLAY_NAMES).flatMap(([key, label]) => [
    [key, key],
    [label.toLowerCase(), key],
    [label.toLowerCase().replace(/[^a-z0-9]+/g, ""), key],
  ]),
);

const NATIONALITY_TO_COUNTRY: Record<string, string> = {
  english: "england",
  spanish: "spain",
  german: "germany",
  french: "france",
  brazilian: "brazil",
  argentine: "argentina",
  argentinian: "argentina",
  american: "usa",
  mexican: "mexico",
  canadian: "canada",
  nigerian: "nigeria",
  ghanaian: "ghana",
  ivorian: "ivorycoast",
  egyptian: "egypt",
  "south african": "southafrica",
  senegalese: "senegal",
  cameroonian: "cameroon",
  japanese: "japan",
  korean: "southkorea",
  "south korean": "southkorea",
  saudi: "saudiarabia",
  "saudi arabian": "saudiarabia",
  chinese: "china",
  australian: "australia",
  "new zealander": "newzealand",
};

/** Resolve a stored key or display label to the canonical compact key. */
export function normalizeCountryKey(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  const lower = trimmed.toLowerCase();
  const compact = lower.replace(/[^a-z0-9]+/g, "");
  return COUNTRY_ALIASES[lower] ?? COUNTRY_ALIASES[compact];
}

/** Resolve a nationality/demonym to a country key when club geography is unavailable. */
export function countryKeyFromNationality(value?: string): string | undefined {
  const lower = value?.trim().toLowerCase();
  if (!lower) return undefined;
  return NATIONALITY_TO_COUNTRY[lower] ?? normalizeCountryKey(lower);
}

export function getCountryDisplayName(country?: string): string {
  if (!country) return "Unknown";
  const key = normalizeCountryKey(country);
  if (key) return COUNTRY_DISPLAY_NAMES[key] ?? country;

  const humanized = country.replace(/([A-Z])/g, " $1").trim();
  return humanized.charAt(0).toUpperCase() + humanized.slice(1);
}
