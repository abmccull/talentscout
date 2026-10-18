# HumGen pre-rendered portrait integration

The user selected a pre-rendered library on September 8, 2026. Blender is an authoring dependency only. The game receives WebP images, never the vendor's models, textures, add-on code or saved Blender scenes.

## Runtime behavior

`bundled-packs.json` lists versioned source packs and allocation priorities. The checked-in compact runtime index is generated from these strictly validated sources. HumGen priority 100 precedes legacy documentary priority 0 for new reservations. Existing bindings remain immutable, so loading a saved career cannot replace a recognizable face. Legacy portraits remain available for saved bindings and as inventory after the current HumGen batch is exhausted.

All `PlayerAvatar` surfaces already share the portrait resolver. Age checkpoints remain 15, 18, 22, 27, 31, 35, 39 and 45. The runtime selects the latest checkpoint no older than the requested age, including historical `atAge` views. Player visuals consume no football randomness. Image load failure cannot change allocation.

Retired or pruned players retain permanent face reservations. Exhaustion produces the existing initials fallback, never modulo selection or face recycling. A pre-rendered library is finite: integration does not establish sufficient inventory for a 30-year career.

## Authoring and expansion

1. Install licensed HumGen content locally; retain its source manifest and hashes outside the shipping assets.
2. In Blender, add `tools/blender` to the Python module path and call `humgen_production.start(absolute_output_directory, count=12, first=0)`. The output directory's parent must contain the source-manifest.json. Each versioned batch pins source hashes, identity range, eight ages, resolution and samples. It resumes matching completed receipts and rejects conflicts or corrupt render bytes.
3. Review representative ages and likeness across the batch before importing. The initial v1 facial offsets proved too subtle for repeated presets. The importer therefore holds repeated base presets within a batch; those outputs remain in the authoring folder with an exclusion report. This is a conservative initial QA rule, not a sufficient long-term perceptual-uniqueness algorithm.
4. Import a completed batch: `npm run portraits:package:humgen -- --source artifacts/portraits/humgen-full/production-v1 --pack humgen-v1`. PNG receipts, fixed recipe consistency and image dimensions are checked before output. Published bytes cannot be overwritten with different data.
5. For another pack, use a new pack name/output range, review it against existing people, add its source to bundled-packs.json, then run `npm run portraits:index` and `npm run portraits:verify`. Keep all previously published packs available.

The first importer exports 320 × 400 WebP at quality 90. It holds every person until all eight distinct age images exist. Source PNGs, production receipts and exact recipes stay local; public image hashes and dimensions live in the full pack manifest. Production builds verify both the compact index and every bundled image's bytes, dimensions and decoding.

## Tests and limits

The integration tests cover HumGen preference, all age checkpoints, serialized reservation restoration, old-save binding preservation, exhausted inventory, pruning and later catalog expansion. Python tests cover 20,000 distinct recipes, version fingerprints and invalid-input rejection. Unique recipes are not proof of visibly distinct people.

Further mass production needs stronger calibrated facial variation and cross-pack likeness review. The initial batch establishes a working game integration; it is not the thousands of portraits needed for a long career. No database migration, player-side Blender installation or image-generation API is required.

## Executed verification — September 8, 2026

- Rendered all 96 requested images. Published 8 accepted people × 8 ages = 64 images, 534,332 bytes total. Four repeated-preset candidates were held; their exclusion report remains with the source batch.
- Completed batch resume verified all 96 hashes without changing any PNG modification timestamp. Re-running the importer verified identical published bytes and canonical references.
- TypeScript check passed. All 27 tests across eight portrait integration/persistence suites passed. All 16 Python tests passed.
- Compact index and decoded image verification passed for both packs: 60 total catalog entries and 480 images, including held legacy entries retained for saved bindings. The asset-provenance audit reports zero untracked assets or blockers.
- In an isolated browser context at `http://127.0.0.1:3185/play`, a new career player received `humgen-v1-00001`. The profile loaded its age-27 image. Save/JSON reload preserved the exact binding and image path. No page errors, failed portrait requests or mobile horizontal overflow.
- Inspected actual desktop and mobile screenshots in `artifacts/portraits/humgen-game/`; the portrait appears in the player dossier at both widths.
- This is a local implementation in the portrait checkout. No production deployment, installer build or multi-decade art-inventory acceptance is claimed.
