# Formatter compatibility fixtures

`upstream-test.js` and `upstream-test-validation.js` are unchanged copies of
`test/test.js` and `test/test_validation.js` from alexei/sprintf.js commit
`3a0d8c26d291b5bd9f1974877ecc50739921d6f5`, the npm 1.1.3 gitHead.
The upstream BSD-3-Clause license is retained in `LICENSE`.

Sources:

- https://github.com/alexei/sprintf.js/blob/3a0d8c26d291b5bd9f1974877ecc50739921d6f5/test/test.js
- https://github.com/alexei/sprintf.js/blob/3a0d8c26d291b5bd9f1974877ecc50739921d6f5/test/test_validation.js

The Node E2E harness executes their original assertions in the current realm
with the actual installed readable and minified formatter entry points. Only
the test runner bindings and module selector are supplied by the harness.

`cases.json` is the immutable 32-row pre-candidate catalog prepared on
16 October 2026. Its baseline and guarded outcomes are both retained, together
with the four asynchronous crash cases and seven actual Roarr consumer cases.
The baseline can be rechecked against an upstream installation by setting
`TALENTSCOUT_SPRINTF_EXPECT=baseline` and `TALENTSCOUT_SPRINTF_MODULE_ROOT` to
its node_modules directory. Normal CI uses the installed guarded leaf.
