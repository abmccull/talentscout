// Destination: tests/engine/observation/observationSituationArchiveMalformedMasks.test.ts.
// Preceding canonical-mask regression; keep -0 in memory because JSON normalizes it to 0.
import { describe, expect, it } from "vitest";
import {
  compactObservationSituationSnapshot as compact,
  expandObservationSituationSnapshot as expand,
  InvalidObservationSituationArchiveError,
} from "@/engine/observation/situationArchive";
import { wire } from "./observationSituationArchiveFixtures";

function descriptors(target: object) {
  return Reflect.ownKeys(target).map(key => [key, Object.getOwnPropertyDescriptor(target, key)!] as const);
}

describe("observation situation canonical masks", () => {
  it.each([["presenceMask", 1], ["undefinedMask", 2]] as const)(
    "refuses signed-zero %s before payload getters and preserves every input reference",
    (_label, slot) => {
      for (const withGetter of [false, true]) {
        let reads = 0;
        const input = wire();
        const payload = input.observationSituationV1;
        payload[slot] = -0;
        if (withGetter) {
          const signal = payload[13] as Record<string, unknown>;
          Object.defineProperty(signal, "technical", {
            enumerable: true, configurable: true, get() { reads++; return 1.2; },
          });
        }
        const targets = [input, payload, ...payload.filter(
          (value): value is object => value !== null && typeof value === "object",
        )];
        const before = targets.map(target => ({ target, entries: descriptors(target) }));
        expect(Object.is(payload[slot], -0)).toBe(true);

        const operations = [(value: unknown) => expand(value), (value: unknown) => compact(value)];
        for (const operation of operations) {
          let refusal: unknown;
          try { operation(input); } catch (error) { refusal = error; }
          expect(refusal).toBeInstanceOf(InvalidObservationSituationArchiveError);
          expect((refusal as Error | undefined)?.message).toBe(
            "Invalid observation situation archive: invalid presence or undefined mask",
          );
          for (const { target, entries } of before) {
            expect(Reflect.ownKeys(target)).toStrictEqual(entries.map(([key]) => key));
            for (const [key, descriptor] of entries) {
              const current = Object.getOwnPropertyDescriptor(target, key)!;
              expect(Reflect.ownKeys(current)).toStrictEqual(Reflect.ownKeys(descriptor));
              for (const field of Reflect.ownKeys(descriptor) as (keyof PropertyDescriptor)[]) {
                expect(Object.is(current[field], descriptor[field])).toBe(true);
              }
            }
          }
          expect(Object.is(payload[slot], -0)).toBe(true);
          expect(reads).toBe(0);
        }
      }
    },
  );
});

