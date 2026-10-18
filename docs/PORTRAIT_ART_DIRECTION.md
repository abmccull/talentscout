# Portrait art direction

## Philosophy

A footballer is a person the scout may remember for decades. Photographs should look like ordinary academy and club documentation: attentive, imperfect and credible. Human recognition matters more than beauty. No vector faces, emoji, toy-like 3D busts, glamour retouching or celebrity likenesses.

## Photographic language

Eye-level head and shoulders, mostly front-facing, quiet neutral expression, plain charcoal/forest kit without brands, softly defocused training ground, overcast natural daylight and muted color. Keep the full crown and enough shoulder context to read adolescent versus adult proportions. Preserve natural skin texture, asymmetry, ears and distinctive facial geometry. Do not brighten older skin into a different complexion.

Native delivery crops are approximately square, sometimes modestly portrait or landscape according to the generated atlas's actual cell boundaries. The first production images are roughly 217–218px wide, with individually verified heights. The image generator did not deliver the requested 3840×1920 sheet; actual sheets were 1774×887. Documentation and packing use actual dimensions. Avoid enlarging these small photographs beyond their useful resolution; prominent dossiers use approximately 144–176px, ordinary rows 48–64px.

There are no decorative circles or glowing rings. Use a small rectangular crop, a subtle selected underline, and a readable name beside it. Broad cells may crop lower shoulders for a compact list, but must not cut the crown. A headshot should never become wallpaper behind dense report text.

## Identity and age

Each row in an authored sheet contains one fictional human at 15, 18, 22, 27, 31, 35, 39 and 45. Preserve eye spacing, nose, mouth, ears, facial proportions, complexion and distinctive marks. Allow adolescent cheeks/jaw to mature, hair to change naturally and restrained lines or gray to emerge later. Fifteen-year-olds are clean-shaven with youthful proportions. Eighteen-year-olds are emerging adults. Thirty-five-year-olds should not look elderly.

Do not merely recolor one template. Vary real facial geometry, eyes, noses, hair textures, expressions, skin tones and builds independently. The photograph catalog has no nationality assignment. A position may inform a future generation brief's physical context, but it must not force body stereotypes.

The game stores one identity and one permanent lineage binding, then reads the appropriate age image. It never creates unrelated images separately for each workspace. See `PLAYER_VISUAL_IDENTITY_SYSTEM.md` for the persisted contract.

## Controlled production prompt

The offline generation prompt contains only structured artistic attributes. A representative brief is:

> Photorealistic documentary sports portrait of a fictional 15-year-old male academy footballer. Preserve the defined eye spacing, nose, mouth, ears, complexion and facial proportions throughout all age states. Natural adolescent cheeks and jaw, clean-shaven, attentive neutral expression, plain unbranded dark training kit, blurred football ground, soft overcast daylight, real skin texture, eye-level camera, full crown and head-and-shoulders framing.

At 27, preserve those same identity anchors with adult facial structure and plausible hairstyle/facial hair. At 35, add only subtle maturity. At 45, modest lines and individual hair changes are appropriate. The production manifest retains each exact original prompt, edit prompts, rejected attempts, source image hash, actual grid boundaries, reviewed anchors and editorial QA notes.

## Review and acceptance

Review the full age row and individual optimized tiles. Reject or repair an adult-looking teenager, a changed nose/eye/mouth identity, complexion drift, inconsistent ears, cropped crown, plastic skin, malformed eyes, logos or an elderly 35-year-old. Repair creative defects with the image-generation tool. Unequal grid rows alone can be handled by explicit extraction boundaries; do not pay for regeneration merely to force mathematically equal rows.

Mechanical packing extracts each actual cell, removes seam pixels and compresses to WebP quality 86 without inventing new detail. The packer decodes every output, records dimensions/hash/bytes and refuses mutations to a published lineage. Canonical references are preserved losslessly. Metadata review flags are assertions made by the production workflow, not automatic proof of realism.

## Fallback, storage and costs

A missing image uses the player's editorial initials on a quiet charcoal frame with an accessible name. It never borrows another human or returns to a cartoon. Asset loading is local, lazy and cached by the existing browser/Electron runtime. Save exports retain identity and binding metadata; custom asset packs require a companion bundle on a new machine.

There is no routine regeneration. A new offline pack expands coverage at an explicit boundary. No image is generated annually or on refresh. Generated photographs are produced during development, with actual generation usage governed by the available tool; no monetary price is assumed. Delivery size is measured from the actual WebP files and reported separately from source-atlas storage. Finite unique-face capacity remains visible in the technical coverage report.

## Delivered art review

The current pack preserves 52 authored people and eight ages per person. Six are excluded from new allocation after independent age and likeness review, leaving 46 unique photographic assignments per career. These decisions are recorded in `portraits/production-manifest.json` under `rootReview`; earlier candidate acceptance flags do not override them. Existing photographed saves retain their original face. Native delivery dimensions vary with actual atlas boundaries and are verified per file.

Use the installed workflow in `portraits/OFFLINE_TOOLS.md` for expansion. A new person requires a new lineage ID and full age-row review; file hashes alone never establish visual distinction.
