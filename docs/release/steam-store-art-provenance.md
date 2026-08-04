# Steam store art provenance

Generation date: August 4, 2026

This evidence covers the TalentScout Early Access Steam capsule, hero, library, logo, and rendered-game screenshot set. The superseded unbranded `steam-capsule.png` and `steam-hero.png` placeholders were removed so they cannot be selected for a public store slot.

## Generation process

Two source masters were generated with OpenAI's built-in image-generation tool, then resized and composed with project-authored SVG typography by `scripts/generate-steam-store-art.mjs` using Sharp 0.35.3. The final images contain the project name, the descriptive subtitle, and an Early Access label only where the Steam asset format permits text.

The normalized wide-master prompt intent was: a cinematic, premium football scouting scene viewed from the touchline in rain at night; an anonymous scout in silhouette with a notebook; floodlit fictional stadium, restrained emerald accents, realistic editorial key art, wide crop-safe composition, no words, logos, real clubs, sponsors, famous people, or recognizable trademarks.

The normalized portrait-master prompt intent was: a cinematic portrait-format football scouting scene with an anonymous scout and notebook above a rain-soaked fictional pitch; premium realistic editorial key art, strong negative space for project typography, restrained emerald accents, no words, logos, real clubs, sponsors, famous people, or recognizable trademarks.

The source prompts above are normalized records of the generation intent. Final text and geometry are deterministic project-authored overlays in the checked-in generator.

## Source master hashes

| Master | SHA-256 |
| --- | --- |
| Wide source master | `ad833fdbcc9a818b79cf3640f76a9523f08b72fda5d725224d2d2a656c88464f` |
| Portrait source master | `c80b36440e09917e8085804a9628eda17d18de3c0c6a7284de26bf69c64d5735` |

## Final output hashes

| Asset | Dimensions | SHA-256 |
| --- | --- | --- |
| `steam-header-capsule.png` | 460x215 | `da4d5b8748b3ae7a829d9160b3d766e2251902a2d446fa403a95052b251a47c9` |
| `steam-library-capsule-v2.png` | 600x900 | `bbde5295b7f6d699147047c01b402947d74242211d0929a6f334657a381a4dbd` |
| `steam-library-hero.png` | 3840x1240 | `725640c40a097befd5c20f590b82ca322c27a1d01979a935d0243f3a6fb7ec81` |
| `steam-logo-transparent.png` | 1280x720 RGBA | `03ccb8565872b501f74ee10e8d4829d9bf36a9b9753955f0d25038d98dde1791` |
| `steam-main-capsule.png` | 616x353 | `d5e680537beca9927dc5eff2b19003b793f0e65be90bd9f4d15bab973d86d774` |
| `steam-page-background.png` | 1438x810 | `05ea5db649485bf75b94027903000131534afd6b326d812af832682be92c6684` |
| `steam-small-capsule.png` | 231x87 | `278b776f5eb775a42512840d04b6c4b0cd5afeb73bea333b5d79e77b02430f01` |
| `steam-store-hero-v2.png` | 3840x1240 | `7b7f78cc0d2d4e0303a588a6a1aa45c2fe3a3c376aac0beeb9c09e4486ec8347` |

## Review record

- The people and venue are fictional and non-identifiable.
- No real club crest, sponsor mark, player likeness, third-party character, or visible trademark was found in the final outputs.
- The project title and subtitle overlays are project-authored.
- The transparent logo is generated entirely by project-authored SVG markup.
- Rendered screenshots are project-authored game UI and fictional simulation data; their exact paths and dimensions are enforced by `scripts/validate-steam-store-assets.mjs`.

Evidence class: generator record, cryptographic inventory, and project visual review. This is not an independent legal opinion.
