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
