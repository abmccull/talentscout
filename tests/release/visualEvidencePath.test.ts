import { describe, expect, it } from "vitest";

import { buildVisualEvidenceProvenance } from "../../e2e/helpers/releaseEvidencePath";

describe("visual evidence provenance paths", () => {
  it("uses a stable candidate slug for a clean checkout", () => {
    const provenance = buildVisualEvidenceProvenance({
      commitSha: "0123456789abcdef0123456789abcdef01234567",
      baseTreeSha: "89abcdef0123456789abcdef0123456789abcdef",
      dirty: false,
      dirtyFingerprint: null,
    });

    expect(provenance.slug).toBe("candidate-0123456789ab");
    expect(provenance.dirtyFingerprint).toBeNull();
  });

  it("marks dirty evidence with the base tree and fingerprint", () => {
    const provenance = buildVisualEvidenceProvenance({
      commitSha: "fedcba9876543210fedcba9876543210fedcba98",
      baseTreeSha: "76543210fedcba9876543210fedcba9876543210",
      dirty: true,
      dirtyFingerprint: "abc123def456",
    });

    expect(provenance.slug).toBe(
      "head-fedcba987654__base-tree-76543210fedc__dirty-abc123def456",
    );
  });
});
