# Known issues

Accepted defects and deliberate trades that are not yet fixed. Ticket IDs come
from the Telegram bot; nothing here is renumbered or inferred.

---

## T-8 — `sessionValid` fails open, and one branch fails open further than intended

**Where** `api/tea.mjs:380-420`, and the separate copy at `api/tea-pipeline.mjs:655-689`.

**What happens** When Apps Script answers an HTML consent page, answers something
unparseable, or does not answer at all, `sessionValid` returns a caller object
instead of `null`. The request proceeds on the strength of the token being a
non-empty string — nothing has checked that the token is real.

    api/tea.mjs:402   HTML answer        -> { role: '', status: '' }
    api/tea.mjs:408   unparseable answer -> { role: '', status: '' }
    api/tea.mjs:417   threw / timed out  -> { role: '' }

Apps Script answering HTML is not hypothetical. It is documented in `api/gas.mjs`
and has been observed on this deployment on more than one day, in both directions
on different days.

**Consequence 1 — cost.** Any caller who invents a token string can reach Gemini
through `/api/tea` for as long as Apps Script is misbehaving. There is no rate
limit on that path and each call is a paid generation.

**Consequence 2 — the descriptor withholding stops holding.** This one is worse
than the trade that was signed off, and it is a bug rather than a trade.

The handler computes:

    const paidPlan = caller.status !== 'free' && caller.status !== '';

The comment above it states the intent: `''` means the plan could not be
established, and is treated as free. Lines 403 and 409 honour that. **Line 418
does not — it omits `status` entirely**, so `caller.status` is `undefined`,
`paidPlan` evaluates to `true`, and the six ICAO descriptors are returned in full
to a caller whose plan is unknown. D-1 exists to stop precisely that, and this
branch is the one place the plan is least knowable.

The two proxies do not agree on the shape either: `api/tea-pipeline.mjs` returns
`{ status: '' }` on all three branches and has no `role` at all.

**Why it is open** Failing closed would end live sittings mid-exam whenever
Apps Script hiccups — a candidate forty minutes into a paper would be signed out
of their own examination. That trade is deliberate and was taken knowingly. What
is not deliberate is that it is unbounded, unlogged beyond a `console.warn`, and
that line 418 leaks scores the other two branches withhold.

**Smallest honest fix** Make line 418 return `{ role: '', status: '' }` so the
three branches agree, then bound the open state — a counter, a short cache of
recently-validated tokens, or a cheap signature the browser cannot forge.

**Not fixed here** Rule 4: no drive-by edits. Rule 8: the second consequence
needs its own ID from the bot if it is to be tracked separately.
