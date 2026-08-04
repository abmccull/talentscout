# Steam Rollback And Branch Rollback

## Status

- Steam portal action completed: `Unverified`
- Recovery smoke on rollback target: `Unverified`
- Player communication approved: `Unverified`

Use this runbook when a Steam build already exists and the safest action is to
move a branch back to a previously known-good build. This does not authorize a
rebuild under the same candidate identity.

## Required provenance

Before touching Steam branches, identify both the current bad build and the
rollback target with:

- candidate tag
- candidate commit SHA
- candidate source tree SHA when available
- original workflow run ID
- package manifest SHA-256
- Steam build ID
- target Steam branch: `testing` or `default`

If any of those are missing for the rollback target, stop and keep status
`Unverified`.

## Triggers

Rollback is usually justified when:

- a `SEV-0` crash exists on the current Steam branch
- a `SEV-1` crash is reproducible on a critical path
- the build on `default` is worse than the last known-good build on `testing`
- the active build cannot be tied back to one exact candidate package set

## Decision fields

Record:

- incident ID
- rollback owner
- approval owner
- current branch affected
- rollback target branch or build
- decision time
- reason for rollback

## Procedure

1. Open Steamworks Build Manager for App `4455570`.
2. Identify the current live build on the affected branch.
3. Identify the previous known-good build with matching candidate provenance.
4. For `testing` rollback:
   - set the known-good build live on `testing`
   - leave `default` unchanged unless separately approved
5. For `default` rollback:
   - set the known-good build live on `default`
   - if a safer build is only on `testing`, promote that exact known-good build
     rather than uploading new bytes
6. Record the resulting Steam build ID, branch, operator, and timestamp.

Do not:

- upload a fresh depot as part of a rollback unless the decision has changed to
  replacement or hotfix
- reuse a candidate tag for different bytes
- treat a portal click as verified until a clean client installs the changed
  branch

## Recovery verification

Verify on a clean Steam client account or machine when possible:

- the branch now resolves to the intended Steam build ID
- install completes from Steam without a manual file swap
- launch reaches the main menu
- new career and existing save smoke both work
- no new secret-bearing screenshots or logs were stored in public channels

Keep all verification rows `Unverified` until a human records the result.
