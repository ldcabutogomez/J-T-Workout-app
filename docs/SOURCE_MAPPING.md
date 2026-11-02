# Workbook source mapping and ambiguity log

Source file inspected directly: `GZCL Free Compendium November 27th Update.xlsx`.

Primary worksheets:

- `J&T2.0` (`xl/worksheets/sheet7.xml`, used range `A1:BQ246`)
- `J&T2.0 KGS` (`xl/worksheets/sheet8.xml`, used range `A1:BQ246`)

Both sheets use the same prescription layout. Every generated slot records both worksheet names and the relevant real cell ranges. There are no pseudo-addresses such as `T2a_Wk1`.

## Week columns and day ranges

| Week | Exercise–set columns | Day 1 | Day 2 | Day 3 | Day 4 |
|---:|---|---|---|---|---|
| 1 | `D:G` | `D55:G66` | `D67:G78` | `D79:G90` | `D91:G104` |
| 2 | `I:L` | `I55:L66` | `I67:L78` | `I79:L90` | `I91:L104` |
| 3 | `N:Q` | `N55:Q66` | `N67:Q78` | `N79:Q90` | `N91:Q104` |
| 4 | `S:V` | `S55:V66` | `S67:V78` | `S79:V90` | `S91:V104` |
| 5 | `X:AA` | `X55:AA66` | `X67:AA78` | `X79:AA90` | `X91:AA104` |
| 6 | `AC:AF` | `AC55:AF66` | `AC67:AF78` | `AC79:AF90` | `AC91:AF104` |
| 7 | `AH:AK` | `AH55:AK66` | `AH67:AK78` | `AH79:AK90` | `AH91:AK104` |
| 8 | `AM:AP` | `AM55:AP66` | `AM67:AP78` | `AM79:AP90` | `AM91:AP104` |
| 9 | `AR:AU` | `AR55:AU66` | `AR67:AU78` | `AR79:AU90` | `AR91:AU104` |
| 10 | `AW:AZ` | `AW55:AZ66` | `AW67:AZ78` | `AW79:AZ90` | `AW91:AZ104` |
| 11 | `BB:BE` | `BB55:BE66` | `BB67:BE78` | `BB79:BE90` | `BB91:BE104` |
| 12 | `BG:BJ` | `BG55:BJ66` | `BG67:BJ78` | `BG79:BJ90` | `BG91:BJ104` |

The matching progression columns are `D:E`, `I:J`, `N:O`, `S:T`, `X:Y`, `AC:AD`, `AH:AI`, `AM:AN`, `AR:AS`, `AW:AX`, `BB:BC`, and `BG:BH`.

## Training-max inputs and formula tracing

| Named load basis | Block 1 input | Block 2 input |
|---|---|---|
| Squat | `E4` | `AI4` |
| Bench Press | `E5` | `AI5` |
| Deadlift | `E6` | `AI6` |
| Military Press | `E7` | `AI7` |
| Front Squat | `O5` | `AS5` |

The app stores these as named keys separate from exercise display names. Block 1 and Block 2 values are separate profile fields.

Main T1 progression/source rows:

- Day 1 Back Squat: progression row 15; schedule rows 57–59.
- Day 2 Bench Press: progression row 18; schedule rows 69–71.
- Day 3 Front Squat in Weeks 1–6 and Deadlift in Weeks 7–12: progression row 21; schedule rows 81–83. Block 1 back-off formulas reference Front Squat input `O5`; Block 2 back-offs use that day's achieved target-RM load.
- Day 4 Military Press: progression row 24; schedule rows 93–95.
- Day 4 Sling Shot Bench: progression row 25; schedule rows 96–98.

For example, the Week 1 Day 1 back-off formula is in `J&T2.0!E58` and references `E4` plus the percentage in `E15`. Week 7–11 main T1 schedule cells store `.85` or `.90` and are applied to the load actually achieved for the target RM, not to a stored TM.

## T2a rows, mappings, and percentages

| Day | Progression row | Schedule row | Block 1 load basis | Block 2 load basis |
|---:|---:|---:|---|---|
| 1 | 37 | 60 | Deadlift `E6` | Deadlift `AI6` |
| 2 | 39 | 72 | Bench `E5` | Bench `AI5` |
| 3 | 41 | 84 | Squat `E4` | Front Squat `AS5` |
| 4 | 43 | 99 | Bench `E5` | Bench `AI5` |

Formula evidence:

- Week 1 Day 1 deficit deadlift: `J&T2.0!E60 = ROUND($E$6*E$37*0.2,0)*5`.
- Week 1 Day 4 legs-up bench: `J&T2.0!E99 = ROUND($E$5*E$43*0.2,0)*5`.
- Week 7 Day 3 front squat: `J&T2.0!AI84 = ROUND($AS$5*AI$41*0.2,0)*5`.

Percentages by day for Weeks 1–12 (`—` means rest or an explicit Week 12 conflict):

| Day | W1 | W2 | W3 | W4 | W5 | W6 | W7 | W8 | W9 | W10 | W11 | W12 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 50 | 60 | 70 | 75 | 80 | — | 70 | 75 | 80 | 82.5 | 85 | — |
| 2 | 50 | 55 | 60 | 62.5 | 65 | — | 70 | 75 | 80 | 82.5 | 85 | conflict |
| 3 | 50 | 60 | 70 | 75 | 80 | — | 70 | 75 | 80 | 82.5 | 85 | conflict |
| 4 | 45 | 50 | 55 | 57.5 | 60 | — | 65 | 70 | 75 | 77.5 | 80 | — |

The populated schemes are W1 `4×10`, W2 `4×8`, W3 `4×6`, W4 `5×4`, W5 `7×2`, W7 `5×6`, W8 `5×5`, W9 `5×4`, W10 `6×3`, and W11 `7×2`.

## Accessory coverage and block changes

Weeks 1–6 use populated rows 61–66, 73–78, 85–90, and 100–104. The source's `3MRS` entries are represented as one target-RM set plus three additional MRS.

In Block 2, Day 1–3 T2b/T2c move down one row because the broad rest/label row occupies the first accessory position:

- Day 1: T2b/T2c rows 62–63; T3 rows 64–66.
- Day 2: T2b/T2c rows 74–75; T3 rows 76–78.
- Day 3: T2b/T2c rows 86–87; T3 rows 88–90.
- Day 4: there is no populated Block 2 Push Press slot; T3 rows remain 101–104.

The dataset retains stable omitted-slot records where a Block 1 slot has no populated Block 2 exercise. Populated Block 2 changes include:

- Day 3 T2b: Back Step Lunge → Stiff Leg Deadlift.
- Day 3 T2c: V Grip Lat Pull Down → Lat Pull Down.
- Day 3 T3: Wide Grip Cable Row, Hammer Curl, and EZ Bar Curl.
- Day 2 swaps the Block 2 Pec Flye and Rear Delt Flye positions.
- Day 4 T3a/T3b become DB Bench Press and Cable OH Tricep Extension.

## Explicit ambiguity log

These contradictions occur in both source sheets and are not described as verified rules:

1. Week 12 Day 2:
   - `J&T2.0!BG72:BH72` and `J&T2.0 KGS!BG72:BH72` explicitly prescribe Close Grip Bench “Find 1RM”.
   - `J&T2.0!BG73` and `J&T2.0 KGS!BG73` say “T2 Rest”.
   - Decision: keep the explicit T2a test visible, flag the conflict, and leave performance to the lifter's manual decision.

2. Week 12 Day 3:
   - `J&T2.0!BG84:BH84` and `J&T2.0 KGS!BG84:BH84` explicitly prescribe Front Squat “Find 1RM”.
   - `J&T2.0!BG85` and `J&T2.0 KGS!BG85` say “T2 Rest”.
   - Decision: keep the explicit T2a test visible, flag the conflict, and leave performance to the lifter's manual decision.

No other source contradiction was silently resolved. Blank Block 2 cells are represented as omitted rather than replaced with the former app's accessory substitutions.

## App additions that are not in the workbook

These are product choices, not source cells, and none of them change a workbook-derived prescription, set count or source range:

- **Warm-up sets** (T1 main lifts only): kept outside `prescribedSets`, so workbook set counts and `setCount === prescribedSets.length` stay true.
- **Suggested loads** for cells the workbook leaves blank: the T1 `Find nRM` / test set (`J&T2.0` rows 57, 69, 81, 93 and the matching Block 2 cells) and the accessory `?` weights. The suggestion is a pre-filled editable value flagged `suggested`; `loadBasis` remains `user_selected`.
- **Block 2 TM default:** for a lift whose Block 2 input (`AI4:AI7`, `AS5`) has not been saved, formulas that reference it use the Block 1 input (`E4:E7`, `O5`) instead. The stored Block 2 value is never written automatically.
