import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

const hashPattern = /^[a-f0-9]{64}$/;
const eventPattern = /^[a-f0-9]{32}$/;
const privateMessage = "Renderer exception (message omitted for privacy)";
const standardErrors = new Set(["Error", "TypeError", "RangeError", "ReferenceError", "SyntaxError", "URIError", "EvalError", "AggregateError"]);
const requiredControls = ["installedExactPackage", "intentionalRendererError", "providerEventReadBack", "payloadPrivacyReviewed"];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const empty = (value) => value == null || value === "" || (typeof value === "object" && Object.values(value).every(empty));
const inside = (root, path) => {
  const part = relative(root, path);
  return part && part !== ".." && !part.startsWith(`..${sep}`) && !isAbsolute(part);
};

// The project-event API normalizes SDK snake_case frame names to camelCase.
// Only documented null metadata and exact sent locations are permitted; no
// source-map content, local paths, variables, or arbitrary added fields.
function matchesReceivedStack(stack, sentFrames) {
  if (stack == null) return sentFrames.length === 0;
  if (Object.keys(stack).some((key) => !["frames", "framesOmitted", "registers", "hasSystemFrames"].includes(key))
    || !empty(stack.framesOmitted) || !empty(stack.registers)
    || (stack.hasSystemFrames != null && stack.hasSystemFrames !== false)
    || !Array.isArray(stack.frames) || stack.frames.length !== sentFrames.length) return false;
  const nullable = ["errors", "vars", "package", "module", "platform", "instructionAddr", "context", "symbolAddr", "trust", "symbol"];
  const fields = new Set(["filename", "absPath", "function", "lineNo", "colNo", "inApp", ...nullable]);
  return stack.frames.every((frame, index) => {
    const sent = sentFrames[index];
    return frame && Object.keys(frame).every((key) => fields.has(key))
      && frame.filename === sent.filename && (empty(frame.absPath) || frame.absPath === sent.filename)
      && (frame.function ?? "") === (sent.function ?? "")
      && (frame.lineNo ?? null) === (sent.lineno ?? null) && (frame.colNo ?? null) === (sent.colno ?? null)
      && frame.inApp === sent.in_app && nullable.every((key) => empty(frame[key]));
  });
}

function safeProviderContexts(contexts) {
  if (empty(contexts)) return true;
  if (typeof contexts !== "object" || Array.isArray(contexts)) return false;
  return Object.entries(contexts).every(([key, context]) => ["browser", "os"].includes(key)
    && context && typeof context === "object" && !Array.isArray(context)
    && Object.keys(context).every((field) => ["type", "name", "version"].includes(field))
    && (context.type == null || context.type === key)
    && typeof context.name === "string" && /^[A-Za-z][A-Za-z0-9 ._()-]{0,79}$/.test(context.name)
    && (context.version == null || (typeof context.version === "string" && /^[0-9][A-Za-z0-9 ._-]{0,63}$/.test(context.version))));
}

// This verifies retained provider read-backs. It never sends a probe or calls
// Sentry. An accountable operator must collect the real event from the package.
export async function validateSentryProviderReceipt({ root, evidence, candidateSha, candidateTreeSha, candidateTag, packageManifest, packageManifestPath }) {
  const failures = [];
  const check = (condition, message) => { if (!condition) failures.push(message); };
  check(evidence.schemaVersion === 1 && evidence.evidenceKind === "sentry-provider-receipt", "Sentry receipt schema/kind is invalid");
  check(evidence.candidateCommitSha === candidateSha && evidence.candidateTreeSha === candidateTreeSha, "Sentry receipt does not describe the exact candidate commit/tree");
  check(evidence.candidateTag === (candidateTag ?? null), "Sentry receipt does not describe the exact candidate tag");
  check(evidence.status === "Passed" && typeof evidence.operator === "string" && evidence.operator.trim(), "Sentry receipt needs a completed accountable operator pass");
  const completedAt = Date.parse(evidence.completedAt ?? "");
  check(Number.isFinite(completedAt) && completedAt <= Date.now(), "Sentry receipt completion timestamp is invalid or in the future");
  for (const key of requiredControls) check(evidence.controls?.[key]?.status === "Passed", `Sentry receipt control ${key} did not pass`);
  check(Object.values(evidence.controls ?? {}).every((control) => control?.status === "Passed"), "Sentry receipt contains non-passing controls");
  try {
    check(packageManifestPath && evidence.packageManifestSha256 === hash(await readFile(packageManifestPath)), "Sentry receipt is not bound to the exact package manifest");
  } catch { failures.push("Sentry receipt package manifest cannot be read"); }
  const testedPackage = evidence.testedPackage;
  const manifestPackage = packageManifest?.packages?.find((entry) => entry.kind === testedPackage?.kind);
  check(manifestPackage && testedPackage.sha256 === manifestPackage.sha256 && testedPackage.bytes === manifestPackage.bytes, "Sentry receipt is not bound to an exact manifest package hash/length");

  const provider = evidence.provider ?? {};
  check(eventPattern.test(provider.eventId ?? ""), "Sentry receipt event ID is invalid");
  const readAt = Date.parse(provider.retrievedAt ?? "");
  check(provider.httpStatus === 200 && Number.isFinite(readAt) && readAt <= completedAt, "Sentry receipt requires a successful provider read-back before completion");
  try {
    const url = new URL(provider.eventApiUrl);
    check(url.protocol === "https:" && (url.hostname === "sentry.io" || url.hostname.endsWith(".sentry.io"))
      && !url.username && !url.password && !url.search && !url.hash
      && /^[a-zA-Z0-9_-]+$/.test(provider.organization ?? "") && /^[a-zA-Z0-9_-]+$/.test(provider.project ?? "")
      && url.pathname === `/api/0/projects/${provider.organization}/${provider.project}/events/${provider.eventId}/`,
    "Sentry receipt API URL does not bind the declared project and event");
  } catch { failures.push("Sentry receipt API URL is invalid"); }

  const resolvedRoot = await realpath(root);
  const usedPaths = new Set();
  async function boundJson(entry, label) {
    try {
      if (!entry || typeof entry.path !== "string" || isAbsolute(entry.path) || !hashPattern.test(entry.sha256 ?? "")) throw new Error("invalid file binding");
      const path = resolve(resolvedRoot, entry.path);
      const real = await realpath(path);
      if (!inside(resolvedRoot, real) || (await lstat(path)).isSymbolicLink() || usedPaths.has(real)) throw new Error("unsafe or reused evidence path");
      usedPaths.add(real);
      const bytes = await readFile(real);
      if (hash(bytes) !== entry.sha256) throw new Error("hash does not match");
      return JSON.parse(bytes.toString("utf8"));
    } catch (error) {
      failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
  const sent = await boundJson(evidence.sentEvent, "Sentry sent event");
  const received = await boundJson(evidence.providerEvent, "Sentry provider event");
  const attachments = await boundJson(evidence.providerAttachments, "Sentry provider attachments");
  check(Array.isArray(attachments) && attachments.length === 0, "Sentry provider event must have zero attachments");
  check(provider.attachmentsHttpStatus === 200 && provider.attachmentsApiUrl === `${provider.eventApiUrl}attachments/`, "Sentry receipt requires the matching attachments API read-back");

  if (sent) {
    const allowed = new Set(["event_id", "timestamp", "platform", "level", "release", "environment", "tags", "exception"]);
    check(Object.keys(sent).every((key) => allowed.has(key)), "Sentry sent event contains fields outside the privacy allowlist");
    check(sent.event_id === provider.eventId && sent.release === candidateSha && sent.platform === "javascript"
      && sent.level === "error" && sent.environment === "production", "Sentry sent event identity or production renderer scope does not match");
    check(sent.tags?.runtime === "renderer" && Object.keys(sent.tags ?? {}).length === 1, "Sentry sent event tags are not the renderer allowlist");
    check(typeof sent.timestamp === "number" && Number.isFinite(sent.timestamp) && sent.timestamp * 1000 <= readAt, "Sentry sent event timestamp is invalid or after provider read-back");
    const values = sent.exception?.values;
    check(Object.keys(sent.exception ?? {}).every((key) => key === "values") && Array.isArray(values) && values.length > 0 && values.length <= 5, "Sentry sent event exception list is invalid");
    for (const exception of Array.isArray(values) ? values : []) {
      check(Object.keys(exception).every((key) => ["type", "value", "stacktrace"].includes(key))
        && standardErrors.has(exception.type) && exception.value === privateMessage, "Sentry sent event contains an unsanitized exception");
      if (exception.stacktrace) {
        check(Object.keys(exception.stacktrace).every((key) => key === "frames") && Array.isArray(exception.stacktrace.frames) && exception.stacktrace.frames.length <= 50, "Sentry sent event stacktrace is invalid");
        for (const frame of exception.stacktrace.frames ?? []) {
          check(Object.keys(frame).every((key) => ["filename", "function", "lineno", "colno", "in_app"].includes(key))
            && /^\/_next\/static\/[a-zA-Z0-9_./-]+\.js$/.test(frame.filename ?? "")
            && (frame.function === undefined || /^[\w.$<>\[\]-]{1,160}$/.test(frame.function)) && frame.in_app === true
            && [frame.lineno, frame.colno].every((number) => number === undefined || (Number.isInteger(number) && number >= 0)),
          "Sentry sent event contains an unsanitized frame");
        }
      }
    }
  }
  if (received) {
    const tags = Array.isArray(received.tags) ? received.tags : [];
    const tag = (key) => tags.filter((entry) => entry.key === key);
    const release = received.release?.version ?? tag("release")[0]?.value;
    check(received.eventID === provider.eventId && release === candidateSha && received.platform === "javascript" && received.type === "error", "Sentry provider event identity/release does not match the candidate");
    check(tag("runtime").length === 1 && tag("runtime")[0].value === "renderer"
      && tag("environment").length === 1 && tag("environment")[0].value === "production"
      && tag("release").every((entry) => entry.value === candidateSha), "Sentry provider event tags do not match the production renderer");
    const receivedAt = Date.parse(received.dateReceived ?? "");
    check(Number.isFinite(receivedAt) && receivedAt <= readAt && receivedAt >= (sent?.timestamp ?? Infinity) * 1000 - 60_000, "Sentry provider receipt timestamp does not follow the sent event");
    const entries = Array.isArray(received.entries) ? received.entries : [];
    const exceptions = entries.filter((entry) => entry.type === "exception").flatMap((entry) => entry.data?.values ?? []);
    check(exceptions.length > 0 && exceptions.length === sent?.exception?.values?.length
      && exceptions.every((exception, index) => exception.value === privateMessage && exception.type === sent.exception.values[index].type), "Sentry provider exception does not match the sanitized sent event");
    for (const [index, exception] of exceptions.entries()) {
      const sentFrames = sent?.exception?.values?.[index]?.stacktrace?.frames ?? [];
      check(Object.keys(exception).every((key) => ["type", "value", "stacktrace", "rawStacktrace", "module", "threadId", "mechanism"].includes(key))
        && empty(exception.module) && empty(exception.threadId)
        && (empty(exception.mechanism) || (exception.mechanism.type === "generic" && typeof exception.mechanism.handled === "boolean"
          && Object.keys(exception.mechanism).every((key) => ["type", "handled"].includes(key)))), "Sentry provider exception contains unexpected metadata");
      check(matchesReceivedStack(exception.stacktrace, sentFrames)
        && (exception.rawStacktrace == null || matchesReceivedStack(exception.rawStacktrace, sentFrames)), "Sentry provider frames do not match the sanitized sent frame allowlist");
    }
    check(empty(received.user) && empty(received.context) && safeProviderContexts(received.contexts) && empty(received.extra) && empty(received.request) && empty(received.userReport), "Sentry provider event contains personal, request, or custom context data");
    check(entries.every((entry) => entry.type === "exception" || (entry.type === "breadcrumbs" && empty(entry.data?.values))), "Sentry provider event contains unexpected payload entries");
    check(empty(received.message) || received.message === privateMessage, "Sentry provider event contains an unsanitized message");
    check(empty(received.metadata?.value) || received.metadata.value === privateMessage, "Sentry provider event contains unsanitized exception metadata");
  }
  return failures;
}
