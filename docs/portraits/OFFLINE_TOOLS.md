# Portable offline portrait tools

The installed offline pipeline consists of:

- `scripts/portrait-source-loader.cjs`
- `scripts/package-portraits.cjs`
- `scripts/verify-portrait-pack.cjs`
- `scripts/prepare-portrait-runtime.cjs`
- `src/engine/players/portraits/offline/verifyPackFiles.ts`

The offline verifier stays out of the browser-facing portrait barrel. It imports Node filesystem modules and Sharp and runs only in authoring/import tooling.

## Commands

Run from the repository root:

```powershell
node scripts/package-portraits.cjs --manifest path/to/reviewed-art/manifest.json --output artifacts/portraits/documentary-v1 --through-atlas 13
node scripts/verify-portrait-pack.cjs --pack artifacts/portraits/documentary-v1/portrait-pack.json --public artifacts/portraits/documentary-v1/public --sources artifacts/portraits/documentary-v1/sources
```

The packer and verifier also accept `--repo <repository-directory>` when invoked elsewhere. The packer requires explicit manifest, output directory, and final atlas number. `--pack-id` defaults to `documentary-v1`. Source atlas paths may be absolute or relative to the art manifest. No API key, network access, image generation, new dependency, or precompiled proposal directory is required.

After importing a reviewed full pack into `src/data/portraits/documentary-v1.json`, run `node scripts/prepare-portrait-runtime.cjs --write`. Review and include the generated `documentary-runtime.json` alongside the full manifest. Every production build runs `--check`: it strictly validates the full pack and rejects any mismatch in the derived runtime index. The runtime index retains canonical face hashes, anchors, targeting metadata, revisions, image paths, dimensions and all eight ages; only delivery-file digests stay exclusively in the full offline manifest. File verification still checks those digests against the actual WebP bytes. This keeps offline-only metadata out of the initial game download without changing saved identities or the synchronous allocation boundary.

The repository already has TypeScript and Sharp available. The source loader uses that compiler in memory to load the exact source `types`, `identity`, `catalog`, and offline-verification modules. This is execution/transpilation rather than a project-wide typecheck; the new offline module separately passed a targeted strict TypeScript check.

## Publishing behavior

1. Validate reviewed atlas metadata, exact source hashes, structured anchors, and pixel boundaries. Extract each tile with a two-pixel inset, preserve native physical dimensions, and encode WebP at quality 86.
2. Read and verify any existing pack. Existing lineage metadata, canonical source references, and delivery bytes must match exactly. Previously published people remain in the pack even when a smaller source subset is requested.
3. Build a complete sibling set in a temporary staging directory inside the explicit output root. Fully decode every staged delivery image and canonical reference, check hashes and dimensions, and validate the complete pack shape.
4. Publish immutable asset files with atomic, non-overwriting hard links on the same filesystem. Only after all referenced assets exist, atomically replace the append-only pack index. Read back and verify the published result.
5. Remove only the verified, task-owned staging directory and release the output lock. A concurrent packer is rejected. No existing portrait image is overwritten or deleted.

The explicit output directory must be on a filesystem that supports hard links, such as NTFS. A failure after some new immutable files are published leaves the old pack index intact until all files are ready; byte-identical orphan files are safe on a retry. If a process is forcibly killed, its `.portrait-pack.lock` may need operator inspection and removal before retry. The tool deliberately does not guess whether a different process's lock is stale.

The output contains `portrait-pack.json`, `public/images/portraits/<pack-id>/`, `sources/<lineage>/age-22.png`, source extraction evidence, and `file-verification.json`. The lossless age-22 PNG hash is the persisted canonical face reference. A future delivery codec cannot silently replace the already-published image bytes or face identity.

Catalog eligibility is separate from byte integrity. The runtime's root-reviewed exclusion/hold metadata must block new allocation to rejected lineages while preserving old bindings. Distinct SHA-256 values do not establish visual uniqueness. This tool never deletes or regenerates held or rejected development portraits.

## Verification

The one-atlas tool checks cover exact catalog compatibility, byte-identical repeat, refusal to replace published identity anchors, rejection of an incorrect source hash before creating output, delivery/reference verification, declared-dimension mismatch rejection, and staging/lock cleanup. Run the standalone verifier against the complete installed pack after importing any new atlas. See `../VISUAL_OVERHAUL_REPORT.md` for the final integrated validation evidence.
