# Working rules — AEROCOMMS

## Repo shape
- Google Apps Script backend (*.js, global scope, doPost action router)
- Single-file vanilla-JS client: Scripts.html, ~30,900 lines, 12 top-level IIFEs
- Index.html shell, Styles.html styles
- Vercel serverless proxies: api/*.mjs
- build.js compiles to dist/index.html; dist/ is gitignored and Vercel builds
  from source on every push

## Definition of done
A ticket is done when:
- A verification command exists, has been run, and its REAL output is in the
  commit body — not the expected output
- The fix is confirmed on the path that executes at runtime, not just present at
  the line the ticket named. Trace forward from the entry point and check whether
  a second implementation exists that the live path might use instead
- Anything unverifiable from code is stated as unverifiable
Never report a fix as complete on the strength of the diff alone.

## Non-negotiable rules
1. One ticket, one commit. Message begins with the ticket ID.
2. Verification command and its real output go in every commit body.
3. Run `node build.js` after every change and confirm the output greps clean.
4. No drive-by refactoring. Scripts.html is 30,900 lines. Any unrequested edit is
   an untested regression on a screen nobody will check. Spot something? Write a
   ticket, don't fix it.
5. Never fix by hiding. No display:none, no client-side redaction, no removed nav
   link as a substitute for a server-side check. If the browser receives data the
   user isn't entitled to, the bug is not fixed.
6. "I can't verify that" is an acceptable answer. Guessing is not. Sheets data,
   Script Properties, rendered geometry and deployed state cannot be confirmed by
   reading the repo.
7. Never invent scope. Ambiguous ticket → stop and ask.
8. Ticket IDs come from the Telegram bot. The repo history uses a different,
   drifted numbering. Never renumber, never infer an ID.
9. Don't grep dist/ for identifiers — the build minifies and renames locals, which
   produces false negatives. Use source for identifiers, and
   `grep -o … | wc -l` for occurrence counts (grep -c counts lines, and the bundle
   is a few very long ones).

## Two-copies rule
Before fixing anything, search for a second implementation of the same concept. This is
the dominant failure mode in this codebase — it has already produced that failure at
least five times, including a live security exposure. Examples so far: TEA_AUDIO vs
IcaoTestItemService (the fix landed on the unused copy while the live path kept shipping
transcripts), two replay counters, two sessionValid copies with divergent return shapes,
product functions pasted into test suites, two threshold defaults. The list is
illustrative, not exhaustive — assume the next one is undiscovered.

If you find two, say so before editing. If a genuine boundary forces two (client vs Apps
Script), add an executable parity test that compares them directly — never a comment
asking them to stay in sync.

## Tests must be able to fail
A new or repaired test is not trusted until it has been seen red. Break the behaviour it
covers, show the failure, restore. Never paste product code into a test — lift it from
source. A test asserting against a copy is green about a product that may no longer
exist.

## Tests can be wrong about the product
A failing test is not automatically a defect, and a passing one is not automatically
correct. feedbackCard asserted a "Show answer" button that renderAttemptFeedback
deliberately withholds — anyone making it green would have destroyed the exercise. When a
test and the code disagree, establish which is right before changing either.

## Errors must be observable
console.error and console.warn are not error handling; nothing reaches the developer.
Client failures go through apiLogClientEvent / _reportClientError. A silent failure path
is a defect in itself, independent of whatever caused it.

## Never present stale data as current
If a fetch fails and the UI renders from cache, the UI must show that. Never reset a
freshness timestamp on cache restore. This is a product rule, not a UI preference — the
app misreporting a student's own progress is worse than the app being slow.

## Apps Script constraints (environment, not code)
- doPost always returns HTTP 200. Refusals are {ok:false, code:'FORBIDDEN', status:403}
  in the body. Body-level codes are the real authorization, not a workaround.
- executeAs: USER_DEPLOYING means getUserLock() resolves to one identity — per-user
  locking is unavailable. All 41 dbWithScriptLock_ sites share one project-wide lock.
- Apps Script sometimes returns an HTML consent page instead of JSON. A single probe is
  unreliable evidence in either direction — repeat before concluding.
- Platform floor is ~1.7-5.9s even for a no-I/O call. Don't attribute that to app code.
- Full-sheet getDataRange() scans grow with usage. Route reads through dbReadAll_'s
  _DB_SCOPE cache and filter before building row objects.

## The ledger is part of the work
Closing something updates its KNOWN_ISSUES entry in the same commit that closes it.
A ledger that describes a fixed defect as open is worse than no ledger — it is a
second copy of the truth, drifting, which is the failure mode this file already
warns about twice. Audit #2 found one entry four commits stale, saying "Open,
nothing changed" about work that had shipped. Sweep every entry against HEAD when
you touch the file at all.

## A commit subject describes the outcome, not the intent
"One named default per runtime" read as closure for work that closed nothing — it
named two constants and left them free to diverge, and the subject is why nobody
looked again until an audit. If a change is partial, the subject says so. If it
names a constant rather than removing a duplicate, the subject says that. The
body can carry the reasoning; the subject is what someone scanning the log
believes without reading further.

## Verification output is re-run, not remembered
Commit bodies carry commands and their output in this shape:

    $ grep -c '^## ' KNOWN_ISSUES.md
    12

`.githooks/commit-msg` re-runs every `$ ` line from the repo root and rejects the
commit if the output beneath it does not match. Install it once per clone:
`git config core.hooksPath .githooks`. Use `$! ` for anything that cannot be
replayed — network calls, deploys, live probes, timings — which is skipped and
listed so nobody mistakes it for checked. It closes one hole, not the class: a
claim that was never a command is still yours to get right.
