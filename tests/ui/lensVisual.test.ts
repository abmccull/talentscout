import { describe, expect, it } from "vitest";
import { LENS_KEYS, LENS_VISUAL, lensShapeClass } from "@/components/game/observation/lensVisual";

describe("lens dual-coding", () => {
  it("gives every lens a unique shape and a token class, not a hue name", () => {
    const shapes = LENS_KEYS.map((lens) => LENS_VISUAL[lens].shape);
    expect(new Set(shapes).size).toBe(LENS_KEYS.length);

    for (const lens of LENS_KEYS) {
      const visual = LENS_VISUAL[lens];
      expect(visual.label.length).toBeGreaterThan(0);
      expect(visual.className).not.toMatch(/text-(blue|orange|purple|yellow|red|emerald)-/);
      expect(lensShapeClass(visual.shape).length).toBeGreaterThan(0);
    }

    expect(LENS_VISUAL.general.className).toBe("signal-general");
    expect(LENS_VISUAL.mental.shape).toBe("plus");
  });
});
