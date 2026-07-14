import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";

import { ENGLAND_DATA } from "@/data/england";
import { getAvailableCountries, getCountryData } from "@/data";
import { validateCountryData } from "@/lib/modLoader";

function validCountry() {
  return {
    key: "testland",
    name: "Testland",
    leagues: [
      {
        id: "testland-first",
        name: "Testland First Division",
        shortName: "TFD",
        tier: 1,
        clubs: [
          {
            id: "testland-city",
            name: "Testland City",
            shortName: "TST",
            reputation: 55,
            scoutingPhilosophy: "academyFirst",
            youthAcademyRating: 12,
            budget: 5_000_000,
          },
        ],
      },
    ],
    nativeNamePool: {
      firstNames: ["Ari"],
      lastNames: ["Vale"],
    },
    foreignNamePools: {
      neighbour: {
        firstNames: ["Mika"],
        lastNames: ["Reed"],
      },
    },
    nationalitiesByTier: {
      1: [{ nationality: "Testland", weight: 1 }],
    },
  };
}

describe("custom country-data import boundary", () => {
  it("accepts a complete bounded country package", () => {
    expect(validateCountryData(validCountry(), "testland")).toBe(true);
    expect(validateCountryData(ENGLAND_DATA, "england")).toBe(true);
  });

  it("accepts every shipped country package that players can export and re-import", async () => {
    for (const key of getAvailableCountries()) {
      const country = await getCountryData(key);
      expect(validateCountryData(country, key), key).toBe(true);
    }
  });

  it("rejects a mismatched outer key and incomplete name pools", () => {
    const country = validCountry();
    expect(validateCountryData(country, "lookalike")).toBe(false);
    expect(validateCountryData({
      ...country,
      nativeNamePool: {},
    }, "testland")).toBe(false);
  });

  it("rejects non-finite balance values and unknown philosophies", () => {
    const country = validCountry();
    expect(validateCountryData({
      ...country,
      leagues: [{
        ...country.leagues[0],
        clubs: [{ ...country.leagues[0].clubs[0], budget: Number.POSITIVE_INFINITY }],
      }],
    }, "testland")).toBe(false);
    expect(validateCountryData({
      ...country,
      leagues: [{
        ...country.leagues[0],
        clubs: [{ ...country.leagues[0].clubs[0], scoutingPhilosophy: "alwaysWins" }],
      }],
    }, "testland")).toBe(false);
  });

  it("rejects duplicate identifiers that would orphan world references", () => {
    const country = validCountry();
    const club = country.leagues[0].clubs[0];
    expect(validateCountryData({
      ...country,
      leagues: [{
        ...country.leagues[0],
        clubs: [club, { ...club }],
      }],
    }, "testland")).toBe(false);
  });
});
