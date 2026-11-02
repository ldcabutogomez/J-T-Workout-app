# Jacked & Tan 2.0 Partner Training Engine

A local-first workout tracker for the original Jacked & Tan 2.0 template in `GZCL Free Compendium November 27th Update.xlsx`. The prescription dataset was reconstructed from the workbook's `J&T2.0` and `J&T2.0 KGS` sheets—not from the former app engine, its verification screen, or the General Gainz hybrid.

The app keeps the existing two-partner, mobile-first workflow while correcting prescriptions, load bases, session persistence, history, progress claims, and production offline behavior. It does not use AI APIs, example workbook weights, or automatically increased training maxes.

## Personal setup

New installations create two blank local profiles. Before starting a workout, enter the lifter's five Block 1 training maxes on the Program tab:

- Squat
- Bench Press
- Deadlift
- Military Press
- Front Squat

Before Week 7 work that references a Block 2 TM, enter and explicitly save the separate Block 2 values. Until a lift's Block 2 value is saved, the app uses that lift's Block 1 TM as a starting default (the Program tab says so) so Week 7+ is never blocked. The app never copies test 1RMs into these fields, never writes the default back, and never applies an automatic increase.

Training maxes are the workbook's personal estimated daily 2RM inputs. Workbook sample weights are reference data only and are never seeded into profiles.

## Program behavior

- All 12 weeks and four populated days are represented by stable exercise-slot IDs and real workbook cell ranges.
- Week 1–5 main T1 back-offs use the named Block 1 TM and the lift-specific percentage.
- Week 7–11 main T1 back-offs use the load actually achieved for that day's target-RM set. A rep mismatch leaves follow-up loads blank until the lifter explicitly chooses and saves a load.
- T2a work keeps its own exercise-specific percentage and TM mapping, including deadlift for Day 1 deficit deadlifts, Bench for Day 4 legs-up bench, and the separate Block 2 Front Squat input for Day 3.
- `3+` is three total back-off work sets; the final optional AMRAP can be declined without making the session unsuccessful.
- `3MRS` is one target-RM set plus three additional MRS—four logged sets total. Achieved reps are recorded separately and may decline.
- Populated T2c/T3d work, Day 4 Sling Shot Bench, block-specific accessory changes, and the Front Squat-to-Deadlift Day 3 T1 transition are preserved.
- Week 12 Day 2 and Day 3 T2a tests remain visible but are flagged as workbook conflicts; see [the source mapping and ambiguity log](docs/SOURCE_MAPPING.md).

## Additions beyond the workbook

The workbook has no warm-up sets and leaves some weights to the lifter (`Find nRM` and the accessory `?` cells). The app adds, clearly labeled and always editable:

- **Suggested loads.** The T1 `Find nRM` set (including Week 6 and 12 tests) is suggested from the training max, using an Epley estimate with the TM treated as a daily 2RM. Accessory and Sling Shot first sets are suggested from the lifter's last logged top set for that exercise, rescaled to today's rep target. Nothing is suggested the first time an exercise appears. Suggestions never replace the workbook's own percentage formulas.
- **T1 warm-ups.** A checklist above the main lift ramps to that day's heaviest planned set: bar x10, 40% x5, 60% x3, 80% x2, or 40/60/75/90% for 1 to 3 rep days and tests, rounded to the plate increment. Warm-ups are tracked separately and never count toward volume, PRs, set totals or partial-session detection.
- **Coach messages.** A coach card on Today (welcome back, phase milestones, weekly recap, the day's lift), short nudges mid-workout, and a personal note after a finished workout, in the lifter's chosen tone. Messages are deterministic: the same situation gives the same words.
- **Partner leaderboard.** Partial workouts count toward pounds lifted, PRs and session totals, and toward the weekly goal, 4-week compliance and streak in proportion to the sets logged (18 of 32 sets is 0.56 of a session). Badges, the 48-session cycle check and "workout complete" claims still require a finished workout. Your own stats appear immediately after a workout without waiting for a partner.

## Calendar

The Program tab opens with a week-by-week schedule. Each of the four program days has a date: by default Day 1 to Day 4 sit on Mon, Tue, Thu and Fri (change the weekdays in Settings).

- **Reschedule by dragging.** Press and hold a workout, then drag it to another day in the same Monday-to-Sunday week. Dropping on a day that already has a workout swaps the two. The **Move** button does the same thing without dragging (a day picker, plus Start now and Skip). Finished workouts stay where they were done, and nothing can be moved onto a day that has passed.
- **Missed days stay put.** A workout whose day passes unfinished is flagged Missed; nothing moves on its own. If you fall a week or more behind, **Move plan to this week** re-dates the unfinished workouts, starting from today.
- **Order does not matter to the program.** Whether a workout is done comes from your history, not its date. The Today tab picks today's workout, else the next one coming up, else the earliest missed one. The saved position (`currentWeek` / `currentDay`) is kept as the first workout you have not done, so the leaderboard, backups and partner sync are unchanged. The 48-session cycle completes on whichever workout finishes it.
- Moves are only allowed inside a week, so the weekly progression and the Week 6 and Week 12 test weeks stay in order.

## Local state and backups

Each logged set is serialized through a write queue and saved immediately. Refreshing or reopening restores the profile's unfinished session. Profiles have independent positions, drafts, units, TMs, and history.

A session stores a snapshot of its prescription, source ranges, unit, equipment increment, TMs, and customizations. Later settings changes do not rewrite historical prescriptions. Completed-session edits upsert the same record and do not advance the program again. Week 12 Day 4 records the end state and does not silently restart.

Backup format version 2 validates profiles, sessions, exercises, sets, stable IDs, cell references, and nested values before writing. Duplicate profile/session IDs and duplicate active-profile records are rejected by default. The UI offers replace-all only after explicit confirmation; import is one IndexedDB transaction (or a rollback-protected localStorage fallback).

All workout records stay in the browser. Export backups regularly, especially before clearing browser storage.

## Who uses this phone

The first time a phone with both profiles opens, it asks **Who uses this phone?** and locks to that person, with their theme, photo and sync identity. The other profile is hidden from the header, Settings and the leaderboard. **Switch who uses this phone** in Settings (with confirmation) clears the lock and the partner link. This is a convenience, not security: the other profile's data still exists in the on-device database and in backups.

## Main lift swaps

Tier 1 lifts have a "Swap" dropdown like accessories (Back Squat to Belted, Safety Bar, Box or Pause Squat; Bench to Sling Shot, Pause, Spoto or Floor Press; and so on, both directions for Bench and Sling Shot Bench). The swap keeps the day's sets, reps, percentages and training max, is remembered for that slot until the program changes the lift, keeps its own PR history, and suggests your last weight for that lift when you have one. It locks once a set is logged.

## Together tab and partner sync

The Together tab ranks both lifters on 4-week compliance, week streak, lifetime volume and all-time PRs, with this-week progress and days-since-last-session for accountability.

With two phones, each phone pushes a **snapshot** (sessions per week, streak inputs, volume, PR count, badge count, program position, last session time) and pulls its partner's. Unless you turn off **Share my photo and live status with my partner** in Settings, the snapshot also carries a 64 px thumbnail of your photo, your color and theme, a "Lifting now · X of Y sets" status while a workout is open (hidden after 3 hours), your next workout, and one code per weekday of this week. Set-by-set logs never leave the phone, and your photo goes to your own Supabase project, keyed by the hashed pairing code. Older builds ignore the new fields. Partners are linked with a shared 10-character code (Create a code on one phone, Join on the other). Stats are recomputed on the receiving phone against its own clock, so a partner who stops training shows as inactive even if their phone never syncs again. The sync is optional: without a backend configured the tab only compares profiles on the same phone, and the rest of the app works offline as before.

### One-time backend setup (Supabase, free tier)
1. Create a project at supabase.com.
2. In the SQL editor, run `supabase/schema.sql`. It locks the table down so the public key can only call `push_snapshot` and `pull_snapshots`, and stores codes as SHA-256 hashes. A code accepts at most two phones.
3. Copy the project URL and anon key (Project Settings, API). Locally, put them in `.env.local` (see `.env.example`). For the deployed app, add them as repository **Variables** named `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` and redeploy.
4. On each phone, open Together, pick who you are, then Create a code on one and Join with it on the other.

Anyone holding the code can read the two snapshots, so treat it like a password and Unlink to stop sharing. Only a pairing code is needed, so there are no accounts.


## Install and run

Prerequisites: Node.js `^20.19.0` or `>=22.12.0` and npm.

```bash
npm ci
npm run dev
```

Useful commands:

```bash
npm run typecheck       # TypeScript
npm test                # prescription, engine, storage, and message tests
npm run build           # production bundle in dist/
npm run preview         # serve the production build on 127.0.0.1:4173
npm run test:browser    # production workflow + refresh/offline browser test
```

Run `npm run build` before `npm run test:browser`. Playwright may require its Chromium binary on a fresh machine (`npx playwright install chromium`).

## Production and offline behavior

The production build emits a versioned `sw.js` containing the actual hashed JS/CSS filenames plus the manifest and install icons. It deletes only older caches with the app's `jnt2-app-` prefix. A downloaded update waits for user action, and the UI disables applying it during an active workout.

After one successful online production load, the tested desktop-Chromium flow can reopen offline, log a set into IndexedDB, refresh offline, and restore that draft. Installation requires HTTPS in deployment (localhost is also a secure context). External fonts are not required.

## Verification scope and limitations

The automated suite independently transcribes workbook expectations and checks all 48 week/day combinations for identity, tier, status, set type, counts, reps, percentages, load bases, transitions, exceptions, and real source ranges. It also covers numeric loads, missing TMs, invalid positions, RM overrides/corrections, MRS/AMRAP semantics, profile isolation, autosave/reload, units, backups, one-time advancement, partial/skipped records, completion messages, comparisons, PRs, and production offline operation.

The in-app Workbook Mapping screen contains isolated, non-destructive smoke checks only. It does not write to workout storage and does not claim to prove workbook fidelity.

Verified here:

- TypeScript check and automated Node test suite.
- Production Vite build.
- Desktop Chromium at a 390×844 viewport: setup → start → log → refresh/resume → complete → history.
- The same production build: service-worker cache, offline reopen, offline log, and offline refresh/restore.

Not performed:

- Installation or hands-on testing on a physical iPhone or Android phone.
- Cross-browser PWA testing outside desktop Chromium.
- Resolution of the two Week 12 source contradictions; those remain explicit manual decisions.

See [docs/SOURCE_MAPPING.md](docs/SOURCE_MAPPING.md) for the cell-level mapping and ambiguity record.
