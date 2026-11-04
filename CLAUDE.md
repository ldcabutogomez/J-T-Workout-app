# J&T 2.0 Workout app: notes for future sessions

React + TypeScript PWA (Vite). Commands: `npm run dev`, `npx tsc --noEmit`, `npm test`, `npm run build`. Pushing to `main` deploys to GitHub Pages (`.github/workflows/deploy.yml`).

## Exercise swaps: rules to keep

- Swaps are explicit pairs in `SWAP_RULES` (`src/program/swapOptions.ts`). Every rule needs a `fit` (`direct`, `conditional`, `different`). Never infer compatibility from group membership. `different` pairs (a different movement) are applied like any other and always rescale reps.
- Never convert load between different exercises (no load factors). A swapped-in exercise suggests a load only from its own logged history.
- A swapped main lift keeps the day's sets, reps and percentages but never the program lift's training max. Block 1 uses `profile.variationTrainingMaxes` (`${exerciseId}:${block}`); Block 2 back-offs follow the logged target-RM set. The deadlift offers only Sumo, Trap Bar and Rack Pull.
- Reps are never changed silently. A rule's `reps` range is the replacement's own rep range: when a non-T1 slot's target falls outside it, reps are rescaled into it (a T3 uses the range as is; a T2 may run up to 4 lower, never below 5), sets stay 4, and the picker shows "Reps rescaled from X to Y". T1 swaps keep the program's reps. The one exception is a rule with an explicit `scheme` (deadlift to Romanian Deadlift or Hip Thrust): it rescales sets and reps, the picker says so, and it is unavailable on 1RM test weeks.
- Day 3 programs Back Squat (Block 1 T1, Block 2 T2a) on the `squat` TM; Front Squat is only a swap option on Back Squat slots, with its own variation TM. This deliberately differs from the workbook, and `tests/workbookExpectations.ts` says so.
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

## Added exercises ("extras")

- An extra is an exercise the lifter adds to a workout (`LoggedExercise.isExtra`, slot id `extra-<exerciseId>`, straight sets, empty `sourceRefs`). It lives only in `session.exercises`, never in `prescriptionSnapshot`; the validator enforces this.
- Extras must never affect completion or credit: use `programExercises(session)` (`src/engine/extras.ts`) for anything about "is the workout finished", `sessionCredit`, progress bars, nudges and the live-workout count. `finalizeSession` drops unlogged extra sets and empty extras.
- An extra's heaviest logged set stands for it in PRs, "last time" and records (`findTopSet`). Its id is `slug(name)`, so it shares history with the same exercise anywhere in the app.
- Extras have no swap menu, warm-up or workbook source.
