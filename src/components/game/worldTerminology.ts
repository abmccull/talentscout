export const WORLD_TERMS = {
  familiarity: {
    label: "Familiarity",
    shortLabel: "Familiarity",
    description:
      "Your personal track record and local credibility in this country. It grows when your reads land, your reports hold up, and local people trust your judgment.",
  },
  regionalKnowledge: {
    label: "Regional knowledge",
    shortLabel: "Regional knowledge",
    description:
      "Your learned football intelligence for this country. It can become stale if you stop working the market, so it is a dossier of context rather than a permanent truth unlock.",
  },
  operationalPresence: {
    label: "Operational presence",
    shortLabel: "Operational presence",
    description:
      "Your access and delivery strength in this country. It combines travel routes, local infrastructure, trusted people, and active coverage into one practical access score.",
  },
} as const;

export function worldTermSummary(): string {
  return `${WORLD_TERMS.familiarity.label} is personal credibility. ${WORLD_TERMS.regionalKnowledge.label} is learned, potentially stale football intelligence. ${WORLD_TERMS.operationalPresence.label} is your combined access and delivery strength.`;
}
