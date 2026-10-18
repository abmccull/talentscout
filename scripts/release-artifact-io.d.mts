/**
 * Frozen interface realization of IO-v2; declarations contain no runtime code.
 * Opaque brands express identity admission, not a user-constructible grant.
 */
import type { Buffer } from 'node:buffer';
declare const loadedBrand: unique symbol;
declare const encodedBrand: unique symbol;
export type ProfilePurpose = 'canonical' | 'diagnostic';
export type ArtifactDomain = 'driver' | 'worker' | 'aggregate' | 'staging' | 'checker' | 'helper-parity';
export type EvidenceClassification = 'canonical' | 'diagnostic-fixture';
export type PhaseName = 'run' | 'determinism-replay';
export interface WorkerProgressContext {
  readonly workerRunId: string; readonly phase: PhaseName; readonly seedIndex: number;
  readonly driverPid: number; readonly vitestPid: number; readonly workerPid: number;
}
export type WriteRole = 'progress' | 'run' | 'worker-result' | 'checkpoint' | 'campaign-summary' |
  'single-seed-summary' | 'worker-failure' | 'campaign-failure' | 'checker-report';
export type ReadRole = 'worker' | 'shard' | 'campaign' | 'status' | 'package' | 'manifest' |
  'replayability' | 'exception' | 'core' | 'source-exception' | 'other-supported-json' |
  'source-run' | 'source-jobs' | 'failure-receipt' | 'checker-report';
export interface ProfileOptions { readonly path: string; readonly sha256: string; readonly purpose: ProfilePurpose }
export interface ErrorFact {
  readonly name: string; readonly code: string | null; readonly message: string; readonly stack: string | null;
  readonly originalLengths: { readonly name: number | null; readonly code: number | null; readonly message: number | null; readonly stack: number | null };
  readonly truncated: boolean;
}
export interface ApiObservation { readonly attempted: boolean; readonly returned: boolean; readonly error: ErrorFact | null }
export interface DescriptorSnapshot {
  readonly dev: string; readonly ino: string; readonly mode: string; readonly nlink: string;
  readonly size: string; readonly mtimeNs: string; readonly ctimeNs: string; readonly birthtimeNs: string;
}
export interface ReadObservation {
  readonly pathBefore: DescriptorSnapshot | null; readonly fdBefore: DescriptorSnapshot | null;
  readonly fdAfter: DescriptorSnapshot | null; readonly pathAfter: DescriptorSnapshot | null;
  readonly bytesRead: number; readonly readOperations: number; readonly overflowBytes: number;
  readonly close: ApiObservation; readonly firstError: ErrorFact | null; readonly secondaryErrors: readonly ErrorFact[];
}
export interface LoadedProfile {
  readonly [loadedBrand]: true; readonly profile: ArtifactProfile; readonly sha256: string;
  readonly bytes: number; readonly path: string; readonly purpose: ProfilePurpose;
  readonly descriptorAndClose: ReadObservation;
}
export interface EncodedJson {
  readonly [encodedBrand]: true;
  /** Each indexed access returns a fresh bounded copy; helper writes use private sealed chunks. */
  readonly chunks: readonly Buffer[];
  readonly bytes: number; readonly sha256: string;
}
export interface ReadResult { readonly value: unknown; readonly bytes: number; readonly sha256: string; readonly descriptorAndClose: ReadObservation }
export interface PromotionObservation {
  readonly attempted: boolean; readonly returned: boolean; readonly error: ErrorFact | null;
}
export interface WriteDisposition {
  readonly path: string; readonly created: boolean; readonly bytesWritten: number;
  readonly sha256: string | null; readonly writeOperations: number;
  readonly fdBefore: DescriptorSnapshot | null; readonly fdAfter: DescriptorSnapshot | null;
  readonly pathAfter: DescriptorSnapshot | null;
  readonly sync: ApiObservation; readonly close: ApiObservation; readonly promotion: PromotionObservation;
  readonly state: 'not-created' | 'retained' | 'promoted' | 'closed' | 'uncertain';
  readonly failureStage: string | null;
  readonly firstError: ErrorFact | null; readonly secondaryErrors: readonly ErrorFact[];
}
export interface WriteResult {
  readonly path: string; readonly bytes: number; readonly sha256: string;
  readonly partialDisposition: WriteDisposition | null; readonly close: ApiObservation;
  readonly disposition: WriteDisposition;
}
export interface ProgressResult extends WriteResult {
  readonly row: number; readonly fileBytes: number; readonly operations: number;
}
export interface FailureFact extends ErrorFact {
  readonly role: string | null; readonly operation: string;
  readonly admittedFileBytes: number | null; readonly observedFileBytes: number | null;
  readonly observedFileBytesDecimal: string | null;
}
export interface BankSnapshot { readonly bank: string; readonly attempts: number; readonly bytes: number }
export interface ReadRoleSnapshot { readonly role: ReadRole; readonly attempts: number; readonly chargedBytes: number }
export interface ArtifactSnapshot {
  readonly profileId: string; readonly profileSha256: string; readonly profilePurpose: ProfilePurpose;
  readonly domain: ArtifactDomain; readonly phase: WorkerProgressContext | null;
  readonly evidenceClassification: EvidenceClassification;
  readonly reads: { readonly attempts: number; readonly chargedBytes: number; readonly actualBytes: number;
    readonly inflight: number; readonly maxInflightObserved: number; readonly byRole: readonly ReadRoleSnapshot[] };
  readonly normal: { readonly attempts: number; readonly bytes: number };
  readonly reserve: { readonly attempts: number; readonly bytes: number };
  readonly banks: readonly BankSnapshot[];
  readonly progress: { readonly path: string; readonly rows: number; readonly fileBytes: number; readonly complete: boolean } | null;
  readonly firstFailure: FailureFact | null; readonly secondaryFailures: readonly FailureFact[]; readonly secondaryFailureCount: number;
  readonly uncertainDescriptors: number;
  readonly lastRead: { readonly path: string; readonly role: ReadRole; readonly descriptorAndClose: ReadObservation } | null;
  readonly lastWrite: WriteDisposition | null;
}
export interface ArtifactContext {
  encodeJson(value: unknown, options: { readonly role: WriteRole; readonly pretty: boolean; readonly terminalNewline: boolean }): Promise<EncodedJson>;
  readJson(path: string, options: { readonly role: ReadRole; readonly expectedSha256: string | null }): Promise<ReadResult>;
  writeJson(path: string, encoded: EncodedJson, options: { readonly method: 'atomic' | 'exclusive'; readonly role: WriteRole; readonly assertHealthy?: () => void }): Promise<WriteResult>;
  appendProgress(path: string, encoded: EncodedJson, options: { readonly event: 'started' | 'week' | 'career-complete' }): Promise<ProgressResult>;
  assertHealthy(): void;
  snapshot(): ArtifactSnapshot;
}
export function loadArtifactProfile(options?: ProfileOptions): Promise<LoadedProfile>;
export function createArtifactContext(options: {
  readonly loadedProfile: LoadedProfile; readonly domain: ArtifactDomain;
  readonly phase: WorkerProgressContext | null; readonly evidenceClassification: EvidenceClassification;
}): ArtifactContext;
export interface ArtifactAdmissionPolicy {
  readonly schemaVersion: 1; readonly profileId: string; readonly profileSha256: string; readonly purpose: ProfilePurpose;
  readonly expectedExecutionIdentityHash: string; readonly expectedCandidateCommitSha: string; readonly expectedCandidateTreeSha: string;
  readonly failureReceiptPath: string;
}
export interface C02WorkerReadSizeFailure {
  readonly code: 'ERR_RELEASE_ARTIFACT_READ_SIZE'; readonly role: 'worker'; readonly operation?: 'read';
  readonly admittedFileBytes: number; readonly observedFileBytes: number; readonly stack: string;
  readonly observedFileBytesDecimal?: string; readonly name?: string; readonly message?: string;
}
/** Other actual helper causes; runtime excludes caller-health and enforces the C02 branch whenever its code/role match. */
export interface ActualOtherHelperFailure {
  readonly operation: 'encode' | 'read' | 'write' | 'progress';
  readonly code: string | null; readonly role: string | null;
  readonly name?: string; readonly message?: string; readonly stack?: string | null;
  readonly admittedFileBytes?: number; readonly observedFileBytes?: number; readonly observedFileBytesDecimal?: string;
}
export interface CampaignArtifactFailureReceipt {
  readonly schemaVersion: 1; readonly evidenceKind: 'long-career-artifact-failure'; readonly status: 'Failed';
  readonly candidateCommitSha: string; readonly candidateTreeSha: string; readonly executionIdentityHash: string;
  readonly artifactProfileId: string; readonly artifactProfileSha256: string; readonly artifactProfilePurpose: ProfilePurpose;
  readonly driverPid: number;
  readonly failure: C02WorkerReadSizeFailure | ActualOtherHelperFailure;
}


export interface ArtifactProfile {
  readonly schemaVersion: number;
  readonly profileId: string;
  readonly readyForImplementation: boolean;
  readonly limitNature: string;
  readonly campaign: {
    readonly maxPrimarySeeds: number;
    readonly maxSeasons: number;
    readonly maxConcurrency: number;
    readonly weeksPerSeason: number;
    readonly maxTicksPerCareer: number;
    readonly maxActualWorkerPhases: number;
    readonly requiredCertification: {
      readonly primarySeeds: number;
      readonly seasons: number;
      readonly concurrency: number;
      readonly freshReplaySeed: number;
      readonly resume: boolean;
      readonly reuse: boolean;
    };
    readonly smallerProfilesCertifyOriginalCampaign: boolean;
  };
  readonly unchangedGameBudgets: {
    readonly batchCpuMs: number;
    readonly batchWallMs: number;
    readonly oldSpaceMiB: number;
    readonly semiSpaceMiB: number;
    readonly exposeGc: boolean;
    readonly actualV8AndRetainedHeapBytes: number;
    readonly rssBytes: number;
    readonly postGcHeapGrowthBytes: number;
    readonly saveBytes: number;
    readonly growthMultiplier: number;
    readonly collectionBudgetsChanged: boolean;
    readonly vitestTestTimeoutMs: number;
    readonly hookTimeoutMs: number;
    readonly vitestMaxWorkers: number;
    readonly externalNativeOrJobLifetimeChanged: boolean;
  };
  readonly relay: {
    readonly independent: boolean;
    readonly defaultMaxOutputBytes: number;
    readonly existingConfigurationAndIdentityContractChanged: boolean;
  };
  readonly representation: {
    readonly scope: string;
    readonly maxDepth: number;
    readonly maxOwnEnumerableStringKeysPerObject: number;
    readonly maxArrayLength: number;
    readonly maxEncodedPropertyNameBytes: number;
    readonly maxPropertyNameUtf8Bytes: number;
    readonly maxOrdinaryScalarStringUtf8Bytes: number;
    readonly maxSeedUtf8Bytes: number;
    readonly maxFingerprintIdUtf8Bytes: number;
    readonly maxFingerprintTitleUtf8Bytes: number;
    readonly maxCanonicalPathUtf8Bytes: number;
    readonly pathControlCharactersAllowed: boolean;
    readonly maxEncodedFiniteNumberBytes: number;
    readonly maxRunVisitedOccurrences: number;
    readonly maxWorkerVisitedOccurrences: number;
    readonly maxCampaignVisitedOccurrences: number;
    readonly maxEncodedRunBytesAtActualIndent: number;
    readonly encoderChunkBytes: number;
    readonly maxEncoderRetainedPayloadBytes: number;
    readonly wholeStringifyOrBufferConcatAllowed: boolean;
    readonly ordinaryJsonFormattingPreserved: boolean;
    readonly sharedDagAllowed: boolean;
    readonly cyclesAccessorsCustomToJsonOrCustomPrototypesAllowed: boolean;
  };
  readonly writers: {
    readonly progress: {
      readonly rowBytes: number;
      readonly rowsPerWorker: number;
      readonly fileBytesPerWorker: number;
      readonly filesPerCampaign: number;
      readonly cumulativeBytesAllPhases: number;
    };
    readonly workerTemporaryResult: {
      readonly payloadBytes: number;
      readonly writesPerPhase: number;
      readonly phases: number;
      readonly cumulativeBytes: number;
    };
    readonly workerCanonicalResult: {
      readonly payloadBytes: number;
      readonly writesPerPhase: number;
      readonly phases: number;
      readonly cumulativeBytes: number;
    };
    readonly checkpoint: {
      readonly payloadBytes: number;
      readonly normalPromotions: number;
      readonly cumulativeNormalBytes: number;
      readonly reservedFailurePromotions: number;
    };
    readonly campaignSummary: {
      readonly payloadBytes: number;
      readonly normalPromotions: number;
    };
    readonly singleSeedShardSummary: {
      readonly payloadBytes: number;
      readonly normalPromotions: number;
    };
    readonly normalDriverAtomicAttempts: number;
    readonly normalDriverCumulativeBytes: number;
    readonly normalTotalDirectProducerOperations: number;
    readonly normalTotalDirectProducerBytes: number;
    readonly campaignNormalLogicalBytesCeiling: number;
    readonly retryAfterFailedWriteOrPromotion: boolean;
    readonly temporaryFilesExclusive: boolean;
    readonly priorCanonicalTargetUnlinkedForFallback: boolean;
    readonly failedOrRemovedPayloadRefunded: boolean;
  };
  readonly failureReserve: {
    readonly workerReceiptBytes: number;
    readonly workerReceipts: number;
    readonly checkpointReceiptBytes: number;
    readonly checkpointReceipts: number;
    readonly campaignReceiptBytes: number;
    readonly campaignReceipts: number;
    readonly cumulativeBytes: number;
    readonly cumulativeOperations: number;
    readonly encodedMessagePrefixBytes: number;
    readonly encodedTailPrefixBytesEach: number;
    readonly nameAndCodeUtf8BytesEach: number;
    readonly budgetDomainSeparate: boolean;
    readonly firstFailurePreserved: boolean;
    readonly truncationReported: boolean;
    readonly diagnosticPublicationGuaranteedOnDiskFailure: boolean;
  };
  readonly readers: {
    readonly profileConfigurationBytes: number;
    readonly configurationReadsPerProcess: number;
    readonly workerFileBytes: number;
    readonly workerReadsPerCampaignIncludingResumeDiagnostic: number;
    readonly workerCumulativeBytesIncludingResumeDiagnostic: number;
    readonly workerReadInflight: number;
    readonly readChunkBytes: number;
    readonly shardFileBytes: number;
    readonly shardJsonFiles: number;
    readonly shardCumulativeBytes: number;
    readonly shardReadInflight: number;
    readonly directoryEntriesAllKinds: number;
    readonly directoriesIncludingRoot: number;
    readonly directoryDepth: number;
    readonly sourceRunReceiptBytes: number;
    readonly sourceJobsReceiptBytes: number;
    readonly sourceJobRows: number;
    readonly stagedAggregateBytes: number;
    readonly stagingCumulativeReadBytes: number;
    readonly checkerStatusBytes: number;
    readonly checkerPackageJsonBytes: number;
    readonly checkerPackageManifestBytes: number;
    readonly checkerReplayabilityBytes: number;
    readonly checkerReleaseExceptionBytes: number;
    readonly checkerCoreEvidenceBytes: number;
    readonly checkerSourceExceptionJsonBytes: number;
    readonly checkerOtherSupportedJsonBodyBytes: number;
    readonly checkerSoakEvidenceBytes: number;
    readonly checkerJsonReadOperations: number;
    readonly checkerCumulativeJsonReadBytes: number;
    readonly checkerGateRows: number;
    readonly unrestrictedReadFileAfterPathStatAllowed: boolean;
    readonly fullBodyReadOrDecodeBeforeDescriptorSizeAdmission: boolean;
    readonly changedOrNonOrdinaryInputAccepted: boolean;
    readonly readOrEnumerationAllowanceResetPerDirectory: boolean;
  };
  readonly staging: {
    readonly aggregateWriteBytes: number;
    readonly acceptedEnvelopeRewriteBytes: number;
    readonly exclusiveSiblingStagingPreserved: boolean;
    readonly previousAcceptedArtifactPreservedOnFailure: boolean;
  };
  readonly checkerReport: {
    readonly payloadBytes: number;
    readonly writes: number;
    readonly readbackBytes: number;
    readonly maxDepth: number;
    readonly maxArrayLength: number;
    readonly maxVisitedOccurrences: number;
    readonly maxScalarStringUtf8Bytes: number;
    readonly existingOwnedOutputAndRawHashChecksPreserved: boolean;
    readonly otherAssetOrPackageBinaryReadsChanged: boolean;
  };
  readonly consumerAdmission: {
    readonly soakEvidenceReadBytes: number;
    readonly currentCampaignFailureReceiptReadBytes: number;
    readonly validatorOwnsArtifactAdmissionFailures: boolean;
    readonly explicitCurrentArtifactResourceOrTransportFailureWaivable: boolean;
    readonly pureMissingOrUnreadableOrdinaryArtifactLegacyExceptionBehaviorPreserved: boolean;
    readonly profileIdentityAndExpectedCampaignContextRequired: boolean;
    readonly oldOrLowerDiagnosticProfileCertifiesCurrentCampaign: boolean;
  };
  readonly optionalModes: {
    readonly sharedDiagnosticCheckpointSupported: boolean;
    readonly chooserOnlyMatrixSupported: boolean;
    readonly refuseBeforeFirstStartNewGameOrSpawn: boolean;
    readonly noSilentUnmeteredFallback: boolean;
  };
  readonly physicalReservationAccepted: boolean;
  readonly nativeOrHardIoLifetimeAccepted: boolean;
  readonly serializationPeakRssAccepted: boolean;
  readonly fullCareerAccepted: boolean;
  readonly releaseAccepted: boolean;
}
