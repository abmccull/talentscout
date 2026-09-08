# Real Sentry receipt for an immutable package

Reviewed control scope: 2026-09-05. This protocol covers the production renderer's
allowlisted error envelope in `src/lib/sentry.ts`. Optional Supabase account cloud
saves and rankings remain disabled. Steam-native save queue/reconnect/conflict
tests remain required by the packaged-runtime matrix.

The release owner supplies `sentry-provider-receipt.json` in the independent
certification bundle. Do not copy a historical result, create a fictional event,
or mark this gate passed because local telemetry tests passed. Local tests only
validate this evidence contract. An authorized operator performs the actual
probe in W14 after the exact shipping packages and Sentry project exist.

1. Install a package whose kind, SHA-256, and length match the candidate manifest.
   Record the installed package, source commit/tree, intended label, manifest
   SHA-256, operator, and session time. Use a disposable career for the probe.
2. Trigger one intentional renderer exception in that installed package. Retain
   the exact decoded event JSON that was sent, without transport credentials,
   HTTP headers, DSN, save data, or added diagnostic fields. Preserve the provider's
   32-character event ID. Do not edit an unsafe event into a passing one; fix the
   sanitizer or project configuration, build a new candidate, and test again.
3. Read the event from Sentry's authenticated
   [project event endpoint](https://docs.sentry.io/api/events/retrieve-an-event-for-a-project/).
   Record HTTP 200, retrieval time, organization/project, event URL, and the exact
   response JSON. Read the matching
   [attachments endpoint](https://docs.sentry.io/api/events/list-an-events-attachments/)
   and retain its HTTP 200 response; it must be an empty array. Tokens stay outside
   the evidence bundle. The local validator never contacts Sentry itself.
4. Verify the sent event and received exception use the candidate SHA as release,
   production environment, renderer runtime, and the fixed privacy message.
   Verify no private fields, custom context, request data, breadcrumbs, or
   attachments arrived. Record four passing controls: `installedExactPackage`,
   `intentionalRendererError`, `providerEventReadBack`, `payloadPrivacyReviewed`.
5. Hash each JSON file after copying it to its final certification path. Sign
   the receipt with the accountable operator and completion timestamp. Keep any
   installation/session notes under controlled evidence storage so an independent
   reviewer can corroborate that the probe ran in the declared package.

The receipt has `schemaVersion: 1`, `evidenceKind: "sentry-provider-receipt"`,
`candidateCommitSha`, `candidateTreeSha`, `candidateTag`, `packageManifestSha256`,
`status: "Passed"`, `operator`, `completedAt`, and the four `controls`, each shaped
as `{ "status": "Passed" }`. `testedPackage` contains `kind`, `sha256`, and `bytes`
from the exact manifest entry.

`provider` contains `eventId`, `organization`, `project`, `eventApiUrl`,
`httpStatus: 200`, `retrievedAt`, `attachmentsApiUrl`, and
`attachmentsHttpStatus: 200`. The attachments URL is the event API URL followed
by `attachments/`. The API URL must belong to Sentry over HTTPS and match the
declared organization/project/event; it contains no credential, query, or fragment.

`sentEvent`, `providerEvent`, and `providerAttachments` each contain `path` and
`sha256`. Paths refer to three distinct files at their final repository-relative
locations under `artifacts/release/generated/certifications/`. The sent event is
the actual event object from the decoded envelope, not an invented test object.
No default receipt or template with passing placeholder values is supplied.

The checker rejects missing/tampered read-backs, wrong event or release,
wrong candidate/tree/label/manifest/package, non-passing operator controls,
unsafe paths, attachments, and private event data. A matching JSON file is not
cryptographic proof of provider origin: independent review of the real Sentry
record and installed-package session remains part of W14.

The [project event API](https://docs.sentry.io/api/events/retrieve-an-event-for-a-project/)
uses `lineNo`, `colNo`, and `inApp` for normalized frames. Both `stacktrace` and
any `rawStacktrace` must match every sent frame in order, including filename,
function, line, column, and application flag. An optional `absPath` must equal
the already sanitized filename. Documented frame metadata may be null/empty;
variables, source context, extra fields, local paths, and source-map expansion
are rejected. Generic mechanism type/handled metadata is permitted, with no
extra fields. This candidate sends compiled locations only; a different source
mapping policy requires a separately reviewed protocol and candidate.

Sentry's [context data model](https://develop.sentry.dev/sdk/data-model/event-payloads/contexts/)
documents server-derived OS information for JavaScript and browser name/version
context. The provider read-back may contain `contexts.browser` and `contexts.os`
with only matching `type`, a bounded name, and optional bounded version. Raw
descriptions, device identifiers, custom context keys, user data, and request
data remain rejected. The sent event still permits no contexts at all. This
allows documented safe provider normalization without accepting arbitrary
enrichment; a real W14 read-back must confirm the configured project's behavior.
