import { describe, expect, it } from "vitest";

import {
  ALL_POSITIONS as allPositionsFromBarrel,
  ATTRIBUTE_DOMAINS as attributeDomainsFromBarrel,
} from "@/engine/core/types";
import {
  ALL_POSITIONS as allPositionsFromLeaf,
  ATTRIBUTE_DOMAINS as attributeDomainsFromLeaf,
} from "@/engine/core/types/player";

describe("core types compatibility barrel", () => {
  it("re-exports the canonical player constants from the leaf module", () => {
    expect(attributeDomainsFromBarrel).toBe(attributeDomainsFromLeaf);
    expect(allPositionsFromBarrel).toBe(allPositionsFromLeaf);
    expect(attributeDomainsFromBarrel.firstTouch).toBe("technical");
    expect(allPositionsFromBarrel).toContain("GK");
  });
});
