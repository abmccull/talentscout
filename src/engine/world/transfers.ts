/**
 * Geography-aware transfer-flow weights.
 *
 * Transfer selection, money, registrations, and contracts are owned by the
 * core lifecycle pipeline. This module deliberately has no mutation logic; it
 * only describes how plausible one country-to-country route is relative to
 * another.
 */

import { normalizeCountryKey } from "@/lib/country";

const TRANSFER_FLOW_MATRIX: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  argentina: { spain: 0.18, italy: 0.12, england: 0.08, portugal: 0.07, france: 0.05 },
  austria: { germany: 0.18, switzerland: 0.08, italy: 0.04 },
  belgium: { france: 0.12, netherlands: 0.1, england: 0.08, germany: 0.06 },
  brazil: { portugal: 0.22, spain: 0.14, england: 0.1, italy: 0.09, france: 0.08 },
  cameroon: { france: 0.2, belgium: 0.09, england: 0.05 },
  canada: { england: 0.1, germany: 0.08, france: 0.05, usa: 0.16 },
  chile: { spain: 0.14, argentina: 0.08, italy: 0.05 },
  colombia: { spain: 0.14, portugal: 0.08, argentina: 0.06, england: 0.05 },
  croatia: { italy: 0.14, germany: 0.1, austria: 0.08 },
  denmark: { england: 0.1, germany: 0.09, netherlands: 0.08, sweden: 0.06 },
  ecuador: { spain: 0.12, portugal: 0.06, argentina: 0.05 },
  england: { scotland: 0.12, spain: 0.06, germany: 0.05, france: 0.05, italy: 0.04 },
  france: { england: 0.1, belgium: 0.09, germany: 0.07, italy: 0.06, spain: 0.05 },
  germany: { austria: 0.1, england: 0.07, switzerland: 0.07, netherlands: 0.06 },
  ghana: { england: 0.1, france: 0.09, belgium: 0.08, germany: 0.05 },
  ivorycoast: { france: 0.24, belgium: 0.09, england: 0.05 },
  italy: { england: 0.06, spain: 0.05, france: 0.05, switzerland: 0.04 },
  japan: { germany: 0.1, belgium: 0.08, netherlands: 0.07, england: 0.05 },
  mexico: { spain: 0.1, portugal: 0.06, usa: 0.14 },
  morocco: { france: 0.2, spain: 0.12, belgium: 0.09, netherlands: 0.06 },
  netherlands: { england: 0.12, germany: 0.1, belgium: 0.08, spain: 0.05 },
  nigeria: { england: 0.12, belgium: 0.09, france: 0.08, germany: 0.06 },
  norway: { england: 0.1, denmark: 0.08, germany: 0.07, sweden: 0.07 },
  paraguay: { argentina: 0.12, spain: 0.08, brazil: 0.06 },
  peru: { spain: 0.08, argentina: 0.07, portugal: 0.04 },
  poland: { germany: 0.12, italy: 0.06, england: 0.06 },
  portugal: { spain: 0.12, england: 0.1, france: 0.08, italy: 0.05 },
  scotland: { england: 0.2, wales: 0.06 },
  senegal: { france: 0.24, belgium: 0.08, england: 0.06, spain: 0.05 },
  serbia: { italy: 0.12, germany: 0.09, austria: 0.08 },
  southkorea: { germany: 0.09, england: 0.07, belgium: 0.06 },
  spain: { england: 0.08, portugal: 0.08, italy: 0.06, france: 0.05 },
  sweden: { denmark: 0.09, england: 0.08, germany: 0.07, norway: 0.06 },
  switzerland: { germany: 0.12, france: 0.09, italy: 0.08 },
  turkey: { germany: 0.12, netherlands: 0.06, france: 0.05 },
  uruguay: { spain: 0.14, argentina: 0.11, italy: 0.08, portugal: 0.06 },
  usa: { england: 0.09, germany: 0.08, netherlands: 0.06, canada: 0.1 },
  wales: { england: 0.2, scotland: 0.06 },
};

const SAME_COUNTRY_FLOW = 0.3;
const DEFAULT_FLOW = 0.02;

function normalizeCountry(name: string): string {
  return normalizeCountryKey(name) ?? name.trim().toLowerCase().replace(/[\s_-]+/g, " ");
}

/**
 * Returns a relative route weight. The caller combines this with sporting,
 * financial, squad-need, and club-philosophy factors before selecting a club.
 */
export function getTransferFlowProbability(
  fromCountry: string,
  toCountry: string,
): number {
  const from = normalizeCountry(fromCountry);
  const to = normalizeCountry(toCountry);
  if (from === to) return SAME_COUNTRY_FLOW;
  return TRANSFER_FLOW_MATRIX[from]?.[to] ?? DEFAULT_FLOW;
}
