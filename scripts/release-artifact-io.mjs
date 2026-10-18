// Proposed production artifact boundary. No native lifetime or campaign certification is implied.
import { open, lstat, rename } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { types } from 'node:util';

const CANONICAL_SHA = '193f139435344eb680c868385483a62dca0fca27732e206ae93ed50ef94f47e5';
const PROCESS_KEY = Symbol.for('TalentScout.release-artifact-io.v1.193f1394');
const SHA = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const NORMAL_CODES = new Set(['ENOENT', 'EACCES', 'EPERM', 'EBUSY']);
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) freeze(value[key]);
    Object.freeze(value);
  }
  return value;
}
function fact(error) {
  const get = key => error && typeof error === 'object' && !types.isProxy(error)
    ? Object.getOwnPropertyDescriptor(error, key)?.value : undefined;
  const fields = ['name', 'code', 'message', 'stack'];
  const values = Object.fromEntries(fields.map(key => [key, typeof get(key) === 'string' ? get(key) : null]));
  if (values.name === null && types.isNativeError(error)) {
    const proto = Object.getPrototypeOf(error);
    if ([Error.prototype, TypeError.prototype, RangeError.prototype, SyntaxError.prototype, ReferenceError.prototype,
      URIError.prototype, EvalError.prototype, AggregateError.prototype].includes(proto))
      values.name = Object.getOwnPropertyDescriptor(proto, 'name')?.value ?? 'Error';
  }
  const originalLengths = Object.fromEntries(fields.map(key => [key, values[key] === null ? null : values[key].length]));
  const text = key => values[key] === null ? null : values[key].slice(0, 4096);
  return freeze({ name: text('name') ?? 'Error', code: text('code'), message: text('message') ?? 'Unclassified failure', stack: text('stack'),
    originalLengths, truncated: fields.some(key => values[key] !== null && values[key].length > 4096) });
}
function refusal(code, role, message, details = {}) {
  const error = new Error(message);
  error.name = 'ReleaseArtifactError';
  Object.assign(error, { code, role, ...details });
  Object.defineProperty(error, 'stack', { value: String(error.stack), writable: false, configurable: false, enumerable: false });
  return Object.freeze(error);
}
function requireDomain(condition, role, message) {
  if (!condition) throw refusal('ERR_RELEASE_ARTIFACT_DOMAIN', role, message);
}
function record(value) {
  requireDomain(value !== null && typeof value === 'object' && !Array.isArray(value) && !types.isProxy(value), null, 'Plain own-data record required');
  const proto = Object.getPrototypeOf(value);
  requireDomain(proto === Object.prototype || proto === null, null, 'Custom prototype refused');
  return value;
}
function own(value, key) {
  const descriptor = Object.getOwnPropertyDescriptor(record(value), key);
  requireDomain(!descriptor || 'value' in descriptor, null, 'Accessor refused');
  return descriptor?.value;
}
function keys(value, maximum) {
  record(value);
  const result = [];
  for (const key in value) if (Object.hasOwn(value, key)) {
    requireDomain(result.length < maximum, null, 'Own-key admission exceeded');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    requireDomain(descriptor && 'value' in descriptor, null, 'Accessor refused');
    result.push(key);
  }
  return result;
}
function exact(value, names) {
  const actual = keys(value, names.length + 1);
  requireDomain(actual.length === names.length && names.every(name => actual.includes(name)), null, 'Unexpected record fields');
}
const positive = value => Number.isSafeInteger(value) && value > 0;
const seedText = value => String(value).padStart(2, '0');
const seedName = value => 'release-soak-' + seedText(value);
function canonicalPath(value, maximum = 2048) {
  requireDomain(typeof value === 'string' && value.length <= maximum && Buffer.byteLength(value) <= maximum
    && isAbsolute(value) && resolve(value) === value && !/[\u0000-\u001f\u007f-\u009f]/u.test(value), null, 'Canonical bounded path required');
  if (process.platform === 'win32') requireDomain(!value.split(/[\\/]/).slice(1)
    .some(part => part.endsWith(' ') || part.endsWith('.') || part.includes(':')), null, 'Windows path alias refused');
  return value;
}
function observation() { return { attempted: false, returned: false, error: null }; }
function stats(value) {
  return { dev: String(value.dev), ino: String(value.ino), mode: String(value.mode), nlink: String(value.nlink),
    size: String(value.size), mtimeNs: String(value.mtimeNs), ctimeNs: String(value.ctimeNs), birthtimeNs: String(value.birthtimeNs) };
}
function stable(a, b) { return Object.keys(a).every(key => a[key] === b[key]); }
function common(pathSnapshot, descriptorSnapshot) {
  return ['ino', 'mode', 'nlink', 'size', 'mtimeNs'].every(key => pathSnapshot[key] === descriptorSnapshot[key])
    && (pathSnapshot.dev === descriptorSnapshot.dev || process.platform === 'win32' && pathSnapshot.dev === '0');
}
function regular(value) { return value.isFile() && !value.isSymbolicLink() && value.nlink === 1n; }
async function closeOnce(handle, result, retained, uncertain = null) {
  result.attempted = true;
  try { await handle.close(); result.returned = true; retained.delete(handle); }
  catch (error) { uncertain?.add(handle); result.error = fact(error); throw error; }
}
async function boundedBody(path, ceiling, expectedSha256, retained, onSize = () => {}, onRead = () => {}, readChunkBytes = 65536, onFailure = () => {}, uncertain = null) {
  const seen = { pathBefore: null, fdBefore: null, fdAfter: null, pathAfter: null, bytesRead: 0, readOperations: 0,
    overflowBytes: 0, close: observation(), firstError: null, secondaryErrors: [] };
  let handle = null, primary = null, failed = false, body = null, digest = null;
  try {
    const before = await lstat(path, { bigint: true }); seen.pathBefore = stats(before);
    requireDomain(regular(before), null, 'Ordinary input required');
    handle = await open(path, constants.O_RDONLY); retained.add(handle);
    const opened = await handle.stat({ bigint: true }); seen.fdBefore = stats(opened);
    if (!regular(opened) || !common(seen.pathBefore, seen.fdBefore))
      throw refusal('ERR_RELEASE_ARTIFACT_READ_CONSISTENCY', null, 'Descriptor/path identity differs');
    const observed = opened.size;
    onSize(observed);
    if (observed < 0n || observed > BigInt(ceiling) || observed > BigInt(Number.MAX_SAFE_INTEGER))
      throw refusal('ERR_RELEASE_ARTIFACT_READ_SIZE', null, 'Descriptor body exceeds allowance',
        { admittedFileBytes: ceiling, observedFileBytes: observed <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(observed) : null,
          observedFileBytesDecimal: String(observed) });
    body = Buffer.alloc(Number(observed)); let offset = 0;
    while (offset < body.length) {
      const requested = Math.min(readChunkBytes, body.length - offset);
      const returned = await handle.read(body, offset, requested, offset);
      seen.readOperations++; const count = returned.bytesRead;
      if (!Number.isSafeInteger(count) || count < 0 || count > requested)
        throw refusal('ERR_RELEASE_ARTIFACT_READ_CONSISTENCY', null, 'Invalid actual read count');
      seen.bytesRead += count; onRead(count);
      if (count === 0) break;
      offset += count;
    }
    const overflow = Buffer.alloc(1); const extra = await handle.read(overflow, 0, 1, offset);
    seen.readOperations++; seen.overflowBytes = extra.bytesRead;
    if (!Number.isSafeInteger(extra.bytesRead) || extra.bytesRead < 0 || extra.bytesRead > 1)
      throw refusal('ERR_RELEASE_ARTIFACT_READ_CONSISTENCY', null, 'Invalid overflow read count');
    onRead(extra.bytesRead);
    if (offset !== body.length || extra.bytesRead !== 0)
      throw refusal('ERR_RELEASE_ARTIFACT_READ_CONSISTENCY', null, 'Body grew or truncated during bounded read');
    const ended = await handle.stat({ bigint: true }); seen.fdAfter = stats(ended);
    const after = await lstat(path, { bigint: true }); seen.pathAfter = stats(after);
    if (!regular(ended) || !regular(after) || !stable(seen.fdBefore, seen.fdAfter) || !stable(seen.pathBefore, seen.pathAfter)
      || !common(seen.pathAfter, seen.fdAfter))
      throw refusal('ERR_RELEASE_ARTIFACT_READ_CONSISTENCY', null, 'Input changed during bounded read');
    digest = createHash('sha256').update(body).digest('hex');
    if (expectedSha256 !== null && digest !== expectedSha256)
      throw refusal('ERR_RELEASE_ARTIFACT_READ_CONSISTENCY', null, 'Same-buffer SHA mismatch');
  } catch (error) { failed = true; primary = error; seen.firstError = fact(error); onFailure(error); }
  finally {
    if (handle) try { await closeOnce(handle, seen.close, retained, uncertain); } catch (error) {
      seen.secondaryErrors.push(fact(error));
      const closeFailure = refusal('ERR_RELEASE_ARTIFACT_READ_CONSISTENCY', null, 'Actual descriptor close failed',
        { originalError: seen.firstError, closeError: fact(error) });
      if (!failed || NORMAL_CODES.has(primary?.code)) primary = closeFailure;
      failed = true;
      onFailure(closeFailure);
    }
  }
  if (failed) { const wrapped = new Error(primary?.message ?? 'Bounded read failed', { cause: primary }); Object.assign(wrapped, primary);
    wrapped.name = primary?.name ?? 'Error'; wrapped.code = primary?.code ?? null; wrapped.descriptorAndClose = freeze(seen);
    if (primary?.stack) Object.defineProperty(wrapped, 'stack', { value: primary.stack, writable: false, configurable: false, enumerable: false });
    throw Object.freeze(wrapped); }
  return { body, sha256: digest, descriptorAndClose: freeze(seen) };
}


const CANONICAL = freeze({
  "schemaVersion": 1,
  "profileId": "canonical-career-artifact-io-v1",
  "readyForImplementation": false,
  "limitNature": "Proposed evidence admission policy plus explicitly identified source-derived cardinalities; no healthy-size sample or physical reservation claim",
  "campaign": {
    "maxPrimarySeeds": 20,
    "maxSeasons": 30,
    "maxConcurrency": 8,
    "weeksPerSeason": 46,
    "maxTicksPerCareer": 1380,
    "maxActualWorkerPhases": 21,
    "requiredCertification": {"primarySeeds": 20, "seasons": 30, "concurrency": 3, "freshReplaySeed": 1, "resume": false, "reuse": false},
    "smallerProfilesCertifyOriginalCampaign": false
  },
  "unchangedGameBudgets": {
    "batchCpuMs": 45000, "batchWallMs": 60000,
    "oldSpaceMiB": 1440, "semiSpaceMiB": 32, "exposeGc": true,
    "actualV8AndRetainedHeapBytes": 1610612736, "rssBytes": 2147483648,
    "postGcHeapGrowthBytes": 1073741824, "saveBytes": 83886080,
    "growthMultiplier": 64, "collectionBudgetsChanged": false,
    "vitestTestTimeoutMs": 18000000, "hookTimeoutMs": 120000,
    "vitestMaxWorkers": 1, "externalNativeOrJobLifetimeChanged": false
  },
  "relay": {"independent": true, "defaultMaxOutputBytes": 67108864, "existingConfigurationAndIdentityContractChanged": false},
  "representation": {
    "scope": "Direct artifact writer receipt/summary domain; not generic package/asset graph shape validation",
    "maxDepth": 16, "maxOwnEnumerableStringKeysPerObject": 256,
    "maxArrayLength": 1382, "maxEncodedPropertyNameBytes": 768,
    "maxPropertyNameUtf8Bytes": 128, "maxOrdinaryScalarStringUtf8Bytes": 4096,
    "maxSeedUtf8Bytes": 64, "maxFingerprintIdUtf8Bytes": 128,
    "maxFingerprintTitleUtf8Bytes": 1024,
    "maxCanonicalPathUtf8Bytes": 2048, "pathControlCharactersAllowed": false,
    "maxEncodedFiniteNumberBytes": 64,
    "maxRunVisitedOccurrences": 4096, "maxWorkerVisitedOccurrences": 16384,
    "maxCampaignVisitedOccurrences": 131072,
    "maxEncodedRunBytesAtActualIndent": 1048576,
    "encoderChunkBytes": 65536, "maxEncoderRetainedPayloadBytes": 33554432,
    "wholeStringifyOrBufferConcatAllowed": false,
    "ordinaryJsonFormattingPreserved": true, "sharedDagAllowed": true,
    "cyclesAccessorsCustomToJsonOrCustomPrototypesAllowed": false
  },
  "writers": {
    "progress": {"rowBytes": 16384, "rowsPerWorker": 1382, "fileBytesPerWorker": 22642688, "filesPerCampaign": 21, "cumulativeBytesAllPhases": 475496448},
    "workerTemporaryResult": {"payloadBytes": 4194304, "writesPerPhase": 1, "phases": 21, "cumulativeBytes": 88080384},
    "workerCanonicalResult": {"payloadBytes": 4194304, "writesPerPhase": 1, "phases": 21, "cumulativeBytes": 88080384},
    "checkpoint": {"payloadBytes": 65536, "normalPromotions": 42, "cumulativeNormalBytes": 2752512, "reservedFailurePromotions": 1},
    "campaignSummary": {"payloadBytes": 33554432, "normalPromotions": 1},
    "singleSeedShardSummary": {"payloadBytes": 4194304, "normalPromotions": 1},
    "normalDriverAtomicAttempts": 64,
    "normalDriverCumulativeBytes": 124387328,
    "normalTotalDirectProducerOperations": 29107,
    "normalTotalDirectProducerBytes": 687964160,
    "campaignNormalLogicalBytesCeiling": 1073741824,
    "retryAfterFailedWriteOrPromotion": false,
    "temporaryFilesExclusive": true, "priorCanonicalTargetUnlinkedForFallback": false,
    "failedOrRemovedPayloadRefunded": false
  },
  "failureReserve": {
    "workerReceiptBytes": 262144, "workerReceipts": 21,
    "checkpointReceiptBytes": 65536, "checkpointReceipts": 1,
    "campaignReceiptBytes": 65536, "campaignReceipts": 1,
    "cumulativeBytes": 5636096, "cumulativeOperations": 23,
    "encodedMessagePrefixBytes": 32768, "encodedTailPrefixBytesEach": 32768,
    "nameAndCodeUtf8BytesEach": 128, "budgetDomainSeparate": true,
    "firstFailurePreserved": true, "truncationReported": true,
    "diagnosticPublicationGuaranteedOnDiskFailure": false
  },
  "readers": {
    "profileConfigurationBytes": 65536, "configurationReadsPerProcess": 1,
    "workerFileBytes": 4194304, "workerReadsPerCampaignIncludingResumeDiagnostic": 41,
    "workerCumulativeBytesIncludingResumeDiagnostic": 171966464,
    "workerReadInflight": 2, "readChunkBytes": 65536,
    "shardFileBytes": 4194304, "shardJsonFiles": 20,
    "shardCumulativeBytes": 83886080, "shardReadInflight": 1,
    "directoryEntriesAllKinds": 256, "directoriesIncludingRoot": 64, "directoryDepth": 4,
    "sourceRunReceiptBytes": 262144, "sourceJobsReceiptBytes": 2097152,
    "sourceJobRows": 256, "stagedAggregateBytes": 33554432,
    "stagingCumulativeReadBytes": 35913728,
    "checkerStatusBytes": 1048576, "checkerPackageJsonBytes": 262144,
    "checkerPackageManifestBytes": 8388608, "checkerReplayabilityBytes": 4194304,
    "checkerReleaseExceptionBytes": 4194304, "checkerCoreEvidenceBytes": 8388608,
    "checkerSourceExceptionJsonBytes": 8388608,
    "checkerOtherSupportedJsonBodyBytes": 8388608,
    "checkerSoakEvidenceBytes": 33554432,
    "checkerJsonReadOperations": 128, "checkerCumulativeJsonReadBytes": 268435456,
    "checkerGateRows": 64,
    "unrestrictedReadFileAfterPathStatAllowed": false,
    "fullBodyReadOrDecodeBeforeDescriptorSizeAdmission": false,
    "changedOrNonOrdinaryInputAccepted": false,
    "readOrEnumerationAllowanceResetPerDirectory": false
  },
  "staging": {"aggregateWriteBytes": 33554432, "acceptedEnvelopeRewriteBytes": 33554432, "exclusiveSiblingStagingPreserved": true, "previousAcceptedArtifactPreservedOnFailure": true},
  "checkerReport": {"payloadBytes": 33554432, "writes": 1, "readbackBytes": 33554432, "maxDepth": 32, "maxArrayLength": 16384, "maxVisitedOccurrences": 262144, "maxScalarStringUtf8Bytes": 32768, "existingOwnedOutputAndRawHashChecksPreserved": true, "otherAssetOrPackageBinaryReadsChanged": false},
  "consumerAdmission": {"soakEvidenceReadBytes": 33554432, "currentCampaignFailureReceiptReadBytes": 65536, "validatorOwnsArtifactAdmissionFailures": true, "explicitCurrentArtifactResourceOrTransportFailureWaivable": false, "pureMissingOrUnreadableOrdinaryArtifactLegacyExceptionBehaviorPreserved": true, "profileIdentityAndExpectedCampaignContextRequired": true, "oldOrLowerDiagnosticProfileCertifiesCurrentCampaign": false},
  "optionalModes": {"sharedDiagnosticCheckpointSupported": false, "chooserOnlyMatrixSupported": false, "refuseBeforeFirstStartNewGameOrSpawn": true, "noSilentUnmeteredFallback": true},
  "physicalReservationAccepted": false,
  "nativeOrHardIoLifetimeAccepted": false,
  "serializationPeakRssAccepted": false,
  "fullCareerAccepted": false,
  "releaseAccepted": false
});

function profileCheck(value, purpose) {
  record(value);
  const stack = [[value, CANONICAL, '']];
  while (stack.length) {
    const [actual, expected, route] = stack.pop();
    if (typeof expected === 'object' && expected !== null) {
      exact(actual, Object.keys(expected));
      for (const key of Object.keys(expected)) stack.push([own(actual, key), expected[key], route ? route + '.' + key : key]);
    } else if (route === 'profileId') {
      requireDomain(typeof actual === 'string' && actual.length > 0 && (purpose === 'canonical'
        ? actual === expected : actual !== expected), 'configuration', 'Profile identity differs');
    } else if (typeof expected === 'number') {
      const fixed = route === 'schemaVersion' || route.startsWith('unchangedGameBudgets.')
        || route.startsWith('relay.') || route.startsWith('campaign.requiredCertification.');
      requireDomain(positive(actual) && (purpose === 'canonical' || fixed ? actual === expected : actual <= expected),
        'configuration', 'Invalid or expanded numeric profile leaf: ' + route);
    } else requireDomain(actual === expected, 'configuration', 'Profile schema/fixed metadata differs: ' + route);
  }
  return freeze(value);
}
function requestedProfile(options) {
  const names = ['SOAK_ARTIFACT_PROFILE_PATH', 'SOAK_ARTIFACT_PROFILE_SHA256', 'SOAK_ARTIFACT_PROFILE_PURPOSE'];
  const present = names.some(name => process.env[name] !== undefined);
  let request;
  if (options !== undefined) { exact(options, ['path', 'sha256', 'purpose']);
    request = { path: own(options, 'path'), sha256: own(options, 'sha256'), purpose: own(options, 'purpose') }; }
  if (present) {
    requireDomain(names.every(name => typeof process.env[name] === 'string' && process.env[name].length > 0),
      'configuration', 'All three profile overrides are required');
    const environment = { path: process.env[names[0]], sha256: process.env[names[1]], purpose: process.env[names[2]] };
    requireDomain(!request || Object.keys(environment).every(key => environment[key] === request[key]),
      'configuration', 'Explicit and environment profile bindings differ');
    request = environment;
  }
  request ??= { path: fileURLToPath(new URL('./release-artifact-io-profile.json', import.meta.url)),
    sha256: CANONICAL_SHA, purpose: 'canonical' };
  canonicalPath(request.path);
  requireDomain(typeof request.sha256 === 'string' && SHA.test(request.sha256) && ['canonical', 'diagnostic'].includes(request.purpose),
    'configuration', 'Invalid profile hash/purpose');
  if (request.purpose === 'canonical') requireDomain(request.sha256 === CANONICAL_SHA, 'configuration', 'Canonical hash differs');
  return freeze(request);
}
function phaseCheck(phase) {
  if (phase === null) return null;
  exact(phase, ['workerRunId', 'phase', 'seedIndex', 'driverPid', 'vitestPid', 'workerPid']);
  const result = Object.fromEntries(['workerRunId', 'phase', 'seedIndex', 'driverPid', 'vitestPid', 'workerPid'].map(key => [key, own(phase, key)]));
  requireDomain(typeof result.workerRunId === 'string' && UUID.test(result.workerRunId) && ['run', 'determinism-replay'].includes(result.phase)
    && positive(result.seedIndex) && positive(result.driverPid) && positive(result.vitestPid)
    && result.workerPid === process.pid && result.vitestPid === process.ppid, null, 'Actual immutable worker phase required');
  return freeze(result);
}
function makeProcessState() {
  let selected = null, pending = null, loaded = null, configurationFailure = null, context = null, contextKey = null;
  const retained = new Set();
  const poison = error => { configurationFailure ??= error; return configurationFailure; };
  return Object.freeze({
    version: CANONICAL_SHA,
    load(request) {
      request = requestedProfile(request); // Defend the shared global capability as well as the exported entry point.
      if (configurationFailure) return Promise.reject(configurationFailure);
      if (selected && !['path', 'sha256', 'purpose'].every(key => selected[key] === request[key]))
        return Promise.reject(poison(refusal('ERR_RELEASE_ARTIFACT_DOMAIN', 'configuration', 'One selected profile per actual process')));
      if (pending) return pending;
      selected = request; // Consume the single configuration read BEFORE any awaited I/O.
      pending = (async () => {
        try {
          const actual = await boundedBody(request.path, CANONICAL.readers.profileConfigurationBytes, request.sha256, retained);
          requireDomain(request.purpose !== 'canonical' || actual.body.length === 6565, 'configuration', 'Canonical byte count differs');
          const value = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(actual.body));
          const profile = profileCheck(value, request.purpose);
          loaded = Object.freeze({ profile, sha256: actual.sha256, bytes: actual.body.length,
            purpose: request.purpose, path: request.path, descriptorAndClose: actual.descriptorAndClose });
          return loaded;
        } catch (error) { throw poison(error); }
      })();
      return pending;
    },
    context(options) {
      if (configurationFailure) throw configurationFailure;
      exact(options, ['loadedProfile', 'domain', 'phase', 'evidenceClassification']);
      requireDomain(loaded !== null && own(options, 'loadedProfile') === loaded, null, 'Opaque loaded profile required');
      const domain = own(options, 'domain'), classification = own(options, 'evidenceClassification');
      requireDomain(['driver', 'worker', 'aggregate', 'staging', 'checker', 'helper-parity'].includes(domain)
        && ['canonical', 'diagnostic-fixture'].includes(classification), null, 'Context domain/classification differs');
      const phase = phaseCheck(own(options, 'phase'));
      requireDomain(domain === 'worker' || phase === null, null, 'This domain cannot own a private worker phase');
      requireDomain(domain !== 'helper-parity' || (loaded.purpose === 'diagnostic' && phase === null && classification === 'diagnostic-fixture'),
        null, 'Minimal helper parity is diagnostic only');
      requireDomain(loaded.purpose !== 'diagnostic' || classification === 'diagnostic-fixture', null, 'Diagnostic profile cannot certify');
      requireDomain(domain !== 'worker' || phase !== null || classification === 'diagnostic-fixture', null, 'Direct worker output is supporting only');
      const key = [domain, classification, phase?.workerRunId ?? '', phase?.phase ?? '', phase?.seedIndex ?? '',
        phase?.driverPid ?? '', phase?.vitestPid ?? '', phase?.workerPid ?? ''].join('|');
      requireDomain(context === null || contextKey === key, null, 'One nonreset artifact context per actual process');
      if (context === null) { contextKey = key; context = makeContext(loaded, domain, phase, classification, () => configurationFailure); }
      return context;
    }
  });
}
let processState = globalThis[PROCESS_KEY];
if (processState === undefined) {
  processState = makeProcessState();
  Object.defineProperty(globalThis, PROCESS_KEY, { value: processState, writable: false, configurable: false });
}
requireDomain(processState.version === CANONICAL_SHA && Object.isFrozen(processState), 'configuration', 'Process profile state conflicts');
export function loadArtifactProfile(options) { return processState.load(requestedProfile(options)); }
export function createArtifactContext(options) { return processState.context(options); }

function stringPolicy(key, spec, profile) {
  const r = profile.representation;
  if (spec.reserve && ['message', 'failure', 'stdoutTail', 'stderrTail'].includes(key)) {
    const encoded = /Tail$/.test(key) ? profile.failureReserve.encodedTailPrefixBytesEach : profile.failureReserve.encodedMessagePrefixBytes;
    return { raw: Math.max(r.maxOrdinaryScalarStringUtf8Bytes, encoded), encoded };
  }
  if (spec.reserve && /(?:name|code)$/i.test(key)) return { raw: profile.failureReserve.nameAndCodeUtf8BytesEach };
  if (/path|output|directory|cwd|root$/i.test(key)) return { raw: r.maxCanonicalPathUtf8Bytes, path: true };
  if (key === 'seed') return { raw: r.maxSeedUtf8Bytes };
  if (/fingerprintId$/i.test(key)) return { raw: r.maxFingerprintIdUtf8Bytes };
  if (/fingerprintTitle$/i.test(key)) return { raw: r.maxFingerprintTitleUtf8Bytes };
  return { raw: spec.report ? profile.checkerReport.maxScalarStringUtf8Bytes : r.maxOrdinaryScalarStringUtf8Bytes };
}
function encodeBody(value, spec, profile, pretty, terminalNewline) {
  const r = profile.representation, report = profile.checkerReport;
  const cap = Math.min(spec.cap, r.maxEncoderRetainedPayloadBytes);
  const chunkSize = Math.min(r.encoderChunkBytes, cap);
  const chunks = [], ancestors = new Set(), runs = [];
  let current = null, used = 0, bytes = 0, visited = 0;
  const fail = message => { throw refusal('ERR_RELEASE_ARTIFACT_SERIALIZATION_LIMIT', spec.role, message); };
  function byte(value) {
    if (bytes >= cap || runs.some(run => bytes - run.start >= r.maxEncodedRunBytesAtActualIndent)) fail('Encoded byte allowance exceeded');
    if (current === null || used === current.length) {
      if (current) chunks.push(current);
      current = Buffer.allocUnsafe(Math.min(chunkSize, cap - bytes)); used = 0;
    }
    current[used++] = value; bytes++;
  }
  function ascii(text) { for (let i = 0; i < text.length; i++) byte(text.charCodeAt(i)); }
  function codepoint(code) {
    if (code < 0x80) byte(code);
    else if (code < 0x800) { byte(0xc0 | code >> 6); byte(0x80 | code & 63); }
    else if (code < 0x10000) { byte(0xe0 | code >> 12); byte(0x80 | code >> 6 & 63); byte(0x80 | code & 63); }
    else { byte(0xf0 | code >> 18); byte(0x80 | code >> 12 & 63); byte(0x80 | code >> 6 & 63); byte(0x80 | code & 63); }
  }
  function text(value, policy) {
    if (value.length > policy.raw) fail('Scalar length exceeds admission');
    let rawBytes = 0;
    for (let i = 0; i < value.length; i++) {
      const n = value.charCodeAt(i);
      if (n >= 0xd800 && n <= 0xdbff && i + 1 < value.length && value.charCodeAt(i + 1) >= 0xdc00 && value.charCodeAt(i + 1) <= 0xdfff) { rawBytes += 4; i++; }
      else rawBytes += n < 0x80 ? 1 : n < 0x800 ? 2 : 3;
      if (rawBytes > policy.raw) fail('UTF8 scalar admission exceeded');
    }
    if (policy.path && /[\u0000-\u001f\u007f-\u009f]/u.test(value)) fail('Path control character refused');
    const start = bytes; byte(34);
    for (let i = 0; i < value.length; i++) {
      let n = value.charCodeAt(i);
      if (n === 34 || n === 92) { byte(92); byte(n); }
      else if ([8, 9, 10, 12, 13].includes(n)) ascii({ 8: '\\b', 9: '\\t', 10: '\\n', 12: '\\f', 13: '\\r' }[n]);
      else if (n < 32) ascii('\\u' + n.toString(16).padStart(4, '0'));
      else if (n >= 0xd800 && n <= 0xdbff && i + 1 < value.length && value.charCodeAt(i + 1) >= 0xdc00 && value.charCodeAt(i + 1) <= 0xdfff) {
        const low = value.charCodeAt(++i); codepoint(0x10000 + ((n - 0xd800) << 10) + low - 0xdc00);
      } else if (n >= 0xd800 && n <= 0xdfff) ascii('\\u' + n.toString(16).padStart(4, '0'));
      else codepoint(n);
      if (policy.encoded && bytes - start + 1 > policy.encoded) fail('Encoded scalar token exceeds admission');
    }
    byte(34);
    if (policy.encoded && bytes - start > policy.encoded) fail('Encoded scalar token exceeds admission');
  }
  const maxDepth = spec.report ? report.maxDepth : r.maxDepth;
  const maxArray = spec.report ? report.maxArrayLength : r.maxArrayLength;
  const maxVisits = spec.report ? report.maxVisitedOccurrences : spec.campaign ? r.maxCampaignVisitedOccurrences : r.maxWorkerVisitedOccurrences;
  const stack = [{ kind: 'value', value, key: '', level: 0, run: spec.role === 'run' }];
  while (stack.length) {
    const task = stack.pop();
    if (task.kind === 'container') {
      const count = task.array ? task.value.length : task.entries.length;
      if (task.index === count) {
        if (count && pretty) ascii('\n' + '  '.repeat(task.level));
        ascii(task.array ? ']' : '}'); ancestors.delete(task.value); continue;
      }
      const index = task.index++;
      let key = '', child, run = false;
      if (task.array) {
        const descriptor = Object.getOwnPropertyDescriptor(task.value, String(index));
        requireDomain(!descriptor || 'value' in descriptor, spec.role, 'Array accessor refused');
        child = descriptor?.value === undefined ? null : descriptor.value; run = task.key === 'runs';
      } else { ({ key, value: child } = task.entries[index]); run = key === 'persistenceReplay'; }
      if (index) ascii(',');
      if (pretty) ascii('\n' + '  '.repeat(task.level + 1));
      if (!task.array) { text(key, { raw: r.maxPropertyNameUtf8Bytes, encoded: r.maxEncodedPropertyNameBytes }); ascii(pretty ? ': ' : ':'); }
      stack.push(task);
      stack.push({ kind: 'value', value: child, key: key || (task.key === 'runs' ? '' : task.key), level: task.level + 1, run });
      continue;
    }
    if (task.kind === 'run-end') { runs.pop(); continue; }
    if (task.run) { runs.push({ start: bytes, visits: 0 }); stack.push({ kind: 'run-end' }); }
    visited++;
    for (const run of runs) if (++run.visits > r.maxRunVisitedOccurrences) fail('Run visited-occurrence admission exceeded');
    if (visited > maxVisits) fail('Visited-occurrence admission exceeded');
    const actual = task.value;
    if (actual === null) { ascii('null'); continue; }
    if (typeof actual === 'string') { text(actual, stringPolicy(task.key, spec, profile)); continue; }
    if (typeof actual === 'boolean') { ascii(actual ? 'true' : 'false'); continue; }
    if (typeof actual === 'number') {
      const token = Number.isFinite(actual) ? String(Object.is(actual, -0) ? 0 : actual) : 'null';
      if (token.length > r.maxEncodedFiniteNumberBytes) fail('Number token exceeds admission');
      ascii(token); continue;
    }
    requireDomain(actual !== undefined && typeof actual === 'object' && !types.isProxy(actual), spec.role, 'Unsupported JSON value refused');
    const array = Array.isArray(actual), proto = Object.getPrototypeOf(actual);
    requireDomain(array ? proto === Array.prototype : proto === Object.prototype || proto === null, spec.role, 'Custom JSON prototype refused');
    const hook = Object.getOwnPropertyDescriptor(actual, 'toJSON');
    requireDomain(!hook || ('value' in hook && typeof hook.value !== 'function'), spec.role, 'Custom toJSON refused');
    requireDomain(!Object.getOwnPropertyDescriptor(proto ?? {}, 'toJSON'), spec.role, 'Inherited toJSON refused');
    requireDomain(!ancestors.has(actual), spec.role, 'Ancestor cycle refused');
    if (task.level + 1 > maxDepth) fail('Container depth exceeds admission');
    ancestors.add(actual);
    const entries = [];
    if (array) {
      if (actual.length > maxArray) fail('Array length exceeds admission');
    } else {
      let count = 0;
      for (const key in actual) if (Object.hasOwn(actual, key)) {
        if (++count > r.maxOwnEnumerableStringKeysPerObject) fail('Object key admission exceeded');
        const descriptor = Object.getOwnPropertyDescriptor(actual, key);
        requireDomain(descriptor && 'value' in descriptor, spec.role, 'Object accessor refused');
        if (descriptor.value !== undefined) entries.push({ key, value: descriptor.value });
      }
    }
    ascii(array ? '[' : '{');
    stack.push({ kind: 'container', array, value: actual, entries, index: 0, key: task.key, level: task.level });
  }
  if (terminalNewline) ascii('\n');
  if (current && used) chunks.push(current.subarray(0, used));
  const hash = createHash('sha256'); for (const chunk of chunks) hash.update(chunk);
  return { chunks: Object.freeze(chunks), bytes, sha256: hash.digest('hex'), visitedOccurrences: visited };
}


 

function makeContext(loaded, domain, phase, classification, configurationFailure) {
  const p = loaded.profile, w = p.writers, r = p.readers, f = p.failureReserve;
  const tokens = new WeakMap(), retained = new Set(), uncertain = new Set(), banks = new Map(), phases = new Map(), readRoles = new Map();
  let replayKey = null, primaryCount = 0, firstFailure = null, firstThrown = null;
  let firstReadFailure = false, secondaryFailureCount = 0;
  const secondaryFailures = [];
  let normalAttempts = 0, normalBytes = 0, reserveAttempts = 0, reserveBytes = 0;
  let readAttempts = 0, readBytes = 0, actualReadBytes = 0, inflight = 0, maxInflight = 0;
  let lastRead = null, lastWrite = null, progress = null, reportReadback = null;
  function failureFact(error, operation, role) {
    const base = fact(error);
    const get = key => error && typeof error === 'object' && !types.isProxy(error)
      ? Object.getOwnPropertyDescriptor(error, key)?.value : null;
    return freeze({ ...base, role: typeof get('role') === 'string' ? get('role') : role, operation,
      admittedFileBytes: Number.isSafeInteger(get('admittedFileBytes')) ? get('admittedFileBytes') : null,
      observedFileBytes: Number.isSafeInteger(get('observedFileBytes')) ? get('observedFileBytes') : null,
      observedFileBytesDecimal: typeof get('observedFileBytesDecimal') === 'string' ? get('observedFileBytesDecimal') : null });
  }
  function latch(error, operation, role) {
    const actual = failureFact(error, operation, role);
    if (firstFailure === null) {
      firstFailure = actual; firstThrown = error;
      firstReadFailure = operation === 'read' && String(actual.code).startsWith('ERR_RELEASE_ARTIFACT_');
    } else {
      secondaryFailureCount++;
      if (secondaryFailures.length < 64) secondaryFailures.push(actual);
    }
    return error;
  }
  function healthy() {
    if (configurationFailure()) throw configurationFailure();
    if (firstFailure !== null) throw firstThrown;
  }
  function allowed(spec) {
    if (configurationFailure()) throw configurationFailure();
    if (!spec.reserve && !(spec.report && spec.failed && firstReadFailure)) healthy();
  }
  function limit(role, message, extra = {}) { return refusal('ERR_RELEASE_ARTIFACT_WRITE_LIMIT', role, message, extra); }
  function serial(role, message) { return refusal('ERR_RELEASE_ARTIFACT_SERIALIZATION_LIMIT', role, message); }
  function roleSpec(value, role) {
    const spec = { role, reserve: false, report: false, campaign: false, failed: false, cap: 0, meta: {} };
    const parity = domain === 'helper-parity';
    if (role === 'progress') {
      requireDomain((domain === 'worker' && phase !== null) || parity, role, 'Private worker phase required for progress');
      spec.cap = w.progress.rowBytes;
      if (parity) spec.meta = { event: own(value, 'event') };
      else {
        const fields = ['workerRunId', 'phase', 'seedIndex', 'driverPid', 'vitestPid', 'workerPid'];
        requireDomain(own(value, 'schemaVersion') === 1 && own(value, 'evidenceKind') === 'long-career-release-worker-progress-v1'
          && fields.every(key => own(value, key) === phase[key]), role, 'Progress context differs');
        spec.meta = Object.fromEntries(['event', 'seed', 'canonicalOutput', 'temporaryOutput', 'progressPath'].map(key => [key, own(value, key)]));
        requireDomain(spec.meta.seed === seedName(phase.seedIndex), role, 'Progress seed differs');
      }
      requireDomain(['started', 'week', 'career-complete'].includes(spec.meta.event), role, 'Progress event differs');
    } else if (role === 'run') {
      requireDomain(['worker', 'driver', 'helper-parity'].includes(domain), role, 'Run role/domain differs');
      spec.cap = p.representation.maxEncodedRunBytesAtActualIndent;
    } else if (role === 'worker-result') {
      requireDomain(domain === 'driver' || (domain === 'worker' && phase !== null) || parity, role, 'Worker result domain/phase differs');
      spec.cap = domain === 'worker' ? w.workerTemporaryResult.payloadBytes : w.workerCanonicalResult.payloadBytes;
      if (!parity) {
        requireDomain(own(value, 'schemaVersion') === 2, role, 'Worker result schema differs');
        const runs = own(value, 'runs');
        requireDomain(Array.isArray(runs) && !types.isProxy(runs) && runs.length === 1, role, 'One actual worker run required');
        const descriptor = Object.getOwnPropertyDescriptor(runs, '0');
        requireDomain(descriptor && 'value' in descriptor, role, 'Own worker run required');
        const checkpoint = own(value, 'checkpoint');
        spec.meta = { seed: own(descriptor.value, 'seed'), seedIndex: checkpoint ? own(checkpoint, 'seedIndex') : phase?.seedIndex };
        requireDomain(positive(spec.meta.seedIndex) && spec.meta.seed === seedName(spec.meta.seedIndex), role, 'Worker seed/context differs');
        if (phase) requireDomain(spec.meta.seedIndex === phase.seedIndex, role, 'Private worker seed differs');
      }
    } else if (role === 'checkpoint') {
      requireDomain(domain === 'driver' || parity, role, 'Checkpoint domain differs');
      spec.cap = w.checkpoint.payloadBytes;
      if (!parity) {
        requireDomain(own(value, 'schemaVersion') === 1 && own(value, 'evidenceKind') === 'long-career-release-soak-checkpoint'
          && ['InProgress', 'Passed', 'Failed'].includes(own(value, 'status')), role, 'Checkpoint selector differs');
        spec.reserve = own(value, 'status') === 'Failed'; spec.failed = spec.reserve;
      }
    } else if (role === 'campaign-summary' || role === 'single-seed-summary') {
      requireDomain(['driver', 'aggregate', 'staging'].includes(domain) || (domain === 'worker' && phase === null) || parity,
        role, 'Summary domain/phase differs');
      requireDomain(role !== 'single-seed-summary' || ['driver', 'worker', 'helper-parity'].includes(domain), role, 'Single seed domain differs');
      spec.campaign = true;
      spec.cap = role === 'single-seed-summary' ? w.singleSeedShardSummary.payloadBytes
        : domain === 'staging' ? p.staging.acceptedEnvelopeRewriteBytes
        : domain === 'aggregate' ? p.staging.aggregateWriteBytes : w.campaignSummary.payloadBytes;
      if (!parity) {
        requireDomain(own(value, 'schemaVersion') === (domain === 'worker' ? 2 : 3), role, 'Summary schema differs');
        const runs = own(value, 'runs');
        requireDomain(Array.isArray(runs) && !types.isProxy(runs), role, 'Summary runs array required');
        if (runs.length > (role === 'single-seed-summary' ? 1 : p.campaign.maxPrimarySeeds)) throw serial(role, 'Summary primary run count exceeds profile');
      }
    } else if (role === 'worker-failure') {
      requireDomain(domain === 'driver' && own(value, 'schemaVersion') === 2
        && own(value, 'evidenceKind') === 'long-career-worker-failure' && positive(own(value, 'seedIndex'))
        && (own(value, 'status') === undefined || own(value, 'status') === 'Failed'), role, 'Worker failure selector differs');
      spec.cap = f.workerReceiptBytes; spec.reserve = true; spec.failed = true;
      spec.meta = { seedIndex: own(value, 'seedIndex') };
    } else if (role === 'campaign-failure') {
      requireDomain(domain === 'driver' && own(value, 'schemaVersion') === 1
        && own(value, 'evidenceKind') === 'long-career-artifact-failure' && own(value, 'status') === 'Failed', role, 'Campaign failure selector differs');
      const cause = own(value, 'failure');
      requireDomain(firstFailure !== null && !firstFailure.operation.startsWith('caller-health:')
        && ['encode', 'read', 'write', 'progress'].includes(firstFailure.operation)
        && own(cause, 'code') === firstFailure.code && own(cause, 'role') === firstFailure.role,
        role, 'Actual helper first failure required');
      for (const key of ['name', 'message', 'stack']) {
        const selected = own(cause, key);
        requireDomain(selected === undefined || (selected === null ? firstFailure[key] === null
          : typeof selected === 'string' && typeof firstFailure[key] === 'string' && firstFailure[key].startsWith(selected)),
          role, 'Failure text must be a selected actual prefix');
      }
      if (firstFailure.code === 'ERR_RELEASE_ARTIFACT_READ_SIZE' && firstFailure.role === 'worker')
        requireDomain(Number.isSafeInteger(firstFailure.admittedFileBytes) && Number.isSafeInteger(firstFailure.observedFileBytes)
          && own(cause, 'admittedFileBytes') === firstFailure.admittedFileBytes
          && own(cause, 'observedFileBytes') === firstFailure.observedFileBytes && typeof own(cause, 'stack') === 'string'
          && own(cause, 'stack').includes('release-artifact-io.mjs')
          && firstFailure.stack !== null && firstFailure.stack.startsWith(own(cause, 'stack')), role, 'Actual C02 descriptor cause required');
      else {
        requireDomain(own(cause, 'operation') === firstFailure.operation, role, 'Actual helper operation required');
        for (const key of ['admittedFileBytes', 'observedFileBytes', 'observedFileBytesDecimal'])
          requireDomain(own(cause, key) === undefined || firstFailure[key] !== null && own(cause, key) === firstFailure[key], role, 'Unobserved failure numeric field refused');
      }
      spec.cap = f.campaignReceiptBytes; spec.reserve = true; spec.failed = true;
    } else if (role === 'checker-report') {
      requireDomain(domain === 'checker' && own(value, 'schemaVersion') === 2
        && ['Passed', 'PassedWithAcceptedRisk', 'Failed'].includes(own(value, 'status')), role, 'Checker report selector differs');
      spec.cap = p.checkerReport.payloadBytes; spec.report = true; spec.failed = own(value, 'status') === 'Failed';
      const gates = own(value, 'gateResults');
      requireDomain(Array.isArray(gates) && !types.isProxy(gates), role, 'Checker gate array required');
      if (gates.length > r.checkerGateRows) throw serial(role, 'Checker gate count exceeds admission');
    } else throw refusal('ERR_RELEASE_ARTIFACT_DOMAIN', role, 'Unknown write role');
    return spec;
  }
  function phasePath(path, failure, seedIndex) {
    const leaf = basename(path);
    const match = /^(seed-([0-9]+)-(run|determinism-replay))(-failure)?\.json$/.exec(leaf);
    requireDomain(match && Boolean(match[4]) === failure && positive(Number(match[2]))
      && match[2] === seedText(Number(match[2])) && Number(match[2]) === seedIndex, null, 'Canonical seed phase basename differs');
    const key = match[3] + ':' + match[2];
    const canonical = failure ? resolve(dirname(path), match[1] + '.json') : path;
    const existing = phases.get(key);
    requireDomain(!existing || existing === canonical, null, 'Logical phase path cannot be rebound');
    if (!existing) {
      if (match[3] === 'run') {
        if (primaryCount >= p.campaign.maxPrimarySeeds) throw limit('worker-result', 'Primary phase count exhausted');
        primaryCount++;
      } else {
        requireDomain(phases.has('run:' + match[2]), null, 'Replay must reference an admitted primary phase');
        requireDomain(replayKey === null || replayKey === key, null, 'One replay allocation slot');
        replayKey = key;
      }
      if (phases.size >= p.campaign.maxActualWorkerPhases || phases.size >= w.workerCanonicalResult.phases)
        throw limit('worker-result', 'Actual/canonical phase count exhausted');
      phases.set(key, canonical);
    }
    return key;
  }
  function privatePaths(meta, path) {
    const canonical = canonicalPath(meta.canonicalOutput, p.representation.maxCanonicalPathUtf8Bytes);
    requireDomain(basename(canonical) === 'seed-' + seedText(phase.seedIndex) + '-' + phase.phase + '.json', 'progress', 'Private canonical output differs');
    const temporary = canonical + '.partial-' + phase.driverPid + '-' + phase.workerRunId + '.json';
    const progressPath = canonical + '.progress-' + phase.workerRunId + '.jsonl';
    requireDomain(meta.temporaryOutput === temporary && meta.progressPath === progressPath && path === progressPath, 'progress', 'Private path derivation differs');
    return { canonical, temporary, path: progressPath };
  }
  function bankFor(path, token, progressWrite = false) {
    const { spec } = token, role = spec.role, parity = domain === 'helper-parity';
    let name, attempts, bytes;
    if (progressWrite) {
      name = 'progress'; attempts = w.progress.rowsPerWorker; bytes = w.progress.fileBytesPerWorker;
    } else if (role === 'worker-result') {
      if (domain === 'driver') name = 'canonical:' + phasePath(path, false, spec.meta.seedIndex);
      else if (domain === 'worker') {
        requireDomain(progress !== null && progress.complete && !progress.busy && path === progress.temporary, role, 'Completed phase result must use bound private temporary');
        name = 'temporary-result';
      } else name = 'parity-result';
      attempts = 1; bytes = spec.cap;
    } else if (role === 'worker-failure') {
      name = 'worker-failure:' + phasePath(path, true, spec.meta.seedIndex); attempts = 1; bytes = spec.cap;
    } else if (role === 'checkpoint') {
      name = spec.reserve ? 'failure-checkpoint' : 'checkpoint';
      attempts = spec.reserve ? f.checkpointReceipts : w.checkpoint.normalPromotions;
      bytes = spec.reserve ? f.checkpointReceiptBytes : w.checkpoint.cumulativeNormalBytes;
    } else if (role === 'campaign-failure') {
      name = 'failure-campaign'; attempts = f.campaignReceipts; bytes = f.campaignReceiptBytes;
    } else if (role === 'campaign-summary' || role === 'single-seed-summary') {
      name = 'final-summary'; attempts = role === 'campaign-summary' ? w.campaignSummary.normalPromotions : w.singleSeedShardSummary.normalPromotions; bytes = spec.cap;
    } else if (role === 'checker-report') {
      name = 'checker-report'; attempts = p.checkerReport.writes; bytes = spec.cap;
    } else throw refusal('ERR_RELEASE_ARTIFACT_DOMAIN', role, 'Encoding-only role cannot be published through writeJson');
    let bank = banks.get(name);
    if (!bank) { bank = { name, path, attempts: 0, bytes: 0 }; banks.set(name, bank); }
    requireDomain(bank.path === path, role, 'Bank path cannot be rebound');
    return { bank, attempts, bytes, parity };
  }
  function charge(path, token, progressWrite = false) {
    const { spec, bytes } = token, entry = bankFor(path, token, progressWrite), bank = entry.bank;
    // Charge the attempted operation and payload before any acquisition, including an over-limit attempt.
    bank.attempts++; bank.bytes += bytes;
    if (spec.reserve) { reserveAttempts++; reserveBytes += bytes; }
    else { normalAttempts++; normalBytes += bytes; }
    if (bank.attempts > entry.attempts || bank.bytes > entry.bytes) throw limit(spec.role, 'Selected bank exhausted');
    if (spec.reserve) {
      const workerCount = Array.from(banks.values()).filter(item => item.name.startsWith('worker-failure:')).reduce((n, item) => n + item.attempts, 0);
      if (reserveAttempts > f.cumulativeOperations || reserveBytes > f.cumulativeBytes || workerCount > f.workerReceipts)
        throw limit(spec.role, 'Independent failure reserve exhausted');
    } else {
      if (normalAttempts > w.normalTotalDirectProducerOperations || normalBytes > w.normalTotalDirectProducerBytes
        || normalBytes > w.campaignNormalLogicalBytesCeiling) throw limit(spec.role, 'Cumulative normal ledger exhausted');
      if (domain === 'driver' && (normalAttempts > w.normalDriverAtomicAttempts || normalBytes > w.normalDriverCumulativeBytes))
        throw limit(spec.role, 'Driver cumulative atomic ledger exhausted');
      if (progressWrite && normalBytes > w.progress.cumulativeBytesAllPhases) throw limit(spec.role, 'Progress cumulative ledger exhausted');
      if (spec.role === 'worker-result' && domain === 'worker' && bank.bytes > w.workerTemporaryResult.cumulativeBytes)
        throw limit(spec.role, 'Temporary result cumulative ledger exhausted');
      if (spec.role === 'worker-result' && domain === 'driver') {
        const total = Array.from(banks.values()).filter(item => item.name.startsWith('canonical:')).reduce((n, item) => n + item.bytes, 0);
        if (total > w.workerCanonicalResult.cumulativeBytes) throw limit(spec.role, 'Canonical result cumulative ledger exhausted');
      }
    }
  }
  function readSpec(role) {
    if (domain === 'driver' && role === 'worker') return { cap: r.workerFileBytes, count: r.workerReadsPerCampaignIncludingResumeDiagnostic,
      bytes: r.workerCumulativeBytesIncludingResumeDiagnostic, inflight: r.workerReadInflight };
    if (domain === 'aggregate' && role === 'shard') return { cap: r.shardFileBytes, count: r.shardJsonFiles, bytes: r.shardCumulativeBytes, inflight: r.shardReadInflight };
    if (domain === 'staging' && ['source-run', 'source-jobs', 'campaign'].includes(role))
      return { cap: role === 'source-run' ? r.sourceRunReceiptBytes : role === 'source-jobs' ? r.sourceJobsReceiptBytes : r.stagedAggregateBytes,
        count: 3, bytes: r.stagingCumulativeReadBytes, inflight: 3, roleCount: 1 };
    if (domain === 'checker') {
      const caps = { status: r.checkerStatusBytes, package: r.checkerPackageJsonBytes, manifest: r.checkerPackageManifestBytes,
        replayability: r.checkerReplayabilityBytes, exception: r.checkerReleaseExceptionBytes, core: r.checkerCoreEvidenceBytes,
        'source-exception': r.checkerSourceExceptionJsonBytes, 'other-supported-json': r.checkerOtherSupportedJsonBodyBytes,
        campaign: r.checkerSoakEvidenceBytes, 'failure-receipt': p.consumerAdmission.currentCampaignFailureReceiptReadBytes,
        'checker-report': p.checkerReport.readbackBytes };
      if (Object.hasOwn(caps, role)) return { cap: caps[role], count: r.checkerJsonReadOperations, bytes: r.checkerCumulativeJsonReadBytes, inflight: r.checkerJsonReadOperations };
    }
    throw refusal('ERR_RELEASE_ARTIFACT_DOMAIN', role, 'Read role/domain differs');
  }
  function snapshot() {
    return freeze({ profileId: p.profileId, profileSha256: loaded.sha256, profilePurpose: loaded.purpose, domain, phase,
      evidenceClassification: classification,
      reads: { attempts: readAttempts, chargedBytes: readBytes, actualBytes: actualReadBytes, inflight, maxInflightObserved: maxInflight,
        byRole: Array.from(readRoles, ([role, item]) => ({ role, attempts: item.attempts, chargedBytes: item.bytes })) },
      normal: { attempts: normalAttempts, bytes: normalBytes }, reserve: { attempts: reserveAttempts, bytes: reserveBytes },
      banks: Array.from(banks.values(), item => ({ bank: item.name, attempts: item.attempts, bytes: item.bytes })),
      progress: progress ? { path: progress.path, rows: progress.rows, fileBytes: progress.fileBytes, complete: progress.complete } : null,
      firstFailure, secondaryFailures: secondaryFailures.slice(), secondaryFailureCount,
      uncertainDescriptors: uncertain.size, lastRead, lastWrite });
  }

 

  async function encodeJson(value, options) {
    let role = null;
    try {
      exact(options, ['role', 'pretty', 'terminalNewline']); role = own(options, 'role');
      requireDomain(typeof own(options, 'pretty') === 'boolean' && typeof own(options, 'terminalNewline') === 'boolean', role, 'Exact format booleans required');
      const spec = roleSpec(value, role); allowed(spec);
      if (role === 'progress') requireDomain(!own(options, 'pretty') && own(options, 'terminalNewline'), role, 'Progress is compact JSON plus LF');
      const encoded = encodeBody(value, spec, p, own(options, 'pretty'), own(options, 'terminalNewline'));
      const publicChunks = [];
      for (let index = 0; index < encoded.chunks.length; index++) Object.defineProperty(publicChunks, String(index),
        { enumerable: true, configurable: false, get: () => Buffer.from(encoded.chunks[index]) });
      Object.freeze(publicChunks);
      const token = Object.freeze({ chunks: publicChunks, bytes: encoded.bytes, sha256: encoded.sha256 });
      tokens.set(token, { ...encoded, spec: freeze(spec), used: false });
      return token;
    } catch (error) { throw latch(error, 'encode', role); }
  }
  async function readJson(path, options) {
    let role = null, active = false;
    try {
      exact(options, ['role', 'expectedSha256']); role = own(options, 'role');
      path = canonicalPath(path, p.representation.maxCanonicalPathUtf8Bytes);
      const expected = own(options, 'expectedSha256');
      requireDomain(expected === null || typeof expected === 'string' && SHA.test(expected), role, 'Expected SHA differs');
      const spec = readSpec(role);
      if (domain === 'driver' && role === 'worker') {
        const match = /^(seed-([0-9]+)-(run|determinism-replay)\.json)(?:\.partial-([0-9]+)-([a-f0-9-]+)\.json)?$/.exec(basename(path));
        requireDomain(match && positive(Number(match[2])) && (!match[4] || Number(match[4]) === process.pid && UUID.test(match[5])), role, 'Canonical/private worker read path required');
        phasePath(resolve(dirname(path), match[1]), false, Number(match[2]));
      }
      const afterFailure = firstFailure !== null;
      if (afterFailure) requireDomain(firstReadFailure && role === 'checker-report' && reportReadback !== null
        && reportReadback.path === path && expected === reportReadback.sha256, role, 'Only actual Failed-report readback remains admitted');
      else healthy();
      let byRole = readRoles.get(role);
      if (!byRole) { byRole = { attempts: 0, bytes: 0 }; readRoles.set(role, byRole); }
      readAttempts++; byRole.attempts++;
      if (readAttempts > spec.count || spec.roleCount && byRole.attempts > spec.roleCount || inflight >= spec.inflight)
        throw refusal('ERR_RELEASE_ARTIFACT_READ_SIZE', role, 'Read operation/inflight admission exhausted',
          { admittedFileBytes: spec.cap, observedFileBytes: null, observedFileBytesDecimal: null });
      inflight++; active = true; maxInflight = Math.max(maxInflight, inflight);
      const actual = await boundedBody(path, spec.cap, expected, retained, observed => {
        const charge = observed >= 0n && observed <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(observed) : 0;
        readBytes += charge; byRole.bytes += charge;
        if (observed < 0n || observed > BigInt(spec.cap) || observed > BigInt(Number.MAX_SAFE_INTEGER) || readBytes > spec.bytes)
          throw refusal('ERR_RELEASE_ARTIFACT_READ_SIZE', role, 'Actual descriptor/cumulative read admission exceeded',
            { admittedFileBytes: spec.cap, observedFileBytes: observed <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(observed) : null,
              observedFileBytesDecimal: String(observed) });
        if (!afterFailure) healthy();
      }, count => { actualReadBytes += count; if (!afterFailure) healthy(); }, r.readChunkBytes,
      error => { if (!NORMAL_CODES.has(error?.code)) latch(error, 'read', role); }, uncertain);
      lastRead = freeze({ path, role, descriptorAndClose: actual.descriptorAndClose });
      if (!afterFailure) healthy();
      const value = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(actual.body));
      if (role === 'source-jobs' && Array.isArray(value?.jobs) && value.jobs.length > r.sourceJobRows)
        throw refusal('ERR_RELEASE_ARTIFACT_READ_SIZE', role, 'Source jobs row admission exceeded',
          { admittedFileBytes: spec.cap, observedFileBytes: actual.body.length, observedFileBytesDecimal: String(actual.body.length) });
      const gates = role === 'status' ? value?.gates : role === 'checker-report' ? value?.gateResults : null;
      let gateCount = Array.isArray(gates) ? gates.length : 0;
      if (role === 'status' && gates !== null && typeof gates === 'object' && !Array.isArray(gates))
        for (const key in gates) if (Object.hasOwn(gates, key) && ++gateCount > r.checkerGateRows) break;
      if (gateCount > r.checkerGateRows)
        throw refusal('ERR_RELEASE_ARTIFACT_READ_SIZE', role, 'Checker gate row admission exceeded',
          { admittedFileBytes: spec.cap, observedFileBytes: actual.body.length, observedFileBytesDecimal: String(actual.body.length) });
      return Object.freeze({ value, bytes: actual.body.length, sha256: actual.sha256, descriptorAndClose: actual.descriptorAndClose });
    } catch (error) {
      if (error?.descriptorAndClose) lastRead = freeze({ path, role, descriptorAndClose: error.descriptorAndClose });
      const semantic = error instanceof SyntaxError || error instanceof TypeError && !error.code && !error.descriptorAndClose;
      if (NORMAL_CODES.has(error?.code) || semantic) throw error;
      throw latch(error, 'read', role);
    } finally { if (active) inflight--; }
  }
  function sealed(encoded, role) {
    const token = encoded && typeof encoded === 'object' && !types.isProxy(encoded) ? tokens.get(encoded) : undefined;
    requireDomain(token && token.spec.role === role && !token.used, role, 'Unused context-owned exact-role token required');
    return token;
  }
  function freshDisposition(path) {
    return { path, created: false, bytesWritten: 0, sha256: null, writeOperations: 0,
      fdBefore: null, fdAfter: null, pathAfter: null, sync: observation(), close: observation(),
      promotion: observation(), state: 'not-created', failureStage: null, firstError: null, secondaryErrors: [] };
  }
  async function ownedWrite(path, token, check, appendState = null) {
    const seen = freshDisposition(path), digest = createHash('sha256');
    let handle = null, primary = null, failed = false, stage = 'acquisition';
    const remember = error => {
      if (!failed) { failed = true; primary = error; seen.firstError = fact(error); seen.failureStage = stage; }
      else seen.secondaryErrors.push(fact(error));
      if (firstFailure === null || error !== firstThrown) latch(error, 'write', token.spec.role);
    };
    try {
      check(stage);
      handle = await open(path, appendState
        ? constants.O_WRONLY | constants.O_APPEND : constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
      retained.add(handle); seen.created = appendState === null; seen.state = 'retained';
      check('after-acquisition');
      stage = 'descriptor-before'; const before = await handle.stat({ bigint: true }); seen.fdBefore = stats(before); check(stage);
      requireDomain(regular(before) && before.size === BigInt(appendState?.fileBytes ?? 0), token.spec.role, 'Owned output descriptor differs');
      if (appendState?.identity) requireDomain(['dev', 'ino'].every(key => seen.fdBefore[key] === appendState.identity[key]), token.spec.role, 'Progress file identity changed');
      stage = 'path-before'; const beforePath = await lstat(path, { bigint: true }); check(stage);
      requireDomain(regular(beforePath) && common(stats(beforePath), seen.fdBefore), token.spec.role, 'Owned descriptor/path differs');
      for (const chunk of token.chunks) {
        let offset = 0;
        while (offset < chunk.length) {
          stage = 'write'; check('before-write');
          const actual = await handle.write(chunk, offset, chunk.length - offset, appendState ? null : seen.bytesWritten);
          seen.writeOperations++;
          const count = actual.bytesWritten;
          if (!Number.isSafeInteger(count) || count <= 0 || count > chunk.length - offset)
            throw refusal('ERR_RELEASE_ARTIFACT_WRITE_LIMIT', token.spec.role, 'Actual write made invalid/no progress');
          // Persist actual returned work and prefix hash BEFORE any following guard/await.
          seen.bytesWritten += count; digest.update(chunk.subarray(offset, offset + count)); offset += count;
          seen.sha256 = digest.copy().digest('hex'); check('after-write');
        }
      }
      stage = 'descriptor-after'; const after = await handle.stat({ bigint: true }); seen.fdAfter = stats(after); check(stage);
      requireDomain(regular(after) && before.dev === after.dev && before.ino === after.ino
        && after.size === BigInt((appendState?.fileBytes ?? 0) + seen.bytesWritten), token.spec.role, 'Owned output changed');
      stage = 'path-after'; const afterPath = await lstat(path, { bigint: true }); seen.pathAfter = stats(afterPath); check(stage);
      requireDomain(regular(afterPath) && common(seen.pathAfter, seen.fdAfter), token.spec.role, 'Output path identity differs');
      if (token.spec.report) {
        stage = 'sync'; check('before-sync'); seen.sync.attempted = true;
        try { await handle.sync(); seen.sync.returned = true; }
        catch (error) { seen.sync.error = fact(error); throw error; }
        check('after-sync');
      }
    } catch (error) { remember(error); }
    finally {
      if (handle) {
        stage = 'close';
        try { await closeOnce(handle, seen.close, retained, uncertain); seen.state = 'closed'; }
        catch (error) { seen.state = 'uncertain'; remember(error); }
        if (seen.close.returned) try { check('after-close'); } catch (error) { remember(error); }
      }
    }
    lastWrite = freeze(seen);
    return { seen, primary, failed };
  }
  async function writeJson(path, encoded, options) {
    let role = null, seen = null;
    try {
      record(options); const optionKeys = keys(options, 4);
      requireDomain(optionKeys.every(key => ['method', 'role', 'assertHealthy'].includes(key))
        && optionKeys.includes('method') && optionKeys.includes('role'), null, 'Write options differ');
      role = own(options, 'role');
      const method = own(options, 'method'), caller = own(options, 'assertHealthy');
      requireDomain(['atomic', 'exclusive'].includes(method) && (caller === undefined || typeof caller === 'function'), role, 'Write method/guard differs');
      const token = sealed(encoded, role), spec = token.spec;
      path = canonicalPath(path, p.representation.maxCanonicalPathUtf8Bytes);
      requireDomain(role !== 'progress' && role !== 'run', role, 'Dedicated publication route required');
      requireDomain(!spec.reserve || caller === undefined, role, 'Failure reserve omits normal caller guard');
      requireDomain(!spec.report || method === 'exclusive', role, 'Checker report preserves exclusive owned sync route');
      const check = stage => {
        allowed(spec);
        if (!spec.reserve && caller) {
          try {
            const returned = caller();
            requireDomain(returned === undefined, role, 'Synchronous caller guard must return undefined');
          } catch (error) { latch(error, 'caller-health:' + stage, role); throw error; }
        }
      };
      check('admission'); token.used = true; charge(path, token); check('before-acquisition');
      const ownedPath = method === 'atomic' ? resolve(dirname(path), '.' + basename(path) + '.partial-' + process.pid + '-' + randomUUID()) : path;
      const actual = await ownedWrite(ownedPath, token, check); seen = actual.seen;
      if (actual.failed) throw actual.primary;
      check('after-owned-write');
      if (method === 'atomic') {
        // A single invocation, guarded synchronously with NO await between health and rename.
        check('before-promotion'); seen = { ...seen, promotion: observation(), state: 'retained' };
        seen.promotion.attempted = true;
        try { await rename(ownedPath, path); seen.promotion.returned = true; seen.state = 'promoted'; }
        catch (error) {
          seen.promotion.error = fact(error); seen.firstError = fact(error); seen.failureStage = 'promotion'; seen.state = 'uncertain'; lastWrite = freeze(seen); throw error;
        }
        lastWrite = freeze(seen); check('after-promotion');
      } else lastWrite = freeze(seen);
      if (spec.report) reportReadback = { path, sha256: token.sha256 };
      return freeze({ path, bytes: token.bytes, sha256: token.sha256,
        partialDisposition: method === 'atomic' ? seen : null, close: seen.close, disposition: seen });
    } catch (error) {
      if (seen) lastWrite = freeze(seen.firstError ? seen : { ...seen, firstError: fact(error), failureStage: 'publication-health' });
      throw latch(error, 'write', role);
    }
  }
  async function appendProgress(path, encoded, options) {
    let seen = null;
    try {
      exact(options, ['event']); path = canonicalPath(path, p.representation.maxCanonicalPathUtf8Bytes);
      const event = own(options, 'event'), token = sealed(encoded, 'progress');
      healthy(); requireDomain(event === token.spec.meta.event, 'progress', 'Sealed progress event differs');
      if (progress === null) {
        requireDomain(event === 'started', 'progress', 'First row must be started');
        const paths = domain === 'helper-parity' ? { canonical: null, temporary: null, path } : privatePaths(token.spec.meta, path);
        progress = { ...paths, rows: 0, fileBytes: 0, complete: false, busy: false, identity: null };
      }
      // Check cumulative row cap first, matching the frozen extra-row quota probe.
      if (progress.rows >= w.progress.rowsPerWorker) { token.used = true; charge(path, token, true); throw limit('progress', 'Progress row allowance exhausted'); }
      requireDomain(progress.path === path && !progress.busy && !progress.complete
        && (progress.rows === 0 ? event === 'started' : event !== 'started'), 'progress', 'Progress path/order/context differs');
      token.used = true; charge(path, token, true); progress.rows++; progress.busy = true;
      try {
        const actual = await ownedWrite(path, token, () => healthy(), progress.rows === 1 ? null : progress);
        seen = actual.seen;
        progress.fileBytes += seen.bytesWritten;
        if (seen.fdBefore && progress.identity === null) progress.identity = seen.fdBefore;
        if (actual.failed) throw actual.primary;
        healthy();
        if (event === 'career-complete') progress.complete = true;
        return freeze({ path, bytes: token.bytes, sha256: token.sha256, partialDisposition: null,
          close: seen.close, disposition: seen, row: progress.rows, fileBytes: progress.fileBytes, operations: seen.writeOperations });
      } finally { progress.busy = false; }
    } catch (error) { if (seen) lastWrite = freeze(seen); throw latch(error, 'progress', 'progress'); }
  }
  return Object.freeze({ encodeJson, readJson, writeJson, appendProgress, assertHealthy: healthy, snapshot });
}

