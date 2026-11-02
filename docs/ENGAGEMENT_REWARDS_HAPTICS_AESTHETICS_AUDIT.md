# Engagement, Rewards, Haptics, and Aesthetics Audit

**Audit date:** 2026-11-01  
**Scope:** Current working tree, based on `92614a0` plus uncommitted local changes present at audit time  
**Purpose:** Planning-agent handoff for improving engagement through truthful, positive, accessible reinforcement

## Executive summary

The app already has a credible reward foundation: immediate set confirmation, exact PR detection, weekly goals and streaks, a full workout summary, badges, confetti, sound, haptics, a rest timer, progress records, and user-selectable encouragement tone. It is substantially beyond a basic workout logger.

The next move should **not** be “add more gamification.” The highest-leverage work is to:

1. repair several reward-trust defects;
2. make feedback specific, proportional, and emitted only once;
3. shift emphasis from generic badges toward visible mastery and achievable goals;
4. use the two-partner premise for supportive relatedness rather than competition;
5. simplify the workout screen and make its feedback accessible in a gym context.

The current system is strongest at end-of-workout celebration and weakest at long-term mastery, partner reinforcement, event orchestration, and measurement. The experience can become much more engaging without becoming noisier.

### Highest-priority findings

- A session containing only a “better than last time, but below the all-time best” result is headlined **“New personal best!”** and receives PR-level feedback. The displayed delta can render as `+-10` because it is calculated against the all-time best. This is a trust-breaking reward error.
- The preference labeled **“7-day target”** is implemented as a Monday–Sunday calendar-week goal in the streak system, while completion encouragement uses a rolling seven-day window. Users can see inconsistent counts and semantics.
- PR feedback can fire when the top set is logged and then fire again in the completion summary. Undoing and relogging can repeat it again. There is no idempotent reward-event layer.
- The `50 workouts` badge is unreachable in the normal 48-session cycle because the app prevents another cycle from starting.
- Editing a completed session suppresses highlight recomputation, so volume and PR-derived history can become stale. Deleting or changing achievement-supporting history does not reconcile unlocked badges.
- Haptic patterns are distinct but some are long and buzzy, one pattern is reused for an unrelated exercise-swap action, and timer completion has no persistent visual fallback when sound/haptics are disabled.
- The “partner” app has two separate profiles but no cooperative reward loop, shared progress, or private partner kudos.
- The visual language is cohesive, but active workout screens are dense with equally weighted rounded cards, 9–10 px metadata, and workbook source references that compete with the next action.

## Audit method and limitations

Reviewed:

- reward and feedback orchestration in `src/App.tsx`;
- achievement, streak, PR, and encouragement logic;
- Today, Progress, Settings, Workout Summary, Rest Timer, Toast, Confetti, and Progress Ring components;
- global visual/motion styles, PWA metadata, and app icon;
- reward-related automated tests.

Validation performed:

- `npm test`: all 6 test files passed;
- `npm run typecheck`: passed;
- app/PWA icon inspected directly.

The sandbox did not permit binding the local Vite preview port (`EPERM`), so this is a source- and asset-based aesthetic/accessibility audit, not a claim of hands-on device rendering. A physical iOS/Android pass remains necessary, especially for haptics, sound, focus behavior, safe areas, and one-handed use.

## Current reinforcement inventory

| Moment | Current behavior | What is good | Main gap |
|---|---|---|---|
| Before workout | Weekly goal ring, streak copy, next scheduled session, prominent Start button | Clear next action; weekly context is visible | No 48-session/cycle map, block milestone, or personally chosen short-term goal |
| Set logged | Green completed row, check icon, pop animation, progress bar advance, 25 ms haptic | Immediate and contingent; visual state persists | No semantic event record; same haptic is reused for exercise swap; every set gets nearly identical treatment |
| Top-set improvement | Exact comparable result detection | Comparison uses stable exercise identity, achieved reps, and normalized units | “Previous improvement” and all-time PR become conflated downstream |
| All-time PR | Toast plus PR sound/haptic while logging | Specific, truthful copy at the immediate moment | Repeats at session finish and can repeat after undo/relog |
| Rest | Optional tier-based auto-start, persistent timestamp, pulse ring, completion sound/haptic | Useful gym-context utility; survives app backgrounding | Completion can become effectively invisible when feedback is muted; no “ready” status/toast |
| Workout completion | Full-screen summary, count-up stats, confetti, sound/haptics, PR cards, weekly goal, badges, next workout | Strongest part of the experience; layered and specific | Too many rewards can stack; headline semantics are wrong for previous-only improvement; elapsed time can be misleading |
| Partial workout | Saved summary and specific logged-set count; no false full-completion claim | Non-shaming and data-honest | Effort is acknowledged only in copy; recovery/next-step support is weak |
| Skipped workout | Neutral confirmation and advancement | Avoids shame or false celebration | No recovery planning or schedule reflection |
| Long-term progress | Weekly streak, lifetime volume, badges, comparable rep records, session history | Real history is prioritized over invented scores | No trend visualization, phase progress, next-badge progress, or active-mastery narrative |
| Partner experience | Two independently persisted profiles | Strong technical isolation | No shared or cooperative engagement mechanic despite the product premise |
| Personalization | Minimal/warm/playful/off tone; separate vibration, sound, and auto-rest toggles | Good user control | No reward intensity, sound volume, goal type, or feedback preview per event |

## What should be preserved

These are good foundations and should not be lost in a redesign:

- **Truthful program semantics.** Partial, skipped, demo, and incomplete sessions are excluded from achievements and completion claims.
- **Specific reinforcement.** PR copy names the exercise, reps, load, unit, and delta instead of offering vague praise.
- **Non-punitive recovery.** Skips and partial sessions are recorded without scolding.
- **Modality choice.** Haptics and sounds can be independently disabled.
- **Reduced-motion support.** CSS globally suppresses nonessential animation and the summary count-up explicitly respects `prefers-reduced-motion`.
- **Accessible status foundations.** Toasts use `aria-live="polite"`; banners use `status`/`alert`; set progress is a real progressbar.
- **Strong core palette.** Slate surfaces, amber brand/action accents, emerald success, and rose warnings form a coherent visual system.
- **Strong PWA identity.** The barbell app icon is recognizable, restrained, and consistent with the product palette.

## Detailed findings

### P0 — Reward correctness and trust

#### 1. Previous improvement is mislabeled and over-celebrated as a personal best

**Evidence**

- `findAllComparableResults` correctly distinguishes `all_time_pr` from `previous_improvement` in `src/engine/encouragement.ts:68-73`.
- `computeHighlights` stores both in a field called `prs` in `src/engine/achievements.ts:42-51`.
- `WorkoutSummary` treats any item in that field as a PR (`hasPr`) and uses “New personal best!” in `src/components/WorkoutSummary.tsx:52-66`.
- The improvement card computes `load - previousBest` in `src/components/WorkoutSummary.tsx:94-97`; for a below-best improvement this is negative and is prefixed with `+`.

**Impact**

Positive reinforcement only works when users trust it. Inflating an improvement into a PR devalues real PRs and can produce visibly broken copy such as `+-10`.

**Upgrade route**

- Rename `SessionHighlights.prs` to a neutral `performanceResults`, or split it into `allTimePrs` and `previousImprovements`.
- Derive summary state from `hasAllTimePr`, `hasPreviousImprovement`, and `hasBenchmark` separately.
- Use distinct headlines and feedback intensity:
  - all-time PR: “New personal best”;
  - previous improvement: “Up from last time”;
  - first comparable result: “Benchmark established”;
  - matched best: “Matched your best.”
- Store both `previousSessionLoad` and `allTimeBestLoad` when needed; never infer both meanings from `previousBest`.

#### 2. Weekly-goal semantics conflict

**Evidence**

- Settings calls the preference a `7-day target` in `src/components/SettingsTab.tsx:63`.
- `computeStreak` uses Monday–Sunday calendar weeks in `src/engine/achievements.ts:61-103`.
- Completion encouragement counts a rolling seven-day window in `src/engine/encouragement.ts:175-185`.
- Progress shows both a rolling seven-day count and a calendar-week ring in `src/components/ProgressTab.tsx:41-64`.

**Impact**

A goal can appear met in one surface and unmet in another. That undermines the competence signal and makes streak logic feel arbitrary.

**Upgrade route**

Choose one definition and name it exactly. The current architecture favors **calendar week (Monday–Sunday)** because streaks and the primary goal ring already use it. If rolling seven days is retained as a secondary statistic, label it “Last 7 days” and never use it to explain the weekly streak.

#### 3. Derived reward data becomes stale after history edits

**Evidence**

- Highlights are recomputed only when `celebrate` is true in `src/App.tsx:234-235`; `celebrate` is false while editing completed history.
- Session deletion refreshes history but does not reconcile stored badge unlocks in `src/App.tsx:365-370`.
- Lifetime volume uses stored highlights in `src/components/ProgressTab.tsx:46`.

**Impact**

An edited load/reps value may leave old PRs and volume in the record. A deleted qualifying session can leave an unsupported badge permanently unlocked. This is a data-integrity problem expressed through the reward UI.

**Upgrade route**

- Recompute session highlights whenever a completed session is created or edited; suppressing celebration must be separate from deriving data.
- Define an explicit achievement policy:
  - **historical unlocks are permanent**, with wording such as “earned on”; or
  - **achievements reflect current history**, with a reconciliation pass after edit/delete/import.
- Recompute dependent results in chronological order when an earlier top set changes, because later PR classification may also change.

#### 4. One badge is unreachable in the normal product flow

**Evidence**

- `sessions_50` requires 50 valid completed sessions in `src/engine/achievements.ts:12-24`.
- The cycle contains 48 sessions and starting another cycle is blocked in `src/App.tsx:135-140`.

**Upgrade route**

Replace it with a reachable milestone such as 40 sessions, or add an explicit, safe “start another cycle” model before keeping lifetime milestones above 48. Every displayed badge should have a reachable path that the UI can explain.

### P1 — Reinforcement pacing and event orchestration

#### 5. The same PR can be celebrated multiple times

**Evidence**

- Immediate PR feedback fires on top-set logging in `src/App.tsx:168-176`.
- Completion summary fires PR feedback again in `src/components/WorkoutSummary.tsx:54-60`.
- Reward delivery is component-state driven and has no persisted/idempotent event ID.

**Impact**

Repeated celebration makes feedback feel mechanical and increases sound/haptic fatigue. Undo/relog can retrigger the same event.

**Upgrade route**

Create a central reward-event layer with idempotency keys. Suggested shape:

```ts
type RewardEventKind =
  | 'set_logged'
  | 'exercise_completed'
  | 'benchmark_established'
  | 'previous_improvement'
  | 'all_time_pr'
  | 'session_completed'
  | 'weekly_goal_completed'
  | 'badge_unlocked'
  | 'phase_completed'
  | 'cycle_completed';

interface RewardEvent {
  id: string; // deterministic: sessionId + subject + kind + result signature
  kind: RewardEventKind;
  level: 'micro' | 'medium' | 'major';
  sessionId: string;
  subjectId?: string;
  createdAt: number;
}
```

The summary should **recap** an already-delivered PR visually without replaying the PR sound/haptic. If multiple achievements happen together, select one primary celebration and present the others quietly beneath it.

#### 6. The hierarchy jumps from “set logged” to “workout complete”

The app has good micro feedback and a good finale, but little meaningful reinforcement between them.

**Upgrade route**

Use a restrained hierarchy:

| Event | Visual | Haptic | Sound |
|---|---|---|---|
| Set logged | Persistent check and progress update | One crisp tap | None |
| Exercise completed | Compact “T1 complete · 4/4 sets” transition | Distinct short success tap | None |
| Previous improvement | Specific inline card/toast | Optional medium tap | Usually none |
| All-time PR | One prominent toast/card | One celebratory pattern | Optional short chime |
| Session completed | Summary transition | One success pattern if no stronger event just fired | Optional |
| Weekly/phase/cycle milestone | Prominent summary section | Major pattern | Optional, never stacked |
| Rest complete | Persistent “Ready” status | Attention pattern, not reward pattern | Optional alert |

Keep major celebration scarce. Do not add praise after every set; the persistent check and progress movement are enough.

#### 7. First performances and matched performances are silent

PR logic requires comparable history. A new lifter establishes useful baselines without receiving a competence-oriented signal.

**Upgrade route**

Add truthful non-PR states: benchmark established, matched best, completed prescribed reps, and returned after a gap. These should be lower intensity than a PR and should emphasize evidence (“First 5-rep benchmark saved”) rather than generic praise.

#### 8. Partial and skipped sessions need a recovery path, not more reward

The current non-shaming copy is good. Extend it with an actionable next step:

- partial: “12 sets saved. Resume is not available after advancing; next scheduled session is X” or change the flow to offer “keep as draft” versus “finish partial and advance”;
- skipped: “Schedule advanced. Your current weekly count is 2/4”;
- return after gap: acknowledge return without calling out failure or lost streaks.

Do not introduce broken-streak punishment, red failure states, or “you disappointed your partner” copy.

### P1 — Haptics and sound

#### 9. Haptic meanings are not fully causal or platform-shaped

**Evidence**

- Patterns are hard-coded as raw web vibration durations in `src/lib/feedback.ts:15-30`.
- `setLogged` is also used after exercise swap in `src/App.tsx:199-211`.
- PR, finish, badge, and timer patterns range from several hundred milliseconds to roughly one second including pauses.
- The iOS path relies on a hidden-switch technique in `src/lib/feedback.ts:32-86`, which is a best-effort browser workaround rather than a stable native haptic contract.

**Impact**

The same sensation can mean unrelated things, and longer raw vibrations may feel buzzy on lower-quality actuators. Web support will vary by browser/device.

**Upgrade route**

- Give swap/selection a separate semantic event or no custom haptic.
- Shorten confirmation patterns; reserve longer attention patterns for timer completion only.
- Document the web fallback matrix and treat iOS vibration as best effort.
- Consider defaulting sound off for new profiles, or ask during onboarding, while retaining independent controls.
- Add a preview row for each event category rather than one combined “test finish” button.
- Do not let sound/haptics be the only indication of success or timer readiness.

Apple and Android both recommend causal, consistent, complementary, optional haptics and warn against overuse. Android specifically favors short, crisp, action-oriented feedback over legacy long one-shot vibration.

#### 10. Rest completion lacks a durable visual state

When the timer expires, the floating control returns from the amber countdown to the generic “Rest” button and emits sound/haptics. With both disabled, the state change is easy to miss.

**Upgrade route**

Show a persistent, accessible “Rest complete · ready for the next set” state/toast until acknowledged or the next set is logged. Announce it through a polite live region. Keep timer alerts semantically separate from achievement rewards.

### P1 — Long-term engagement and partner value

#### 11. Badges are more developed than mastery feedback

The badge grid has 11 items, but there is no lift trend chart, phase map, volume trend, consistency calendar, next-milestone progress, or 48-session cycle overview. Research on physical-activity apps generally finds feedback and achievable goal-setting more reliable than generic rewards alone.

**Upgrade route**

Prioritize competence-oriented surfaces before expanding the badge catalog:

- a 48-position cycle map with Block 1, Week 6 testing, Block 2, and cycle-completion milestones;
- per-lift comparable-result trend, clearly segmented by achieved rep count;
- “last time / today / all-time best” context on relevant top sets;
- weekly consistency history without punitive broken-chain framing;
- progress toward the **next** meaningful badge or milestone;
- active-time or clearly labeled elapsed-time tracking.

Avoid a synthetic points currency unless it unlocks something meaningful and cannot distort training decisions.

#### 12. The partner premise is not represented in the reward loop

Profiles are independent and technically sound, but the experience is effectively two single-user apps sharing one install.

**Upgrade route**

Build a private cooperative layer, with opt-in competition only:

- shared workout launcher and turn indicator;
- “both trained this week” cooperative goal;
- one-tap local kudos after a partner logs a hard set or finishes;
- joint session recap with each person’s own truthful highlights;
- partner-aware next action (“Alex rests · Sam logs next”);
- no public feed, stranger leaderboard, or pressure copy.

This supports relatedness while preserving autonomy and avoiding the common failure mode where one partner’s lower performance becomes a negative comparison.

#### 13. There is no engagement measurement plan

No product event or local analytics layer is visible. Without measurement, increasing animation or reward frequency can look like engagement work without improving adherence.

**Upgrade route**

Define privacy-preserving, local-first product measures. If cloud analytics are later considered, make them explicit and opt-in.

Measure outcomes such as:

- setup-to-first-set completion;
- workout start-to-finish rate;
- draft resume versus discard rate;
- weekly goal completion rate;
- return after a partial, skip, or missed week;
- time to next completed session;
- rest-timer adoption and cancellation;
- sound/haptic disable rate;
- completion-summary dismissal time only as a usability signal, not a success metric.

Do not optimize raw taps, screen time, notification opens, or celebration frequency. The desired outcome is consistent, self-directed training.

### P2 — Aesthetics, hierarchy, and accessibility

#### 14. The visual system is cohesive but too uniform and dense during workouts

**Strengths**

- consistent dark palette and semantic colors;
- large primary CTAs;
- restrained motion primitives;
- clear numeric typography intent;
- recognizable PWA icon.

**Gaps**

- Nearly every container is a similarly rounded dark card with a border, reducing hierarchy.
- All exercise sections remain fully expanded and equally prominent.
- Workbook source references are visible in the main preview and active workout flows (`src/components/TodayTab.tsx:97` and `:142`) even though they are verification metadata.
- Several labels and metadata lines use 9–10 px text and low-emphasis slate colors.
- `Arial Narrow` and `Inter` are named but not bundled, so intended display hierarchy varies by device.
- `theme?: 'dark' | 'light'` exists in the profile model, but there is no functioning theme control/application.
- Emoji badges do not fully match the otherwise restrained Lucide/barbell visual language.

**Upgrade route**

- Make the **current set** the strongest surface, the current exercise second, and completed/future exercises progressively quieter or collapsible.
- Move workbook source references behind a “Prescription details” disclosure or keep them in the Verification surface.
- Establish tokens for surface levels, semantic type sizes, focus rings, motion durations, and reward intensities.
- Raise essential workout text to at least 12–14 px; reserve tiny type for nonessential metadata.
- Bundle a deliberate local display font or accept a system-font design intentionally.
- Either implement light/high-contrast themes or remove the dead theme field.
- Replace emoji badges over time with a cohesive SVG achievement family; retain text names and descriptions.

#### 15. Focus, dialog, and touch behavior need a dedicated pass

**Evidence**

- The summary has dialog semantics but no visible focus placement, focus trap, Escape handling, or focus return in `src/components/WorkoutSummary.tsx:68-137`.
- Help and rest-timer panels are modal-like but lack complete dialog semantics and focus management.
- Numeric inputs explicitly use `outline-none` without a replacement focus-visible style in `src/components/TodayTab.tsx:274-281`.
- Several icon controls meet the WCAG 24 px minimum only narrowly and are below a gym-friendly 44 px target.

**Upgrade route**

- Add consistent 2–3 px `:focus-visible` rings with adequate contrast.
- Use a tested dialog primitive or implement initial focus, trapping, Escape, background inertness, and focus return.
- Target approximately 44 px for frequent workout controls even where WCAG’s 24 px minimum is technically met.
- Verify 200% text zoom, screen-reader announcements, landscape layout, safe areas, and sweaty/one-handed input.
- Keep redundant visual text for every sound/haptic event.

## Recommended work packages

### WP0 — Restore reward truthfulness

**Priority:** P0  
**Effort:** Small–medium  
**Dependencies:** None

Deliver:

- separated all-time PR, previous-improvement, match, and baseline semantics;
- correct deltas and headlines;
- one weekly-goal definition and matching copy;
- highlight recomputation after edits;
- explicit badge reconciliation policy;
- reachable badge thresholds.

Acceptance criteria:

- A below-best improvement never says “personal best,” never uses PR sound/haptic, and never renders a malformed delta.
- The same completed-session history produces the same weekly count in Today, Summary, Progress, and encouragement copy.
- Editing an old result updates later derived PR classifications and lifetime volume.
- Every visible locked badge has a reachable normal-flow path.

### WP1 — Introduce a reward-event orchestrator

**Priority:** P1  
**Effort:** Medium

Deliver:

- semantic reward events and deterministic event IDs;
- a single dispatcher mapping event level to visual, haptic, and sound behavior;
- cooldown/stacking rules and primary-achievement selection;
- event-specific settings previews;
- tests for no duplicate event delivery.

Acceptance criteria:

- A PR logged, undone, and relogged in one session does not replay indefinitely.
- Opening/re-rendering the completion summary cannot replay feedback.
- Badge + weekly goal + PR in one completion produces one primary major feedback sequence, not three stacked sequences.

### WP2 — Strengthen the in-workout competence loop

**Priority:** P1  
**Effort:** Medium

Deliver:

- current-set/current-exercise visual hierarchy;
- compact exercise-complete feedback;
- truthful benchmark/match/previous/all-time context;
- persistent rest-complete state;
- simplified workout cards with source details disclosed on demand.

Acceptance criteria:

- The next action is identifiable at a glance at a 390 px viewport.
- Logging a set always yields immediate visual confirmation even with motion, sound, and haptics off.
- Rest completion remains apparent until acknowledged or the next set begins.

### WP3 — Build mastery and partner engagement

**Priority:** P1–P2  
**Effort:** Medium–large

Deliver mastery first:

- cycle/phase progress;
- lift trends and next-milestone context;
- customizable achievable goals;
- non-punitive consistency history.

Then deliver partner features:

- shared workout/turn flow;
- local partner kudos;
- cooperative weekly goal and joint recap;
- competition only as explicit opt-in.

Acceptance criteria:

- A user can explain what progressed today, where they are in the cycle, and the next meaningful milestone without interpreting raw history.
- Partner features never expose or compare performance without both users opting in.

### WP4 — Accessibility and visual-system hardening

**Priority:** P1 for focus/dialog defects; P2 for broader polish  
**Effort:** Medium

Deliver:

- focus-visible system and accessible dialog behavior;
- gym-friendly target sizes and type scale;
- motion/sound/haptic parity testing;
- semantic design tokens and simplified surface hierarchy;
- deliberate theme/font/badge-icon decisions.

### WP5 — Measurement and validation

**Priority:** P1  
**Effort:** Small for schema; ongoing for evidence

Deliver:

- event dictionary and privacy policy;
- local aggregate metrics or opt-in analytics plan;
- physical-device test matrix;
- qualitative test script focused on trust, motivation, and interruption;
- experiments that compare specific feedback/goal variants rather than “more versus less confetti.”

## Test gaps to add before expansion

Current pure logic tests are valuable, but reward UI and feedback delivery are largely untested. Add coverage for:

- all-time PR versus previous improvement versus match versus baseline;
- summary headline and delta formatting for each result kind;
- duplicate suppression after undo/relog, rerender, and session summary reopen;
- all badge thresholds, reachability, and reconciliation policy;
- weekly boundary behavior around Sunday/Monday and time zones;
- completed-history edits changing later PR classifications;
- timer completion with sound/haptics disabled;
- `prefers-reduced-motion` behavior;
- keyboard focus entry/exit for every dialog;
- screen-reader announcements for set logged, progress, PR, timer complete, and errors;
- haptic/sound preference persistence and per-profile isolation.

## Product principles for the planning agent

Use these as guardrails:

1. **Truth before delight.** Never exaggerate performance to create a reward moment.
2. **Specific before generic.** “Bench 5-rep result is up 5 lb from last time” beats “Amazing job.”
3. **Progress before prizes.** Feedback and achievable goals should lead; badges should mark genuinely meaningful milestones.
4. **Proportionate intensity.** A set, exercise, workout, PR, phase, and cycle should not all feel equally dramatic.
5. **One event, one feedback sequence.** Recaps can repeat information, not sensory celebration.
6. **Reinforce process as well as outcome.** Showing up, finishing prescribed work, returning after a gap, and establishing a baseline deserve truthful recognition.
7. **Autonomy, competence, relatedness.** Let users choose goals and tone, show real mastery, and make partner support cooperative by default.
8. **No shame mechanics.** Avoid streak loss scolding, partner guilt, red failure theater, or punishment for recovery needs.
9. **Every modality is optional and redundant.** Visual/text state must work when sound, haptics, and motion are off.
10. **Optimize adherence, not app consumption.** Success is sustained training with low friction, not more taps or screen time.

## External guidance used

- [Apple Human Interface Guidelines: Playing haptics](https://developer.apple.com/design/human-interface-guidelines/playing-haptics) — causal, consistent, complementary, restrained, and optional haptics.
- [Android Developers: Haptics design principles](https://developer.android.com/develop/ui/views/haptics/haptics-principles) — “less is more,” semantic consistency, co-design with visual/audio feedback, and short clear effects.
- [W3C WCAG 2.2: Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) — programmatically expose success, progress, and error updates without unnecessary interruption.
- [W3C WCAG 2.2: Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum) — at least 24×24 CSS px or sufficient spacing; larger targets are preferable for important controls.
- [W3C WCAG 2.2: Focus Appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance) — visible, sufficiently sized focus indicators.
- [Teixeira et al., Exercise, physical activity, and self-determination theory: a systematic review](https://www.selfdeterminationtheory.org/SDT/documents/2012_TeixeiraEtAl_IJBNPA.pdf) — supports designing around autonomy, competence, relatedness, and self-directed motivation.
- [Schoeppe et al., Your Personal Motivator is with You: systematic review of physical-activity apps](https://pmc.ncbi.nlm.nih.gov/articles/PMC6684571/) — feedback and achievable goal-setting showed more consistent support than generic rewards; familiar-person social support was more promising than sharing with strangers.

## Decision brief

If only one release is available, complete **WP0 + the smallest version of WP1**. That release will improve engagement by making the existing rewards trustworthy and well-paced.

If two releases are available, follow with **WP2 + accessible focus/dialog fixes**.

For the larger product direction, invest in **mastery visualization and cooperative partner reinforcement** before expanding badges, currencies, leaderboards, or notification pressure.
