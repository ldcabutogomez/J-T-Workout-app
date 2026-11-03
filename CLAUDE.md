# J&T 2.0 Workout app: notes for future sessions

React + TypeScript PWA (Vite). Commands: `npm run dev`, `npx tsc --noEmit`, `npm test`, `npm run build`. Pushing to `main` deploys to GitHub Pages (`.github/workflows/deploy.yml`).

## Exercise swaps: rules to keep

- Swaps are explicit pairs in `SWAP_RULES` (`src/program/swapOptions.ts`). Every rule needs a `fit` (`direct`, `conditional`, `different`). Never infer compatibility from group membership. `different` pairs are shown but never applied.
- Never convert load between different exercises (no load factors). A swapped-in exercise suggests a load only from its own logged history.
- A swapped main lift keeps the day's sets, reps and percentages but never the program lift's training max. Block 1 uses `profile.variationTrainingMaxes` (`${exerciseId}:${block}`); Block 2 back-offs follow the logged target-RM set. The deadlift offers only Sumo, Trap Bar and Rack Pull.
- Reps are never changed silently. A rule's `reps` range is a compatibility check against the slot's initial target; outside it the option is unavailable that week.
- Duplicates are settled by `resolveDaySwaps` on final exercise ids, used by both the engine and the picker. Earlier slot wins; the loser keeps the program exercise with a `swapReview`. Program-intended repeats (EZ Bar Curl, Day 3 Block 2) are never touched.
- Completed sets are never relabeled: `swapExercise` refuses once any set in the slot is completed, and clears all unlogged loads otherwise.
- Historical sessions, snapshots and calendar labels never depend on the profile's current swaps.
- Load notation (`src/program/loadNotation.ts`) is written to new sessions only. Older sessions stay `unspecified`; never reinterpret or halve logged loads.
- Tests that require inappropriate TM inheritance should be changed, not preserved. Swap tests: `tests/swaps.test.ts`, `tests/t1swaps.test.ts`, `tests/swapRepair.test.ts`.
- UI conventions: no emoji in UI source (a theme test enforces it).

## Known assumptions and untested behavior

- Variation TMs are keyed per variation and per block. The input appears only in Block 1.
- Entering a variation TM mid-workout refreshes that slot's unlogged loads, which also clears values typed there. This is deliberate.
- The disabled options, review banner, TM input and "Start blank" button have no browser test. Their logic is covered and the build passes.
- Backup import validation of `variationTrainingMaxes` (`src/storage/db.ts`) is not covered by a test.
- `loadNotationFor` classifies by exercise name. Ambiguous ones (for example walking lunge) read as "notation not recorded". That fallback is an assumption.
- A later swap can be rejected when an earlier slot's unswapped exercise happens to match it.
- Rep ranges and the fit classification of each pair are programming judgment, not measured data.
