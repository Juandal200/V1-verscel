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
