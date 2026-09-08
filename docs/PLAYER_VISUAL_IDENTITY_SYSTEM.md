# Player visual identity system

## The person is permanent

Every newly generated `Player` receives `visualIdentity: { version: 1, identityId, seed }`. The identity includes the entire player ID, rather than treating a short hash as a unique identifier. The versioned seed derives a controlled generation brief without using or advancing football simulation randomness. Names, nationality, team, page, season and catalog size do not determine identity.

Existing saves receive the same compact identities through `applyGameplaySaveMigrations`. Active players, unsigned-youth nested player records and retired players are normalized through a common migration. Placement, development, promotion and retirement preserve the Player identity. This is an additive optional field in the existing game-state save; it needs no database table or destructive schema migration.

## A photograph has one owner

`GameState.playerPortraits` stores a versioned reservation ledger. A reservation records player ID, identity, first-seen season/week and actual age, visibility reason, the known player name and an optional photographic binding. Names remain available in Alumni and retrospective views after the full football record is pruned; missing legacy names are backfilled only from an authoritative retained Player. `faceOwners` reserves the canonical face hash permanently, including after retirement and full-record pruning. A person appearing in history never lends their face to a newly generated teenager.

Before a person has a photograph, their seed produces **pending generation DNA**. When an authored catalog face is first adopted, that face's reviewed anchors become authoritative and are frozen in the binding. The system does not pretend a procedural nose/eye description exactly matches an unrelated catalog photograph. A future identity-targeted generation pack must match the exported identity/seed and pending anchors exactly. An existing photographic binding cannot be replaced by that process.

Reviewed anchors cover skin tone, face/eye/nose/mouth/jaw structure, eye color, hair color/texture, baseline hairline, facial-hair tendency, build, distinctive feature and camera angle. Detailed artistic descriptions remain in the production manifest. Nationality does not determine appearance; ethnicity is not guessed from nationality.

## Visibility and persistence

Allocation occurs synchronously at existing domain boundaries: opening assignment, selection of a player, watchlist addition, report opening, observation-session start and the live commit of a completed week. The observation boundary can reserve a transient simulated youth without prematurely committing the football simulation. Successful match focus and accepted staff leads also reserve visible people. Existing autosave paths persist the same ledger.

Detached save migrations validate and preserve the ledger and normalize identity fields without allocating faces. Live `loadGame` allocates known legacy people once and queues persistence of that exact ledger. Loading or inspecting a detached save therefore cannot create a photograph that the active career never received.

The headless weekly worker never allocates photographs. Its commit preserves the latest live ledger before allocating newly known players. A worker result is accepted across an intervening portrait-only state change; any other football state change still rejects the stale result. This prevents selecting a player from either discarding healthy simulation output or allowing stale football state to overwrite current play.

Rendering is pure. `PlayerAvatar` and `YouthPortrait` resolve the canonical active/retired/unsigned player, then its persisted binding. They do not allocate, generate, change DNA or call a provider. Refreshing a page, opening a dossier or loading an image never changes a face. An explicit selection may allocate a previously unseen person once; it never reallocates a known person.

## Aging and recorded history

The bundled age checkpoints are **15, 18, 22, 27, 31, 35, 39 and 45**. Display uses the latest checkpoint at or before the actual age; under-18 players use the adolescent state. The 45 image remains the oldest available state. A birthday only changes the pure checkpoint choice when a boundary is crossed. All eight photographs are authored and reviewed together; no annual generation is needed.

Historical views pass `atAge`. Current views use the canonical player's age. There is no conversion of adults back to age 16. Historical dates and ages must come from a recorded snapshot or the first-photo reservation; a discovery date without a discovery age is not permission to invent a younger portrait. A retired or pruned player stops at their last recorded age, rather than automatically aging with the active world.

Age transitions alter facial maturity, hair and subtle skin detail while retaining facial identity. A 35-year-old remains a mature athlete, not an elderly person. Same-person realism is an editorial image-review requirement; filenames, hashes and tests cannot establish it alone.

## Catalog, storage and caching

The full verified pack is `src/data/portraits/documentary-v1.json`. Assets live under `public/images/portraits/documentary-v1/<lineage>/age-<checkpoint>.webp`. The browser imports `documentary-runtime.json`, a generated projection that preserves every identity anchor, canonical reference hash, revision, age path and dimension while omitting per-image file digests used only by offline verification. `prepare-portrait-runtime.cjs --check` validates the full source pack and exact projection before every build; `--write` explicitly regenerates the index after a reviewed pack update. Pack IDs, lineage IDs, revision and canonical reference hashes are immutable. Paths are local and constrained; remote URLs, traversal, unsupported metadata and incomplete age sets are rejected.

Each image has a byte hash and decoded dimensions. The production packer preserves a lossless age-22 tile hash as the canonical source reference, independently of the optimized delivery encoding. It rejects changes to published anchors and assets. The manifest and files must travel together. Standard local/browser asset caching is sufficient; images load lazily with asynchronous decoding. Save files contain bindings and identity data rather than image bytes.

There are no client API keys, provider SDKs, background network jobs, cloud-account requirements or gameplay image-generation charges. A future provider is an **offline producer** of the same validated pack contract. Swapping a generator cannot silently change a published human identity.

## Failure and finite capacity

If a pack is absent, an age image fails or all unique lineages are used, show a restrained editorial initials frame. Never substitute another player's face, wrap an index around the catalog or return to cartoon avatars. A failed image can recover on a subsequent image mount; the saved binding remains intact.

`portraitCoverage` reports people, seen identities, photographed people, awaiting-pack people and permanent reservations. `exportPortraitRequests` produces controlled, deduplicated briefs for waiting people. It includes no arbitrary player notes, dialogue or game text. `allocateWaitingPortraits` fills waiting reservations at an explicit pack-install boundary and leaves bound people unchanged.

The simulation may generate roughly 6,200–7,900 professionals before youth. A pack with N lineages supports at most N distinct photographed people in one career. Every other generated player still has a persistent identity. Finite offline pack coverage is a real limitation, not a claim of individually photographed world coverage. Exact delivered capacity and bytes belong in `VISUAL_OVERHAUL_REPORT.md`.

## Validation

Unit and integration checks cover deterministic generation without RNG consumption, first binding, distinct ages, catalog reorder/expansion, exhaustion without recycling, malformed/duplicate assets, legacy active/unsigned/retired migration, selection autosave, ownership after pruning, and portrait reservations during an actual asynchronous weekly commit. The permanent portrait ledger belongs to shared career state alongside reports and watchlists; ownership partition tests enforce that classification.

Rendered checks have verified identity across observation, profile, reporting, comparison and history. The save-aging harness closed Chromium completely, reopened its persistent profile and resumed through the actual Continue action: the full portrait ledger and Week-2 report were unchanged. An exact age-35 asset failure displayed editorial initials; restoration recovered the same photograph without rebinding. Explicit synthetic retirement/pruning fixtures retained the original display name and last recorded age 27. These are lifecycle presentation and persistence checks, not a claim of having played a twenty-year career. Visual review checked all 13 atlas sheets for teen/adult/veteran plausibility and continuity; six lineages remain excluded from new allocation.
