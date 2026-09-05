import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlayerPortraitFrame } from "@/components/game/PlayerPortraitFrame";
import { portraitCheckpoint } from "@/engine/players/portraits/identity";
import type { PortraitResolution } from "@/engine/players/portraits/types";

describe("age-aware photographic player presentation", () => {
  it("renders an explicit adult checkpoint without converting it back to sixteen", () => {
    const html = renderToStaticMarkup(createElement(PlayerPortraitFrame, {
      name: "Ari Prospect", size: 176,
      portrait: { status: "fallback", identityId: "person:v1:ari", checkpoint: portraitCheckpoint(35), reason: "awaiting-pack" },
    }));
    expect(html).toContain('data-portrait-age="35"');
    expect(html).toContain("AP");
    expect(html).not.toContain("<svg");
  });

  it("renders the exact assigned local age photograph with accessible name", () => {
    const portrait = { status: "available", identityId: "person:v1:ari", checkpoint: 18,
      binding: {}, asset: { path: "/images/portraits/pilot/ari/age-18.webp", age: 18 } } as PortraitResolution;
    const html = renderToStaticMarkup(createElement(PlayerPortraitFrame, { name: "Ari Prospect", portrait }));
    expect(html).toContain('src="/images/portraits/pilot/ari/age-18.webp"');
    expect(html).toContain('alt="Ari Prospect"');
    expect(html).toContain('loading="lazy"');
  });
});

