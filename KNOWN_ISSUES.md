# Known issues

Accepted defects and deliberate trades that are not yet fixed. Ticket IDs come
from the Telegram bot; nothing here is renumbered or inferred. An entry with no
ID is one found while writing up another ticket, and says so.

---

## T-8 — `sessionValid` fails open when Apps Script will not answer

**Status** **Fixed** — `sessionValid` fails closed in both proxies. Kept for the
record because the trade it replaced was deliberate, and reversing a deliberate
trade should be legible.

**What changed.** A parsed body is authoritative in both directions:
`{ok:false}` refuses, a valid body allows. Anything unusable — consent page,
garbage, no answer — is retried once and then **refuses**. It refuses as
`SESSION_UNCONFIRMED` with a 200, not `FORBIDDEN` with a 403, because a student
whose session is fine must not be told to sign in over a backend fault; a 403
would make the client clear a perfectly good token.

**Why the original trade was reversed.** It was taken when the condition looked
occasional. Audit #2 showed it sustained — six consecutive probes on 2026-09-08
all returned the consent page — and an unauthenticated caller reaching a paid
model call is the worse end of that trade.

**The cost, stated plainly:** when Apps Script is unwell for more than one retry,
a student is now blocked instead of let through. That is the intended direction,
and it is why the refusal says the session is still valid.

Covered by `test/session-fail-closed.test.js`, which also compares the two
copies — see C3 below.

---

<details><summary>The original entry, for the record</summary>

**Status was** Open. Deliberate, now bounded in scope and documented.
</details>

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

**2026-09-08: it is sustained, not occasional.** Six consecutive POSTs to the
live deployment — two actions, three rounds — every one of them answered with
the consent page rather than JSON:

    apiIcaoGraderTranscripts  -> HTML consent page  x3
    apiGetIcaoAdminReport     -> HTML consent page  x3

Earlier the same day the first of those returned proper JSON
(`{"ok":false,"code":"FORBIDDEN","error":"Not authorised."}`), so the deployment
had not changed — its answer had.

Two consequences.

1. **Severity.** The fail-open window is not a spike measured in seconds. For
   the length of a run like that, every request carrying any non-empty string as
   a token is admitted with no role and no plan.

2. **Evidence.** A single probe against this deployment proves nothing. An HTML
   answer does not mean an action is missing, and a JSON answer on one attempt
   does not mean the next will parse. Anything that turns on "is this action
   live" needs repeated attempts and an explicit inconclusive result — not one
   curl.

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

## (no ID) — a green test asserting nothing: `test/grader.test.js`

**Status** Fixed, `7a6fc26`–`a1ff9a2`. Kept for the record; still worth an ID if
you want the history tracked.

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

**Scope** All seven suites in `tests/` copied rather than lifted, so all seven
had the same exposure. Converting them found that four were green about a
product that no longer exists, not one:

- `grader` — the missing digit-join, plus a `clientEvaluate` carrying only the
  fallback branch, so the curated-keywords rule that actually decides an attempt
  was never tested.
- `ttsDigits`, `telephonyDesignators`, `aircraftTypePrefix` — all asserted
  spaced numerals (`"230" → "2 3 0"`, `"Boeing 7 4 7"`). The product speaks ICAO
  words, and has for long enough that nobody can date the change.
- `audioQueue` — `_atcPlaybackRate` pasted in as `return 1.0`, the whole
  function gone.
- `feedbackCard` — asserted a "Show answer" button and a hidden element holding
  the expected read-back. Neither exists; `renderAttemptFeedback` withholds the
  answer deliberately. The suite asserted the opposite of a decision, and
  anyone who believed it would have put the answer back on screen.

**Fixed by** lifting every function out of its source file and running it, and
by merging the two directories so a second one cannot adopt a second method
again. `test/run-all.js` fails the run if a `tests/` directory reappears with
suites in it.

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

---

## (no ID) — a failed home refresh was invisible, and the cache was 30 days old

**Status** **Fixed** — reporting in `8ad89fb`, freshness and TTL in `79bcb51`,
`ok:false` routing in `7f6337d`. Kept for the record; still worth an ID.

**This entry was stale for four commits.** It said "Open. Read-only
investigation, nothing changed" while A1 had already set the TTL to seven days
and wired the reporting, and audit #2 caught it. That is the ledger carrying the
defect the ledger exists to record, which is why CLAUDE.md now requires closing
work to update its entry in the same commit.

Observed 2026-09-08 on a signed-in home screen: `getMyCompletedLevels` failed
twice and `apiGetAppBootstrap` once, all with *"The training server took too long
to answer"*, within a few seconds, followed by
`[home] background refresh failed, will retry later`.

### It is a different path from the HTML consent pages

Both are Apps Script failing to answer, but they are separate branches of
`api/gas.mjs` with separate outcomes:

| condition | what `api/gas.mjs` does | what the client sees |
|---|---|---|
| HTML consent page | detects it, waits 700 ms, **retries once**; if it persists, `JSON.parse` fails | *"Connection to the training server was lost. Close this tab…"*, `cause: GAS_DEPLOYMENT_NEEDS_REAUTH` |
| no answer in 45 s | `AbortController` fires, caught | *"The training server took too long to answer."* |

The observed message is the second. Apps Script accepted the request and never
answered — it did not hand back a consent page.

**A compound case exists and is worse than either.** The HTML retry is not
budgeted. A first call returning HTML at ~40 s, plus 700 ms, plus a retry that
itself runs to the 45 s abort, is ~86 s against `vercel.json`'s
`maxDuration: 60` for `api/gas.mjs`. The function is killed with no response, so
the browser gets a network error instead of any of the messages above. And the
retry's `callGas()` is not individually wrapped, so an `AbortError` there escapes
to the outer handler and returns **HTTP 500** `{ok:false, error:'This operation
was aborted'}` — not the friendly text. One condition, three different outcomes.

### The home screen degrades silently, and this is the first screen a prospect sees

The proxy reports a timeout as **HTTP 200** carrying `ok:false`. `shim.js` parses
any JSON and calls `onSuccess`, so the failure never reaches a failure handler —
`Scripts.html:1855` documents exactly this trap for a different bug.

`renderHome` then does:

    var _hasData = AppState.home && (…metrics || …modules || …dc);
    if (_freshData || _hasData) {
      _doRenderHome();                       // "fresh or stale", per its own comment
      refreshMeAndHome(…, true);             // silent: true
    } else {
      showGasLoadingSkeleton(…);
      refreshMeAndHome(…);                   // silent falsy -> showContentError
    }

With `silent: true` the failure is a `console.warn` and nothing else. So:

- a student or prospect with **any** cached data sees a normally-rendered home
  screen with no indication anything failed;
- only someone with **no data at all** gets a visible error.

Worse, the cache is *labelled* fresh. `Scripts.html:715` sets
`_homeDataFreshAt = Date.now()` on restore, commented *"treat as fresh so
renderHome skips skeleton"* — but the data came from `localStorage`, not the
server. `_HOME_CACHE_TTL` is **30 days**. XP, streak, plan status and dashboard
metrics can therefore be up to a month stale, presented as current, while every
refresh silently fails.

### There is no retry on any of the three calls

"will retry later" describes the next navigation back to Home. There is no timer
for it — the only intervals in the file are the gamification poll, the exam poll
and the plan poll.

- `apiGetAppBootstrap` (cache branch, `Scripts.html:743`) — failure handler is
  `console.warn` only; the success handler's `if (!res || !res.ok) return;`
  silently discards the timeout.
- `apiGetAppBootstrap` via `refreshMeAndHome` — as above, silent when
  `silent: true`.
- `getMyCompletedLevels` — `console.error` at `Scripts.html:1716`, and an
  **empty** failure handler at `Scripts.html:23877`.

The four-attempt retry with 20 s and 30 s budgets exists only on the boot path
that has **no** cache (`_bootAttempt < 4`). It does not cover any of these.

**The 45 s does apply**, but it is not a client timer: it is the
`AbortController` inside `api/gas.mjs`, server-side, on every call routed through
`/api/gas`. `shim.js` has no timeout and no retry of its own, so before those
45 s elapse the browser waits indefinitely.

### One thing this rules out

`_aeroStartKeepWarm` pings every 120 s while the tab is visible, so on a screen
that was already open the runtime should not have been cold. Three timeouts
within seconds of each other on a warm runtime points at Apps Script itself, not
at a cold start.

### Not verifiable from here

Whether Apps Script was rate-limiting, out of quota, or simply slow. That needs
the Cloud Logging for the deployment — `[GAS PROXY] <action> <ms>ms status=…` is
logged for every call that returns, and the timeouts log
`[GAS PROXY] <action> timed out after 45s`. Both are in Vercel's function logs.

### What was actually done

- `_aeroRestoreFromCache` carries `cachedAt` into `_homeDataFreshAt` instead of
  stamping `Date.now()`, so cached data is honestly old.
- `_HOME_CACHE_TTL` is `7 * 24 * 60 * 60 * 1000`. The session stays thirty days —
  staying signed in is a different question from how long stale numbers may be
  shown as live.
- A muted notice under the home header, only when the data is old **and** a
  refresh has failed, with a manual Retry. Verified by execution in all three
  states.
- Both refresh paths report to ClientEvents through `_reportClientError`,
  throttled to one row per ten minutes.

**The endpoint that caused it is now addressed too** (A3): the answer is cached
per user and invalidated in `ProgressService.updateUserProgress`, the
Scenarios→country map is hoisted into a script-wide cache, Progress rows are
filtered by `userId` before an object is built, the rank moved off the badge
timer to five minutes, and the background refresh retries at 30s / 2min / 8min
and then stops.

**Not verifiable from here** (rule 6): whether that brings the call under the
proxy's 45-second abort. The remaining cost is a full read of Progress on a cache
miss, and the size of that sheet cannot be seen from the repo.

---

## (no ID) — one project-wide lock is the write model of the whole product

**Status** Open by decision. Filed, not acted on. Design change, not a task.

`dbWithScriptLock_` takes `LockService.getScriptLock()` — **project-wide, not
per-user** — and **40 call sites** still use it after `apiTrackActiveTime` was
taken off it: every LMS write, attempt saves, OTP and login, scenario writes,
user creation.

**Per-user locking is not available.** `appsscript.json` sets
`"executeAs": "USER_DEPLOYING"`, so every request runs as the owner and
`LockService.getUserLock()` resolves to that same single identity. There is no
narrower lock to switch to without changing how the web app is deployed.

**Why it matters at thirty students.** The lock is held across I/O, not
arithmetic — a typical site does `dbFindOne_` (a full sheet read) then
`dbUpdateByRow_` (a row read plus a row write) inside the critical section. As
arithmetic, not measurement: *N* concurrent writers × hold seconds approaching
1 second of wall clock per second is saturation. Login and attempt-save are the
two that will contend first, and an attempt save happens in the middle of an
exercise.

`waitLock(20000)` throws after twenty seconds, and that throw becomes
`apiError_` → `{ok:false}` → HTTP 200 → the client's success handler. So the
failure mode under contention is silence, everywhere it is used.

**Not verifiable from here** (rule 6): the actual hold duration. The observed
logs cannot separate it from the platform floor — `apiPing` does no I/O at all
and still took 1686–5906 ms.

**Shape of a fix, for whoever picks this up:** the read-modify-write pattern is
what forces the lock. Writes that are appends, or that target a row by key
without reading the whole sheet first, do not need one. That is a data-access
change across 40 sites, not a patch.

---

## (no ID) — three stale Apps Script deployments are live and callable

**Status** Open. Housekeeping, but the kind that has bitten this project four
times.

`clasp deployments` lists four. Production calls `@667`. The other three —
**`@HEAD`, `@309`, `@311`** — are still deployed and still answer requests.

`@HEAD` is the dangerous one: it serves whatever is currently pushed, so any
`clasp push` changes its behaviour immediately, without a `clasp deploy`. Anyone
holding that URL is running unreviewed code.

Nothing in the repo points at them — all four `api/*.mjs` files carry the same
`AKfycbx4…` production ID and `GAS_WEBHOOK_URL` is unset, both confirmed
2026-09-08 — so this is not currently a split-deployment fault. It is an open
door.

**Fix** `clasp undeploy <deploymentId>` for the three, once it is confirmed
nothing external (a bookmark, an old PWA install, a webhook) still calls them.
That confirmation cannot be made from the repo.

---

## (not a defect) — PIPELINE_SECRET and APP_ORIGIN are Production-only

**Status** Recorded so nobody chases it.

Vercel holds nine environment variables. Seven are set for Production **and**
Preview; `PIPELINE_SECRET` and `APP_ORIGIN` are Production-only.

The consequence is expected and correct: **a preview deployment cannot reach the
grader.** `transcriptsFor` sends `PIPELINE_SECRET` to `apiIcaoGraderTranscripts`,
which refuses an empty one, so a preview build fails every Part 2 audio item with
*"The examiner could not be given the recording to mark against."* And
`APP_ORIGIN` being unset on preview means the origin check falls back to
comparing `Origin` against `Host`, which is the designed default and still works.

So: previews can run the app, sign in, and take the simulator, but cannot grade a
scripted exam. If that is ever wanted, both variables need Preview values — and
`PIPELINE_SECRET` would then have to match Script Properties, which means preview
and production would share a credential. Not recommended.

---

## (no ID) — sendBeacon has never worked: every tab close lost the final seconds

**Status** Fixed forward in `474db5e`. Filed because the historical loss is not
recoverable and explains gaps in data already collected.

`_startActiveTimeTracker` flushed its accumulated seconds on `beforeunload` with:

    navigator.sendBeacon('/api/gas', JSON.stringify({ action: 'apiTrackActiveTime', ... }))

`sendBeacon(url, string)` sends `Content-Type: text/plain`. Vercel parses
`text/plain` into a **string**, not an object. `api/gas.mjs` then reads
`req.body.action` off that string, which is `undefined`, so the action resolved
to `'unknown'`, failed the `/^api[A-Z]/` allowlist, and was refused before it
ever reached Apps Script. Executed rather than reasoned about:

    action resolved to : "unknown"
    allowlist passes   : false
    forwarded to GAS   : {"0":"{","1":"\"","2":"a","3":"c","4":"t"...

**The historical consequence.** Since this shipped, **every tab close has
silently dropped whatever seconds had accumulated since the last successful
sync**, for every student. At the old 30-second interval that is up to 30 seconds
per session; a student who works in short bursts and closes the tab loses a
slice each time. Campus-time totals in `UserActivity.totalActiveSeconds` are
therefore **under-reported by an unknown amount for the whole history of the
feature**, and the shortfall is largest for the students with the most
fragmented sessions.

It also means `beforeunload` was never the safety net that justified the
30-second interval — the interval was carrying the whole load on its own.

**Not recoverable.** The requests were refused at the proxy, so nothing was
written anywhere. There is no log to replay: `api/gas.mjs` would have recorded
these as `[GAS PROXY] unknown …`, and Vercel's retention is far shorter than the
feature's life.

**Fixed forward** by sending a `Blob` with `type: 'application/json'`, and by
binding `pagehide` and `visibilitychange` alongside `beforeunload` —
`beforeunload` is unreliable on mobile Safari, which is where a session most
often ends by being swiped away. Covered by `test/active-time.test.js`.

**If campus time is ever used for anything that matters** — a report to an
employer, a certificate, a billing input — the pre-`474db5e` totals should be
treated as a floor, not a measurement.

---

## (reference) — which call is the durable write, and which are reconciliation

**Status** Not a defect. Recorded because the names do not say it, and getting it
backwards produced two wrong pieces of student-facing copy in one sitting —
both approved before anyone checked.

**`apiSubmitAttempt` is the durable write.** It runs as each phase is answered:

    Attemptservice.js   dbAppend_('Attempts', attempt);
                        ProgressService.updateUserProgress(user, scenario);

By the time a route ends, every answer and every per-scenario progress row is
already on the sheet.

**`apiFinalizeRoute` and `apiCompleteRoute` are reconciliation calls.** Both
re-derive the roll-up from what is already stored and hand it back:

    apiFinalizeRoute   iterates the route's scenarioIds, updateUserProgress per scenario,
                       settles route XP
    apiCompleteRoute   updateUserProgress once, then returns ALL progress rows

Neither is what saves the student's work.

**Why this matters for copy.** A failure in either one must not tell a student
their progress was lost — it was not. The true statement is that the route could
not be confirmed or synced. Saying otherwise is the same class of untruth as the
home screen presenting stale data as current, pointing the other way: it makes a
student redo work that is already banked.

**Why it matters for retries.** Both are safe to re-run.
`ProgressService.updateUserProgress` computes
`completedScenarios = Object.keys(completedScenarioMap).length` from the Attempts
sheet rather than incrementing a counter, and writes with `dbUpdateByRow_` when
the row exists, appending only when it does not. Running either twice produces
the same row — so a Retry button is honest, and an automatic retry cannot
inflate a student's count.

**What is genuinely at risk when they fail:** the route-completion state, the
level-unlock roll-up, the debrief, and the certificate auto-save. Real, and worth
telling the student about. Just not their answers.

---

## T-5 / T-6 — the replay threshold: named on both sides, now compared

**Status** T-5 **closed**. T-6 **closed by parity test**, not by removing the
duplication — the duplication is structural and stays.

**T-5's commit subject overstated it.** `cbb378b`, "one named default per
runtime instead of seven loose literals", reads as closure. It replaced seven
`|| 2` literals with a named constant on each side, which was worth doing, and
it left **two independent values**:

    Scripts.html      var _DEFAULT_REPLAY_THRESHOLD = 2;
    ConfigService.js  var DEFAULT_REPLAY_THRESHOLD  = 2;

Nothing compared them. Either could have been edited alone, every suite would
have stayed green, and the simulator would have allowed a different number of
replays than the server graded against — a student penalised for using a control
the app offered them. Audit #2 found the gap; the subject line is why nobody
looked.

**Why the duplication stays.** The boundary is genuine. The client cannot import
from `ConfigService.js` and Apps Script cannot import from `Scripts.html`. There
is no shared module to put the number in, so CLAUDE.md's rule applies: where a
boundary forces two copies, compare them directly rather than leaving a comment
asking them to agree.

**What closes it.** `test/threshold-parity.test.js` reads both declarations and
asserts equality, checks no consumer has drifted back to a literal on either
side, and checks the client declaration still precedes its first use — a
declaration that moves below `AtcReplayGate` would make the gate read `undefined`
and every replay free. Proven able to fail, in both directions:

    # server changed to 3
    FAIL  client 2 === server 3 — client 2, server 3
    # a literal put back in Código.js
    FAIL  Código.js never does either — replayThreshold || 2

**If the number ever needs to change**, change it in both files in one commit.
The test is what makes forgetting loud instead of silent.

---

## (retracted) — the "74 call sites swallow failures" list is not a finding

**Status** **Retracted.** The list was produced by a pattern match, not by
reading the call sites, and where it was checked it was wrong half the time.

**What was claimed.** During A2 I reported 74 `google.script.run` call sites
across 52 distinct actions where "nothing reacts to a failure on either path",
and singled out eight submit actions as the dangerous ones.

**What the method actually was.** For each call site, look ahead about 900
characters from each handler and search for one of a fixed set of reaction
patterns — `showContentError`, a toast, a `console` call, an `else`. Anything
without a match was listed. I labelled it "candidates needing per-site
confirmation, not a verdict", which was correct, and then wrote a sentence that
was not.

**What confirmation found.** Of the eight submit actions, **four already handled
failure properly** and the matcher had simply missed how:

    apiSubmitExam          _examError('Could not record exam result.')
    apiSubmitPlacementTest _placementError(…)
    apiModuleSubmitQuiz    a red message, on both of its two sites
    apiSaveCertificate #2  "Could not save certificate — contact your instructor"

Four of eight is a 50% error rate on the only subset anyone checked.

**The specific false statement.** I wrote: *"A student submits an exam and a
failure says nothing."* That was **false for both exam submits** — the two
places where it would have mattered most. `apiSubmitExam` and
`apiSubmitPlacementTest` have shown a failure message the whole time.

**Status of the remaining 66 sites: unknown, and not to be treated as findings.**
They have never been read. Assume a similar error rate. Anyone working from that
list must confirm each site individually before changing it — which is what the
confirmation step is for, and it did its job.

**What is genuinely established** is only the eight actions on
`SERVER_ERROR_ACTIONS` in `shim.js`, each of which was read, migrated and
asserted individually in `test/shim-server-errors.test.js`.
