# Jacked & Tan 2.0 Partner Training Engine

A local-first workout tracker for the original Jacked & Tan 2.0 template in `GZCL Free Compendium November 27th Update.xlsx`. The prescription dataset was reconstructed from the workbook's `J&T2.0` and `J&T2.0 KGS` sheets—not from the former app engine, its verification screen, or the General Gainz hybrid.

The app keeps the existing two-partner, mobile-first workflow while correcting prescriptions, load bases, session persistence, history, progress claims, and production offline behavior. It does not use AI APIs, cloud sync, example workbook weights, or automatically increased training maxes.

## Personal setup

New installations create two blank local profiles. Before starting a workout, enter the lifter's five Block 1 training maxes on the Program tab:

- Squat
- Bench Press
- Deadlift
- Military Press
- Front Squat

Before Week 7 work that references a Block 2 TM, enter and explicitly save the separate Block 2 values. The app never copies test 1RMs into these fields and never applies an automatic increase.

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

## Local state and backups

Each logged set is serialized through a write queue and saved immediately. Refreshing or reopening restores the profile's unfinished session. Profiles have independent positions, drafts, units, TMs, and history.

A session stores a snapshot of its prescription, source ranges, unit, equipment increment, TMs, and customizations. Later settings changes do not rewrite historical prescriptions. Completed-session edits upsert the same record and do not advance the program again. Week 12 Day 4 records the end state and does not silently restart.

Backup format version 2 validates profiles, sessions, exercises, sets, stable IDs, cell references, and nested values before writing. Duplicate profile/session IDs and duplicate active-profile records are rejected by default. The UI offers replace-all only after explicit confirmation; import is one IndexedDB transaction (or a rollback-protected localStorage fallback).

All records stay in the browser. Export backups regularly, especially before clearing browser storage.

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
