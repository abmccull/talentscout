# TalentScout numeric precision guard

This is a private, reviewed derivative of sprintf-js 1.1.3 under its original
BSD-3-Clause license. It addresses GHSA-hp3w-g68c-fv3c without replacing
global-agent or changing proxy routing, credentials, TLS, retries or timeouts.

Exactly three argument guards are inserted in both distributed formatter
entry points. Numeric `e` and `f` precision is capped at 100; `g` precision is
bounded to 1..100. Valid precision strings pass through unchanged. The original
receiver, formatter parser/cache, other conversions, and error behavior remain.
Invalid numeric precision produces a bounded representation instead of throwing
an uncaught RangeError. No claim is made that arbitrary untrusted format strings
are safe; original width limits, syntax errors and type errors are unchanged.

The source map preserves all original mappings and names and adds mappings for
the inserted guards. `SOURCE-MAP-VALIDATION.json` records the inverse checks;
`UPSTREAM.json` records upstream and derivative hashes. The tarball contains the
11 original package members (four changed); these adjacent review documents are
not archive members. Its SHA-256 is:

`a8e35066b51fd67b699529fb6155d91d0ea2a82ae451f5477144d29d658d6fe4`

Run `npm run test:sprintf-precision-guard` after `npm ci` with the pinned npm
11.21.0 toolchain. The gate executes the full upstream corpus, both public APIs
and source/minified entries across the unchanged precision catalog, actual
asynchronous child calls, and the installed Roarr consumer. Scanner results are
additional evidence; the private package name alone is not remediation proof.
