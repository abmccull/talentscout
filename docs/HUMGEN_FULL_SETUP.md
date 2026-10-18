# Human Generator full-content setup — 2026-09-08

## Installed and exercised

User supplied `C:/Users/hands/Downloads/Human Generator Assets/` after the commercial-license discussion and authorized using it. Installed the supplied add-on ZIP and six completed content packs through Blender's and HumGen's installers. Source archives remain unchanged. Read the supplied asset-license PDF; it describes personal and commercial tiers, not an individual purchase receipt.

Installed content: base humans, hair, clothes, poses, DPL collaboration, optional 8K textures. The optional texture download completed before archive validation began. Validated archive paths and recorded SHA256 hashes in local `artifacts/portraits/humgen-full/source-manifest.json`.

The supplied ZIP is named `HumGen3D_v4_0_29.zip`, but its own `__init__.py` reports `(4, 0, 28)`. Blender reports the same metadata; this is present in the source ZIP, not evidence that the installation silently reverted.

Content folder: `artifacts/portraits/humgen-full/content/` (ignored, local only). Preferences saved. The isolated trial content and user's open `Untitled.blend` remain preserved. No downloaded vendor code, textures or editable models are committed or included in the game bundle.

## Repeatable review workflow

`tools/blender/humgen_portrait_review.py` builds six isolated scenes through the official `Human.from_preset`, `age.set(24)`, and outfit APIs. It retains stock face proportions, eye/skin/hair materials, and selected-preset hairstyles. It sets consistent neutral studio lighting and fits cameras relative to each character's eyes.

From Blender with HumGen enabled and `tools/blender` on the Python path, call `humgen_portrait_review.start(absolute_new_output_directory)`. The batch records failures explicitly and refuses existing portrait receipts/scenes. Each completed render is saved as a PNG and an isolated packed Blender library with hashes and scene-name read-back. These are six review presets, not a production identity generator.

The first review batch is `artifacts/portraits/humgen-full/review-v1/`. Run `node tools/blender/export_humgen_review.cjs` from this checkout to verify source image hashes, encode 320 × 400 WebP review images, and rebuild the local gallery. This exporter targets that first review batch deliberately.

## Verification and measured size

- Six of six rendered successfully at 640 × 800, Cycles 48 samples.
- Six packed editable scenes saved and their expected scene entries verified.
- Inspected the actual full-size initial portraits and all six images in the rendered gallery: distinct facial silhouettes and hairstyles, no trial watermarks or clipped hair. Some skin highlights remain glossy.
- WebP review exports at quality 85: 5,260–7,112 bytes each; 36,220 bytes total (about 6 KB average). This is a six-image sample at 320 × 400, not a final large-library budget or a full-size quality comparison.
- Desktop gallery loads all six images. Mobile width 390 px has no horizontal overflow. Screenshots saved with the batch.
- Python compilation and Git whitespace validation passed. No application runtime behavior changed.

Gallery: http://127.0.0.1:3197/humgen-full-review.html

## Next implementation criteria

1. Define stable HumGen recipes derived from permanent player appearance IDs; persist the recipe/version so appearances survive reloads and renderer changes.
2. Use bounded vendor controls for facial variation instead of custom vertex deformation. Validate varied head shapes and skin/hair/eye combinations across the game's population. Vendor category names are asset metadata, not sufficient rules for assigning nationality or ancestry.
3. Show the same identity at multiple ages, especially youth recruitment ages, while preserving recognizable features.
4. Compare full-size and compressed portraits at actual in-game sizes before fixing the export budget.
5. Wire the resulting assets into the existing portrait path with stable identity assignment and explicit fallback handling. Do not replace a large world with these six repeating samples.
6. Separately validate generation throughput, duplicate similarity, aging storage and the shipping asset-license requirements before mass generation or runtime generator distribution.
