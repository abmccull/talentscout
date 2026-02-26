/**
 * Quick Interaction Mode
 *
 * Lightweight strategic choices for activities that don't need
 * full observation depth. 2-3 choices, ~1 minute play time.
 *
 * Each activity type maps to a template that defines its phases and the
 * strategic choices available within each. Phase 2 choices are dynamically
 * selected based on what the scout chose in Phase 1 — creating the feeling
 * of a short but branching decision tree.
 *
 * This module populates the skeleton phases created by session.ts with
 * strategic choice content for quickInteraction sessions.
 */

import type { RNG } from "@/engine/rng";
import type {
  ObservationSession,
  SessionPhase,
  StrategicChoice,
} from "@/engine/observation/types";

// =============================================================================
// INTERNAL TYPES
// =============================================================================

/**
 * A template for a single phase within a quick interaction activity.
 * Each phase has a prompt and a fixed set of 2–3 choices.
 */
interface QuickPhaseTemplate {
  /** Narrative prompt presented to the scout at this phase. */
  prompt: string;
  /** The strategic choices available. */
  choices: Omit<StrategicChoice, "id">[];
}

/**
 * A full quick interaction template for one activity type.
 *
 * Phase 1 is always the same. Phase 2 is selected from a follow-up bank
 * based on the outcomeType of whatever was chosen in Phase 1 — so the
 * second phase feels responsive to the first decision.
 *
 * Phase 3 (when present) is picked randomly from a final bank, acting as
 * a brief coda that wraps up the session.
 */
interface QuickInteractionTemplate {
  phase1: QuickPhaseTemplate;
  /** Follow-up phases keyed by the Phase-1 outcomeType that leads to them. */
  phase2ByOutcome: Partial<Record<StrategicChoice["outcomeType"], QuickPhaseTemplate>>;
  /** Fallback Phase-2 when no matching key exists in phase2ByOutcome. */
  phase2Default: QuickPhaseTemplate;
  /** Optional pool of closing phases. One is picked at random when the session has 3 phases. */
  phase3Pool?: QuickPhaseTemplate[];
}

// =============================================================================
// PHASE DESCRIPTION BANKS
// =============================================================================

/**
 * Narrative phase descriptions for quick interaction activities.
 * Keyed by activity type → phase index (0-based) → segment pool.
 * rng.pick() selects the specific variant at generation time.
 */
const QUICK_PHASE_DESCRIPTIONS: Record<string, Record<number, string[]>> = {
  statsBriefing: {
    0: [
      "You settle into the weekly stats briefing. The screens are loaded — where do you point your focus first?",
      "The briefing room is quiet. Numbers fill the display. You have a limited window — what matters most this week?",
      "The data team opens the briefing. There's more here than one session can cover. You'll have to choose a lens.",
    ],
    1: [
      "You work through the priority you set. A secondary question emerges from the data — time to take a position.",
      "The first pass through the numbers raises a follow-up decision. Your initial focus shapes what you notice now.",
      "One angle explored, another opens. The briefing narrows to a sharper decision.",
    ],
    2: [
      "As the briefing closes, one final call determines how the week's intelligence gets applied.",
      "The session wraps up. A last decision shapes how the work gets acted on.",
    ],
  },
  dataConference: {
    0: [
      "The conference floor is busy. Colleagues, rivals, and vendors are all here. What's the best use of this time?",
      "You've made it to the data conference. The programme is full — but you can't do everything. Where do you start?",
      "The venue hums with analytics talk. Sessions, workshops, networking. The day is yours to shape.",
    ],
    1: [
      "Your morning choice sets the tone. Now a midday decision arrives — where does the value lie from here?",
      "The opening session paid off. Something useful is emerging. How do you follow it up?",
      "The conference shifts gear after lunch. A second opportunity presents itself.",
    ],
    2: [
      "End of day. One more choice to close the conference and frame what you take back.",
      "The final session of the conference. What you do now determines the lasting value of the trip.",
    ],
  },
  assignTerritory: {
    0: [
      "It's time to allocate scouting coverage for the coming weeks. How do you want to deploy the network?",
      "The territorial map is open. Coverage decisions made now will shape what the system surfaces over the next month.",
      "A scheduling review is on the table. You have scout capacity to direct — where does it go?",
    ],
    1: [
      "The first distribution decision is made. Now a finer detail needs resolving.",
      "Your initial allocation is logged. A gap in coverage is flagged — how do you respond?",
      "The plan is taking shape. A second question refines it further.",
    ],
    2: [
      "Final sign-off on the territory plan. One last consideration before it's locked in.",
      "The coverage plan closes. A last call to sharpen the final output.",
    ],
  },
  analyticsTeamMeeting: {
    0: [
      "The analytics team is assembled. Agenda items are queued — but the group needs direction to get started.",
      "The weekly meeting opens. There are competing priorities and limited time. You need to set the focus.",
      "The team is engaged and ready. The session's direction depends on where you choose to begin.",
    ],
    1: [
      "The first discussion has shaped the room. A follow-up item needs a decision before the meeting moves on.",
      "Good progress on the first agenda item. The second point is more contested — how do you steer it?",
      "The opening discussion lands well. Now a downstream question needs your input.",
    ],
    2: [
      "The meeting is wrapping up. One final direction to set before the group disperses.",
      "Last agenda item. Your call determines how the team's work gets organised going forward.",
    ],
  },
};

// =============================================================================
// QUICK INTERACTION TEMPLATES
// =============================================================================

/**
 * Templates organised by activity type.
 *
 * Each template defines the Phase-1 prompt and choices, the Phase-2
 * follow-up mapped by Phase-1 outcomeType (with a safe default), and an
 * optional pool of Phase-3 closing phases for longer sessions.
 */
export const QUICK_INTERACTION_TEMPLATES: Record<string, QuickInteractionTemplate> = {
  // ---------------------------------------------------------------------------
  // STATS BRIEFING
  // ---------------------------------------------------------------------------
  statsBriefing: {
    phase1: {
      prompt: "What's your priority for this week's stats briefing?",
      choices: [
        {
          text: "Focus on our current targets",
          description: "Pull the performance data for the players already on the shortlist and review their recent numbers.",
          effect: "You narrow the briefing to your active targets, producing a sharper, more actionable summary — but you may miss something emerging in the wider data.",
          outcomeType: "priority",
        },
        {
          text: "Scan for emerging market trends",
          description: "Step back from individual targets and look for statistical patterns that suggest undervalued profiles or positional gaps.",
          effect: "You surface a broader market picture. The intelligence won't be immediately actionable but it seeds the next phase of work.",
          outcomeType: "technique",
        },
        {
          text: "Deep dive on one specific player",
          description: "Commit the whole briefing window to one player — comprehensive statistical history, trend lines, and contextual benchmarking.",
          effect: "You build a thorough case on a single profile. The depth is valuable but the breadth of the session suffers.",
          outcomeType: "priority",
        },
      ],
    },
    phase2ByOutcome: {
      priority: {
        prompt: "The target data is loaded. One number stands out as ambiguous — how do you handle it?",
        choices: [
          {
            text: "Flag it for live observation follow-up",
            description: "Log the anomaly and schedule a scouting assignment to validate what the number might mean in practice.",
            effect: "The ambiguity is captured and routed to the right resolution channel. Your process stays clean.",
            outcomeType: "priority",
          },
          {
            text: "Cross-reference against positional peers",
            description: "Pull comparison data from similar profiles to determine whether this number is genuinely unusual or within normal variation.",
            effect: "Contextualised analysis. The number is resolved — either elevated as a signal or dismissed as noise.",
            outcomeType: "technique",
          },
        ],
      },
      technique: {
        prompt: "You've identified a pattern in the wider data. How do you follow it up?",
        choices: [
          {
            text: "Build a targeted shortlist from the signal",
            description: "Translate the statistical pattern into a set of candidate profiles worth investigating further.",
            effect: "You convert insight into pipeline. The shortlist may need validation but the direction is clear.",
            outcomeType: "priority",
          },
          {
            text: "Document the methodology for the broader team",
            description: "Write up the analytical approach so the wider scouting network can apply the same lens.",
            effect: "The technique becomes institutional knowledge. The immediate follow-up is slower but the long-term return is higher.",
            outcomeType: "technique",
          },
          {
            text: "Share the finding with a trusted network contact",
            description: "Test the insight with someone whose analytical judgement you respect before acting on it.",
            effect: "External validation refines the signal. Your network contact may offer a complementary perspective.",
            outcomeType: "network",
          },
        ],
      },
    },
    phase2Default: {
      prompt: "The briefing surfaces a secondary question. How do you respond?",
      choices: [
        {
          text: "Schedule a follow-up session",
          description: "The question is worth pursuing but not at the cost of the current briefing's focus. Log it for next week.",
          effect: "You protect the current session's depth while ensuring the question doesn't get lost.",
          outcomeType: "priority",
        },
        {
          text: "Integrate it into the current analysis",
          description: "Broaden the session's scope to absorb the new question. You'll cover less ground on each topic.",
          effect: "More comprehensive output, but the depth on the original priority is diluted.",
          outcomeType: "technique",
        },
      ],
    },
    phase3Pool: [
      {
        prompt: "Before the briefing closes, one decision shapes how this week's intelligence gets distributed.",
        choices: [
          {
            text: "Send a summary to the first-team coaching staff",
            description: "Translate the briefing's output into a concise format for the coaches who don't work in the data environment.",
            effect: "The intelligence reaches decision-makers. The translation work is on you but the output is higher value.",
            outcomeType: "network",
          },
          {
            text: "Archive it internally and act on it personally",
            description: "Keep the briefing findings within the scouting operation and use them to direct your own next assignment.",
            effect: "Faster personal action. The intelligence doesn't travel further but it drives sharper individual follow-up.",
            outcomeType: "priority",
          },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // DATA CONFERENCE
  // ---------------------------------------------------------------------------
  dataConference: {
    phase1: {
      prompt: "How do you approach the data conference?",
      choices: [
        {
          text: "Network with other data scouts",
          description: "Prioritise one-to-one conversations over formal sessions — the real value at conferences is often in the corridors.",
          effect: "Your network expands and informal intelligence flows. You miss some structured sessions but you gain context you couldn't get from a presentation.",
          outcomeType: "network",
        },
        {
          text: "Attend the advanced analytics workshop",
          description: "Block out the core of the day for the technical deep-dive session on modern player evaluation frameworks.",
          effect: "Your methodological toolkit is strengthened. The workshop content is directly applicable to your current workflow.",
          outcomeType: "technique",
        },
        {
          text: "Present your methodology for peer review",
          description: "Submit your current evaluation approach to the open methodology session for feedback from practitioners across the industry.",
          effect: "Peer critique reveals blind spots and validates what is working. The exposure raises your professional profile.",
          outcomeType: "technique",
        },
      ],
    },
    phase2ByOutcome: {
      network: {
        prompt: "A conversation with a well-connected data director opens an unexpected door. How do you follow it up?",
        choices: [
          {
            text: "Arrange a formal follow-up meeting",
            description: "Convert the informal conversation into a structured collaboration — propose a specific agenda and a date.",
            effect: "The relationship is formalised. There is now a real channel for intelligence sharing.",
            outcomeType: "network",
          },
          {
            text: "Share your current shortlist for mutual review",
            description: "Offer something of value immediately — opening your work to a peer builds trust faster than any introductory meeting.",
            effect: "The exchange accelerates trust. You may receive comparative intelligence in return.",
            outcomeType: "priority",
          },
        ],
      },
      technique: {
        prompt: "The workshop raises a methodological question about your current evaluation framework. How do you respond?",
        choices: [
          {
            text: "Revise your weighting model on the basis of what you've heard",
            description: "Apply the workshop's most useful insights directly to your current player assessment process.",
            effect: "Your evaluation framework is updated immediately. The change may need validation through use but the direction feels right.",
            outcomeType: "technique",
          },
          {
            text: "Test the new approach on a known profile",
            description: "Apply the revised methodology to a player you already know well to check whether the output improves.",
            effect: "Controlled validation. You'll know whether the new approach holds up before applying it to live targets.",
            outcomeType: "technique",
          },
          {
            text: "Document the open question for the team to discuss",
            description: "Bring the methodological tension back to the analytics team as a discussion item rather than resolving it unilaterally.",
            effect: "Collective input shapes the outcome. Slower, but more durable.",
            outcomeType: "network",
          },
        ],
      },
    },
    phase2Default: {
      prompt: "The afternoon programme offers two diverging options. Which do you choose?",
      choices: [
        {
          text: "Attend the recruitment technology showcase",
          description: "A vendor-led session on emerging scouting platforms. Potentially useful, possibly a sales pitch.",
          effect: "You survey the tool landscape. Whether it's valuable depends on how critically you engage.",
          outcomeType: "technique",
        },
        {
          text: "Stay on the conference floor and keep talking",
          description: "Skip the formal sessions and prioritise unstructured conversation for the rest of the afternoon.",
          effect: "Your network deepens. Informal intelligence continues to accumulate.",
          outcomeType: "network",
        },
      ],
    },
    phase3Pool: [
      {
        prompt: "As the conference closes, you have one final decision about how to use the time remaining.",
        choices: [
          {
            text: "Summarise the day's key takeaways before leaving",
            description: "Spend twenty minutes writing up the most important insights while they are still fresh.",
            effect: "The day's value is captured and transmissible. Your notes will improve the quality of the team debrief.",
            outcomeType: "technique",
          },
          {
            text: "Join the evening networking dinner",
            description: "The formal programme is over but the most candid conversations tend to happen over food.",
            effect: "Relationships deepen. The evening will produce intelligence that the daytime sessions couldn't.",
            outcomeType: "network",
          },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // ASSIGN TERRITORY
  // ---------------------------------------------------------------------------
  assignTerritory: {
    phase1: {
      prompt: "How should scout coverage be distributed this period?",
      choices: [
        {
          text: "Focus on established academies",
          description: "Direct the network's attention toward the well-resourced academies with high output rates — the known production hubs.",
          effect: "Coverage concentrates where talent density is proven. The scouting workload is manageable and the intelligence will be reliable.",
          outcomeType: "territory",
        },
        {
          text: "Expand into underexplored regions",
          description: "Redirect scout capacity toward areas that the wider industry neglects — lower coverage means lower competition for any talent found there.",
          effect: "The risk is higher and the hit rate may be lower, but the value per discovery is greater. You are buying cheap if the region delivers.",
          outcomeType: "territory",
        },
        {
          text: "Double up coverage on hot prospects",
          description: "Assign multiple scouts to the players currently at the top of the shortlist to accelerate the assessment process.",
          effect: "Faster, more confident evaluations on your priority targets. Coverage elsewhere thins out in exchange.",
          outcomeType: "priority",
        },
      ],
    },
    phase2ByOutcome: {
      territory: {
        prompt: "The coverage plan has a gap. How do you address it?",
        choices: [
          {
            text: "Rotate a scout from a saturated region",
            description: "Pull capacity from a well-covered area to fill the gap. The reduction in redundancy is worth the coverage gain.",
            effect: "Balanced reallocation. The gap is filled without increasing total coverage cost.",
            outcomeType: "territory",
          },
          {
            text: "Bring in a short-term freelance scout",
            description: "Contract external coverage for the gap region rather than reallocating from the permanent network.",
            effect: "The gap is covered without disrupting current assignments. Budget cost is real but the opportunity cost is managed.",
            outcomeType: "network",
          },
        ],
      },
      priority: {
        prompt: "The doubled coverage on your priority target produces two conflicting assessments. How do you resolve it?",
        choices: [
          {
            text: "Request a third assessment to break the tie",
            description: "Send a senior scout to observe the player independently and produce a definitive evaluation.",
            effect: "Resolution is slower but the final assessment is authoritative. You'll act with confidence when the third report lands.",
            outcomeType: "priority",
          },
          {
            text: "Review the methodology behind each assessment",
            description: "Dig into what each scout was focusing on and why — the disagreement may be informative rather than obstructive.",
            effect: "The conflict becomes data. Understanding why the scouts disagreed may reveal something important about the player.",
            outcomeType: "technique",
          },
        ],
      },
    },
    phase2Default: {
      prompt: "A late adjustment to the territory plan is needed. What's the call?",
      choices: [
        {
          text: "Absorb the change within existing capacity",
          description: "Ask the current scouts to adapt their schedule without additional resource.",
          effect: "The plan stays within budget. Individual scout workload increases briefly.",
          outcomeType: "territory",
        },
        {
          text: "Flag the constraint to management",
          description: "Escalate the capacity issue rather than absorbing it quietly — the tradeoff needs visibility.",
          effect: "The decision gets made at the right level. You protect the quality of the current coverage.",
          outcomeType: "priority",
        },
      ],
    },
    phase3Pool: [
      {
        prompt: "Final approval of the territory plan. One last element needs a decision.",
        choices: [
          {
            text: "Set clear review dates for each coverage area",
            description: "Embed checkpoints into the plan so coverage allocations can be adjusted as the intelligence picture develops.",
            effect: "The plan stays adaptive. You avoid locking into an allocation that the data may quickly make obsolete.",
            outcomeType: "territory",
          },
          {
            text: "Lock in the plan and execute without mid-period reviews",
            description: "Commit fully to the coverage plan and resist the urge to intervene until the full period has run.",
            effect: "Scouts operate with clear, uninterrupted mandates. The discipline prevents reactive over-correction.",
            outcomeType: "priority",
          },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // ANALYTICS TEAM MEETING
  // ---------------------------------------------------------------------------
  analyticsTeamMeeting: {
    phase1: {
      prompt: "What direction should the analytics team focus on this week?",
      choices: [
        {
          text: "Prioritise transfer targets",
          description: "Redirect the team's capacity toward building, enriching, and pressure-testing the current transfer shortlist.",
          effect: "The analytical resource is aligned with the club's immediate recruitment need. Depth on priority targets improves quickly.",
          outcomeType: "priority",
        },
        {
          text: "Improve our prediction models",
          description: "Allocate time to refining the player performance models — better predictions over time are worth short-term diversion of resource.",
          effect: "Infrastructure improves. The work won't surface results immediately but the downstream gain in accuracy is real.",
          outcomeType: "technique",
        },
        {
          text: "Focus on youth pipeline data",
          description: "Point the team toward the academy and emerging talent data — building a picture of the club's long-term asset base.",
          effect: "Youth intelligence depth increases. Decisions on development pathways will be better informed going forward.",
          outcomeType: "priority",
        },
      ],
    },
    phase2ByOutcome: {
      priority: {
        prompt: "The team has produced an initial output on the priority. A decision point has emerged — how do you steer it?",
        choices: [
          {
            text: "Challenge the assumptions in the model",
            description: "Ask the team to stress-test the methodology before the output is circulated — better to find the problem internally.",
            effect: "The output is slower to deliver but more defensible. Errors caught internally don't become embarrassments externally.",
            outcomeType: "technique",
          },
          {
            text: "Circulate the output to the coaching staff now",
            description: "Send a working-version report to the coaches so they can respond while the analysis is still live.",
            effect: "Fast feedback loop. The coaches may shape the next iteration of the work in a useful direction.",
            outcomeType: "network",
          },
        ],
      },
      technique: {
        prompt: "The model improvement work surfaces a methodological tension. How do you resolve it?",
        choices: [
          {
            text: "Adopt a conservative revision",
            description: "Apply only the changes with the strongest validation evidence — preserve the existing model's tested performance.",
            effect: "Stability is maintained. The model improves incrementally rather than through a disruptive overhaul.",
            outcomeType: "technique",
          },
          {
            text: "Rebuild the model from new foundations",
            description: "Accept the disruption and rebuild around the better theoretical framework the team has identified.",
            effect: "Higher short-term cost, higher long-term gain. The model will be more coherent when the rebuild is complete.",
            outcomeType: "technique",
          },
          {
            text: "Run both models in parallel for one month",
            description: "Test the new approach against the old without decommissioning anything — let the comparative data decide.",
            effect: "Evidence-based resolution. The extra operational complexity is worth the confidence the comparison will produce.",
            outcomeType: "priority",
          },
        ],
      },
    },
    phase2Default: {
      prompt: "A resource conflict arises mid-meeting. How do you handle it?",
      choices: [
        {
          text: "Deprioritise the lower-urgency workstream",
          description: "Make an explicit decision about what gets paused to free up capacity for the conflict.",
          effect: "Clarity over the tradeoff. The team knows what's paused and why — and can resume when capacity returns.",
          outcomeType: "priority",
        },
        {
          text: "Bring in a contractor to absorb the overflow",
          description: "Use external analytical resource to cover the capacity gap without cutting any workstream.",
          effect: "Everything continues. The cost is real but the operational continuity is preserved.",
          outcomeType: "network",
        },
      ],
    },
    phase3Pool: [
      {
        prompt: "The meeting is closing. One final call on how the team's output gets used this week.",
        choices: [
          {
            text: "Present the findings at the Thursday recruitment board",
            description: "Commit to a formal presentation slot and prepare the team's work for a decision-making audience.",
            effect: "The work reaches the right people at the right moment. Preparation time is absorbed but the impact is higher.",
            outcomeType: "priority",
          },
          {
            text: "Distribute a written brief to relevant stakeholders",
            description: "Summarise the outputs in a written format and circulate to those who need to act on them.",
            effect: "Efficient distribution. Stakeholders can engage with the findings on their own timeline.",
            outcomeType: "network",
          },
          {
            text: "Keep the output internal until the next full review cycle",
            description: "Hold the work within the analytics team for further refinement before circulation.",
            effect: "The output matures before it travels. The delay is a cost, but the quality of the eventual communication improves.",
            outcomeType: "technique",
          },
        ],
      },
    ],
  },
};

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Builds a StrategicChoice with a deterministic session-scoped id.
 * The id is derived from the phase index and a positional counter so it is
 * stable for a given activity type and phase layout.
 */
function buildChoice(
  raw: Omit<StrategicChoice, "id">,
  phaseIndex: number,
  choiceIndex: number,
  sessionId: string,
): StrategicChoice {
  return {
    id: `${sessionId}-p${phaseIndex}-c${choiceIndex}`,
    ...raw,
  };
}

/**
 * Selects the Phase-2 template to use based on what was chosen in Phase 1.
 *
 * The last choice in the Phase-1 array is used as the "selected" choice when
 * an explicit selection hasn't been recorded (the phase hasn't been played
 * yet). In practice the RNG populates all phases upfront, so we pick a
 * representative Phase-2 by sampling the Phase-1 choices with the RNG.
 */
function resolvePhase2Template(
  template: QuickInteractionTemplate,
  rng: RNG,
): QuickPhaseTemplate {
  // Sample a Phase-1 outcome type via the RNG so the Phase-2 selection is
  // deterministic for a given seed but appears organic.
  const phase1Choices = template.phase1.choices;
  const sampledChoice = rng.pick(phase1Choices);
  const followUp = template.phase2ByOutcome[sampledChoice.outcomeType];
  return followUp ?? template.phase2Default;
}

/**
 * Generates the description for a quick interaction phase by looking up the
 * pre-defined narrative bank and picking a variant via the RNG.
 */
function resolvePhaseDescription(
  activityType: string,
  phaseIndex: number,
  rng: RNG,
): string {
  const activityBank = QUICK_PHASE_DESCRIPTIONS[activityType];
  if (!activityBank) {
    return `Phase ${phaseIndex + 1} of the ${activityType} session.`;
  }
  const pool = activityBank[phaseIndex];
  if (!pool || pool.length === 0) {
    return `Phase ${phaseIndex + 1} of the ${activityType} session.`;
  }
  return rng.pick(pool);
}

/**
 * Populates a skeleton SessionPhase with strategic choices and a description.
 */
function populatePhase(
  phase: SessionPhase,
  phaseTemplate: QuickPhaseTemplate,
  activityType: string,
  sessionId: string,
  rng: RNG,
): SessionPhase {
  const choices: StrategicChoice[] = phaseTemplate.choices.map((raw, idx) =>
    buildChoice(raw, phase.index, idx, sessionId),
  );

  const description = resolvePhaseDescription(activityType, phase.index, rng);

  return {
    ...phase,
    description: description + " " + phaseTemplate.prompt,
    choices,
  };
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Populates all skeleton phases of a Quick Interaction session with strategic
 * choices and narrative descriptions.
 *
 * Input contract:
 *   - session.state must be 'setup'.
 *   - session.mode must be 'quickInteraction'.
 *   - session.phases contains 2–3 skeleton phases created by session.ts.
 *
 * Returns a new session object with all phases populated.
 * The caller transitions to 'active' by calling startSession() from session.ts.
 *
 * Guard behaviour: if the session is not in 'setup' state, or the mode is not
 * 'quickInteraction', the session is returned unchanged.
 */
export function populateQuickInteractionPhases(
  session: ObservationSession,
  rng: RNG,
): ObservationSession {
  if (session.state !== "setup") {
    return session;
  }

  if (session.mode !== "quickInteraction") {
    return session;
  }

  const template = QUICK_INTERACTION_TEMPLATES[session.activityType];
  if (!template) {
    // No template registered for this activity type — return unchanged rather
    // than generating empty phases, so the caller knows something is wrong.
    return session;
  }

  const phase2Template = resolvePhase2Template(template, rng);

  const populatedPhases: SessionPhase[] = session.phases.map((phase) => {
    if (phase.index === 0) {
      return populatePhase(phase, template.phase1, session.activityType, session.id, rng);
    }

    if (phase.index === 1) {
      return populatePhase(phase, phase2Template, session.activityType, session.id, rng);
    }

    // Phase index 2 (optional third phase) — pick from the pool if available.
    if (template.phase3Pool && template.phase3Pool.length > 0) {
      const phase3Template = rng.pick(template.phase3Pool);
      return populatePhase(phase, phase3Template, session.activityType, session.id, rng);
    }

    // Fallback: treat extra phases as copies of phase2Default.
    return populatePhase(phase, template.phase2Default, session.activityType, session.id, rng);
  });

  return {
    ...session,
    phases: populatedPhases,
  };
}
