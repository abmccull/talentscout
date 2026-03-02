import type { WikiArticle } from "@/components/game/wiki/wikiTypes";
import { SectionBlock, Para, PerkCard } from "./components";

// ─── Specializations ────────────────────────────────────────────────────────

export const specializationsArticles: WikiArticle[] = [
  // ── Youth Scout ─────────────────────────────────────────────────────────────
  {
    slug: "youth-scout-spec",
    title: "Youth Scout",
    category: "specializations",
    order: 0,
    summary:
      "Focuses on players under 21. Better at reading potential ability, with access to grassroots venues and unsigned youth circuits.",
    searchText:
      "Youth Scout. Focuses on players under 21. Better at reading potential ability over current ability. Unlocks grassroots venues and unsigned youth scouting circuits invisible to other specializations. Perks: Grassroots Access (Lv1) opens doors to street football sessions and grassroots tournaments, discover unsigned youth in venues hidden from the mainstream scouting circuit. Raw Potential Reading (Lv3) years of watching rough diamonds gives an instinctive sense of ceilings, unlocks a rough potential ability range indicator on unsigned youth. Instinct Sharpening (Lv5) gut reactions to young talent are sharper, gut feeling trigger rate increased by 40% when observing players under 16. Youth Network (Lv7) contacts begin sharing intel about unsigned youth sightings, network meetings occasionally reveal hidden talents in the region. Placement Reputation (Lv9) clubs trust your recommendations, placement acceptance rate increases by 25% across all conviction levels. Wonderkid Radar (Lv12) pattern recognition for generational talent is razor-sharp, auto-alert when observing an under-16 with generational potential markers. Academy Whisperer (Lv15) reputation opens private academy doors, you can request clubs to hold dedicated trial days for your recommended youth. Generational Eye (Lv18) the pinnacle of youth scouting intuition, gut feelings now include a PA estimate within plus or minus 5 of the true value.",
    content: (
      <SectionBlock>
        <Para>
          Focuses on players under 21. Better at reading potential ability over
          current ability. Unlocks grassroots venues and unsigned youth scouting
          circuits invisible to other specializations.
        </Para>
        <div className="space-y-2">
          <PerkCard
            name="Grassroots Access"
            level={1}
            description="Opens doors to street football sessions and grassroots tournaments. Discover unsigned youth in venues hidden from the mainstream scouting circuit."
          />
          <PerkCard
            name="Raw Potential Reading"
            level={3}
            description="Years of watching rough diamonds gives an instinctive sense of ceilings. Unlocks a rough potential ability range indicator on unsigned youth."
          />
          <PerkCard
            name="Instinct Sharpening"
            level={5}
            description="Your gut reactions to young talent are sharper than most. Gut feeling trigger rate increased by 40% when observing players under 16."
          />
          <PerkCard
            name="Youth Network"
            level={7}
            description="Your contacts begin sharing intel about unsigned youth sightings. Network meetings occasionally reveal hidden talents in the region."
          />
          <PerkCard
            name="Placement Reputation"
            level={9}
            description="Clubs trust your recommendations. Placement acceptance rate increases by 25% across all conviction levels."
          />
          <PerkCard
            name="Wonderkid Radar"
            level={12}
            description="Your pattern recognition for generational talent is razor-sharp. Auto-alert when observing an under-16 with generational potential markers."
          />
          <PerkCard
            name="Academy Whisperer"
            level={15}
            description="Your reputation opens private academy doors. You can request clubs to hold dedicated trial days for your recommended youth."
          />
          <PerkCard
            name="Generational Eye"
            level={18}
            description="The pinnacle of youth scouting intuition. Gut feelings now include a PA estimate within \u00b15 of the true value."
          />
        </div>
      </SectionBlock>
    ),
    related: [
      "unsigned-youth",
      "placement-reports",
      "alumni-tracking",
      "youth-activities",
      "equipment-overview",
    ],
    tags: [
      "youth",
      "specialization",
      "grassroots",
      "potential",
      "wonderkid",
      "academy",
      "perks",
    ],
  },

  // ── First Team Scout ────────────────────────────────────────────────────────
  {
    slug: "first-team-scout-spec",
    title: "First Team Scout",
    category: "specializations",
    order: 1,
    summary:
      "Focuses on ready-now senior players. Better at current ability accuracy and transfer market valuation.",
    searchText:
      "First Team Scout. Focuses on ready-now senior players. Better at current ability accuracy and transfer market valuation. Unlocks agent showcase events and trial match observation. Perks: System Fit Analysis (Lv1) assess how well a player's movement and decision-making patterns match your club's tactical shape, observations include a system-compatibility indicator alongside standard readings. Form vs Ability (Lv3) distinguish between a player riding a hot streak and one whose underlying ability is genuinely elite, unlocks a form-adjusted reading that separates current peak from long-term level. Opposition Context Correction (Lv5) watching players against weak opposition no longer artificially inflates readings, assessments apply a quality-of-opposition adjustment. Transfer Market Sense (Lv8) seasons spent tracking senior players gives an instinctive feel for fair value, market valuation estimates carry significantly tighter error margins. Adaptation Prediction (Lv12) predict how well a player will settle into a new league, club culture, or tactical demand, unlock an adaptation-risk score on every report for players moving between leagues. Conviction Commander (Lv15) reputation for backing the right players is impeccable, every conviction level you attach to a report now carries 50% more persuasive weight in the boardroom. Transfer Kingmaker (Lv18) your word carries real institutional weight, direct lobbying, targeted briefings, and relationship leverage give you meaningful influence over whether a club pursues a transfer.",
    content: (
      <SectionBlock>
        <Para>
          Focuses on ready-now senior players. Better at current ability accuracy
          and transfer market valuation. Unlocks agent showcase events and trial
          match observation.
        </Para>
        <div className="space-y-2">
          <PerkCard
            name="System Fit Analysis"
            level={1}
            description="Assess how well a player's movement and decision-making patterns match your club's tactical shape. Observations include a system-compatibility indicator alongside standard readings."
          />
          <PerkCard
            name="Form vs Ability"
            level={3}
            description="Distinguish between a player riding a hot streak and one whose underlying ability is genuinely elite. Unlocks a form-adjusted reading that separates current peak from long-term level."
          />
          <PerkCard
            name="Opposition Context Correction"
            level={5}
            description="Watching players against weak opposition no longer artificially inflates readings. Your assessments apply a quality-of-opposition adjustment."
          />
          <PerkCard
            name="Transfer Market Sense"
            level={8}
            description="Seasons spent tracking senior players gives an instinctive feel for fair value. Market valuation estimates carry significantly tighter error margins."
          />
          <PerkCard
            name="Adaptation Prediction"
            level={12}
            description="Predict how well a player will settle into a new league, club culture, or tactical demand. Unlock an adaptation-risk score on every report for players moving between leagues."
          />
          <PerkCard
            name="Conviction Commander"
            level={15}
            description="Your reputation for backing the right players is impeccable. Every conviction level you attach to a report now carries 50% more persuasive weight in the boardroom."
          />
          <PerkCard
            name="Transfer Kingmaker"
            level={18}
            description="At this level your word carries real institutional weight. Direct lobbying, targeted briefings, and relationship leverage give you meaningful influence over whether a club pursues a transfer."
          />
        </div>
      </SectionBlock>
    ),
    related: [
      "building-conviction",
      "phase-matching",
      "notebook-video-equipment",
      "contact-types",
      "reading-between-the-lines",
    ],
    tags: [
      "first team",
      "specialization",
      "senior",
      "transfer",
      "valuation",
      "system fit",
      "perks",
    ],
  },

  // ── Regional Expert ─────────────────────────────────────────────────────────
  {
    slug: "regional-expert-spec",
    title: "Regional Expert",
    category: "specializations",
    order: 2,
    summary:
      "Deep knowledge of one geographic territory. Better accuracy on home soil and the ability to create long-term player pipelines.",
    searchText:
      "Regional Expert. Deep knowledge of one geographic territory. Better accuracy on home soil, faster contact relationship building, and the ability to create long-term player pipelines from a specific region. Perks: Local Network (Lv1) deep roots in your region mean contacts trust you faster, meetings with regional scouts and journalists yield enhanced relationship gains and more candid intelligence. League Knowledge (Lv3) you know the playing styles, tactical tendencies, and quality variance of every club in your region intimately, attribute readings from regional matches carry a 15% accuracy bonus. Hidden Gem Finder (Lv5) lower leagues hide players no-one else is watching, thorough regional coverage reveals additional layers of mental and tactical attributes on players outside the top two tiers. Cultural Translator (Lv8) understanding regional culture, language, and football philosophy lets you build bridges between players and new clubs, agent contacts in your region yield substantially richer intel. Pipeline Builder (Lv12) establish a formal talent pipeline from your region, receive alerts when contracted players in your territory enter their final contract year or become available for loan. Territory Mastery (Lv15) you know your home region as well as anyone alive, observations made on home soil carry a 70% accuracy bonus, narrowing confidence intervals to near-certainty. Hidden Attribute Revealer (Lv18) years of intimate knowledge of players in your territory means Consistency and Professionalism are no longer hidden to you, you read them directly from sustained observation.",
    content: (
      <SectionBlock>
        <Para>
          Deep knowledge of one geographic territory. Better accuracy on home
          soil, faster contact relationship building, and the ability to create
          long-term player pipelines from a specific region.
        </Para>
        <div className="space-y-2">
          <PerkCard
            name="Local Network"
            level={1}
            description="Deep roots in your region mean contacts trust you faster. Meetings with regional scouts and journalists yield enhanced relationship gains and more candid intelligence."
          />
          <PerkCard
            name="League Knowledge"
            level={3}
            description="You know the playing styles, tactical tendencies, and quality variance of every club in your region intimately. Attribute readings from regional matches carry a 15% accuracy bonus."
          />
          <PerkCard
            name="Hidden Gem Finder"
            level={5}
            description="Lower leagues hide players no-one else is watching. Your thorough regional coverage reveals additional layers of mental and tactical attributes on players outside the top two tiers."
          />
          <PerkCard
            name="Cultural Translator"
            level={8}
            description="Understanding regional culture, language, and football philosophy lets you build bridges between players and new clubs. Agent contacts in your region yield substantially richer intel."
          />
          <PerkCard
            name="Pipeline Builder"
            level={12}
            description="Establish a formal talent pipeline from your region. Receive alerts when contracted players in your territory enter their final contract year or become available for loan."
          />
          <PerkCard
            name="Territory Mastery"
            level={15}
            description="You know your home region as well as anyone alive. Observations made on home soil carry a 70% accuracy bonus, narrowing confidence intervals to near-certainty."
          />
          <PerkCard
            name="Hidden Attribute Revealer"
            level={18}
            description="Years of intimate knowledge of players in your territory means Consistency and Professionalism are no longer hidden to you \u2014 you read them directly from sustained observation."
          />
        </div>
      </SectionBlock>
    ),
    related: [
      "relationship-building",
      "intel-reliability",
      "travel-network-analysis-equipment",
      "gossip-intel",
      "contact-types",
    ],
    tags: [
      "regional",
      "specialization",
      "territory",
      "pipeline",
      "accuracy",
      "hidden attributes",
      "perks",
    ],
  },

  // ── Data Scout ──────────────────────────────────────────────────────────────
  {
    slug: "data-scout-spec",
    title: "Data Scout",
    category: "specializations",
    order: 3,
    summary:
      "Statistical analysis specialist. Unlocks data overlays, advanced metrics, and automated anomaly detection.",
    searchText:
      "Data Scout. Statistical analysis specialist. Unlocks data overlays on reports, advanced metrics, and automated anomaly detection. Less dependent on live observation than other paths. Perks: Statistical Baseline (Lv1) access to league-wide per-90 benchmarks lets you contextualise raw output numbers, attribute readings gain a statistical confidence score drawn from data rather than pure observation. Performance Modelling (Lv3) a proprietary model blends observed attributes with underlying statistical profiles, all attribute confidence ranges narrow by 20% when sufficient data coverage is available. Anomaly Detection (Lv5) flags players whose statistical output is significantly higher or lower than their observed attribute profile would predict, surfacing hidden gems and overrated names alike. Video Efficiency Protocol (Lv8) systematic clip tagging and frame-by-frame review extracts more signal from footage than a standard viewing session, video observations now yield attribute readings comparable to a live visit. xG Chain Analysis (Lv12) decompose expected-goals chains to assess each player's contribution to attack creation and defensive disruption, unlocks advanced shot-creation and pressing-intensity metrics on reports. Predictive Analytics (Lv15) when data coverage is rich enough, models move from descriptive to predictive, attribute confidence intervals tighten by 65% on players with high data coverage. Neural Scout Network (Lv18) pattern-matching systems now operate across the entire dataset simultaneously, receive automated alerts whenever a cross-league statistical pattern matches a profile associated with breakout talent.",
    content: (
      <SectionBlock>
        <Para>
          Statistical analysis specialist. Unlocks data overlays on reports,
          advanced metrics, and automated anomaly detection. Less dependent on
          live observation than other paths.
        </Para>
        <div className="space-y-2">
          <PerkCard
            name="Statistical Baseline"
            level={1}
            description="Access to league-wide per-90 benchmarks lets you contextualise raw output numbers. Attribute readings gain a statistical confidence score drawn from data rather than pure observation."
          />
          <PerkCard
            name="Performance Modelling"
            level={3}
            description="A proprietary model blends observed attributes with underlying statistical profiles. All attribute confidence ranges narrow by 20% when sufficient data coverage is available."
          />
          <PerkCard
            name="Anomaly Detection"
            level={5}
            description="Flags players whose statistical output is significantly higher or lower than their observed attribute profile would predict \u2014 surfacing hidden gems and overrated names alike."
          />
          <PerkCard
            name="Video Efficiency Protocol"
            level={8}
            description="Systematic clip tagging and frame-by-frame review extracts more signal from footage than a standard viewing session. Video observations now yield attribute readings comparable to a live visit."
          />
          <PerkCard
            name="xG Chain Analysis"
            level={12}
            description="Decompose expected-goals chains to assess each player's contribution to attack creation and defensive disruption. Unlocks advanced shot-creation and pressing-intensity metrics on reports."
          />
          <PerkCard
            name="Predictive Analytics"
            level={15}
            description="When data coverage is rich enough, your models move from descriptive to predictive. Attribute confidence intervals tighten by 65% on players with high data coverage."
          />
          <PerkCard
            name="Neural Scout Network"
            level={18}
            description="Your pattern-matching systems now operate across the entire dataset simultaneously. Receive automated alerts whenever a cross-league statistical pattern matches a profile associated with breakout talent."
          />
        </div>
      </SectionBlock>
    ),
    related: [
      "notebook-video-equipment",
      "travel-network-analysis-equipment",
      "phase-matching",
      "choosing-the-right-lens",
      "equipment-overview",
    ],
    tags: [
      "data",
      "specialization",
      "statistics",
      "analytics",
      "xG",
      "anomaly",
      "video",
      "perks",
    ],
  },
];
