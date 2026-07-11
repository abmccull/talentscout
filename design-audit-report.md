# TalentScout Youth Early Access design audit

**Audit date:** July 10, 2026
**Audited scope:** Freelance Youth Scout creation, onboarding, dashboard, calendar, observation/report loop, marketplace outcome, saves, desktop shell, and 390 × 844 responsive states.
**Current verdict:** **Early Access candidate** for the focused Youth Scout slice. No P0/P1 visual, interaction, or accessibility defect remains in the verified first-report journey.

## Outcome

The product now presents one honest entry point and one coherent promise: discover youth players, collect evidence, write a defensible report, and sell that work as an independent scout. Unsupported specializations, club starts, scenarios, batch advance, Agency, Leaderboard, Analytics, rival-scout widgets, and international travel controls are removed from the Early Access path while their underlying full-game data remains preserved.

The most important rendered improvements are:

- A single, prominent **Start Youth Career** action with explicit Early Access framing.
- A six-step creator that requires all eight skill points and remains usable at 390 px.
- A mobile mentor card that stays opposite its target instead of covering the hamburger or required control.
- An actionable first tutorial task (**Open the calendar**) instead of asking the player to visit the dashboard they already occupy.
- A scoped dashboard and calendar without unsupported Agency, Leaderboard, Analytics, rival, transfer-alert, auto-schedule, or travel calls to action.
- Evidence-linked report claims, conservative goalkeeper copy, and quality guidance that never rewards invented strengths or concerns.
- Mobile report, history, calendar, inbox, save, and navigation states that retain their primary actions.
- No serious or critical axe violations in mobile main menu, creation, dashboard, or calendar states.

## Scorecard

| Dimension | Score | Evidence-backed assessment |
|---|---:|---|
| 1. Visual hierarchy | 8.5/10 | Main CTA, page titles, planner action, and report decisions are immediately legible. Disabled secondary menu actions remain intentionally subordinate. |
| 2. Layout and spacing | 8/10 | Desktop cards use consistent max widths and rhythm; mobile creator and planner stack without horizontal overflow. The dashboard remains information-dense below the fold. |
| 3. Typography | 8/10 | Strong title/body hierarchy and compact simulation labels. Small metadata is readable after calendar contrast fixes. |
| 4. Color and contrast | 8/10 | Emerald action language is consistent; empty slots and activity headings now meet the blocking contrast gate. |
| 5. Imagery and atmosphere | 9/10 | Stadium, office, and observation imagery strongly support the scouting fantasy without obscuring primary content. |
| 6. Navigation and information architecture | 8/10 | Early Access navigation is reduced to the verified Youth loop. Mobile off-canvas navigation remains reachable during the tutorial. |
| 7. Component consistency | 8/10 | Cards, badges, buttons, dialogs, and tutorial surfaces use a coherent dark-system vocabulary. |
| 8. Interaction and feedback | 8/10 | Skill allocation, week decisions, observation phases, save loading, listing, bids, and bid acceptance expose clear state changes. |
| 9. Responsive behavior | 8/10 | The critical creator/dashboard/calendar states work at 390 × 844; the mentor card uses edge-aware placement and a viewport-safe width. |
| 10. Accessibility | 8/10 | Landmarks, button names, dialog labels, mobile navigation, timeline semantics, and contrast were verified. Automated gate: zero serious/critical axe violations across four critical mobile states. |
| 11. Onboarding and task completion | 8.5/10 | Fresh onboarding immediately advances to an actionable Calendar task and then to a specialization-specific School Match task. |
| 12. Trust and game-state clarity | 8.5/10 | UI scope matches enabled behavior; incompatible saves are preserved; summaries, claims, valuation ranges, bids, and load results reflect persisted state. |
| **System cohesion** | **8.2/10** | Visual language, game-state transitions, tutorial milestones, and Early Access scope now reinforce the same core loop. |

## Rendered evidence

- `design-audit-evidence/youth-ea-main-desktop.png`
- `design-audit-evidence/youth-ea-creation-desktop.png`
- `design-audit-evidence/youth-ea-main-mobile.png`
- `design-audit-evidence/youth-ea-creation-mobile.png`
- `design-audit-evidence/youth-ea-dashboard-mobile.png`
- `design-audit-evidence/youth-ea-calendar-mobile.png`

Desktop evidence was captured at 1280 × 720. Mobile evidence was captured at 390 × 844 in the in-app browser. The mobile flow was completed through the real six-step creator, dashboard arrival, hamburger navigation, and Calendar tutorial transition.

## Accessibility evidence

The dedicated Playwright/axe gate covers:

- Mobile main menu.
- Mobile identity/creation entry.
- Mobile dashboard.
- Mobile calendar.

The audit fixed three blocking classes of issue:

1. Event-segment ARIA labels were moved from prohibited generic elements to the timeline's semantic image label.
2. Empty calendar slots and activity-category labels received sufficient contrast.
3. Completed creator-step icon buttons received explicit accessible names.

## Remaining non-blocking design debt

- The dashboard and season timeline are still dense for a first-time player; future iterations should progressively disclose lower-priority season context.
- The `/play` route remains a large client bundle (about 920 KB first-load JS in the current production build). Route and system-level code splitting is the next meaningful performance project.
- Local portraits and landing imagery now use the static-export-safe Next image path; lint passes with zero warnings.
- This audit certifies the first-report Early Access loop, not multi-season balance, economy tuning, content variety, or Steam storefront configuration.

## Design release decision

**Pass for the focused Youth Scout Early Access candidate.** Preserve the current scope discipline: new breadth should not re-enter navigation until it has equivalent UI, accessibility, game-state, and end-to-end evidence.
