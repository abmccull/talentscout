import * as Sentry from "@sentry/nextjs";

const standardErrorTypes = new Set([
  "Error", "TypeError", "RangeError", "ReferenceError", "SyntaxError",
  "URIError", "EvalError", "AggregateError",
]);
const errorIntegrations = new Set([
  "InboundFilters", "BrowserApiErrors", "GlobalHandlers", "Dedupe",
]);
const privateMessage = "Renderer exception (message omitted for privacy)";

/** Keep useful compiled locations without sending local paths or source data. */
function applicationFrame(frame: Sentry.StackFrame): Sentry.StackFrame[] {
  const file = frame.filename?.split(/[?#]/, 1)[0];
  const assetOffset = file?.indexOf("/_next/static/") ?? -1;
  if (!file || assetOffset < 0) return [];
  const filename = file.slice(assetOffset);
  if (!/^\/_next\/static\/[a-zA-Z0-9_./-]+\.js$/.test(filename)) return [];

  return [{
    filename,
    function: frame.function && /^[\w.$<>\[\]-]{1,160}$/.test(frame.function)
      ? frame.function
      : undefined,
    lineno: frame.lineno,
    colno: frame.colno,
    in_app: true,
  }];
}

/** Allowlist the event payload: error messages can contain saves or account data. */
export function sanitizeRendererError(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  const exceptions = event.exception?.values ?? [{ type: "Error" }];
  return {
    type: undefined,
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: "javascript",
    level: "error",
    release: process.env.NEXT_PUBLIC_BUILD_VERSION || "development",
    environment: process.env.NODE_ENV,
    tags: { runtime: "renderer" },
    exception: {
      values: exceptions.slice(-5).map((exception) => ({
        type: standardErrorTypes.has(exception.type ?? "") ? exception.type : "Error",
        value: privateMessage,
        stacktrace: exception.stacktrace ? {
          frames: exception.stacktrace.frames?.flatMap(applicationFrame).slice(-50),
        } : undefined,
      })),
    },
  };
}

export function initializeClientErrorReporting(): boolean {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
  if (typeof window === "undefined" || !dsn) return false;
  if (Sentry.getClient()) return true;

  Sentry.init({
    dsn,
    release: process.env.NEXT_PUBLIC_BUILD_VERSION || "development",
    environment: process.env.NODE_ENV,
    sendDefaultPii: false,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      httpBodies: [],
      queryParams: false,
      genAI: { inputs: false, outputs: false },
      stackFrameVariables: false,
      frameContextLines: 0,
    },
    maxBreadcrumbs: 0,
    sendClientReports: false,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    enableLogs: false,
    enableMetrics: false,
    integrations: (defaults) => defaults.filter(({ name }) => errorIntegrations.has(name)),
    beforeSend: (event, hint) => {
      // Scope attachments bypass event fields unless removed from the send hint.
      hint.attachments = [];
      return sanitizeRendererError(event);
    },
  });
  return true;
}

export function captureException(error: unknown): void {
  // Also initialize on direct capture, protecting error boundaries that run early.
  if (initializeClientErrorReporting()) Sentry.captureException(error);
}
