import type {
  LoanDeal,
  Player,
  PlayerMovementEvent,
  TransferAddOn,
} from "@/engine/core/types";

type TransferAgreementRole = NonNullable<LoanDeal["agreedPlayingTime"]>;
type MovementSettlement = NonNullable<PlayerMovementEvent["financialSettlements"]>[number];

export interface TransferNewsPresentationInput {
  playerName: string;
  fromClubName?: string;
  toClubName?: string;
  fromCountry?: string;
  toCountry?: string;
  transfer: {
    fee: number;
    wage?: number;
    contractLength?: number;
    signingBonus?: number;
    addOns?: TransferAddOn[];
    agreedRole?: TransferAgreementRole;
  };
}

export interface RetirementOutlookPresentation {
  badgeLabel: string;
  badgeClassName: string;
  headline: string;
  timingLabel: string;
  updatedLabel: string;
  reasons: string[];
}

export interface PlayerMovementPresentation {
  title: string;
  summary: string;
  details: string[];
}

function formatCompactCurrency(value: number): string {
  const rounded = Math.max(0, Math.round(value));
  if (rounded >= 1_000_000) return `£${(rounded / 1_000_000).toFixed(1)}M`;
  if (rounded >= 1_000) return `£${Math.round(rounded / 1_000)}K`;
  return `£${rounded}`;
}

function formatExactCurrency(value: number): string {
  return `£${Math.max(0, Math.round(value)).toLocaleString("en-GB")}`;
}

function formatRole(role: TransferAgreementRole): string {
  switch (role) {
    case "key": return "key player role";
    case "regular": return "regular first-team role";
    case "rotation": return "rotation role";
    case "prospect": return "development prospect role";
  }
}

function formatContractLength(contractLength: number): string {
  return `${contractLength}-year deal`;
}

function formatTransferAddOn(addOn: TransferAddOn): string {
  if (addOn.type === "sellOnClause") {
    return `${Math.max(0, Math.round(addOn.value))}% sell-on clause`;
  }

  const value = formatExactCurrency(addOn.value);
  switch (addOn.type) {
    case "appearanceBonus":
      return addOn.trigger
        ? `appearance bonus at ${addOn.trigger} (${value})`
        : `appearance bonus (${value})`;
    case "performanceBonus":
      return addOn.trigger
        ? `performance bonus at ${addOn.trigger} (${value})`
        : `performance bonus (${value})`;
    case "relegationClause":
      return addOn.trigger
        ? `relegation clause at ${addOn.trigger} (${value})`
        : `relegation clause (${value})`;
    default:
      return value;
  }
}

function formatRouteSentence(fromCountry?: string, toCountry?: string): string {
  if (!fromCountry || !toCountry || fromCountry === toCountry) return "";
  return ` The move takes him from ${fromCountry} to ${toCountry}.`;
}

function movementTitle(type: PlayerMovementEvent["type"]): string {
  const titles: Record<PlayerMovementEvent["type"], string> = {
    youthSigning: "Signed from youth football",
    permanentTransfer: "Permanent transfer",
    loanStart: "Loan started",
    loanReturn: "Returned from loan",
    loanRecall: "Recalled from loan",
    loanBuyOption: "Loan made permanent",
    release: "Released",
    freeAgentSigning: "Signed as a free agent",
    contractRenewal: "Contract renewed",
    retirement: "Retired",
    footballExit: "Left professional football",
  };
  return titles[type];
}

function clubName(
  clubId: string | undefined,
  resolveClubName?: (clubId: string | undefined) => string | undefined,
): string | undefined {
  return resolveClubName?.(clubId) ?? clubId;
}

function settlementLabel(settlement: MovementSettlement): string {
  switch (settlement.type) {
    case "sellOnClause":
      return `Sell-on settlement paid: ${formatExactCurrency(settlement.amount)}.`;
    case "appearanceBonus":
      return `Appearance bonus settled: ${formatExactCurrency(settlement.amount)}.`;
    case "performanceBonus":
      return `Performance bonus settled: ${formatExactCurrency(settlement.amount)}.`;
    case "relegationClause":
      return `Relegation clause settled: ${formatExactCurrency(settlement.amount)}.`;
    case "loanWageContribution":
      return `Loan wage obligation recorded: ${formatExactCurrency(settlement.amount)}.`;
  }

  const exhaustiveType: never = settlement.type;
  return `Financial settlement recorded: ${formatExactCurrency(settlement.amount)} (${exhaustiveType}).`;
}

export function formatTransferNewsBody(input: TransferNewsPresentationInput): string {
  const fromClub = input.fromClubName ?? "Unknown";
  const toClub = input.toClubName ?? "Unknown";
  const sentences = [
    `${input.playerName} has completed a transfer from ${fromClub} to ${toClub} for ${formatCompactCurrency(input.transfer.fee)}.`,
  ];

  const terms: string[] = [];
  if (input.transfer.agreedRole) terms.push(formatRole(input.transfer.agreedRole));
  if (input.transfer.wage && input.transfer.wage > 0) {
    terms.push(`${formatCompactCurrency(input.transfer.wage)}/week`);
  }
  if (input.transfer.contractLength && input.transfer.contractLength > 0) {
    terms.push(formatContractLength(input.transfer.contractLength));
  }
  if (input.transfer.signingBonus && input.transfer.signingBonus > 0) {
    terms.push(`${formatExactCurrency(input.transfer.signingBonus)} signing bonus`);
  }
  if ((input.transfer.addOns ?? []).length > 0) {
    terms.push(
      `add-ons including ${(input.transfer.addOns ?? []).map(formatTransferAddOn).join(", ")}`,
    );
  }

  if (terms.length > 0) {
    sentences.push(`Agreed terms: ${terms.join(", ")}.`);
  }

  const routeSentence = formatRouteSentence(input.fromCountry, input.toCountry);
  return `${sentences.join(" ")}${routeSentence}`;
}

export function buildRetirementOutlookPresentation(
  player: Pick<Player, "retirementOutlook">,
  currentSeason: number,
): RetirementOutlookPresentation | null {
  const outlook = player.retirementOutlook;
  if (!outlook) return null;

  const updatedDelta = Math.max(0, currentSeason - outlook.updatedSeason);
  const updatedLabel = updatedDelta === 0
    ? "Updated this season"
    : updatedDelta === 1
      ? "Updated last season"
      : `Updated in season ${outlook.updatedSeason}`;

  switch (outlook.status) {
    case "ready":
      return {
        badgeLabel: "Retirement close",
        badgeClassName: "border-amber-500/40 bg-amber-500/10 text-amber-300",
        headline: "A retirement decision looks close.",
        timingLabel: "Timing: an end-of-career call could come soon.",
        updatedLabel,
        reasons: outlook.reasons,
      };
    case "considering":
      return {
        badgeLabel: "Retirement in view",
        badgeClassName: "border-sky-500/40 bg-sky-500/10 text-sky-300",
        headline: "Late-career planning is beginning to come into view.",
        timingLabel: "Timing: a decision could develop over the next season or two.",
        updatedLabel,
        reasons: outlook.reasons,
      };
    default:
      return {
        badgeLabel: "Retirement settled",
        badgeClassName: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
        headline: "No immediate retirement signal is showing.",
        timingLabel: "Timing: nothing points to an imminent exit for now.",
        updatedLabel,
        reasons: outlook.reasons,
      };
  }
}

export function buildPlayerMovementPresentation(input: {
  movement: PlayerMovementEvent;
  loanDeal?: LoanDeal;
  resolveClubName?: (clubId: string | undefined) => string | undefined;
}): PlayerMovementPresentation {
  const { movement, loanDeal, resolveClubName } = input;
  const fromName = clubName(movement.fromClubId, resolveClubName);
  const toName = clubName(movement.toClubId, resolveClubName);
  const details: string[] = [];

  if (movement.reason) {
    details.push(movement.reason);
  }
  for (const settlement of movement.financialSettlements ?? []) {
    details.push(settlementLabel(settlement));
  }

  switch (movement.type) {
    case "permanentTransfer":
      return {
        title: movementTitle(movement.type),
        summary: fromName && toName
          ? `${fromName} to ${toName}${movement.fee !== undefined ? ` for ${formatCompactCurrency(movement.fee)}` : ""}.`
          : toName
            ? `Joined ${toName}${movement.fee !== undefined ? ` for ${formatCompactCurrency(movement.fee)}` : ""}.`
            : "Changed clubs permanently.",
        details,
      };
    case "loanStart": {
      if (loanDeal?.agreedPlayingTime) {
        details.push(`Agreed role: ${formatRole(loanDeal.agreedPlayingTime)}.`);
      }
      if (loanDeal && loanDeal.wageContribution > 0) {
        details.push(`Wage coverage: ${loanDeal.wageContribution}% paid by the loan club.`);
      }
      if (loanDeal?.buyOptionFee && loanDeal.buyOptionFee > 0) {
        details.push(`Buy option: ${formatExactCurrency(loanDeal.buyOptionFee)}.`);
      }
      return {
        title: movementTitle(movement.type),
        summary: toName
          ? `Loaned to ${toName}${loanDeal?.loanFee ? ` for ${formatCompactCurrency(loanDeal.loanFee)}` : ""}.`
          : "Moved on loan.",
        details,
      };
    }
    case "loanBuyOption":
      if (loanDeal?.agreedPlayingTime) {
        details.push(`The loan had been agreed as a ${formatRole(loanDeal.agreedPlayingTime)}.`);
      }
      return {
        title: movementTitle(movement.type),
        summary: toName
          ? `Loan move became permanent at ${toName}${loanDeal?.buyOptionFee ? ` for ${formatCompactCurrency(loanDeal.buyOptionFee)}` : ""}.`
          : "Loan move became permanent.",
        details,
      };
    case "loanReturn":
      return {
        title: movementTitle(movement.type),
        summary: toName
          ? `Returned from loan to ${toName}.`
          : "Returned from loan.",
        details,
      };
    case "loanRecall":
      return {
        title: movementTitle(movement.type),
        summary: toName
          ? `Recalled from loan to ${toName}.`
          : "Recalled from loan.",
        details,
      };
    case "freeAgentSigning":
      return {
        title: movementTitle(movement.type),
        summary: toName
          ? `Signed as a free agent by ${toName}${movement.fee !== undefined ? ` with ${formatCompactCurrency(movement.fee)} in upfront costs` : ""}.`
          : "Signed as a free agent.",
        details,
      };
    case "contractRenewal":
      return {
        title: movementTitle(movement.type),
        summary: toName || fromName
          ? `Renewed with ${toName ?? fromName}.`
          : "Signed a contract renewal.",
        details,
      };
    case "retirement":
      return {
        title: movementTitle(movement.type),
        summary: "Retired from football.",
        details,
      };
    case "footballExit":
      return {
        title: movementTitle(movement.type),
        summary: "Left professional football.",
        details,
      };
    case "release":
      return {
        title: movementTitle(movement.type),
        summary: fromName ? `Released by ${fromName}.` : "Released by the owning club.",
        details,
      };
    case "youthSigning":
      return {
        title: movementTitle(movement.type),
        summary: toName ? `Joined ${toName}.` : "Joined an academy setup.",
        details,
      };
  }
}
