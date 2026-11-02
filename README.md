# Jacked & Tan 2.0 Partner Training Engine

A mobile-first workout tracking progressive web application built strictly around Cody LeFever's original **Jacked & Tan 2.0** program from the **GZCL Free Compendium (November 27th Update)** (`J&T2.0` and `J&T2.0 KGS` sheets).

Designed specifically for two training partners on mobile phones with zero external dependencies, no AI API calls, offline IndexedDB persistence, and an automated rule verification suite.

---

## 1. Program Source of Truth & Cell Traceability

> **Source Notice:** The canonical prescriptions are derived from the official `J&T2.0` and `J&T2.0 KGS` tabs of the GZCL Free Compendium. No hybrid or General Gainz modifications were introduced.

### Prescriptions & Cell Mappings

| Component | Source Cells | Canonical Rule Implemented |
| :--- | :--- | :--- |
| **T1 First Block Back-offs** | `J&T2.0!D14:I25` | Lift-specific percentages of starting TM (Squat 70-85%, Bench 65-80%, Deadlift 70-85%, OHP 60-80%). |
| **T1 Second Block Dynamic Back-offs** | `J&T2.0!Col_T1_Wk7:Wk11` | Computed as 85% (Weeks 7–9) and 90% (Weeks 10–11) of the **actual target-RM load achieved that day**. |
| **T2a Supplemental Work** | `J&T2.0!Row_T2a` | Fixed percentage work from reference TM (W1: 4×10 @ 50%, W2: 4×8 @ 60%, etc.). Does *not* use the T1 RM rule. |
| **"3MRS" Notation** | Compendium Guide | 1 initial target RM set followed by **3 additional Max Rep Sets** at the same load (yielding 4 logged sets total). |
| **"3+" Notation** | Compendium Guide | 3 total work sets with an optional rep-out on set 3 (not 4 sets). |
| **Test & Deload Weeks** | `J&T2.0!Wk6, Wk7, Wk12` | Week 6: T2 Rest; Week 7: T3 Rest; Week 11: T2 Rest; Week 12: T2 & T3 Rest. |

### Workbook Quirks & Discrepancies Surfaced
1. **Rest Recommendation Typo:** The compendium table lists `T1: 3-5 Minutes`, `T2: 2-3 Minutes`, and then repeats `T1: 60-90 Seconds`. In standard GZCL methodology, 60–90 seconds is the T3 rest recommendation. The app displays this quirk transparently and provisions rest timer presets for 4:00 (T1), 2:30 (T2), and 1:30 (T3).
2. **T2a Training Max Reference:** While standard templates link T2a to the parent competition lift TM, lifters whose variation strength deviates significantly (e.g. Front Squat vs. Back Squat) can customize exercise names and TMs independently.

---

## 2. Key Features

- **Mobile-First & One-Handed Ergonomics:**
  - Big touch buttons with instant `+` / `-` increment steppers and quick RIR selectors (0 to 3+).
  - Floating background-resilient rest timer that calculates elapsed time from wall-clock timestamps so backgrounding the phone preserves the countdown.
  - Interactive Barbell Plate Calculator modal displaying visual plate stacks for any Olympic bar (45 lb or 20 kg).
- **Dual Partner Isolation:**
  - Independent profiles for Partner 1 and Partner 2.
  - Advancing one person's calendar never skips or advances the partner's training day.
  - Separate units (`lb` or `kg`), equipment increments (e.g. 5 lb or 2.5 kg), and tone preferences.
- **Local-First IndexedDB Persistence:**
  - Autosaves after **every single logged set**.
  - Unfinished workouts are automatically restored upon page refresh or browser restart.
  - Separate storage partitions for real workout history vs. demo workouts.
  - Versioned JSON export/import backup engine with schema validation.
- **Deterministic Positive Reinforcement (NO AI API):**
  - Offline rules engine with 4 selectable tones (`minimal`, `warm`, `playful`, `off`).
  - Triggers based on objective logged events: returning after a 5+ day gap, reaching Week 6/12 test milestones, respecting programmed deload weeks, comparable PR improvements, and rolling weekly session consistency.
- **Progress & Rep-Max Integrity:**
  - Tracks true comparable rep-max performance (10RM, 8RM, 6RM, 5RM, 4RM, 3RM, 2RM, 1RM). A heavier 2RM is never falsely labeled a PR over a 10RM.

---

## 3. Verification Suite Checks

The application includes an in-app verification suite (`Engine Checks` button in header) that runs automated unit tests:

1. **Squat Week 1:** 200 lb TM @ 70% back-off = 140 lb.
2. **Bench Press Week 1:** 200 lb TM @ 65% back-off = 130 lb.
3. **Overhead Press Week 1:** 200 lb TM @ 60% back-off = 120 lb.
4. **Metric Unit Rounding:** 100 kg TM @ 82.5% rounded to nearest 2.5 kg = 82.5 kg.
5. **Block 2 Dynamic Autoregulation:** Week 7 achieved 6RM of 200 lb automatically sets 85% back-offs to 170 lb regardless of the lifter's old TM.
6. **Week 10 Dynamic Autoregulation:** Week 10 achieved 5RM of 200 lb sets 90% back-offs to 180 lb.
7. **Notation Accuracy:** "3MRS" generates exactly 4 logged sets (1 RM + 3 MRS).
8. **Notation Accuracy:** "3+" generates exactly 3 work sets with the last set marked as AMRAP.
9. **Deload / Peaking Rules:** Week 6 T2 Rest, Week 7 T3 Rest, and Week 12 full accessory deload verified.
10. **Storage Roundtrip:** Verifies full JSON backup export and import validation cycle.

---

## 4. Setup & Local Development

```bash
# 1. Install dependencies
npm install

# 2. Run local development server
npm run dev

# 3. Build production bundle
npm run build

# 4. Run TypeScript checks
npm run lint
```

---

## 5. Next 3 Immediate Improvements

1. **Custom Barbell Plate Visualizer Settings:** Allow gym lifters to specify the exact count and weights of plates they own in their home gym (e.g., bumper plates vs. iron plates).
2. **Warm-Up Ladder Generator:** An optional 3-to-4 set ramp-up ladder (e.g. Bar × 10, 40% × 5, 60% × 3, 80% × 1) before the top RM attempt.
3. **Web Bluetooth Heart Rate Monitor / Audio Cues:** Optional audio cues and web vibration patterns tailored for lifters training with headphones or phones in pockets.
