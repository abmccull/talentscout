/**
 * Runtime contracts for authored simulation content.
 *
 * TypeScript types protect source edits at compile time, but save-compatible
 * content also needs a small runtime boundary: duplicate or malformed IDs
 * must fail at startup rather than quietly changing a career's meaning.
 * Content packs are immutable definition catalogues. They are never written
 * into saves; saves retain only their stable IDs and run fingerprints.
 */

export const CONTENT_SCHEMA_VERSION = 1 as const;

export type ContentKind =
  | "event-template"
  | "scenario"
  | "game-mode"
  | "insight-narrative"
  | "observation-atmosphere-event"
  | "investigation-consequence-narrative";

const CONTENT_KINDS = new Set<ContentKind>([
  "event-template",
  "scenario",
  "game-mode",
  "insight-narrative",
  "observation-atmosphere-event",
  "investigation-consequence-narrative",
]);

export interface ContentPackManifest<Kind extends ContentKind> {
  /** Stable pack identifier, suitable for diagnostics and content fingerprints. */
  id: string;
  kind: Kind;
  /** Version of the runtime validation contract used by this pack. */
  schemaVersion: number;
  /** Semantic version of the authored catalogue itself. */
  contentVersion: string;
}

export interface ContentValidationIssue {
  packId: string;
  definitionId?: string;
  path: string;
  message: string;
}

export class ContentValidationError extends Error {
  readonly issues: readonly ContentValidationIssue[];

  constructor(issues: readonly ContentValidationIssue[]) {
    super(
      `Invalid authored content: ${issues
        .map((issue) => `${issue.packId}${issue.definitionId ? `/${issue.definitionId}` : ""} ${issue.path}: ${issue.message}`)
        .join("; ")}`,
    );
    this.name = "ContentValidationError";
    this.issues = issues;
  }
}

export interface VersionedContentPack<
  Kind extends ContentKind,
  Definition,
> {
  manifest: Readonly<ContentPackManifest<Kind>>;
  entries: readonly Definition[];
  /** Extracts the stable authored ID without forcing domain models to duplicate it. */
  getDefinitionId: (definition: Definition) => string;
}

export interface DefineContentPackInput<
  Kind extends ContentKind,
  Definition,
> {
  manifest: ContentPackManifest<Kind>;
  entries: readonly Definition[];
  getDefinitionId: (definition: Definition) => string;
  validateDefinition: (
    definition: Definition,
  ) => readonly Omit<ContentValidationIssue, "packId" | "definitionId">[];
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateManifest<Kind extends ContentKind>(
  manifest: ContentPackManifest<Kind>,
): ContentValidationIssue[] {
  const issues: ContentValidationIssue[] = [];
  const packId = isNonBlankString(manifest.id) ? manifest.id : "<unknown-pack>";

  if (!isNonBlankString(manifest.id)) {
    issues.push({ packId, path: "manifest.id", message: "must be a non-empty string" });
  }
  if (!CONTENT_KINDS.has(manifest.kind)) {
    issues.push({ packId, path: "manifest.kind", message: "must be a supported content kind" });
  }
  if (!Number.isInteger(manifest.schemaVersion) || manifest.schemaVersion < 1) {
    issues.push({ packId, path: "manifest.schemaVersion", message: "must be a positive integer" });
  }
  if (!isNonBlankString(manifest.contentVersion)) {
    issues.push({ packId, path: "manifest.contentVersion", message: "must be a non-empty string" });
  }

  return issues;
}

/**
 * Validate and freeze an authored content catalogue.
 *
 * The validation intentionally runs when a module is imported. A bad shipped
 * definition is a build-time defect, not a recoverable player-state problem.
 */
export function defineContentPack<
  Kind extends ContentKind,
  Definition,
>(input: DefineContentPackInput<Kind, Definition>): VersionedContentPack<Kind, Definition> {
  const issues = validateManifest(input.manifest);
  const seenIds = new Set<string>();

  if (input.entries.length === 0) {
    issues.push({
      packId: input.manifest.id,
      path: "entries",
      message: "must contain at least one definition",
    });
  }

  for (const definition of input.entries) {
    let definitionId: string;
    try {
      definitionId = input.getDefinitionId(definition);
    } catch (error) {
      issues.push({
        packId: input.manifest.id,
        path: "definition.id",
        message: `could not be resolved: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }
    if (!isNonBlankString(definitionId)) {
      issues.push({
        packId: input.manifest.id,
        path: "definition.id",
        message: "must be a non-empty string",
      });
      continue;
    }
    if (seenIds.has(definitionId)) {
      issues.push({
        packId: input.manifest.id,
        definitionId,
        path: "definition.id",
        message: "must be unique within its content pack",
      });
    }
    seenIds.add(definitionId);

    for (const issue of input.validateDefinition(definition)) {
      issues.push({
        packId: input.manifest.id,
        definitionId,
        ...issue,
      });
    }
  }

  if (issues.length > 0) {
    throw new ContentValidationError(issues);
  }

  return Object.freeze({
    manifest: Object.freeze({ ...input.manifest }),
    entries: Object.freeze([...input.entries]),
    getDefinitionId: input.getDefinitionId,
  });
}

export function getContentEntry<Definition>(
  pack: VersionedContentPack<ContentKind, Definition>,
  id: string,
): Definition | undefined {
  return pack.entries.find((entry) => pack.getDefinitionId(entry) === id);
}

/** Stable IDs suitable for a run content fingerprint or release diagnostics. */
export function getContentDefinitionIds<
  Kind extends ContentKind,
  Definition,
>(pack: VersionedContentPack<Kind, Definition>): string[] {
  return pack.entries.map(
    (entry) => `${pack.manifest.kind}:${pack.getDefinitionId(entry)}@${pack.manifest.contentVersion}`,
  );
}

export function hasNonBlankString(value: unknown): value is string {
  return isNonBlankString(value);
}
