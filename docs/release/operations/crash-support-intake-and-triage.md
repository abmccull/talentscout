# Early Access Crash And Support Intake And Triage

## Status

- Human severity confirmation: `Unverified`
- Player-impact count: `Unverified`
- Public communication approval: `Unverified`

## Constraint

Candidate `6fa7297c13ad6058a2e1c157fb9541677d0195c4` has no newly-added crash
telemetry. Treat player narrative, reproducible steps, package identity, save
artifacts, and OS or Steam evidence as the primary truth for that candidate.

## Intake record

Record these fields before triage:

- incident ID
- intake owner
- decision owner
- current decision
- severity
- first report time
- distribution channel: `Steam default`, `Steam testing`, or `manual installer`
- candidate tag and commit SHA
- package manifest SHA-256
- package kind, filename, byte length, and SHA-256
- Steam build ID and branch when applicable
- platform and OS version
- player count affected: exact or `Unverified`

## Severity definitions

| Severity | Meaning | Default action |
| --- | --- | --- |
| `SEV-0` | Crash or hang on launch for most affected players, or crash with save corruption/data loss risk | Stop promotion, prepare immediate rollback or withdrawal |
| `SEV-1` | Repeatable crash on a critical path such as loading, saving, week advance, or first-hour progression | Hold branch expansion, decide rollback within the same operating window |
| `SEV-2` | Crash on a bounded feature or hardware subset with a known workaround | Keep branch state under review, patch forward unless scope grows |
| `SEV-3` | Single report or non-reproducible crash with no sign of corruption | Gather more evidence before any release action |

## Evidence to collect

Collect only what binds the report to the exact package and reproduction:

- screenshot or video of the failure
- plain-language player description of what they did immediately before the
  crash
- exact repro steps if available
- candidate tag, commit SHA, package manifest SHA-256, and package SHA-256
- Steam build ID and branch, or installer filename plus SHA-256
- save file or exported save only when the reporter consents
- OS crash evidence such as Windows Event Viewer or macOS crash report
- app logs if they exist for that machine and candidate
- whether offline mode, Steam Cloud, or a resumed save was involved

Do not collect or paste:

- Steam Guard codes, passwords, session cookies, API keys, OAuth tokens, or
  private certificates
- full account dumps when a minimal repro save or a single crash log is enough
- unredacted personal contact details beyond what support already needs

## Triage flow

1. Confirm the report is bound to one exact candidate or installer. If the
   hashes or build ID are missing, status stays `Unverified`.
2. Decide whether the issue is launch-wide, progression-blocking, save-risk, or
   bounded.
3. Attempt repro on the same package bytes. Do not rebuild under the same
   incident.
4. Check whether the last known good Steam build or installer candidate is
   already documented with full provenance.
5. Choose one decision:
   - monitor
   - hotfix forward on a new candidate
   - rollback Steam branch
   - withdraw manual installer
6. Record why the chosen path is safer than leaving the current package live.

## Rollback triggers

Trigger rollback or withdrawal when any of these are true:

- `SEV-0`
- repeated `SEV-1` on launch, save, load, or week advance
- one credible report of save corruption or unrecoverable career loss
- support cannot distinguish affected from unaffected package bytes
- reproduction succeeds on the exact live package and the previous known-good
  package is available

## Recovery verification

After rollback, withdrawal, or replacement, verify and record:

- active Steam branch or installer link now points at the intended target
- target build or installer provenance matches the recorded candidate hashes
- clean-machine launch works
- open existing save and new-career smoke both work
- no secret-bearing evidence was copied into tickets, docs, or public updates

If any verification item is missing, keep recovery status `Unverified`.
