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

**Fix** One key, so the three fail-open branches agreed.

**Superseded by T-8.** Those three branches no longer exist. T-8 replaced all of
them with a single `return SESSION_UNAVAILABLE;` that refuses, so there is no
longer a caller object with an empty status for `paidPlan` to misread — the
request does not reach that line at all. This entry is kept because the defect
was real and the way it was found matters, but anyone reading it against HEAD
will not find the code it describes. Caught by the final-pass sweep, which is
what that sweep is for.

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

---

## T-7 — three replay counters, now named and deliberately unequal

**Status** **Closed.** Not by unification — by naming, documenting and testing
that they differ on purpose.

Three counters, three surfaces, all measuring "times a recording was played",
all feeding something a student is judged on, each written as if it were the
only one:

| surface | constant | value | what it does |
|---|---|---|---|
| simulator | `_DEFAULT_REPLAY_THRESHOLD` | 2 | unlocks the transmission text |
| practice test | `TEA_MAX_LISTENS` | 2 | caps the comprehension band |
| scripted exam | `SC_REC_REPLAYS` | 1 | replays allowed on a Part 2 recording |

**Merging them would have been the wrong fix wearing the right rule's clothes.**
They have different consequences, and the scripted exam is deliberately stricter
— needing the repeat *is* the comprehension evidence, and an examination grades
it. The test asserts each is named and none is a literal; it explicitly does
**not** assert they are equal, and says so, so nobody "fixes" that later.

**The real find was the coupling, not the literal.** Setting a Part 2 recording
did two things on adjacent lines:

    _sc.recReplaysLeft  = SC_REC_REPLAYS;   // what the Replay button spends
    _t.listens[step.id] = 1;                // what the examiner is told

Two counters that both feed grading, seeded together, spent separately, with
nothing recording that this was intentional. The count starts at one rather than
zero because the first play has already happened — otherwise the examiner is
told the candidate never heard the recording it is about to question them on.
Both sites now carry the reasoning, and each points at the other.

Covered by `test/replay-counters.test.js`, red in both directions: restoring the
literal fails 7 assertions, removing the coupling comment fails 4.

---

## (no ID) — three things that looked correct and did nothing

**Status** Pattern, recorded. Two fixed, one fixed; the lesson is the entry.

Within one week, three separate pieces of this codebase were doing nothing while
appearing to work:

1. **`feedbackCard.test.js`** asserted a "Show answer" button that
   `renderAttemptFeedback` deliberately does not build. Green, and describing a
   screen that does not exist — worse, describing the opposite of a decision.
2. **`sendBeacon`** sent a bare string, so Vercel parsed it as `text/plain`, the
   action resolved to `'unknown'`, and the proxy refused it before Apps Script
   ever saw it. Every tab close since the feature shipped lost its final seconds.
3. **`.githooks/commit-msg`** required output indented deeper than the `$`,
   parsed nothing, compared nothing, and approved every message — including the
   two written to be rejected.

**The shape is identical in all three: success is the silent path.** A test that
finds nothing to assert passes. A beacon that is refused returns no error to the
page. A checker that parses no claims reports no mismatches. In each case the
absence of work was indistinguishable from work that succeeded, so nothing ever
said otherwise.

**What caught each one** was not review. It was running the thing against a case
that must fail: a deliberately wrong commit message, a replay of the proxy's own
parsing, and a per-site confirmation of what the test claimed. See CLAUDE.md,
"A silent success must be made to fail before it is trusted".

---

## (no ID) — the Apps Script URL is a fallback in all four proxies, by decision

**Status** **Accepted, with a precondition.** One live defect fixed; the
remaining literal stays until a dashboard change makes removing it safe.

`test/one-database-source.test.js` asserted zero hardcoded Apps Script URLs in
`api/`, on the reasoning that the URL should come from the environment and throw
when absent. That is the right end state. It is not reachable today.

**Why not.** `GAS_WEBHOOK_URL` is **unset** in Vercel — nine variables are set,
that one is not (confirmed 2026-09-08). Throwing on absence takes the entire app
down: every `google.script.run` call in the client routes through `/api/gas`. The
change has to start in the dashboard, not the repo:

1. set `GAS_WEBHOOK_URL` for Production **and** Preview to the `@667` deployment;
2. deploy, and confirm all four proxies still answer;
3. then delete the literals and restore the assertion to max 0.

**What WAS a live defect, and is fixed.** Two of the four — `api/gas.mjs` and
`api/cron-streak-push.mjs` — had **no override at all**. Setting the variable
would have pointed grading at one deployment and login, home and levels at
another, silently, with both halves apparently working. That is the
split-deployment failure this project has hit four times, armed and waiting for
whoever set the variable first. All four now read the same variable and fall back
to the same literal.

**What the test asserts instead**, because it is true and worth keeping: all four
read `GAS_WEBHOOK_URL`, exactly one distinct deployment id appears across the
four fallbacks, and none of them uses the literal as its only source. Red if any
proxy loses its override, and red if one is pointed somewhere else.

---

## (no ID) — a fourth transition speed, accepted because it is a clock

**Status** **Accepted.** `test/form-system.test.js` ceiling raised from three
sub-second speeds to four, with the fourth named.

The design system allows three durations under a second — 0.15s, 0.25s, 0.4s —
on the reasoning that anything longer is carrying information rather than
decorating. `.sc-clock-ring` added a fourth: `transition: background 0.5s linear`.

**It is the same argument, below a second.** The ring animates a conic-gradient
between ticks of a countdown running on `setInterval(tick, 500)`. At 0.4s it
finishes early and sits still for 100ms out of every 500 — a visible stutter once
a second. And it is `linear` rather than `var(--ease)` deliberately: a clock that
eases misreports the rate time passes.

So the duration is the tick, and the rule's own exemption applies; it simply had
a threshold at one second that this falls under. The test now allows four, names
which four, and additionally asserts that 0.5s is used **exactly once** and is
linear — so the exception cannot quietly become a fifth arbitrary speed. Red if
a new sub-second duration appears anywhere.

---

## F-0010 / D-8 — the emoji sweep is complete; 31 marks remain on purpose

**Status** **Closed by decision.** Not a partial sweep — a finished one with a
documented remainder. Anyone auditing this should read the remainder as the
answer, not as work left over.

53 emoji became drawn icons from the 47-name `uiIcon` catalogue. Thirty-one
remain, and every one of them falls into a category where replacing it would
make the product worse, not more consistent.

### Why an emoji was being replaced at all

Emoji render differently on every platform and are drawn by the operating
system, not by us — so they ignore the design tokens, change shape between a Mac
and a Windows laptop, and in some cases do not render at all. A regional-indicator
pair has no glyph on Windows and appears as two letters. That is why the sweep
happened. It is also why it stops where it does: in the places below, the same
property that makes an emoji inconsistent is the property that makes it work.

### The remainder, by reason

**11 — `LevelService.js`: they are sheet data, not markup.**
Written into the Levels sheet through `dbAppend_`. Changing the seed changes
nothing a student sees, because the rows are already written; and the client
renders `m.icon` raw, so a half-migration prints the word `plane` on the level
map. Closing this needs a renderer that tolerates both, shipped first, then the
seed, then a migration over existing rows — and per rule 6 the sheet cannot be
read from the repo. Tracked in its own entry above.

**9 — `TourService.js`: eight reach no screen, one is an email.**
The eight are `COMMENDATIONS` icons. The field is never written to the sheet and
`getMyCareerStats` returns `commendations[]`, which `Scripts.html` never reads —
its only consumer takes `res.medallions`, which carries no icon. Editing them
changes nothing. The ninth is inside `_buildWeeklyEmail_`.

**4 — emails (`TourService.js`, `Gamification.js`, `Userservice.js`).**
Inline SVG does not survive Outlook, and many clients strip or refuse it. An
emoji entity is the reliable choice in an HTML email; a drawn icon is the
unreliable one. This is the reverse of the argument that motivated the sweep.

**1 — `api/cron-streak-push.mjs`: a push-notification title.**
A notification tray renders text. There is nowhere to put an SVG.

**4 — `HumanFactorsModule.html`, `NonRoutineModule.html`: dead files.**
The modules are rendered by `renderHumanFactorsModule` and
`renderNonRoutineModule` in `Scripts.html`; these files ship nowhere.
`grep -c "zone-icon" dist/index.html` returns 0. Editing them is churn with no
effect.

**1 — `IcaoTestItemService.js`: a server-side data label** (`flag: '🌐'`), a
fallback string in a table, not markup.

**1 — 🥇🥈🥉 in the ranking** (counted as one site, `Scripts.html`).
Three medals distinguish first, second and third at a glance. The catalogue has
`trophy` and nothing that says *second*, so drawing them would make three
identical icons where the whole point is the difference. Left until the ranking
screen is designed properly; recorded as a deliberate hold, not an oversight.

**1 — 🧠 on the Human Factors card** — resolved. It is `uiIcon('shield', 28)`
now; the count above is the two remaining in the dead module files.

### What would reopen this

A new emoji appearing in a rendered client path. The categories above are stable:
data, email, notification, dead file, and one design decision.

---

## D-9 — replay and retry stay two controls, deliberately

**Status** **Closed by decision.** The ticket asked for one control; the answer
is two, and the reason is the student's, not the code's.

**What was reported.** In the simulator, Retry and Replay sat next to each other
and behaved incoherently — *"the text does not unlock because they are all retry
and not replay"*. D-9 proposed unifying them into a single control.

**What was actually wrong.** Retry rebuilt the stage, which ran `simMediaInit`,
which autoplayed the clearance — and autoplay is free by design, because hearing
the message arrive is the exercise starting rather than a replay the student
asked for. Replay, meanwhile, spent one of a limited number of listens. So Retry
was a way to hear the clearance again at no cost, sitting beside a button that
charged for it. A student who wanted to hear it again pressed the free one, the
unlock counted replays, and the text never unlocked. That is almost certainly
what the report describes.

**Why they were not merged.** The two controls do different things a student
needs separately:

- **Retry** gives back *the answer* — clear what you typed and try again.
- **Replay** gives back *the recording* — hear it once more, and it costs.

Merging them removes the ability to correct an answer without paying a listen.
On Level 1, that is a student who mistypes a read-back and is charged a listen to
fix a typo. The options that unified them were considered and declined for that
reason; the fix was to close the bypass instead — Retry no longer replays the
clearance, so Replay is the only way to hear it again and the only thing that
costs.

**And T-7 hardened the case.** The three replay counters measure different things
on different surfaces — unlocking text, capping a comprehension band, spending an
exam replay — and are deliberately unequal. A single unified control would have
to pick one meaning and would silently change what the other two record. Unifying
now costs more than it did when D-9 was written, and buys the same nothing.

**What would reopen it.** A student report that having two controls is itself
confusing, once the bypass is gone. That is a different complaint from the one
filed, and it would need its own observation rather than an inference from this
one.

---

## F-0025 — internationalisation: not needed

**Status** **Closed by decision** (product owner, 2026-09-09). Not deferred —
declined.

**What was reported.** A stray Spanish string in the interface, raised as
evidence that the product needed an internationalisation layer.

**The decision.** The product ships in English and is an *English* proficiency
trainer: the interface language is part of the exercise, and ICAO assessment is
conducted in English. One stray string is a typo, not a missing subsystem.

**Why this is worth writing down rather than leaving open.** An i18n layer is not
a small addition — it touches every rendered string in a 31,000-line file, every
email template, and every server-side message, and it creates a second copy of
all user-facing text that must be kept in step. This repository's dominant
defect for a week has been exactly that shape: two copies of one thing, drifting.
Adding a translation layer with no second language to serve would import that
failure mode deliberately, for no user.

**What would reopen it.** A decision to sell into a market that requires a
non-English interface — which is a commercial choice, not a code one. At that
point the cost above is worth paying, and the work starts with a string
catalogue, not with a framework.

---

## Saying nothing scored full marks

**Status** **Fixed** — silence is stopped in the browser, the answer no longer
travels to Whisper, and an echo is rejected if one ever gets back. Recorded
because it took three separate correct-looking decisions to produce, and each
one is still tempting on its own.

**No bot ID.** Reported directly with a screenshot on 2026-09-08, not through
the Telegram bot, so no ticket ID was issued and none is invented here.

**What was reported.** A student opened a level, tapped the microphone, said
nothing, tapped it again — and was marked correct.

**How it worked.** Three things, all of them individually defensible:

1. The recorder's only test on a take was `e.data.size > 0`. Silence has bytes.
2. The scenario's expected read-back was sent to Whisper as its bias prompt —
   the sharpest possible hint for a read-back is the clearance being read back,
   and the tail of a Whisper prompt carries the most weight, so it went last.
3. `temperature: 0`. Deterministic, so it does not invent when unsure.

Given no signal, a prompt and no temperature to wander with, Whisper returns the
prompt. So the answer left with the audio and came back as the transcript, was
written into the textarea, and was graded. The casing is what identified it:
`_spellDigits` writes lowercase digit words and the correction table maps
`niner → NINER`, so `09` came back as `zero NINER` — mixed case no other path in
the file produces.

**What it cost.** It defeated the replay gate — "ATC TEXT HIDDEN — UNLOCKS AFTER
4 REPLAYS" is worth nothing if the answer is one silent tap away — and it wrote
a false attempt row, so the Attempts sheet has scores in it that nobody earned.

**Why the prompt is not simply back with a shorter answer in it.** There is no
version of "some of the answer" that is safe. The general phraseology vocabulary
is what the prompt was actually for: it separates "turn right" from "tongue
right", and both headings are in the list. Nothing scenario-specific reaches
that call any more.

**The part that is unverifiable from the repo (rule 6).** How many false attempt
rows already exist. That is Sheets data. The thresholds are also reasoned rather
than measured against student recordings — 0.02 peak RMS as a silence floor,
0.10 as loud-on-its-own, 1.8 peak-over-median as the dynamics test. Both are set
to let a marginal take through rather than block it, because rejecting a real
answer is worse than an exploit that takes deliberate silence to trigger. Real
recordings would tighten them; nothing in this repository can.

**What would reopen it.** A student reporting "we didn't hear anything" on a take
they actually spoke. That is the failure direction that matters.

---

## "Evaluating…" for thirty seconds after the score was on screen

**Status** **Fixed** — the verdict branch resets the button, and both halves of
the button's state now look it up the same way. Recorded because the visible
symptom was one bug and there were three, and the other two were only findable
by reading what the reset actually did.

**No bot ID.** Found while fixing the microphone exploit above, reported directly
on 2026-09-08. No Telegram ticket was raised, so no ID is invented here.

**What was reported.** A student sent a read-back, the verdict rendered in about
two seconds, and the Send button stayed disabled and labelled "Evaluating…" for
the next twenty-eight.

**The three defects behind it.**

1. `_resetSendReadbackBtn` had exactly one caller: the thirty-second `setTimeout`
   armed in `immersiveSendReadback`. The branch that renders the verdict never
   called it. That is the reported symptom.
2. Both halves looked the button up as `.big-action` — the first element in the
   document with that class. The verdict renderer fills `#simActionRow` with more
   `.big-action` buttons a few lines *before* the reset would have run, so the
   two lookups could disagree about which element they meant. They now share one
   `_sendReadbackBtn()`.
3. The reset restored the label `'Send read-back'` onto a button whose markup has
   said `Send` since it was drawn. So on the one path that did fire, the safety
   net silently renamed the button. The label is now read off the button before
   it is overwritten and put back from there.

**Why this is worth an entry rather than a line in the log.** Nothing was broken.
The submission worked, the score was correct, the attempt was recorded. The
screen said otherwise for twenty-eight seconds, immediately after telling the
student they were right — and a product that lies about its own state teaches
students to distrust the parts that are telling the truth.

**What is not verifiable from the repo (rule 6).** How the restored button looks
on screen. That is rendered geometry.

---

## A backgrounded tab spent execution slots all day

**Status** **Fixed** — the two gamification polls check `visibilityState`, and the
keep-warm ping is deleted. Recorded because the keep-warm was added deliberately,
for a reason that was sound when the ceiling was not the constraint, and undoing
a deliberate trade should be legible.

**No bot ID.** This came out of the concurrency analysis on 2026-09-09, not from
a defect report.

**What was happening.** Three timers reached `doPost` on a fixed cadence,
regardless of what the student was doing or whether the page was on screen:

| call | cadence | calls/hr |
|---|---|---|
| `apiPing` (keep-warm) | 120s, visible only | 30 |
| `getNotificationCounts` | 60s, always | 60 |
| `getMyCompletedLevels` (rank) | 5 min, always | 12 |

`_gamStopPoll` is reached only by signing out, and neither gamification timer
checked visibility — so a student who opened the app in the morning and left it
in a background tab kept polling all day. `executeAs: USER_DEPLOYING` means those
requests spend slots from the same 30-execution budget as every other student.

**Why the keep-warm went rather than being guarded.** Its cost is measured and
its benefit is not. `apiPing`'s whole body was `return {ok:true}`, and `doPost`'s
floor is 1.7–5.9s regardless — so it held a slot for roughly the measured 3.5s
median every 120s per visible tab, about a quarter of what an idle student costs.
Against that, nobody has measured a cold-versus-warm difference on this path, and
the ping only ever fired while the student was idle, which is when a cold start
matters least. During a route the real calls keep the instance warm anyway.

**The part that is not a pure win.** Guarding a poll trades traffic for staleness.
Without a catch-up, a student returning to the tab would see a stale badge for up
to 60 seconds and a stale rank for up to five minutes. `_gamOnVisible` refreshes
the badges on every return and the rank only once its five minutes have actually
elapsed, so tab-flipping cannot turn the expensive poll into a poll-per-switch.
The guard is only correct because returning is treated as a reason to poll.

**What is left naming a deleted function.** Two comments still cite `apiPing` as
a past measurement — `Gamification.js` and `test/rank-cost.test.js`. Both are
historical records of why the rank cache exists, and both were left alone rather
than edited under rule 4. If either becomes confusing, that is a ticket.

**What would reopen it.** A measured cold-start penalty on the first action after
an idle gap. The answer then is a ping tied to intent — on the screen before an
action — not a timer.

---

## The first call of a cold session takes ~49s and the proxy gives up at 45s

**Status** **Open — measured, not explained.** Left open deliberately rather than
guessed at. It is not a blocker: it hits one call per cold session and the boot
retry recovers on the next attempt, which is warm.

**No bot ID.** Found in the Executions panel on 2026-09-08 while measuring the
Phase 1–3 backend work.

**What was observed.** A single `getMyCompletedLevels` execution of **49.157s** at
the start of a test session. Every one of the 15+ calls after it completed in
1.375–5.041s, median ~3.5s.

**Why it is a defect and not just slow.** `api/gas.mjs` aborts at 45,000ms. That
execution ran 4.157s past it, so Apps Script finished and wrote its cache while
the browser had already given up. **The Executions panel shows it as a success. It
was not one for the user.** Anything measured only from that panel will keep
looking green.

**What it is not.** The obvious explanation was the full-sheet scan, and that was
wrong. Measured 2026-09-09:

| read | cold | warm |
|---|---|---|
| Progress — 210 rows x 20 cols | 667ms | 300ms |
| Attempts — 3015 rows x 22 cols | 1150ms | 719ms |
| level map (Scenarios scan) | 380ms | 37ms |

Total sheet I/O on this path is about **one second**. So ~48s of the 49.157s is
something else, and the "full-sheet scans grow with usage" concern — real, and
written into CLAUDE.md — is not what is happening here. At 3015 rows there is
roughly 10x headroom before it becomes one.

**What has not been ruled out.** Four collaborators in `getMyCompletedLevels`
were never measured: `AuthService.requireRole`, `TourService.getActiveTour`,
`lmsGetXpData_` and `lmsGetStreak_`. The last two are full `dbReadAll_` reads of
LmsXp and UserStreaks, and this function never opens a `dbWithReadScope_`, so
nothing memoises them — the same defect Phase 1 fixed for `apiFinalizeRoute`.
At the speeds above those should total ~4s, not 48. Beyond them is the platform:
cold start, recompiling 26 files, queueing.

**How to settle it.** Checkpoint `getMyCompletedLevels`, log the total spent
inside the function, and subtract that from the duration the Executions panel
reports for the same execution. The remainder is platform, which no checkpoint
inside our own code can see because it happens before the first line runs. The
instrumentation was written and then reverted unused; it is in the conversation
of 2026-09-09 if it is wanted again.

**What this leaves unmeasured.** Lock hold time inside `dbWithScriptLock_`. Until
someone has it, any concurrent-user ceiling above ~40 is an estimate: 41 sites
share one project-wide lock with `waitLock(20000)`, and a queue of ten waiters at
2s each would exhaust that budget and throw. The instrumentation for this was
also written and reverted.

**What would close it.** Either the two measurements above, or a decision that one
slow call per cold session behind a working retry is acceptable — which is a
product call, not a code one.

---

## The commit-msg hook counts an unchecked command as checked

**Status** **Open.** Found 2026-09-09 by shipping a commit body with `{N}` and
`{T}` placeholders where the verification output belonged. The hook accepted it
and reported `2 claimed output(s) re-run and matched`.

**The mechanism.** `.githooks/commit-msg` collects the contiguous block beneath
each `$ ` line as the claimed output, then skips comparison when that block is
empty (`if (c.claimed === '') continue;`). The summary line counts
`checks.length - skipped.length`, and `skipped` holds only the `$!` entries. So a
command with no claimed output is never compared and is still reported as
matched.

**Why it matters here.** The hook exists because three times in one week a commit
body carried a number the command had not printed. It closes that hole only for
claims that have output beneath them. A claim with nothing beneath it — a
placeholder, a stray blank line, an indent that does not match the `$` — is
counted as verified.

**This is the fourth instance of the pattern CLAUDE.md already names twice.** A
test asserting a button that does not exist, a sendBeacon the proxy refused, a
hook that parsed no claims and approved everything, and now a hook that compares
nothing and reports a match. Doing nothing and succeeding are the same observable.

**The fix, when someone takes it.** Either treat an empty claim as a failure, or
report it distinctly — `1 matched, 1 had nothing to check` — so the summary line
can never overstate. And the fix is not trusted until a body with an empty claim
block has been seen rejected.

---

## An answer submitted itself, one phase after the student pressed Enter

**Status** **Fixed** — a take that delivers no transcript now cancels the pending
send. Recorded because the mechanism was correct when it was written and became
wrong when the recorder grew new ways to finish, which is a failure mode no
amount of care at the original site would have caught.

**No bot ID.** Reported from a live route on 2026-09-09 with screenshots.

**What was reported.** "When hitting replay it automatically jumps like incorrect
without typing or sending anything." A verdict of 0/100 on an answer the student
was still writing.

**The mechanism.** Pressing Enter while the microphone is recording is meant to
stop it and wait — the transcript has to arrive before there is anything to send.
That request lives in `_sendAfterTranscript`, set in `_simSubmitReadback` and
cleared in exactly one place: `_simOnTranscript`, on the success path.

The recorder has **five** ways to finish without ever reaching it — silence, an
echo, no API key, a Whisper error, a network failure — and on every one of them
the flag stayed armed. It is module-scope, so it survived Practice again
rebuilding the card. The next transcript to arrive, possibly a phase later,
submitted itself the instant it landed.

**Whose fault it is.** The two-of-five that make it common are mine: the silence
gate and the collision guard, added 2026-09-09, both return without calling
`onTranscript`. Silence is the ordinary case — a student presses Enter, the
recorder had nothing, and from then on the next thing they say sends itself. The
other three exits predate that and had the same hole; nobody had hit them often
enough to notice.

**The general shape.** A flag set in one place and cleared in one place is only
correct while there is exactly one way to finish. The recorder gained two more
and nothing pointed at the flag. `_micPhase` now reports *which kind* of ending
it was — `'done'` for a delivered transcript, `''` for a take that produced
nothing — so a new exit has to say which it is rather than silently defaulting to
the wrong one.

**What would reopen it.** A sixth exit added without emitting a phase. The suite
counts them: `test/pending-send.test.js` asserts at least four `''` emissions and
that `'done'` is inside the success branch rather than above it.

---

## The accent badge said "loading…" for the whole phase

**Status** **Fixed** — the badge is drawn from the scenario's own country when
the card renders, and one helper serves both callers.

**No bot ID.** Reported alongside the entry above, on 2026-09-09.

**What was reported.** "Sometimes I don't get the flag, only that loading screen,
next to the replay button. I should always get the flag of the country accent."

**The mechanism.** `#atcVoiceBadge` shipped with the literal text `loading…` and
was only ever rewritten by `_showVoiceBadge`, which runs when a voice resolves.
Three paths never got there or got there without a country: a slow voice fetch, a
failed one, and the text-only fallback, which passes no country at all and
replaced the flag with the words "Text only".

**Why the fix is where it is.** The accent is a property of the scenario, not of
the audio. The country is known when the card is drawn and nothing about it
depends on a round trip, so the badge is written then. `_showVoiceBadge` refreshes
it and falls back to the scenario when its caller passes no country.

**Two-copies rule, applied before editing rather than after.** The flag markup now
exists once, in `_atcAccentBadgeHtml`, with two callers. Writing it inline at the
render site as well would have been a second copy of the same four lines, in the
file whose stylesheet already carries 73 duplicated top-level selectors.

**What is not verifiable from the repo (rule 6).** Whether the flag renders. That
is geometry, and `getFlagHtml` degrades to a two-letter box for a country with no
SVG — of which there are none in `COUNTRY_UI` today, asserted by
`test/sitting-report.test.js`.

---

## 73 top-level selectors in Styles.html are declared twice

**Status** **Open — filed, not fixed.** Found 2026-09-09 while placing the
read-back card's reserved height. Not touched: deduplicating a stylesheet by hand
is a change with no test that can hold it, on a file whose effects are only
visible in a browser.

**No bot ID.** Found during other work.

**What it is.** 73 selectors are declared more than once at top level — not in a
media query, not in a theme block, just twice in the same cascade. 30 of them are
in the simulator's own namespace. Where the two copies differ, **the later one
wins and the earlier one is dead code that reads as if it were live.**

**The one that was caught.** `.sim-feedback-box` at line 2770 declares
`min-height: 56px` and at line 3958 declares `min-height: 50px`. The first has
never had any effect. The read-back card needed exactly that property, and an
edit written at 2770 — the first hit any search returns — would have changed
nothing and looked correct in the diff. The reserve is on `#simFeedbackBox`
instead, because an ID outranks both copies and cannot land on the wrong one.

**Why it matters more here than in most codebases.** This is the two-copies rule
in the file least able to show it. A duplicated function can be caught by a
parity test; duplicated CSS produces no error, no warning and no failing test —
it silently discards half of what is written. CLAUDE.md records five instances of
this pattern in the JavaScript, including a live security exposure. This is the
same shape, at 73x, and it has been sitting there the whole time.

**A partial list, simulator only:** `.sim-action-row` [2798, 3675],
`.sim-feedback-box` [2770, 3958], `.sim-feedback-box.success` [2792, 3980, 4090],
`.sim-live-dot::before` [2578, 3483, 4026], `.sim-plane-icon` [2672, 3603, 4015],
`.sim-radar-sweep` [2659, 3590, 4011], `.sim-radio-console` [3622, 4056],
`.sim-side-item` [2723, 3698], `.sim-readback-priority-input:focus` [3670, 4067].

**How to work with it until it is fixed.** Before editing any rule in Styles.html,
check whether the selector is declared more than once, and edit the LAST one. A
new element is safer given a new class than given an existing one.

**What closing it would need.** Not a hand pass. A script that parses the sheet,
reports every duplicate with its declarations, and a decision per selector about
whether the earlier copy was meant to be overridden or was a paste. Then a
before-and-after screenshot of every screen, because nothing else can confirm it.

---

## Every spoken exam answer was thrown away on arrival

**Status** **Fixed** — `_scOnce` forwards its arguments. Recorded in full because
the helper looked correct, the tests were green, nothing logged an error, and the
result was a fluent pilot marked band 1 in all six descriptors.

**No bot ID.** Reported by the instructor on 2026-09-09 from student complaints.

**What was reported.** Students with good English — C1 among them — sitting the
mock test smoothly, hearing every audio, answering every question aloud, and
receiving **1 in all six descriptors**.

**The cause, in three lines.**

```js
function _scOnce(fn) {
  var used = false;
  return function () { if (used) return; used = true; try { fn(); } catch (e) {} };
}
```

`fn()` — bare. It guards four callbacks and two of them carry the only thing the
exam exists to collect: `_scRecord` passes the transcript Whisper returned, and
`_scTyped` passes what the candidate typed. Both arrived as `undefined`, and the
caller's `String(transcript || '(no answer given)')` wrote the words
**"(no answer given)"** into the graded transcript instead.

Deterministic. Every spoken answer, every scripted sitting, since the scripted
exam shipped.

**Why nothing caught it.** Every part of the system behaved correctly and
reported success. The microphone recorded, the audio was full length, the upload
succeeded, OpenAI transcribed it and **charged for it** — the day of the reported
sitting was the highest spend in the billing period. The transcript was correct
when it arrived. It was dropped one function call later, and the exam then marked
the candidate against silence it had written itself. The grading was right about
what it was shown.

**How it was found.** Not from the repository. Four hypotheses were ruled out in
order — a rendering bug, a missing API key, exhausted credit, a silent microphone
— and each was killed by evidence the instructor supplied: the saved sitting JSON,
the OpenAI usage chart, and a screenshot of a live microphone meter. The billing
chart is what forced it: money spent means the transcription **succeeded**, so the
loss had to be after it. Two of the four hypotheses were mine and stated with more
confidence than they had earned.

**The two consumers that were not affected, and why forwarding is safe for them.**
`_scAsk` invokes its callback bare. `_scSpeak` assigns its callback to
`el.onended`, so it now forwards a DOM `Event` — harmless, because all three
callers ignore parameters and `_scNextStep` declares none. Asserted in
`test/scripted-answer.test.js` so a future edit cannot start reading it.

**What is still open.** The safety net that should have refused to grade this
sitting did not fire, for an unrelated reason. See the entry below it.

---

## The band-1 sittings already in the sheet stay there

**Status** **Closed by decision** (product owner, 2026-09-09). Not deferred —
declined.

**What the decision covers.** Every scripted sitting recorded before the fix
above carries descriptor scores that measure a dropped function argument rather
than a candidate. The instructor's decision is to leave those rows in the sheet
as they are, rather than void or annotate them.

**Why this is worth writing down rather than leaving silent.** Someone reading
the results table in six months has no way to tell those rows apart from real
assessments. A band 1 is not a neutral number — it reads as a judgement on a
person's English, and it is the figure an employer would be shown. Anyone doing
analysis on historical exam results, or answering a student who asks about an old
score, needs to know that sittings before this fix are not evidence of anything.

**How to identify them.** Rows in the TEA results sheet with `Source` =
`conversation` and a date before the deploy of this fix. The `Source` column
exists precisely so results graded by different paths can be told apart.

**What would reopen it.** A student disputing a recorded band, or the results
being used for anything beyond practice — a certificate, a report to an employer,
an intake decision. At that point the rows have to be dealt with rather than
explained.

---

## The refusal that should have caught it counted the exam's own marker as an answer

**Status** **Fixed** — `[EXAM_COMPLETE | …]` is no longer counted as a candidate
answer. Recorded because this is the second time a guard in this file was
defeated by the shape of the data rather than by its logic.

**No bot ID.** Found 2026-09-09 while diagnosing the entry two above this one.

**What it was for.** `96760e1` (2026-09-03) added a refusal to
`_finishExam`, commented *"An examination that heard nothing does not get to
award a band."* It declines to grade when `answered === 0`.

**Why it did not fire.** `_scFinish` pushes `_teaReplayReport()` into the history
as `role: 'user'`, and that returns
`[EXAM_COMPLETE | replays: … | COMPREHENSION_CAP: …]`. `_teaAnsweredCount` skipped
two patterns — `^\[replay report\]` and the word `used` — and the real marker
matches neither. It lands twice, once from `_scFinish` and once from the
conversational finish.

So a sitting in which **every** answer was `(no answer given)` reported
`answered = 2`, the `answered === 0` clause was false, and the exam graded a
candidate it had not heard. Confirmed by running the real function against the
saved sitting: `answered=2 asked=26`.

**The test that should have caught it was green about a string that does not
exist.** `test/unheard-sitting.test.js` fed the counter
`'[replay report] 2 replays used'` — a marker this product has never emitted. It
asserted the guard worked, against input the guard would never see. That is why a
hole in the one safety net for this failure survived five days and a real sitting.
Both forms are asserted now, and the real one is taken verbatim from the saved
JSON.

**What is deliberately not fixed here (rule 4).** The **conversational** exam
sends other bracketed protocol messages through `_chat`, which pushes them as
`role: 'user'` the same way — `[AUDIO_UNAVAILABLE: …]`, `[COMPARE_PICTURES …]`,
`[BEGIN_PART_1 …]`, the picture descriptors. Each would inflate `answered` on that
path exactly as the end-of-exam marker did on the scripted one. The scripted exam
is the path that produced the reported failure and it pushes only answers and this
marker, so this closes that path completely and leaves the other open. It needs
its own ticket and its own decision about whether to enumerate the markers or
treat any wholly-bracketed turn as bookkeeping.

**What would reopen it.** A new protocol message pushed as `role: 'user'` on the
scripted path.

---

## Two graders held candidates to two different standards

**Status** **Fixed** — both carry the ICAO Doc 9835 scale verbatim, and
`test/rubric-parity.test.js` compares them character for character.

**No bot ID.** Found 2026-09-09 while answering an instructor's question about
the rubric.

**What was wrong.** `api/tea-pipeline.mjs` carried the full Doc 9835 scale
verbatim, under an instruction reading *"This is the full scale, verbatim. Do not
grade against a paraphrase of it."* `api/tea.mjs` — the grader that runs when the
pipeline does not produce a result — **was that paraphrase**, and it defined
**only levels 3, 4 and 5**.

So a candidate's standard depended on which grader happened to run, and when the
fallback awarded band 1 it was assigning a band its own rubric never described.
Four of the six graded sittings on record went to the fallback.

**Why the copies were not merged.** A shared module is the correct fix and was
rejected for now: nothing in `api/` imports a local file today, and an import that
fails to bundle takes **both** graders down and every exam with them. That is not a
change to make an hour before a live sitting. The copies stay and a parity test
compares them — the trade this file already allows for two copies across a real
boundary, provided the test is executable rather than a comment.

**What each grader keeps to itself, deliberately.** The fallback carries the replay
ceiling, because the `[EXAM_COMPLETE]` marker that computes it only reaches that
path; the pipeline has the same ceiling applied in client code after it returns.
The fallback also now carries an instruction that it has **no acoustic data** — no
speech rate, no pause length, no pronunciation confidence — and must not describe
measurements it does not have. The pipeline does not get that instruction, because
it does have them. Both exclusions are asserted.

**What was declined from the proposed replacement.** An instructor-supplied rubric
draft was assessed and three of its Level 4 wordings would have moved the pass line
**above** ICAO's — pronunciation "rarely" (Doc 9835 says *sometimes*, and *rarely*
is Level 5's word, so the two bands became indistinguishable), structure "never
obscure" (ICAO: *rarely interfere*), comprehension "consistently accurate" (ICAO:
*mostly*, and *consistently* is Level 6's word). For a test certifying against a
legal minimum, strictness at the pass line fails pilots ICAO says should pass. Also
declined: CEFR anchors, which ICAO does not publish and which invite the model to
grade the English rather than the operational communication; a hard cap forcing
three descriptors to Level 3 on one non-routine failure, which is house policy
presented as a standard; an output schema with no `student_view`/`admin_view`
split, which would have undone the descriptor withholding; and moving the replay
ceiling out of code into the prompt, reversing a deliberate decision not to trust
the model with that arithmetic. All four are asserted against.

**What was adopted from it.** The aviation guardrail, which is the best idea in it
and had no equivalent anywhere: plain concise language that safely resolves a
non-routine situation is a complete Level 4, and elaborate English that obscures
the operational message is a hazard rather than evidence of range. Both graders now
carry it identically.

**What this does not fix.** Nothing here improves the evidence either grader is
given. A rubric is only as good as the transcript under it, and the defect above
this entry is why that mattered.

---

## Leaving a sitting mid-examination asked nothing and lost everything

**Status** **Fixed** — `_navTo`, `_teaExitToHome` and `beforeunload` all ask before
a live sitting is abandoned. Recorded because the exposure was larger than the
button that got pressed, and because the fix is a seatbelt and not an airbag.

**No bot ID.** Reported by the instructor on 2026-09-10, from losing a sitting
mid-exam to a mis-tap.

**What was reported.** Half an hour into the examination, one wrong button, back
to Home, everything gone. No warning before, no recovery after.

**How much was reachable.** The exam runs inside the ordinary app shell. Unlike
the simulator it never calls `enableSimulatorFocusMode`, so Home, Progress, Crew
and Shop stay live on **both** the desktop bar and the mobile bar for the whole
sitting — eight buttons, one tap each, none of them asking. All eight route
through `_navTo`, which is why one guard covers them.

**What was NOT lost, and is worth knowing.** The attempt is not spent. An attempt
is counted only where a row carries a band, and `_icaoSittingsFor_` skips unmarked
rows on purpose — *"a candidate is charged for a result, not for a row."* The exam
hold is also released, because `_teaExitToHome` calls `_teaStopAll`. So the cost
was the half hour, not the allowance.

**The predicate, and the trap in it.** `_t._examDone` is **not** a test for "safe
to leave": it means the answering phase is over and the input bar is locked, and
grading runs after it. Keying the guard off that flag would have waved a student
out **during marking**, losing the result of a sitting that had been fully given —
the worst moment of all. The test for safe is `_t._studentView`: the report is on
screen. Asserted directly in `test/sitting-guard.test.js`.

**Why `window.confirm` and not a styled modal.** It is already how this app asks
before something irreversible, at a dozen call sites, and a custom dialog cannot
help on the `beforeunload` path — browsers insist on their own text there. One
mechanism for one rule beats two that can disagree.

**What `beforeunload` is worth here.** Little, honestly. There is no `pushState`
anywhere in the app, so the browser's back button leaves the site rather than
moving between screens, and `beforeunload` is the only thing that can catch it.
This file already records that it often does not fire at all on mobile Safari.
It is bound because it costs four lines and catches the desktop case. **The in-app
guards are what actually do the work.**

**What this does not do.** It prevents accidents. It does not prevent loss. A dead
battery, a crashed tab or an evicted page still takes the sitting, because `_t` is
a plain in-memory object with no draft and no resume. That is filed separately —
see the ticket on persisting a sitting — and it is a much larger piece of work,
because `_t.segments` holds two dozen base64 recordings and will not fit in
localStorage.

**What would reopen it.** A navigation route that does not go through `_navTo`.
The suite pins the inventory: exactly two buttons bypass it today, both admin, and
a third would fail the test.

---

## The good grader was refused at the door, and nobody was told

**Status** **Fixed** — the recordings no longer travel in the request body. The
payload for a full sitting went from roughly six megabytes to 250 KB, measured in
`test/pipeline-payload.test.js`.

**No bot ID.** Found 2026-09-10 in the Vercel logs, from an instructor's sitting.

**What it was.** One line:

```
SEP 10 01:03:39.44   413   /api/tea-pipeline
```

**413 Payload Too Large.** Vercel rejected the request at the edge, before the
function was invoked. That is why no `[PIPELINE]` line was ever logged and why
four theories about timeouts, keys and quotas were all wrong: the code never ran.

**Why the body was that big.** `/api/tea-pipeline` obtained its acoustic evidence —
speech rate, pause length, per-word confidence — by transcribing every recording a
**second** time. That meant the client posting two dozen base64 recordings in one
JSON body. Base64 adds about a third; a full sitting came to roughly 6 MB against
a limit of about 4.5.

**The part that makes it worse than a size bug.** The failure scaled with the
candidate. A student who answered briefly stayed under the limit and was graded by
the full ICAO pipeline with acoustic evidence. A student who spoke at length
exceeded it and was graded on text alone, by the fallback that carried a paraphrase
of the scale and no acoustic data at all. **The more English a candidate produced,
the worse the examiner they got.** Every sitting in the record where the grader was
`conversation` is that.

**The fix, and why it is not a bigger limit.** The exam already transcribes each
answer through `/api/whisper`, one at a time, and those calls succeed — they are in
the same log, answering 200. `/api/whisper` now returns Whisper's verbose detail
when asked for it, the exam keeps that per answer, and the pipeline receives
transcripts instead of audio. Raising a limit or chunking the upload would have
moved the ceiling; this removes the reason to approach it. `buildRichTranscript` is
untouched and still takes exactly the shape it always took.

**Two copies, resolved rather than added to.** `api/whisper.mjs` and
`transcribeSegment` in `api/tea-pipeline.mjs` were both calling OpenAI's
transcription endpoint. The second is now bypassed on the live path rather than a
third being written. It remains for the mock mode and for any caller still sending
audio.

**A side effect worth having.** Each answer is transcribed once instead of twice,
so a full sitting costs roughly half what it did at OpenAI.

**What is deliberately unchanged.** The recordings stay on the device in
`_t.segments`. They are still the durable evidence of what was said, and the
unheard-sitting guard still counts them to decide whether an examination may be
graded at all. `/api/whisper`'s existing response shape is untouched — the
simulator's read-back posts to the same endpoint and wants a string.

**What is not verified from the repo (rule 6).** Whether the real payload now
lands under the limit, and how long the Gemini grading call takes on its own. The
250 KB figure is a realistic 24-answer reconstruction, not a measurement of a live
sitting. One real examination settles both.

**What this does not fix.** The fallback still takes over in silence. That is why
this ran unnoticed, and it has its own ticket.

---

## Two pictures were 92% of the heaviest file in the project

**Status** **Fixed** — the logo and the avatar are static files with
content-hashed names. `ConfigService.js` went from 366,555 bytes to 31,215, and
`dist/index.html` from 2,138 KB to 1,318 KB.

**No bot ID.** Raised by the instructor on 2026-09-10.

**What it was.** `getLogoDataUrl()` and `getPilotAvatarUrl()` returned base64 data
URLs of 250,510 and 88,850 characters — **339,364 of the file's 366,555 bytes**.
Decoded they are a 680×395 PNG and a 256×256 PNG, drawn at 64–200px.

**What it cost on every open.** The logo was embedded three times in the initial
document and the avatar once, so roughly 751 KB of base64 shipped inside the HTML.
Gzip barely helped: underneath is an already-compressed PNG, so compression only
recovered base64's own expansion. None of it was cacheable, because it lived
inside the HTML — and `sw.js` is network-first for navigation deliberately, so
that weight was paid on **every single open**, not once.

**The three kinds of caller, which is what made this more than a delete.**

*The initial document* — four placeholders in `Index.html`. These need a URL, and
that is where the 820 KB was won.

*Seven emails* — `Userservice.js` 294/593/814, `TourService.js` 699/782,
`Código.js` 6839/7453. Each decoded the base64 by hand and passed a Blob to
MailApp's `inlineImages`, which is the correct way to put an image in an email; a
message read outside the app cannot reference a URL into it. They now call one
helper, `getLogoBlob_()`, which fetches the same static file the browser gets. One
copy of the picture, not a literal kept for email alone.

*Two that only look like emails* — `Gamification.js` 213 and 383 put
`<img src="data:...">` straight into an `htmlBody`, which mail clients discard.
Those were **renamed only**, so they do not call a deleted function; the defect
underneath is filed separately.

**The second implementation this ran into.** `doGet` serves the same `Index.html`
through `HtmlService.createTemplateFromFile('Index').evaluate()`, so
`<?!= getLogoUrl() ?>` is evaluated in **two** places — Apps Script at runtime and
`build.js` for Vercel. A Drive-hosted file would have solved the emails and left
that placeholder with nothing to return. Both resolve now, and the test asserts
both can.

**A fifth base URL, named rather than hidden.** `appBaseUrl_()` is the fifth place
in the project that works out where the app lives. The others are
`ScriptApp.getService().getUrl()` at Userservice 237/561, TourService 664/743,
EnvService 92 and Gamification 398, plus an `APP_URL` chain at Userservice 456 and
556 — so some emails link to `/exec` and others to the Vercel domain. This one
cannot use `getService().getUrl()`, because Apps Script does not serve
`/brand/logo.png`. It follows the fullest existing chain rather than inventing a
sixth answer, and consolidating them is filed.

**A new dependency, accepted deliberately.** Emails now fetch the logo over the
network. `getLogoBlob_()` returns null rather than throwing and every caller sends
without the picture instead — a brand image is not worth failing a password email
over.

**The cold-start hypothesis: NOT TESTED.** `KNOWN_ISSUES` records a 49.157s cold
start with ~48s unattributed and "recompiling 26 files" among the suspects. Apps
Script compiles the whole project cold, and that included a 367 KB file which was
a 250 KB string. The bytes are now out of the project entirely, which is what the
hypothesis needs. **Whether it moved the cold start is unmeasured** — that needs a
real cold start before and after, and nothing in this repository can produce one.
If it does not move, the hypothesis is dead and should be written down as dead;
339 KB of bundle is gone either way.

**What is not verified (rule 6).** The cold start above. Whether the `/exec` front
door is still in real use — if it is, its logo now loads cross-origin from Vercel
rather than inline. And that the emails still render, which needs a real inbox.
