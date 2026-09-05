import type { PlayerAttribute } from "@/engine/core/types";
import type { PlayerMoment } from "./types";

export interface MomentAction {
  id: string;
  momentType: PlayerMoment["momentType"];
  /** Ordered contributors: even a one-attribute cue must describe this action. */
  attributes: readonly PlayerAttribute[];
  pressure: boolean;
  outfieldOnly?: boolean;
  descriptions: { high: string; medium: string; low: string };
  /** Peripheral text identifies the passage without inventing its outcome. */
  vague: string;
}

/** Choose the football action before calculating how well it was executed. */
export const MOMENT_ACTIONS: readonly MomentAction[] = [
  {
    id: "short-pass", momentType: "technicalAction", attributes: ["passing"], pressure: false,
    descriptions: {
      high: "{playerName} weighted a short pass precisely into a teammate's stride under minimal pressure.",
      medium: "{playerName} completed a short pass under minimal pressure, though the receiver had to check their stride.",
      low: "{playerName} misplaced a short pass under minimal pressure, frustrating teammates.",
    },
    vague: "A short passing exchange took place; the execution was difficult to judge.",
  },
  {
    id: "pressured-reception", momentType: "technicalAction", attributes: ["firstTouch", "passing"], pressure: true,
    descriptions: {
      high: "{playerName} controlled a bouncing pass with a defender closing, then released an accurate forward pass.",
      medium: "{playerName} needed a second touch with a defender closing, but recovered and found a teammate.",
      low: "{playerName} lost control of the first touch under a defender's pressure before the pass could be released.",
    },
    vague: "A player received the ball with an opponent closing; the touches were hard to separate.",
  },
  {
    id: "dribble-duel", momentType: "technicalAction", attributes: ["dribbling"], pressure: true, outfieldOnly: true,
    descriptions: {
      high: "{playerName} beat a close marker with a body feint and carried the ball into space.",
      medium: "{playerName} tried to beat a close marker, then turned back to retain the ball.",
      low: "{playerName} dribbled into the close marker and lost the ball trying to force a way through.",
    },
    vague: "A player took on a close marker; the outcome was obscured from this angle.",
  },
  {
    id: "cross", momentType: "technicalAction", attributes: ["crossing"], pressure: false, outfieldOnly: true,
    descriptions: {
      high: "{playerName} used the space on the flank to deliver an accurate cross into a teammate's path.",
      medium: "{playerName} had time on the flank and sent a cross into a crowded area without finding a clear target.",
      low: "{playerName} had time on the flank but sent the cross well beyond its target.",
    },
    vague: "A cross came in from the flank; its accuracy was difficult to assess.",
  },
  {
    id: "finish", momentType: "technicalAction", attributes: ["finishing", "shooting"], pressure: false, outfieldOnly: true,
    descriptions: {
      high: "{playerName} found time in the box and struck a clean finish beyond the goalkeeper.",
      medium: "{playerName} found time in the box but directed the shot within the goalkeeper's reach.",
      low: "{playerName} shanked a shot from a promising position despite having time to set their feet.",
    },
    vague: "A shooting chance developed in the box; the strike was difficult to judge.",
  },
  {
    id: "contested-header", momentType: "technicalAction", attributes: ["heading"], pressure: true, outfieldOnly: true,
    descriptions: {
      high: "{playerName} directed a contested header accurately toward a teammate while a defender challenged.",
      medium: "{playerName} made contact with a contested header but could not direct it cleanly.",
      low: "{playerName} mistimed a contested header and sent the ball away from the intended target.",
    },
    vague: "Players contested a header; the quality of the contact was unclear.",
  },
  {
    id: "tackle", momentType: "technicalAction", attributes: ["tackling"], pressure: true, outfieldOnly: true,
    descriptions: {
      high: "{playerName} timed the tackle cleanly as the attacker tried to drive past.",
      medium: "{playerName} got a foot to the ball as the attacker drove past, leaving possession contested.",
      low: "{playerName} mistimed the tackle and allowed the attacker to drive past.",
    },
    vague: "A tackle was attempted in a close duel; the contact was hard to read.",
  },
  {
    id: "recovery-sprint", momentType: "physicalTest", attributes: ["pace"], pressure: true,
    descriptions: {
      high: "{playerName} accelerated quickly enough to close the gap to a dangerous runner.",
      medium: "{playerName} matched the runner's pace but could not quite close the gap.",
      low: "{playerName} was left trailing as the dangerous runner pulled away.",
    },
    vague: "A player sprinted after a runner; the relative pace was hard to judge.",
  },
  {
    id: "aerial-contest", momentType: "physicalTest", attributes: ["jumping", "strength"], pressure: true,
    descriptions: {
      high: "{playerName} rose above an opponent in a physical aerial contest and held their position through contact.",
      medium: "{playerName} matched the opponent's leap in a physical aerial contest without gaining a clear advantage.",
      low: "{playerName} could not match the opponent's leap and was displaced in the aerial contest.",
    },
    vague: "There was a physical aerial contest; the balance of the duel was unclear.",
  },
  {
    id: "balance-challenge", momentType: "physicalTest", attributes: ["balance", "strength"], pressure: true,
    descriptions: {
      high: "{playerName} absorbed a shoulder challenge and kept their feet while shielding the ball.",
      medium: "{playerName} staggered under a shoulder challenge but regained balance.",
      low: "{playerName} lost balance under a shoulder challenge and could not protect the ball.",
    },
    vague: "A shoulder challenge tested a player's balance; the details were obscured.",
  },
  {
    id: "repeat-run", momentType: "physicalTest", attributes: ["stamina"], pressure: false,
    descriptions: {
      high: "{playerName} repeated a recovery run at the same pace after several earlier efforts, without an opponent challenging directly.",
      medium: "{playerName} completed another recovery run after earlier efforts but needed time to catch their breath.",
      low: "{playerName} ran out of legs on another recovery run despite having no opponent challenging directly.",
    },
    vague: "A player made another recovery effort; their remaining energy was difficult to assess.",
  },
  {
    id: "change-direction", momentType: "physicalTest", attributes: ["agility", "balance"], pressure: false,
    descriptions: {
      high: "{playerName} changed direction sharply in open space while keeping their weight balanced.",
      medium: "{playerName} changed direction in open space but needed an extra step to regain balance.",
      low: "{playerName} slipped while changing direction in open space and lost their footing.",
    },
    vague: "A player changed direction; their footwork was hard to isolate.",
  },
  {
    id: "decision-under-pressure", momentType: "mentalResponse", attributes: ["decisionMaking", "composure"], pressure: true,
    descriptions: {
      high: "{playerName} stayed calm as defenders closed in and selected the open teammate immediately.",
      medium: "{playerName} hesitated as defenders closed in, then settled for a safe option.",
      low: "{playerName} panicked as defenders closed in and chose a blocked option instead of the free teammate.",
    },
    vague: "A player faced a choice with defenders closing; the decision was difficult to read.",
  },
  {
    id: "unhurried-decision", momentType: "mentalResponse", attributes: ["decisionMaking", "anticipation"], pressure: false,
    descriptions: {
      high: "{playerName} used the available time to anticipate the next run and choose the open option.",
      medium: "{playerName} had time to survey the options but chose a predictable route.",
      low: "{playerName} had time to survey the options but reacted late and chose the blocked route.",
    },
    vague: "A player surveyed the available options; the reasoning was unclear from this angle.",
  },
  {
    id: "teammate-direction", momentType: "mentalResponse", attributes: ["leadership"], pressure: false,
    descriptions: {
      high: "{playerName} used a pause in play to give teammates clear, useful directions.",
      medium: "{playerName} offered teammates directions during a pause, though the message needed repeating.",
      low: "{playerName} gave conflicting directions during a pause in play and confused teammates.",
    },
    vague: "A player addressed teammates during a pause; the message was difficult to hear.",
  },
  {
    id: "support-run", momentType: "tacticalDecision", attributes: ["offTheBall", "teamwork"], pressure: false, outfieldOnly: true,
    descriptions: {
      high: "{playerName} timed a supporting run into free space to offer the ball carrier a clear passing lane.",
      medium: "{playerName} moved to support the ball carrier but arrived after the clearest passing lane had closed.",
      low: "{playerName} failed to make the supporting run into free space and left the ball carrier isolated.",
    },
    vague: "A supporting run developed away from the ball; its timing was hard to assess.",
  },
  {
    id: "press-trigger", momentType: "tacticalDecision", attributes: ["pressing", "teamwork"], pressure: true, outfieldOnly: true,
    descriptions: {
      high: "{playerName} read the pressing trigger and closed the correct opponent as teammates squeezed the passing lanes.",
      medium: "{playerName} joined the press but arrived slightly out of sync with teammates.",
      low: "{playerName} pressed the wrong opponent and opened a passing lane through the team.",
    },
    vague: "Players moved into a press; their coordination was difficult to judge.",
  },
  {
    id: "runner-marking", momentType: "tacticalDecision", attributes: ["marking", "defensiveAwareness"], pressure: true, outfieldOnly: true,
    descriptions: {
      high: "{playerName} stayed with a dangerous runner through the crowd and denied the passing route.",
      medium: "{playerName} stayed close to a dangerous runner but briefly lost the ideal marking position.",
      low: "{playerName} lost the dangerous runner through the crowd and left the passing route open.",
    },
    vague: "A player tracked a runner through traffic; the defensive relationship was obscured.",
  },
  {
    id: "cover-position", momentType: "tacticalDecision", attributes: ["positioning", "defensiveAwareness"], pressure: false,
    descriptions: {
      high: "{playerName} used the time before the attack developed to take an effective covering position.",
      medium: "{playerName} took a covering position before the attack developed but needed a late adjustment.",
      low: "{playerName} had time to set the covering position but left a visible gap before the attack developed.",
    },
    vague: "A player adjusted their covering position; the relation to the developing attack was unclear.",
  },
  {
    id: "shape-communication", momentType: "tacticalDecision", attributes: ["teamwork", "defensiveAwareness"], pressure: true,
    descriptions: {
      high: "{playerName} coordinated the defensive line as an attack approached, closing the dangerous gap.",
      medium: "{playerName} tried to coordinate the defensive line as an attack approached, with mixed understanding among teammates.",
      low: "{playerName} failed to coordinate the defensive line as an attack approached, leaving teammates exposed.",
    },
    vague: "The defensive line adjusted to an approaching attack; individual contributions were hard to separate.",
  },
  {
    id: "response-to-mistake", momentType: "characterReveal", attributes: ["composure", "professionalism"], pressure: true,
    descriptions: {
      high: "{playerName} responded to a costly mistake by refocusing immediately and preparing for the next action.",
      medium: "{playerName} showed frustration after a costly mistake, then settled back into the next action.",
      low: "{playerName} dwelled on a costly mistake and was still arguing when the next action began.",
    },
    vague: "A player reacted to a mistake; their response was difficult to interpret.",
  },
  {
    id: "response-to-instruction", momentType: "characterReveal", attributes: ["professionalism", "teamwork"], pressure: false,
    descriptions: {
      high: "{playerName} listened to an instruction during a pause and applied the change at the next opportunity.",
      medium: "{playerName} acknowledged an instruction during a pause but needed a reminder before applying it.",
      low: "{playerName} dismissed an instruction during a pause and repeated the same avoidable mistake.",
    },
    vague: "A player received an instruction; the response was difficult to assess.",
  },
];
