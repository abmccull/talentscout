# Installer Withdrawal And Replacement

## Status

- Download link disabled or asset removed: `Unverified`
- Replacement installer published: `Unverified`
- Replacement recovery smoke: `Unverified`

Use this runbook for GitHub or other manual installer distribution. Steam branch
actions belong in the Steam rollback runbook.

## Triggers

Withdraw the installer when any of these are true:

- installer launch fails or crashes on first-run
- installer bytes cannot be matched to one candidate manifest
- signing or Authenticode state is wrong for the intended release
- a `SEV-0` or repeated `SEV-1` affects installer users and Steam rollback does
  not cover them

## Required identity fields

Record the exact withdrawn asset and any replacement asset with:

- candidate tag
- candidate commit SHA
- original workflow run ID
- package manifest SHA-256
- installer filename
- installer byte length
- installer SHA-256
- Authenticode status
- distribution URL or release page

## Withdrawal procedure

1. Identify every public link serving the bad installer.
2. Disable the link or remove the asset from the release page.
3. Record who performed the withdrawal and when.
4. Preserve the withdrawn asset hash and provenance in the incident record.

If any public link remains live, withdrawal status is still `Unverified`.

## Replacement discipline

Replacement must be one of these only:

- a previously known-good certified installer with exact recorded provenance
- a newly built installer from a new candidate with a new tag or clearly new
  candidate identity

Never:

- overwrite an existing installer filename with different bytes and pretend it
  is the same candidate
- relabel a rebuilt installer as the withdrawn candidate
- publish a replacement without recording its SHA-256 and Authenticode result

## Recovery verification

After publishing the replacement, verify:

- the download URL serves the intended filename and byte length
- the downloaded SHA-256 matches the recorded replacement hash
- Authenticode verification passes on Windows
- clean-machine install, launch, new career, save, and reopen smoke all work
- public notes and support replies mention the new asset identity, not a vague
  "latest build"

Manual verification remains `Unverified` until a human records those results.
