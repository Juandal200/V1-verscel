# Known issues

Accepted defects and deliberate trades that are not yet fixed. Ticket IDs come
from the Telegram bot; nothing here is renumbered or inferred. An entry with no
ID is one found while writing up another ticket, and says so.

---

## T-8 — `sessionValid` fails open when Apps Script will not answer

**Status** Open. Deliberate, now bounded in scope and documented.

**Where** `api/tea.mjs:380-426`, and the separate copy at `api/tea-pipeline.mjs:655-689`.

**What happens** When Apps Script answers an HTML consent page, answers something
unparseable, or does not answer at all, `sessionValid` returns a caller object
instead of `null`. The request proceeds on the strength of the token being a
non-empty string — nothing has checked that the token is real.

    api/tea.mjs   HTML answer        -> { role: '', status: '' }
    api/tea.mjs   unparseable answer -> { role: '', status: '' }
    api/tea.mjs   threw / timed out  -> { role: '', status: '' }

Apps Script answering HTML is not hypothetical. It is documented in `api/gas.mjs`
and has been observed on this deployment on more than one day, in both directions
on different days.

**Consequence** Any caller who invents a token string can reach Gemini through
`/api/tea` for as long as Apps Script is misbehaving. There is no rate limit on
that path and each call is a paid generation.

**Why it is open** Failing closed would end live sittings mid-exam whenever
Apps Script hiccups — a candidate forty minutes into a paper would be signed out
of their own examination. That trade is deliberate and was taken knowingly. What
is not deliberate is that it is unbounded and unlogged beyond a `console.warn`.

**What would close it** Bound the open state rather than remove it: a counter, a
short cache of recently-validated tokens, or a cheap signature the browser cannot
forge. All three keep a mid-exam candidate on their paper.

**Not the same thing as** the descriptor leak below, which shared this function
and was a bug rather than a trade.

---

## (no ID) — the throw branch shipped all six descriptors

**Status** Fixed. The commit that added this section carries the change.

Found while writing up T-8, in the same function, and not a trade.

The handler computes:

    const paidPlan = caller.status !== 'free' && caller.status !== '';

and its own comment states the intent: `''` means the plan could not be
established, and is treated as free. The HTML and unparseable branches honoured
that. The `catch` branch returned `{ role: '' }` with **no `status` key**, so
`caller.status` was `undefined`, which is neither `'free'` nor `''`, so
`paidPlan` was `true` and `withholdInMessage` was never reached. The six ICAO
descriptors went out in full — on the one branch where the plan is least
knowable, and on the live conversational report path D-1 exists to close.

`api/tea-pipeline.mjs` never had this: all four of its returns carry `status`.

**Fix** One key, so the three fail-open branches agree.

Verified by execution, not by regex: a harness drives the real `sessionValid`
down each failure mode and computes the real `paidPlan` expression from whatever
it returns. It reports two failures against the code before the fix and none
after. A regex over source could not have caught this at all — every line it
would have matched was already correct; the defect was in a key that was absent.

**No ID** because it was found inside T-8's write-up rather than reported. If it
needs tracking beyond this entry, the ID has to come from the bot.

---

## (no ID) — a green test asserting nothing: `tests/grader.test.js`

**Status** Open. Needs an ID from the bot.

`tests/` does not import the product. Each suite pastes a copy of the function
under test into the test file, renamed to drop the underscore the original
carries — `normalizeForGrading_` in `Attemptservice.js` becomes
`normalizeForGrading` in `tests/grader.test.js`. Nothing checks that the copy
still matches, so the copy is free to fall behind and the suite stays green.

One already has:

    product (Attemptservice.js:135)
      .replace(/[^A-Z0-9\s]/g,' ').replace(/\s+/g,' ')
      .replace(/\b(\d{1,2}) (\d{3})\b/g,'$1$2')      <-- joins split digits
      .trim()

    test copy (tests/grader.test.js)
      .replace(/[^A-Z0-9\s]/g,' ').replace(/\s+/g,' ')
      .trim()

The digit-joining step is what makes "ONE TWO FIVE ZERO ZERO" and "12 500"
normalise alike, which is most of what read-back grading turns on. The test
grades against a normaliser the product stopped using, passes, and reports
that grading works.

**Why it is worse than no test** `extractSemanticTokens` in the same file is
byte-identical to its original. So the file looks maintained — one function
current, one stale, no way to tell which from the outside, and a green tick
over both.

**This is the F-0017a pattern, in the test suite.** F-0017a was a transcript
kept in a second place that drifted from the first; the fix was to stop having
a second copy. Same shape here: the fix is not to re-sync the copy, it is to
stop copying. `test/report-access.test.js` and
`test/admin-report-endpoint.test.js` now lift the real function out of the
source file and run it, and cannot drift by construction.

**Scope** All seven suites in `tests/` copy rather than lift, so all seven have
the same exposure; `grader.test.js` is the one where the drift is confirmed.
`telephonyDesignators.test.js` says so in its own header — "stubs (mirrors
TTSService.js logic)".

---

## (no ID) — the level icons are sheet data, and the renderer prints them raw

**Status** Open by decision. Recorded so a future sweep does not start it
halfway.

`LevelService.js` holds eleven emoji — nine in `_LEVEL_SEED_` and two in the
Operational/Test rows — and they are written into the **Levels sheet** through
`dbAppend_`. They are data, not markup. F-0010 left them alone for that reason.

**What makes a half-migration break the level map.** The client renders the
value raw:

    Scripts.html:5481   '<div class="lms-module-icon">' + (locked ? … : (m.icon || …)) + '</div>'
    Scripts.html:5418   icon: m.icon || base.icon || uiIcon('plane', 26)

So a seed that emits `'plane'` instead of `'🛫'` prints the word **plane** on
the level map for every row written after the change, while rows already in the
sheet keep their emoji. Both halves have to land together:

1. a renderer that maps a name to `uiIcon(name)` and still tolerates an emoji,
   shipped **first**, so old rows keep working;
2. the seed changed to names;
3. a migration over the existing Levels rows.

Per rule 6 the sheet cannot be read from the repo, so step 3 cannot be planned
or verified from here.
