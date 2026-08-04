import type { GameDate } from "./player";

export interface ContactInteraction {
  occurredAt: GameDate;
  type: "meeting" | "tip" | "referral" | "betrayal" | "favor";
  trustDelta: number;
}

export type GossipClaimStatus = "accurate" | "inaccurate" | "ambiguous";

export interface GossipItem {
  id: string;
  type: "transferRumor" | "unhappyPlayer" | "youthProspect" | "managerChange" | "injuryNews";
  playerId?: string;
  clubId?: string;
  reliability: number;
  claimStatus: GossipClaimStatus;
  revealedAt: GameDate;
  expiresAt: GameDate;
  content: string;
  actionTaken?: GossipAction;
  dismissed?: boolean;
}

export type GossipAction = "actOn" | "watchClosely" | "dismiss";

export type ActionableGossipItem = GossipItem & { contactId: string };
