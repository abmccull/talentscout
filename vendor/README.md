# Reviewed local dependencies

The root `braces` file dependency and `$braces` override select the private
`@talentscout/braces-depth-guard@3.0.3-ts.2` archive in this directory. Use the
repository's pinned npm 11.21.0 toolchain. The readable `braces-depth-guard/`
directory contains the exact twelve files in that archive; the archive is the
installation input.

Archive SHA-256:
`71fdb5731ab2d66bf9242886ea0a58f4e6ebad8f689e468105fb6ff2a78b54de`.

This retains Braces 3.0.3's MIT license and upstream attribution. `UPSTREAM.json`
records its exact upstream/archive identities and the pre-implementation
regression corpora. The patch adds an inclusive internal nesting limit of 100
and bounds recursive AST/parent traversal. It preserves the public API and
ordinary option behavior. It does not bound range expansion, total output or
arbitrary JavaScript callbacks/objects.

Before adoption, all 108 frozen compatibility cases passed in normal and
512 KiB stack configurations: 432 fresh child executions, 216 paired
assertions, and real Micromatch/Next ESLint integrations. The exact artifact
was also used in an offline npm 11 lockfile experiment that preserved all
969 package entries. These local results do not establish release readiness
or remediate unrelated dependency findings.

Do not replace this with an upstream master snapshot, change its identity to
hide scanner findings, or regenerate the tarball without reviewing its source,
retaining the original license/provenance, and rerunning compatibility checks.

## HTTP cache policy

The root `http-cache-semantics` file dependency and matching override select the
private `@talentscout/http-cache-policy@4.3.0-ts.1` archive. The readable
`http-cache-policy/` directory retains its four package files and separate
`UPSTREAM.json` provenance. The archive is the installation input; its SHA-256 is
`c006ee20e7141ddf901d4afc71c2cf7642f1f5ba8f0ab625ee7b61f7cd6476ec`.

This derivative retains the complete published 4.3.0 package, BSD-2-Clause
license and attribution. Three guards enforce required revalidation and request
variant matching before stale fallback. Fresh/private/cache compatibility and
upstream freshness arithmetic and 304 merging remain. Conservative precedence
over optional stale-if-error is the declared local policy; additional protocol
variants are outside the bounded acceptance.

Before integration, all 16 frozen cases passed for both baseline and candidate
through real Got/Cacheable-request/Keyv consumers: 32 outcomes, with complete
isolated graph and actual process/socket/descriptor closure evidence. The
installed-consumer gate `npm run test:http-cache-policy` covers all 16 cases plus
two separately identified fresh direct API controls and retains JSON artifacts.
These local checks do not establish remote CI, platform or release readiness.
