import type { EvidenceClassificationId, PlayerAttribute } from "@/engine/core/types";
import type { PlayerMoment } from "./types";

export interface FootballAction {
  id: string;
  classifications: readonly EvidenceClassificationId[];
  momentType: PlayerMoment["momentType"];
  attributes: PlayerAttribute[];
  outfieldOnly: boolean;
  /** Pressure is intrinsic to the attempted action, regardless of the crowd. */
  requiresPressure: boolean;
  /** The same attempted action at three outcome levels, not unrelated anecdotes. */
  outcomes: { high: string; medium: string; low: string };
}

const ACTION_CLASSIFICATIONS: Record<string, readonly EvidenceClassificationId[]> = {
  "receive": [
    "technicalExecution"
  ],
  "pass": [
    "technicalExecution"
  ],
  "dribble": [
    "technicalExecution"
  ],
  "cross": [
    "technicalExecution"
  ],
  "distance-shot": [
    "technicalExecution"
  ],
  "finish": [
    "technicalExecution"
  ],
  "header": [
    "technicalExecution"
  ],
  "tackle": [
    "technicalExecution"
  ],
  "chase": [
    "physicalExecution"
  ],
  "shield": [
    "physicalExecution"
  ],
  "repeat-run": [
    "physicalRepeatability",
    "physicalExecution"
  ],
  "turn": [
    "physicalExecution"
  ],
  "leap": [
    "physicalExecution"
  ],
  "recover-balance": [
    "physicalExecution"
  ],
  "composed-release": [
    "pressureResponse"
  ],
  "choose-outlet": [
    "decisionMaking"
  ],
  "read-bounce": [
    "offBallMovement"
  ],
  "cover-angle": [
    "defensiveReading"
  ],
  "recover-effort": [],
  "organise": [],
  "support-run": [
    "offBallMovement"
  ],
  "press-angle": [
    "defensiveReading",
    "offBallMovement"
  ],
  "cover-runner": [
    "defensiveReading"
  ],
  "spot-route": [],
  "track-mark": [
    "defensiveReading"
  ],
  "coordinate-cover": [
    "offBallMovement"
  ],
  "reset-after-error": [],
  "respond-to-feedback": []
};

function action(
  id: string, momentType: FootballAction["momentType"], attributes: PlayerAttribute[],
  high: string, medium: string, low: string, outfieldOnly = false, requiresPressure = false,
): FootballAction {
  return { id, classifications: ACTION_CLASSIFICATIONS[id] ?? [], momentType, attributes, outfieldOnly, requiresPressure, outcomes: { high, medium, low } };
}

/** Observable actions own their evidence. A single episode never diagnoses a personality or injury trait. */
export const FOOTBALL_ACTIONS: readonly FootballAction[] = [
  action("receive", "technicalAction", ["firstTouch"],
    "{playerName} cushioned the arriving ball into the space for the next action without needing a recovery touch.",
    "{playerName} needed a second touch to settle the arriving ball, but kept it within reach.",
    "{playerName}'s first touch sent the arriving ball beyond reach, conceding possession."),
  action("pass", "technicalAction", ["passing"],
    "{playerName} weighted a pass into a teammate's stride, allowing the move to continue without a pause.",
    "{playerName} completed the pass, although the teammate had to stop to collect it.",
    "{playerName} underhit the pass and an opponent stepped across to intercept."),
  action("dribble", "technicalAction", ["dribbling"],
    "{playerName} shifted the ball beyond the defender's reaching foot and carried it into the space behind.",
    "{playerName} tried to dribble past the defender, then turned back while keeping possession.",
    "{playerName} pushed the ball too far during the dribble and the defender took it away.", true),
  action("cross", "technicalAction", ["crossing"],
    "{playerName} delivered from the wide channel into the runner's path, beyond the first defender.",
    "{playerName}'s delivery from the wide channel reached the contest, but made the receiver stretch.",
    "{playerName}'s delivery from the wide channel struck the first defender.", true),
  action("distance-shot", "technicalAction", ["shooting"],
    "{playerName} struck from distance cleanly, directing the shot toward the corner.",
    "{playerName} struck from distance on target, but without enough placement to trouble the keeper.",
    "{playerName} snatched at the shot from distance and sent it well wide.", true),
  action("finish", "technicalAction", ["finishing"],
    "{playerName} met the close-range chance with a controlled finish away from the keeper.",
    "{playerName} got the close-range finish on target, but placed it within the keeper's reach.",
    "{playerName} rushed the close-range finish and missed the target.", true),
  action("header", "technicalAction", ["heading"],
    "{playerName} directed the header toward a teammate rather than merely meeting the ball.",
    "{playerName} made contact with the header, sending the ball into a loose contest.",
    "{playerName} mistimed contact and glanced the header away from the intended teammate.", true),
  action("tackle", "technicalAction", ["tackling"],
    "{playerName} waited for the exposed touch and took the ball cleanly in the tackle.",
    "{playerName}'s tackle knocked the ball loose, leaving a second contest to settle possession.",
    "{playerName} reached for the tackle too early and the ball carrier moved beyond it.", true),
  action("chase", "physicalTest", ["pace"],
    "{playerName} closed the gap in the chase and reached the loose ball ahead of the runner.",
    "{playerName} matched the runner's speed in the chase without closing the gap.",
    "{playerName} lost ground in the chase and could not reach the loose ball."),
  action("shield", "physicalTest", ["strength"],
    "{playerName} held ground through shoulder contact, keeping the opponent away from the ball.",
    "{playerName} gave some ground under shoulder contact but kept the ball protected.",
    "{playerName} was moved off the ball by shoulder contact."),
  action("repeat-run", "physicalTest", ["stamina"],
    "{playerName} followed one recovery run with another at similar intensity.",
    "{playerName} made the second recovery run, although it was slower than the first.",
    "{playerName} slowed sharply on the second recovery run and could not recover the ground."),
  action("turn", "physicalTest", ["agility"],
    "{playerName} changed direction with quick, controlled steps and stayed alongside the moving ball.",
    "{playerName} needed an extra step to change direction, then recovered the line of the ball.",
    "{playerName} took too long to change direction and the ball moved beyond reach."),
  action("leap", "physicalTest", ["jumping"],
    "{playerName} rose above the opponent to reach the dropping ball first.",
    "{playerName} matched the opponent's leap and contested the dropping ball.",
    "{playerName} could not reach the dropping ball at the height of the opponent's leap."),
  action("recover-balance", "physicalTest", ["balance"],
    "{playerName} recovered footing after contact and continued without breaking stride.",
    "{playerName} stumbled after contact, then regained footing before the next action.",
    "{playerName} lost footing after contact and could not continue the action."),
  action("composed-release", "mentalResponse", ["composure"],
    "{playerName} kept looking for an outlet as an opponent closed in, then released the ball without rushing.",
    "{playerName} took the safe outlet as an opponent closed in, ending the immediate danger.",
    "{playerName} rushed the release as an opponent closed in, despite an outlet remaining open.", false, true),
  action("choose-outlet", "mentalResponse", ["decisionMaking"],
    "{playerName} chose the open outlet before the opponent could close that route.",
    "{playerName} took a safe outlet while a more progressive option remained available.",
    "{playerName} chose the crowded outlet and overlooked the open teammate."),
  action("read-bounce", "mentalResponse", ["anticipation"],
    "{playerName} moved before the loose ball broke and arrived first at its landing point.",
    "{playerName} reacted as the loose ball broke and arrived in time to contest it.",
    "{playerName} reacted late to the loose ball and arrived after the opponent."),
  action("cover-angle", "mentalResponse", ["positioning"],
    "{playerName} adjusted the covering angle before the ball moved, blocking the direct route.",
    "{playerName} recovered a covering angle once the ball moved.",
    "{playerName} stayed on the wrong covering angle and left a direct route open."),
  action("recover-effort", "mentalResponse", ["workRate"],
    "{playerName} immediately sprinted back after possession was lost and joined the next contest.",
    "{playerName} worked back after possession was lost, arriving behind the first covering player.",
    "{playerName} walked back after possession was lost while a covering run was still needed."),
  action("organise", "mentalResponse", ["leadership"],
    "{playerName} called out the uncovered runner and a teammate moved across before the pass arrived.",
    "{playerName} called out the uncovered runner as the teammate began to recover.",
    "{playerName} called for conflicting cover and two teammates moved toward the same runner."),
  action("support-run", "tacticalDecision", ["offTheBall"],
    "{playerName} moved out of the defender's cover to give the ball carrier a clear passing lane.",
    "{playerName} offered a passing lane, but the movement came too late to advance the move.",
    "{playerName} stayed behind the defender's cover and gave the ball carrier no passing lane.", true),
  action("press-angle", "tacticalDecision", ["pressing"],
    "{playerName} curved the approach to close the ball carrier while screening the nearest outlet.",
    "{playerName} closed the ball carrier, but left the nearest outlet available.",
    "{playerName} approached from an angle that allowed both the forward route and the nearby outlet.", true),
  action("cover-runner", "tacticalDecision", ["defensiveAwareness"],
    "{playerName} noticed the runner entering the uncovered space and shifted across before the pass.",
    "{playerName} noticed the runner entering the uncovered space as the pass was played.",
    "{playerName} watched the ball and missed the runner entering the uncovered space."),
  action("spot-route", "tacticalDecision", ["vision"],
    "{playerName} looked beyond the nearest options and spotted a passing route through the far side.",
    "{playerName} scanned the nearby options but did not explore the far-side passing route.",
    "{playerName} kept looking toward the crowded side while a far-side passing route stayed open."),
  action("track-mark", "tacticalDecision", ["marking"],
    "{playerName} checked the runner's movement and stayed between the runner and the arriving ball.",
    "{playerName} stayed close to the runner, but allowed a brief separation as the ball arrived.",
    "{playerName} lost track of the runner and allowed an uncontested reception.", true),
  action("coordinate-cover", "tacticalDecision", ["teamwork"],
    "{playerName} covered the space a teammate had vacated, allowing that teammate to challenge the ball.",
    "{playerName} moved to cover the teammate, but only after the challenge had begun.",
    "{playerName} followed the teammate toward the ball and left the vacated space uncovered."),
  action("reset-after-error", "characterReveal", ["bigGameTemperament"],
    "{playerName} reset after a visible error and made themselves available for the next ball.",
    "{playerName} took a moment after the error, then rejoined the next passage.",
    "{playerName} remained occupied with the error and missed the next opportunity to get involved."),
  action("respond-to-feedback", "characterReveal", ["professionalism"],
    "{playerName} acknowledged a teammate's correction and adjusted the movement on the next passage.",
    "{playerName} acknowledged a teammate's correction, but the next movement was unchanged.",
    "{playerName} continued arguing about a teammate's correction as the next passage began."),
];
