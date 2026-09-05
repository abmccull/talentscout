import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateAvatarParams } from "@/lib/avatarGenerator";

describe("youth identity", () => {
  it("renders a stylized youth mark instead of the adult bust sheet", () => {
    const file = readFileSync(join(process.cwd(), "src/components/game/YouthPortrait.tsx"), "utf8");
    expect(file).toContain("PlayerAvatar");
    expect(file).not.toContain("<Image");
    expect(file).toContain("age = 16");
  });

  it("keeps youth faces unbearded and without adult accessories", () => {
    const youth = generateAvatarParams("milo-hart", "English", 16);
    expect(youth.facialHair).toBe(0);
    expect(youth.accessory).toBe(0);
  });
});
