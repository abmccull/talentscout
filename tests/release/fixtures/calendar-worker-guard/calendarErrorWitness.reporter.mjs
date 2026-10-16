import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Read the installed public reported-task API, rather than JSON reporter counts.
// A serialization/API/write error leaves no valid witness and fails observation.
export default class CalendarErrorWitness {
  onTestRunEnd(testModules, unhandledErrors, reason) {
    assert(Array.isArray(testModules) && Array.isArray(unhandledErrors));
    assert(['passed', 'failed', 'interrupted'].includes(reason));
    const directory = process.env.CALENDAR_E2E_DIRECTORY;
    const caseId = process.env.CALENDAR_E2E_CASE;
    assert(directory && isAbsolute(directory) && resolve(directory) === directory);
    assert(['C00', 'D01', 'F01', 'A01', 'A02'].includes(caseId));
    const errors = entity => {
      const actual = entity.errors(); assert(Array.isArray(actual)); return actual;
    };
    const modules = testModules.map(module => {
      assert.equal(module.type, 'module');
      const suites = [...module.children.allSuites()].map(suite => {
        assert.equal(suite.type, 'suite');
        return { type: suite.type, name: suite.name, fullName: suite.fullName,
          state: suite.state(), errors: errors(suite) };
      });
      const tests = [...module.children.allTests()].map(test => {
        assert.equal(test.type, 'test');
        const result = test.result();
        assert(result && typeof result === 'object');
        assert(result.errors === undefined || Array.isArray(result.errors));
        return { type: test.type, name: test.name, fullName: test.fullName,
          state: result.state, errorsWereUndefined: result.errors === undefined,
          errors: result.errors === undefined ? [] : result.errors };
      });
      return { type: module.type, moduleId: module.moduleId, relativeModuleId: module.relativeModuleId,
        state: module.state(), errors: errors(module), suites, tests };
    });
    const witness = { schemaVersion: 1, event: 'onTestRunEnd', case: caseId,
      pid: process.pid, directory, reporter: fileURLToPath(import.meta.url),
      reason, unhandledErrors, modules };
    writeFileSync(join(directory, 'run-end-errors.json'), JSON.stringify(witness, null, 2) + '\n', { flag: 'wx' });
  }
}
