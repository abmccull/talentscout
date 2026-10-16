# Reviewed Braces depth guard

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
