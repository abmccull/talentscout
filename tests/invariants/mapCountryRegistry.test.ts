import { describe, expect, it } from "vitest";
import { getAvailableCountries } from "@/data/index";
import {
  COUNTRY_MAP_REGISTRY,
  WORLD_MAP_VIEWBOX,
  getCountriesMissingMapPositions,
  getCountryMapDefinition,
  getCountryMapLabel,
  getCountryMapPosition,
  projectLonLatToWorldMap,
} from "@/engine/world/mapCountryRegistry";

describe("country map registry", () => {
  it("covers every currently data-backed country with a labelled in-bounds position", () => {
    const availableCountries = getAvailableCountries();

    expect(getCountriesMissingMapPositions(availableCountries)).toEqual([]);

    for (const countryKey of availableCountries) {
      const definition = getCountryMapDefinition(countryKey);
      const position = getCountryMapPosition(countryKey);

      expect(definition).not.toBeNull();
      expect(position).not.toBeNull();
      expect(definition?.label.trim().length).toBeGreaterThan(0);
      expect(definition?.abbreviation).toMatch(/^[A-Z]{3}$/);
      expect(position?.x).toBeGreaterThanOrEqual(0);
      expect(position?.x).toBeLessThanOrEqual(WORLD_MAP_VIEWBOX.width);
      expect(position?.y).toBeGreaterThanOrEqual(0);
      expect(position?.y).toBeLessThanOrEqual(WORLD_MAP_VIEWBOX.height);
    }
  });

  it("normalises supported saved and display variants to the same canonical country", () => {
    expect(getCountryMapDefinition("Ivory Coast")).toBe(COUNTRY_MAP_REGISTRY.ivorycoast);
    expect(getCountryMapDefinition("Cote d'Ivoire")).toBe(COUNTRY_MAP_REGISTRY.ivorycoast);
    expect(getCountryMapDefinition("Côte d'Ivoire")).toBe(COUNTRY_MAP_REGISTRY.ivorycoast);
    expect(getCountryMapDefinition("United States")).toBe(COUNTRY_MAP_REGISTRY.usa);
    expect(getCountryMapDefinition("South-Korea")).toBe(COUNTRY_MAP_REGISTRY.southkorea);
    expect(getCountryMapLabel("new zealand")).toBe("New Zealand");
  });

  it("keeps the illustrated-map anchor canonical rather than silently re-projecting it", () => {
    const england = getCountryMapDefinition("england");
    expect(england).not.toBeNull();
    if (!england) return;

    const canonical = getCountryMapPosition("england");
    const geographicProjection = projectLonLatToWorldMap(
      england.geographic.longitude,
      england.geographic.latitude,
    );

    expect(canonical).toEqual(england.position);
    expect(geographicProjection).not.toEqual(canonical);
  });

  it("fails safely for countries outside the current registry", () => {
    expect(getCountryMapDefinition("atlantis")).toBeNull();
    expect(getCountryMapPosition("atlantis")).toBeNull();
    expect(getCountriesMissingMapPositions(["england", "atlantis", "spain"])).toEqual([
      "atlantis",
    ]);
  });
});
