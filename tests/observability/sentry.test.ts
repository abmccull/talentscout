import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ClientOptions = Parameters<typeof Sentry.init>[0];
type ClientTransport = ReturnType<NonNullable<ClientOptions["transport"]>>;
type Envelope = Parameters<ClientTransport["send"]>[0];

const transport = vi.hoisted(() => ({ envelopes: [] as Envelope[] }));

// Exercise the real SDK event pipeline, replacing only outbound transport.
vi.mock("@sentry/nextjs", async () => {
  // The SDK's CommonJS entry exposes all re-exported core methods in Node tests.
  const { createRequire } = await import("node:module");
  const sdk = createRequire(import.meta.url)("@sentry/nextjs") as typeof import("@sentry/nextjs");
  return {
    ...sdk,
    init: vi.fn((options: Parameters<typeof sdk.init>[0]) => sdk.init({
      ...options,
      transport: () => ({
        send: (envelope: Envelope) => {
          transport.envelopes.push(envelope);
          return Promise.resolve({ statusCode: 200 });
        },
        flush: () => Promise.resolve(true),
      }),
    })),
  };
});

import * as Sentry from "@sentry/nextjs";
import { captureException, initializeClientErrorReporting } from "../../src/lib/sentry";

describe("renderer error reporting", () => {
  beforeEach(() => {
    transport.envelopes.length = 0;
    vi.clearAllMocks();
    vi.stubGlobal("window", {});
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://public@local-test.invalid/1");
    vi.stubEnv("NEXT_PUBLIC_BUILD_VERSION", "a".repeat(40));
    Sentry.getCurrentScope().clear();
    Sentry.getIsolationScope().clear();
    Sentry.getCurrentScope().setClient(undefined);
  });

  afterEach(async () => {
    await Sentry.close(1000);
    Sentry.getCurrentScope().setClient(undefined);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("stays inactive without a DSN or outside the renderer", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    captureException(new Error("private local-only error"));
    expect(initializeClientErrorReporting()).toBe(false);
    expect(Sentry.init).not.toHaveBeenCalled();

    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://public@local-test.invalid/1");
    vi.stubGlobal("window", undefined);
    expect(initializeClientErrorReporting()).toBe(false);
    expect(transport.envelopes).toHaveLength(0);
  });

  it("initializes once and delivers a scrubbed exception through the SDK transport", async () => {
    expect(initializeClientErrorReporting()).toBe(true);
    expect(initializeClientErrorReporting()).toBe(true);
    expect(Sentry.init).toHaveBeenCalledTimes(1);

    Sentry.setUser({ id: "private-user", email: "private@example.com" });
    Sentry.setExtra("save", { name: "private-save", token: "private-token" });
    Sentry.setContext("career", { player: "private-player" });
    Sentry.setTag("contact", "private-contact");
    Sentry.getCurrentScope().addAttachment({ filename: "save.json", data: "private-attachment" });
    const error = new TypeError("private-error-message");
    error.stack = "TypeError: private-error-message\n"
      + "    at advanceWeek (app://host/_next/static/chunks/game-123.js?token=private-query:10:20)\n"
      + "    at secret (C:/Users/private-owner/source.js:3:4)";

    captureException(error);
    await Sentry.flush(1000);

    const events = transport.envelopes.flatMap(([, items]) => items
      .filter(([header]) => header.type === "event")
      .map(([, payload]) => payload));
    expect(events).toHaveLength(1);
    const event = events[0] as Sentry.ErrorEvent;
    expect(event.release).toBe("a".repeat(40));
    expect(event.tags).toEqual({ runtime: "renderer" });
    expect(event.exception?.values?.[0].type).toBe("TypeError");
    expect(event.exception?.values?.[0].stacktrace?.frames).toContainEqual({
      filename: "/_next/static/chunks/game-123.js",
      function: "advanceWeek",
      lineno: 10,
      colno: 20,
      in_app: true,
    });
    expect(JSON.stringify(transport.envelopes)).not.toContain("private-");
    expect(JSON.stringify(transport.envelopes)).not.toContain("private@example.com");
    expect(Sentry.getClient()?.getOptions()).toMatchObject({
      sendDefaultPii: false,
      maxBreadcrumbs: 0,
      sendClientReports: false,
      tracesSampleRate: 0,
      enableLogs: false,
    });
  });
});
