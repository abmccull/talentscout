# Release Operations Runbooks

These runbooks are for operator response after a TalentScout Early Access
candidate has already been built. They do not create release proof by
themselves. Every human gate below remains `Unverified` until a real operator
completes it against the exact candidate in question.

## Exact-candidate discipline

For every crash, rollback, withdrawal, or replacement decision, record these
fields together and never mix them across runs:

- candidate tag
- candidate commit SHA
- candidate source tree SHA when available
- original workflow run ID
- package manifest SHA-256
- per-package SHA-256 and byte length
- Steam build ID and Steam branch when Steam is involved
- installer filename and Authenticode status when a manual installer is involved

Source of truth for candidate identity:

- [release-certification.md](/C:/Users/hands/OneDrive/Pictures/TalentScout/talentscout-youth-ea-release/docs/release/release-certification.md)
- [release-evidence.md](/C:/Users/hands/OneDrive/Pictures/TalentScout/talentscout-youth-ea-release/docs/release/release-evidence.md)

## Manual gates

These operational gates are always manual and start `Unverified`:

- player impact confirmed from real reports
- Steam portal branch or build switch completed
- GitHub/manual installer withdrawal completed
- recovery smoke completed on the replacement or rollback target
- external communication drafted and approved

## Runbooks

- [Early Access crash and support intake](./crash-support-intake-and-triage.md)
- [Steam rollback and branch rollback](./steam-rollback-and-branch-rollback.md)
- [Installer withdrawal and replacement](./installer-withdrawal-and-replacement.md)
