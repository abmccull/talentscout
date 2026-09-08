# Talent Scout visual design system

## Direction

Football documentary, scouting notebook, recruitment dossier. The player is a scout making a consequential judgment from incomplete evidence. A screen must establish place, subject, evidence and next action within its first viewport. Photography supplies the atmosphere; typography and grouping supply the interface.

The overhaul lives in the isolated `codex/visual-overhaul-20260904` worktree. Its rendered baseline and source fingerprint are recorded in `PLAN.md`. This document describes the intended implemented system; final coverage and exceptions belong in `VISUAL_OVERHAUL_REPORT.md`.

## Foundation and semantic color

| Role | Value | Purpose |
| --- | --- | --- |
| Background | `#101411` | Warm charcoal canvas |
| Surface | `#181e19` | Quiet grouped content |
| Elevated | `#222a23` | Menus and necessary panels |
| Interactive | `#29342b` | Hover and controls |
| Selected | `#263d2d` | Chosen subject or judgment |
| Overlay | `#141a16` | Readable interruptive decisions |
| Text | `#f2f0e8` | Warm white primary reading |
| Secondary text | `#b4bbb2` | Readable metadata |
| Primary | `#b7d6a0` | One main action; charcoal text |
| Football green | `#77ad86` | Confidence/supporting positive meaning |
| Moment amber | `#ddb777` | Standout moments and consequential timing |
| Information | `#9bbccc` | Estimated information and context |
| Concern | `#e49a8e` | Risk or negative evidence |
| Divider | `#354137` | Section separation where spacing is insufficient |

Use `--signal-focus` for blue information and `--signal-danger` for readable negative text. The darker `--destructive` fill is for destructive controls, not small warning text. Important identity dates use at least 12px readable secondary text.

Meaning always has a label, icon or position as well as color. Unplanned time is ordinary planning, not a red critical error. Unknown information is explicitly unknown; an estimate never becomes a true ability score through presentation.

## Typography

Use the installed system sans serif for body and controls. A restrained Georgia serif supplies editorial titles and the player's name on a dossier. No downloaded font is required for the new language. Handwriting is limited to an optional short personal note, never instructions, controls, assessment labels or dense evidence.

| Token | Size / leading | Use |
| --- | --- | --- |
| Display | clamp 32–56 / 1.04 | Career and opening narrative |
| Page title | clamp 28–40 / 1.12 | Workspace identity |
| Player name | clamp 26–42 / 1.08 | Profile hero |
| Section title | 18–22 / 1.3 | Meaningful content group |
| Body / scouting note | 15–16 / 1.6 | Observations and decisions |
| Metadata | 13 / 1.45 | Age, club, timing, confidence |
| Label | 12 / 1.35 | Short uppercase eyebrow only |
| Stat | 24–32 / 1.1 | A small number of decision-relevant figures |

Avoid long uppercase text and text below 12px. Use tabular numerals for minutes, dates and measured comparisons. Names and observation prose wrap naturally; control decorations may not reserve a large fixed text column.

## Spacing and surfaces

Use a 4px base: 4, 8, 12, 16, 24, 32, 48 and 64. Related information has 8–12px spacing, sections have 24–40px. Desktop workspace gutters are 32–48px; mobile 16–20px. Reading columns usually remain below 75 characters.

Sections are the default: heading, content, whitespace, optional single divider. Cards are reserved for independently selectable decisions or content that actually floats above its surroundings. Do not nest cards to represent simple metadata. Radius is 4px for controls, 6px for a necessary surface; portraits use a small rectangular crop. Shadows are for overlays only.

## Controls and navigation

Primary buttons are a restrained pale green with dark text. Secondary actions are quiet outline or text controls. Default buttons and mobile touch targets have at least 44px height. Visible keyboard focus uses an offset solid outline. Selected options use one marker and a distinct surface; a recommendation is a small flowing annotation, not a second narrow column.

Workspace navigation is stable. Tabs use an underline and text weight rather than four enormous navigation cards. Important confirmation dialogs explain the consequence once. Routine focus and lens changes stay beside the match at every width; selecting a lens moves keyboard focus to the release control. Actual dialogs provide an obvious dismissal and restore focus. Tutorials use short contextual coaching without a second full-page dimmer.

Use the existing line-icon set with consistent stroke and size within each control family. Icons reinforce a label or familiar action rather than decorate every section. Decorative icons are hidden from assistive technology; an icon-only control has an accessible action name and the same practical touch target as a labeled control.

## People and photographs

Use the same persistent player identity in every workspace. Headshots are head-and-shoulders documentary photographs with subdued backgrounds, natural light and plain kit. Profiles give the person enough scale to recognize them; lists use smaller, consistently cropped photos. A missing image uses editorial initials with a neutral photo texture, never a cartoon or a different person's face.

Age history uses the same lineage at recorded ages. It may compare discovery and current appearance, with truthful dates and labels. Rendering never generates or assigns a face. An explicit first selection may reserve a previously unseen person once; subsequent selections preserve the binding. See `PLAYER_VISUAL_IDENTITY_SYSTEM.md` and `PORTRAIT_ART_DIRECTION.md` for the allocation and asset contracts.

Environmental photography is strongest during observation and selected narrative moments. Dossiers use a calm reading surface. No neon grading, arbitrary blue/gold gradients, glass panels or repeated photographic strips behind forms.

## Scouting information

Order a player dossier as identity → present judgment → evidence/uncertainty → next action → deeper history. Reports read as a recommendation supported by specific evidence. Comparisons prioritize role, judgment, confidence and differences; a missing attribute remains missing. Observations form a timeline with minute, player, witnessed description and interpretation. A glimpse cannot reveal a full narrative later.

Confidence words must match engine evidence. Concern is not certainty. Contradictory observations remain visible. Retrospective rewards emphasize recognition, development and consequences rather than casino effects.

## Responsive behavior

Large desktop: generous match stage or dossier hero, bounded reading columns and an adjacent contextual section. Laptop: reduce gutters before reducing text. Tablet: two columns only where both remain useful. Mobile: identity/current evidence/primary decision first, secondary context disclosed below. No floating portraits over tiny pitches; no seven unreadably narrow planning columns; no fixed controls that cover evidence or mobile navigation.

Verify at 1920×1080, 1366×900, 834×1112 and 390×844, including real navigation without manually resetting scroll. A screen change starts at its heading while same-screen interaction preserves position.

## Motion and accessibility

Use 120–180ms fades and small focus emphasis. Age comparisons may crossfade once when the user changes the selected year. Respect OS reduced motion and the game's setting. Avoid bouncing, celebratory spinning and persistent glows. Atmosphere must not reduce text contrast, semantic headings, form labels, keyboard access or clear loading/error feedback.

The shared screen entrance is an opacity-only 150ms fade. Do not transform the screen wrapper: even a completed identity transform changes the containing block of fixed mobile headers, navigation and Watch controls. Verify these controls remain anchored while real content scrolls, with both OS and in-game reduced motion disabled.

Below 1024px, the content-sized workspace clips horizontal overflow without creating its own vertical scrolling boundary. The weekly journey does the same, allowing its sticky action bar to follow the viewport. Use `overflow-x-clip` in these wrappers; `overflow-x-hidden` implies vertical `auto` overflow and can trap sticky descendants in a container with no scroll range. At the parent's end padding a sticky bar may move inward, but it must remain visible above phone navigation. Bounded desktop scrolling remains unchanged.

Validation combines rendered captures, keyboard interactions, accessibility scans and the existing high-risk gameplay tests. A changed token alone is not proof that a screen has been redesigned.

Guide opt-out is a saved career choice. It disables automatic mentor sequences, first-visit screen panels and weekly hints while preserving explicit Ask-for-help controls and requested replay. Major outcomes, week summaries and feedback own the screen before tutorial surfaces appear. Selecting an observation lens is inline at all widths, with keyboard focus moving to the release control after allocation. Initial assessments use one mounted set of six native radio groups inside five steps; resizing never swaps duplicate form controls.

Career Tracker and Alumni lead with a named person and the retained photograph. Sparse history is stated honestly rather than replaced with fabricated outcomes or large zero-value cards. Season statistics and detailed awards use optional disclosures. League recognition must not expose hidden CA/PA or call a market-value estimate an executed transfer.

Weekly playback keeps a seven-day row above a full-width story until 1024px, accounting for the desktop sidebar that appears at 768px. Its tablet footer stays at the bottom without reserving phone navigation space. World assignment cards remain below the top controls at these intermediate widths; absolute left/right arrangements require enough actual content width.
