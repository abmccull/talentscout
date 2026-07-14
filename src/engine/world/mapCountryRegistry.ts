/**
 * Canonical country metadata for the playable world map.
 *
 * The world-map artwork is intentionally illustrative rather than a GIS map,
 * so its marker positions are calibrated to the rendered landmasses and city
 * lights. Every map consumer must use `getCountryMapPosition()` instead of
 * projecting geographic latitude/longitude independently. That keeps marker,
 * popup, route, and focus positions in lockstep.
 */

export const WORLD_MAP_VIEWBOX = {
  width: 800,
  height: 450,
} as const;

export interface CountryMapPosition {
  readonly x: number;
  readonly y: number;
}

export interface GeographicAnchor {
  /** Geographic latitude retained for future geographic layers and analytics. */
  readonly latitude: number;
  /** Geographic longitude retained for future geographic layers and analytics. */
  readonly longitude: number;
}

export type MapMarkerDensity = "compact" | "standard";

export interface CountryMapDefinition {
  readonly key: string;
  /** Player-facing name. This is the map's single label source. */
  readonly label: string;
  readonly abbreviation: string;
  /** Calibrated position in WORLD_MAP_VIEWBOX coordinates. */
  readonly position: CountryMapPosition;
  /** Real-world anchor; never use this to position the illustrated map. */
  readonly geographic: GeographicAnchor;
  /** Compact markers prevent the dense European cluster from overlapping. */
  readonly markerDensity: MapMarkerDensity;
}

function country(
  key: string,
  label: string,
  abbreviation: string,
  x: number,
  y: number,
  latitude: number,
  longitude: number,
  markerDensity: MapMarkerDensity = "standard",
): CountryMapDefinition {
  return {
    key,
    label,
    abbreviation,
    position: { x, y },
    geographic: { latitude, longitude },
    markerDensity,
  };
}

/**
 * Map coverage includes every currently data-backed country plus the legacy
 * destinations already rendered by the map. Travel eligibility is deliberately
 * determined from generated game state, not from this presentation registry.
 */
export const COUNTRY_MAP_REGISTRY: Readonly<Record<string, CountryMapDefinition>> = {
  // Europe
  england: country("england", "England", "ENG", 393, 120, 52.5, -1.5, "compact"),
  scotland: country("scotland", "Scotland", "SCO", 388, 109, 56.5, -4.0, "compact"),
  france: country("france", "France", "FRA", 399, 132, 46.6, 2.3, "compact"),
  spain: country("spain", "Spain", "ESP", 387, 146, 40.4, -3.7, "compact"),
  portugal: country("portugal", "Portugal", "POR", 379, 145, 39.4, -8.2, "compact"),
  germany: country("germany", "Germany", "GER", 411, 123, 51.2, 10.4, "compact"),
  netherlands: country("netherlands", "Netherlands", "NED", 407, 119, 52.1, 5.3, "compact"),
  belgium: country("belgium", "Belgium", "BEL", 403, 122, 50.8, 4.4, "compact"),
  switzerland: country("switzerland", "Switzerland", "SUI", 408, 128, 46.8, 8.2, "compact"),
  italy: country("italy", "Italy", "ITA", 422, 138, 41.9, 12.5, "compact"),
  turkey: country("turkey", "Turkey", "TUR", 457, 147, 39.9, 32.9, "compact"),

  // Africa
  nigeria: country("nigeria", "Nigeria", "NGA", 405, 205, 9.1, 7.5),
  ghana: country("ghana", "Ghana", "GHA", 396, 209, 7.9, -1.0),
  ivorycoast: country("ivorycoast", "Ivory Coast", "CIV", 387, 210, 7.5, -5.5),
  senegal: country("senegal", "Senegal", "SEN", 366, 195, 14.7, -17.4),
  cameroon: country("cameroon", "Cameroon", "CMR", 417, 214, 7.4, 12.4),
  egypt: country("egypt", "Egypt", "EGY", 448, 167, 30.0, 31.2),
  southafrica: country("southafrica", "South Africa", "RSA", 444, 282, -26.2, 28.0),

  // Americas
  usa: country("usa", "United States", "USA", 219, 153, 38.9, -77.0),
  canada: country("canada", "Canada", "CAN", 188, 129, 43.7, -79.4),
  mexico: country("mexico", "Mexico", "MEX", 199, 187, 19.4, -99.1),
  brazil: country("brazil", "Brazil", "BRA", 306, 258, -15.8, -47.9),
  argentina: country("argentina", "Argentina", "ARG", 265, 308, -34.6, -58.4),
  colombia: country("colombia", "Colombia", "COL", 250, 214, 4.7, -74.1),

  // Asia
  japan: country("japan", "Japan", "JPN", 676, 153, 36.2, 138.3),
  southkorea: country("southkorea", "South Korea", "KOR", 655, 151, 35.9, 127.8),
  china: country("china", "China", "CHN", 620, 166, 39.9, 116.4),
  saudiarabia: country("saudiarabia", "Saudi Arabia", "KSA", 480, 175, 24.7, 46.7),

  // Oceania
  australia: country("australia", "Australia", "AUS", 678, 275, -33.9, 151.2),
  newzealand: country("newzealand", "New Zealand", "NZL", 749, 309, -41.3, 174.8),
};

/**
 * Normalise saved/display variants without requiring UI callers to duplicate
 * country-key aliases. Values are intentionally limited to aliases that map
 * to a supported registry entry.
 */
const COUNTRY_KEY_ALIASES: Readonly<Record<string, string>> = {
  "unitedstates": "usa",
  "unitedstatesofamerica": "usa",
  "us": "usa",
  "ivorycoast": "ivorycoast",
  "ctedivoire": "ivorycoast",
  "cotedivoire": "ivorycoast",
  "southkorea": "southkorea",
  "republicofkorea": "southkorea",
  "saudiarabia": "saudiarabia",
  "southafrica": "southafrica",
  "newzealand": "newzealand",
};

function normaliseMapCountryKey(countryKey: string): string {
  return countryKey.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Resolve a country from a game key, saved key, or supported display alias. */
export function getCountryMapDefinition(countryKey: string | null | undefined): CountryMapDefinition | null {
  if (!countryKey) return null;
  const normalised = normaliseMapCountryKey(countryKey);
  const key = COUNTRY_KEY_ALIASES[normalised] ?? normalised;
  return COUNTRY_MAP_REGISTRY[key] ?? null;
}

/**
 * Canonical marker / popup / route location for a map country.
 *
 * Do not substitute a raw geographic projection here: the illustrated map has
 * deliberately calibrated marker anchors.
 */
export function getCountryMapPosition(countryKey: string | null | undefined): CountryMapPosition | null {
  return getCountryMapDefinition(countryKey)?.position ?? null;
}

export function getCountryMapLabel(countryKey: string | null | undefined): string | null {
  return getCountryMapDefinition(countryKey)?.label ?? null;
}

export function getCountryMapAbbreviation(countryKey: string | null | undefined): string | null {
  return getCountryMapDefinition(countryKey)?.abbreviation ?? null;
}

export function hasCountryMapPosition(countryKey: string | null | undefined): boolean {
  return getCountryMapPosition(countryKey) !== null;
}

export function isCompactCountryMapMarker(countryKey: string | null | undefined): boolean {
  return getCountryMapDefinition(countryKey)?.markerDensity === "compact";
}

/** Returns map countries that cannot be rendered, preserving input order. */
export function getCountriesMissingMapPositions(countryKeys: readonly string[]): string[] {
  return countryKeys.filter((countryKey) => !hasCountryMapPosition(countryKey));
}

/**
 * Geographic fallback for non-registry tools only.
 *
 * The game map must use `getCountryMapPosition`, but keeping this pure helper
 * makes projections explicit for future real-geography views rather than
 * quietly mixing them into the illustrated world map.
 */
export function projectLonLatToWorldMap(longitude: number, latitude: number): CountryMapPosition {
  return {
    x: -2 + ((longitude + 180) / 360) * 770,
    y: 8 + ((80 - latitude) / 148) * 400,
  };
}
