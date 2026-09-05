# Data dictionary

Every number in this product had a name and no stated scale. `score` meant one thing in
`Attempts` and another in `Progress`; `Progress` alone carried five different
score-shaped columns. Averaging or charting them would have produced figures that look
meaningful and are not, and nobody would have caught it six months later.

This file says what each measure is, what range it takes, and what it does **not** mean.
If you add a measure, add it here in the same pass.

---

## Identity

**`userId`** — the only join key. Shape `USR_<uuid>`. Present in 21 sheets.

**`email`** — an attribute, not a key. A person can change it. Present on `Users` and
carried on some rows for readability.

**`candidateId`** — the exam results' original key, an email address. Kept for reports
written before `UserId` was added to that sheet. **Join on `userId`, never on this.**

A row whose `userId` is not in `Users` belongs to a deleted account. `checkEverything`
in *HealthCheckService.gs* counts them. They are not dropped from exports — a report
that silently loses people is worse than one that says it did.

---

## Time

**Every timestamp written from now on is UTC, ISO 8601, ending in `Z`.** One helper,
`tsNow_()` in *TimeService.gs*, produces it.

Older rows are in three other shapes — ISO with a timezone offset, ISO without a zone,
and epoch milliseconds — because four different calls were used to write them. Nothing
needs migrating: read through **`tsMs_()`**, which understands all four, and compare
with **`tsBefore_()`** rather than `<`.

> Comparing timestamps as strings is the trap. `2026-09-04T12:00:00-05:00` and
> `2026-09-04T17:00:00Z` are the same instant and sort the wrong way round as text —
> silently, with no error.

**`tsDay_()`** gives the UTC date for grouping. A "day" in any report is a UTC day, not
a local one, so a chart does not gain or lose an hour twice a year.

---

## Scales

### Attempts — one row per answer

| Column | Range | Means |
|---|---|---|
| `score` | 0–100 | How closely the read-back matched. **Not** a percentage of the exercise. |
| `correct` | TRUE / FALSE | Whether it passed. The authority for progress; `score` is descriptive. |
| `responseTimeSec` | seconds | From the clearance finishing to the answer being sent. Includes thinking and typing. |
| `replayCount` | count | Times the clearance was replayed. 0 means heard once. |
| `altDeviationFt` | feet | **Worst** deviation from the cleared altitude during that exercise. 0 means never left tolerance. |
| `altSecondsOff` | seconds | Total time outside the ±200 ft tolerance. 0 is a real value, not missing. |
| `radioDifficulty` | 0–1 | How obstructed the radio was, derived from the level: 0 at level 1, 1 at level 9. Read `replayCount` against this — a rising replay count at a rising difficulty is the radio working, not the student struggling. |

Tolerance is ±200 ft. The aircraft starts **on** target and drifts; the student corrects.
So these two measure attention while speaking, not the ability to reach an altitude.

### Progress — one row per person per level and country

| Column | Range | Means |
|---|---|---|
| `progressPct` | 0–100 | Share of that route's phases completed. |
| `scoreAvg` | 0–100 | Mean `Attempts.score` for that route. |
| `consistencyScore` | 0–100 | Derived. Not comparable to `scoreAvg`. |
| `performanceScore` | 0–100 | Derived. Not comparable to `scoreAvg`. |
| `trendScore` | 0–100 | Derived, direction of travel. Not a percentage of anything. |

The last three are **composites**. Do not average them with each other or with
`scoreAvg` — they are different constructions on the same 0–100 axis, which is exactly
the kind of number that looks safe to combine and is not.

### ICAO test results — one row per sitting

| Column | Range | Means |
|---|---|---|
| `Overall Band` | 1–6 | ICAO band. **6 is best.** Not a percentage; not linear. |
| Six descriptors | 1–6 | Pronunciation, Structure, Vocabulary, Fluency, Comprehension, Interactions. |
| `Version` | VERSION_A/B/C | Which paper. Papers differ in accent and content, so bands across versions are not strictly comparable. |
| `Scope` | FULL / 1 / 2A / 2B / 2C / 3 | **Only `FULL` is an exam result.** The rest are section practice and must never be reported as bands. |
| `Source` | pipeline / conversation | `pipeline` scored transcribed speech with pace and hesitation data; `conversation` scored text because no audio was recorded. **Not equivalent evidence.** |

A sitting that captured no audible answer is refused and never written, so a band of 1
in this sheet is a judgement about English, not a microphone failure.

### XP and streaks

| Column | Range | Means |
|---|---|---|
| `lmsXp` | count | Lifetime XP. 25 per correct answer. A currency, not a measure of ability. |
| `weeklyXp` | count | Resets Monday. |
| `streakDays` | count | Consecutive active days; lapses after 48 hours. |

XP rewards activity. It is **not** a proficiency signal and should never be charted
against band.

---

## Plans

`maxLevel` in `ACCESS_PLANS_` is a **ceiling**, deliberately generous. What a tier
actually opens is computed from published content by `levelCapsFromContent_` in
*LevelService.gs* — Basic to the end of the foundation group, Full to whatever exists.
Read the computed value, never the constant. The constant said 20 while ten levels
existed.

---

## Getting the data out

**`exportAttemptsCsv()`** in *ReportService.gs* — one flat row per attempt, joined to
the person and their most recent band, into an *AEROCOMMS Reports* folder in Drive.
Every timestamp UTC, every identity `userId`.

**`reportSummary()`** in *ReportService.gs* — active people, first-time-correct rate,
and per-level attempts and replays, printed for a quick look.

**`checkEverything()`** in *HealthCheckService.gs* — content integrity across every
level, paper and module before you trust any of the above.
