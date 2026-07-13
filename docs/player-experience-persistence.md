# Player experience persistence

TalentScout treats tutorial completion and permanent tutorial dismissal as
player experience, not as a property of one scout career.

The versioned `PlayerExperienceRecord` is cached locally under
`talentscout_player_experience` and embedded in save-envelope schema 4. Saving
therefore carries the record to IndexedDB and, when enabled, the same Steam
Cloud or authenticated Supabase save slot. Loading any of those copies merges
the record into the local profile and updates the live tutorial store.

The merge is intentionally monotonic: completion or dismissal on either side
wins. An old career save cannot make an experienced player repeat onboarding.
Released `talentscout_tutorial` data is migrated into the new record on first
read, so existing players keep their choice.

Version 2 also keeps the three most recent veteran-prologue template IDs. The
history is unique, bounded, and merged oldest-to-newest using record timestamps,
so generated career openings can avoid recently seen structures across devices.

## Current remote-sync boundary

The application does not currently have a standalone cross-device profile
endpoint or a dedicated Steam Remote Storage profile file. Experience follows
the player when a save slot is uploaded and subsequently loaded on the other
device. It does not sync before the first cloud-save load on a fresh install.
Adding instant account-wide preference sync requires a separately authenticated
profile service (or a reserved Steam profile file) with its own conflict and
deletion policy; the save envelope is ready to seed that future service.
