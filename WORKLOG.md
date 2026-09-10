# Work log

Plans and checklists for work that has no ticket ID.

CLAUDE.md requires three things before building anything: a plan, a criterion, and a
checklist. Where the work has a Telegram ticket, those attach to it. Where it does not —
a remark in a meeting, a line in a message, something noticed in passing — they go here,
under the day, so the work is traceable without an ID.

The checklist is the half that leaves the repository. Code evidence proves a change
landed; the checklist proves it was the change that was wanted. Those are different
claims, and for anything a person can see, the second is the one that counts.

Newest day first.

---

## 2026-09-10

### Light mode is not offered, for now

**Plan.** Remove every way to select the light theme — the boot script, the
top-bar button, the avatar-menu item and `toggleTheme` — and leave the 127
`[data-theme="light"]` rules in place, inert.

**Criterion.** Stated: eliminate the light mode for now.

`DERIVED`, on the strength of "for now": disabled rather than deleted. Five test
suites assert against those rules; deleting them would mean rewriting five suites
and then restoring both to turn it back on. As it stands, reversing this is six
lines in `Index.html` and one function.

`DERIVED`: the `sun` and `moon` icons go. They served only the toggle, and
`typography.test.js` counts icons drawn and never used. They come back with it.

**Why, in one line.** It settles the map's palette question — with no light theme
to break, the geodata map can use the flat dark values it was specified with.

**Checklist.**

- [ ] The app is dark, whatever was stored before
- [ ] No sun/moon button in the top bar
- [ ] No "Light mode" item in the avatar menu
- [ ] Nothing looks half-styled — no element left expecting a light background
- [ ] A student who had light mode on gets dark, not a broken screen

**Not verifiable from the repo.** How it looks to someone who had light mode
selected.


### The coastlines read as a world map

**Plan.** Rewrite `_LM_LAND` at roughly three times the resolution and add the
landmasses that were missing entirely, then prove it with a check that can catch a
continent drawn wrong.

**Criterion.** Stated: make the lines or the silhouette of the map more realistic.

`DERIVED`: still hand-authored coordinates. No library and no remote tiles,
because `sw.js` caches only `/` and a tile source would break the app offline —
the constraint the original author wrote down, and it still holds.

**Why, in one line.** Nothing on this machine can look at the map, so "more
realistic" had to become something testable: every country pin lands inside its
own landmass, and every continent stays inside its own hemisphere.

**Checklist.**

- [ ] The map reads as a world map — recognisable continents at a glance
- [ ] Scandinavia, Hudson Bay, the Red Sea, the Caribbean and Korea are all there
- [ ] Every flag sits on land, none in the sea
- [ ] Greenland is cropped at the top edge rather than squashed
- [ ] Nothing overlaps the mock-test square in the bottom right
- [ ] The map still renders instantly and works offline

**Not verifiable from the repo.** Whether it actually looks better. The tests
prove the outlines are not wrong; they cannot prove they are good.


### The mock test is named honestly and sits on the map

**Plan.** Two halves of one request. The square's three lines become
`Based on ICAO / Mock test / Begin`, and it moves inside the map container as an
absolutely positioned overlay. Separately, anything student-facing that reads as
the NAME of ICAO's own examination is renamed.

**Criterion.** Stated: it is not the official ICAO exam, so the name must not
imply it is; and the square sits inside the map rather than below it.

`DERIVED`: the overlay anchors to `.lm-stage-wrap`, not `.lm-stage`. The stage is
a fixed 1180x500 scaled by transform, so a child of it would shrink with the
window and the square's own text with it. The wrap is unscaled, already
position:relative and already clips.

`DERIVED`: `z-index: 10` — above a resting pin at 2 so the square is visible,
below an opened country panel at 20 so a panel a student just opened is never
hidden behind it.

`DERIVED`, and confirmed with the instructor before starting: `ICAO-based practice
test` is left alone in all nine places. It says "based on" and is already honest;
renaming it would have tripled the diff for no gain in accuracy.

`DERIVED`: the admin results screen keeps its "ICAO Test" label. An administrator
reading that in their own panel is an internal label, not a claim made to a
candidate.

**Checklist.**

- [ ] The square is **on** the map, bottom right, not below it
- [ ] It reads `Based on ICAO` / `Mock test` / `Begin`
- [ ] Its text does not shrink when the window narrows
- [ ] Opening Australia's panel is not hidden behind the square
- [ ] Clicking it still opens the exam
- [ ] The levels screen has no square on its map
- [ ] Nowhere a student can reach says "ICAO Test" or "ICAO TEST"
- [ ] The exam's loader, result banner and history all say Mock test
- [ ] Below 1100px, the ICAO card is still in the card row, unchanged

**Not verifiable from the repo.** Whether the square sits well against the
coastlines at each width.


### Nothing spends money for a stranger

**Plan.** `lib/session.mjs` — outside `api/`, because every file in that directory
becomes a public route, which is why two drifted copies of `sessionValid` already
exist. `api/tea-audio.mjs` and `api/whisper.mjs` import it and refuse before
touching a key. The `doPost` allowlist stops matching names that end in `_`.

**Criterion.** Stated: anyone on the internet can no longer spend the Google TTS
or OpenAI budget.

`DERIVED`: `api/tea.mjs` and `api/tea-pipeline.mjs` keep their own copies for now.
Migrating them touches the live exam path and their return shapes differ, so the
callers would change too. They move once the shared import is proven on a preview
— sequencing the risk, not avoiding it.

`DERIVED`: whisper fails CLOSED on an unconfirmed session, answering `noKey` — the
shape the client already reads as "Whisper is unavailable", which trips the
browser-speech fallback. A refusal costs a less accurate transcript, not the
student's answer, and costs the budget nothing.

`DERIVED`: the session verdict is cached five minutes in warm proxy memory. A
token revoked by signing out can still transcribe for up to five minutes on one
instance. For "may you use the transcription budget" that is the right trade.

**Why, in one line.** Three endpoints billed a third party for anyone who could
send a POST, and `api/tea-pipeline.mjs` already carried a secret — somebody
recognised the class and closed one member of it.

**Checklist.**

- [ ] Speak an answer in a scenario — the transcript comes back as it does today
- [ ] Start an exam — the examiner's audio plays
- [ ] Do both again straight away — no slower the second time
- [ ] Sign out, then POST to `/api/whisper` by hand — refused
- [ ] POST to `/api/tea-audio` with no token — refused
- [ ] POST `{"action":"apiError_"}` to `/api/gas` — `Not allowed`
- [ ] POST a real action with a valid token — still works
- [ ] Turn the network off mid-answer — browser fallback, not a lost answer

**How it ships.** On a branch. Vercel builds a preview; the two spoken checks
happen there before anything reaches `main`, because whisper is on the answer path
and nobody has previously imported a module from outside `api/` in this project.

**Not verifiable from the repo.** Whether Vercel bundles an import from outside
`api/`. That is what the preview answers.


### The tour is deleted and the rank is XP

**Plan.** Three commits. Every student path stops reaching `getActiveTour` — the
rank badge and, less obviously, the rankings tab. The Crew screen is redenominated
in XP. Then the batch, the weekly email and the admin tab are deleted rather than
left unreachable.

**Criterion.** Stated: stop with the tour logic; rank on pure XP.

`DERIVED`, and a change from the shape agreed before starting: the VR bonus key is
`(user, level, ISO week)` rather than `(user, level)`. It keeps today's behaviour —
a bonus stays repeatable weekly — because deleting the tour is a plumbing change,
and turning a repeatable reward into a once-ever one is a gameplay change nobody
asked for. One line to flip.

`DERIVED`: the tour banner's slot is reused for total XP rather than emptied.
Deleting the countdown and leaving the hole makes a panel look broken instead of
changed.

`DERIVED`: `TourProgress` and `Commendations` keep their rows, read by nothing.

**Why, in one line.** The weekly batch had two student doors, not one, and the
second was not in the diagnosis — so it was deleted rather than repaired.

**Checklist.**

- [ ] Log in cold: no 49-second first call
- [ ] The rank badge counts every level ever finished
- [ ] It does not drop to zero on a Monday afternoon
- [ ] Crew → **This Week** and **All Time** both read XP, and neither is empty
- [ ] Where the tour countdown was, total XP and levels complete
- [ ] No medallion strip, no "TOUR 12", no 2× XP badge
- [ ] Admin → no **Tour Reset** tab in the strip
- [ ] Finishing a level still awards XP; the tier still moves at 1000 / 3000 / 8000
- [ ] A VR bonus can still be earned again the following week
- [ ] Streaks, daily challenge and certificates unchanged

**One action for the editor.** Run `deleteWeeklyEmailTrigger()` once. A live Monday
19:00 UTC trigger still points at a function that no longer exists.

**Not verifiable from the repo.** That the cold start is gone — that needs a real
cold boot after deploy.


### The lock gets measured, and LoginCodes stops growing into it

**Plan.** Two commits. `apiAdminMeasureLock` joins the three diagnostics already on
the Eval Tests tab and reports the lock floor, the cost of reading LoginCodes
under the lock, and the row counts behind both. `purgeLoginCodes` plus a daily
trigger removes codes older than 24 hours — they are valid for ten minutes, and
every one ever issued is still read and filtered inside the global lock on every
verify.

**Criterion.** Stated: get the hard number for lock hold time, and stop LoginCodes
degrading the global lock.

`DERIVED`: the measurement is read-only and takes the global lock about thirteen
times briefly, so the panel says not to run it mid-class rather than leaving that
to be discovered.

`DERIVED`: the purge keeps any row whose `createdAt` will not parse. Treating
"cannot read this" as "safe to delete" is how a purge becomes an incident.

**Why, in one line.** Every concurrent-user ceiling above about forty is
arithmetic until someone measures how long the one shared lock is held, and
nothing in this repository can run Apps Script.

**Checklist — the measurement.**

- [ ] Admin → Eval Tests → a **Backend Capacity** section below Schema Migration
- [ ] One click returns numbers in under about 30 seconds
- [ ] Lock floor shown as min / median / max in milliseconds
- [ ] LoginCodes row count, and how long reading it under the lock takes
- [ ] Attempts and Progress row counts and read times
- [ ] Nothing was written — the LoginCodes row count is identical before and after

**Checklist — the purge.**

- [ ] `purgeLoginCodes()` run by hand reports how many rows went and how many remain
- [ ] Re-run the measurement: the LoginCodes read-under-lock time is lower
- [ ] Apps Script → Triggers shows a daily `purgeLoginCodes` at about 04:00
- [ ] **A student can still request a code and log in afterwards**

**Not verifiable from the repo.** Every number the panel produces. That is what it
is for.


### The checkpoint is sat from the map, and the simulator card leaves the desktop home page

**Plan.** Three commits. `_examActionFor` comes out of `_buildExamCard`, so the
five checkpoint states have one action table and both drawings read it. The map's
`lm-cp` marks become buttons carrying that action. Then `simCard` is emitted only
below 1100px, the card row is not emitted at all when it would be empty, and a
small Grid view link appears on the home page.

**Criterion.** Stated: the user can just navigate through the map — the ATC Radio
Simulator card is not on the desktop home page, and the checkpoints on the map are
what you click to sit them.

`DERIVED`, and a change from what was described before approval: the Grid view
link goes **above** the tier bar rather than under it, because the levels screen
puts its own Map/Grid switch in that position and two screens disagreeing about
where the view switch lives is a small thing noticed daily.

`DERIVED`: all five checkpoint states get the action the grid gives them, not a
subset — a passed checkpoint opens its result, a review-required one goes to the
levels screen, locked is dead. Deciding that only "ready to sit" is worth clicking
would be inventing a rule.

`DERIVED`: below 1100px nothing changes. There is no map, so the ATC card stays
and carries the checkpoint as it does today.

**Why, in one line.** The map said READY TO SIT at the top of the home page and
could not be clicked; the only door to that exam was a card below the fold that
had quietly renamed itself.

**Checklist — the checkpoints on the map.**

- [ ] **Tab** reaches all three marks, and **Enter** activates the one that is live
- [ ] A locked checkpoint cannot be clicked, and does not look as though it could
- [ ] READY TO SIT opens the exam
- [ ] PASSED opens its result
- [ ] ONE ATTEMPT LEFT opens the exam
- [ ] REVIEW REQUIRED goes to the levels screen
- [ ] Each does the same thing its card on the levels screen does

**Checklist — the home page.**

- [ ] No ATC Radio Simulator card above 1100px
- [ ] No empty gap where it was
- [ ] A small "Grid view" link above the tier bar opens the levels screen
- [ ] From there the Map/Grid toggle still works and still remembers the choice
- [ ] Below 1100px, reload: the ATC card is back exactly as it is today

**Checklist — nothing lost.**

- [ ] At level 4 with Checkpoint 1 pending, the map says READY TO SIT and clicking
      it starts the exam — the thing only the card could do before
- [ ] The daily challenge, the streak card and the mock-test square are unmoved

**Not verifiable from the repo.** Whether a checkpoint mark is a comfortable click
target at 1100px, and whether losing the card leaves the page looking sparse.


### The home page opens on the map

**Plan.** Five commits, in order. `_lmBuildModels` comes out of the tier loop so a
level's model is computed once and read twice, with a test that lifts it from
source. `_lmStageHtml` comes out of `_lmRenderMap`, which keeps its signature and
its five call sites. `renderHome` then paints the stage into `#homeMapArea` above
everything it already draws, cached in sessionStorage and dropped when
`apiCompleteRoute` banks a completion. The mock test becomes a square in a row
between the stage and the Operational divider, replacing the ICAO card on desktop.
The modules section stops being emitted when the list comes back empty.

**Criterion.** Stated: after logging in you can see the map on the home page; the
weather module is not there for admin, students or instructors; the mock test is a
small square on the right side, above Operational Level, at the bottom of the map.

`DERIVED` — nothing else on Home is removed, because the map arrives above what is
already there rather than instead of it. The square replaces the ICAO card rather
than joining it, because two entries to one exam on one page is not what "becomes a
square" means. Both the map and the square exist only above 1100px, so below it the
ICAO card stays where it is — otherwise the exam loses its home-page entry on
phones.

**Why, in one line.** The map had no address: there is no Simulator nav button, so
it sat two clicks inside a screen reached from a card.

**Two things reading turned up.** `_lmModels` is a local variable, so nothing
outside `renderLevelMap` can reach it, and `level-map-parity` hand-builds its
fixture rather than lifting that computation — so moving it needs a test of its
own or the suite stays green over a break. And deactivating the Weather module
server-side leaves Home showing "No modules available yet. Check back soon", which
is why the sheet edit alone does not finish the job.

**Checklist — the map.**

- [ ] Above 1100px, the map is the first thing on the home page, without scrolling
- [ ] Pins, flags, counts and checkpoint marks match the levels screen exactly
- [ ] Clicking a pin opens its panel; **Escape** and a click on the map close it
- [ ] Operational Level sits below the map on the home page
- [ ] There is no "Grid view" button on the home page
- [ ] The levels screen still opens on the grid, and its Map/Grid toggle still works
- [ ] Below 1100px, reload: no map on Home, and the page looks as it does today
- [ ] Finish a country, return Home: that pin shows the new count, not the old one
- [ ] With the network failing, an error is visible — the map does not vanish silently

**Checklist — the weather module.**

- [ ] Home shows no Weather module card, and no "No modules available yet" notice
- [ ] The same under VIEW AS student, VIEW AS instructor and VIEW AS admin
- [ ] Set the sheet cell back to ACTIVE and reload: the module returns, no redeploy

**Checklist — the mock test square.**

- [ ] A small square sits at the right, below the map and above the Operational divider
- [ ] It reads as the ICAO test, and clicking it opens the exam
- [ ] The full ICAO card is gone from the card row on desktop — one entry, not two
- [ ] Below 1100px the ICAO card is still in the card row, unchanged
- [ ] Opening Australia's panel does not land behind or on top of the square

**Not verifiable from the repo.** Whether the map and the square land above the
fold, whether login feels slower, and the Modules sheet itself.


### The map's cards become panels that hang off their own pin

**Plan.** Rewrite the pin/card block: each country becomes an anchor holding a pin
button — flag, country, `n/m` — and a panel of its levels. Click or Enter opens
it, one at a time, Escape or a click on the map closes. The panel hangs off its
pin, so hand-authored coordinates and the leader lines both go.

**Criterion.** `DERIVED` — "pin chips plus clicks" is the direction given. The
edge flip, single-open and Escape are my inference of what makes it usable.

**Why, in one line.** Grouping fixed levels hiding under levels and replaced it
with cards hiding under cards — India's behind the United Kingdom's, Checkpoint 2
buried under that. Cards that grow rows cannot be placed by hand on a fixed stage.

**Checklist — map open, above 1100px.**

- [ ] Five pins, each showing a flag, its country name and a count like `2/2`
- [ ] Nothing overlaps anything: no panel is visible until one is opened
- [ ] All three checkpoints are readable, none buried
- [ ] Clicking a pin opens its levels; clicking another closes the first
- [ ] **Tab** reaches every pin and **Enter** opens it; **Escape** closes
- [ ] Clicking empty map closes the open panel
- [ ] Australia's panel opens up and to the left, and stays on the map
- [ ] The United States' opens down and to the right
- [ ] Australia lists 3, 8 and 9 — not 10
- [ ] Each row names its tier, and Australia's rows disagree, which is correct
- [ ] Exactly one row is gold, and its panel says "Next level behind your plan"
- [ ] Clicking a row opens that level; **Back** from the simulator returns to the map

**Not verifiable from the repo.** All of it.

### The map is grouped by country, because that is what the curriculum is

**Plan.** One change to the drawing loop: group the models by country and emit one
pin and one card per country instead of one per level. Three things folded in from
the review — tall cards in the lower half grow upward, the country holding the
plan-locked level says so, and every row names its tier.

**Criterion.** `DERIVED` — I proposed grouping and you agreed after seeing the
data. Assumed: that a card reading "Australia · 3, 8, 9" is better than three
cards on one coordinate, and that the map should show the curriculum rather than
pretend nine countries exist.

**The data this was built against**, read from the running catalogue:

| country | levels |
|---|---|
| Australia | 3, 8, 9, 10 |
| India | 1, 5 |
| United Kingdom | 2, 7 |
| USA | 4 |
| Canada | 6 |

**Checklist — map open, above 1100px.**

- [ ] Five pins, one per country, each sitting in its own country
- [ ] Five cards, each naming a country with a count like "1/3"
- [ ] Australia's card lists levels 3, 8 and 9 in that order — **not** level 10
- [ ] India lists 1 and 5; the United Kingdom lists 2 and 7
- [ ] No card overlaps another, and no pin is hidden behind a card
- [ ] Every level 1 to 9 appears exactly once, somewhere
- [ ] Each row shows its tier — Foundation, Advanced or Expert — and Australia's rows disagree with each other, which is correct
- [ ] Exactly one row is gold, and its country card says "Next level behind your plan"
- [ ] Clicking any row opens that level's country screen; **Back** from the simulator returns to the map
- [ ] One leader line per card, joining it to its own pin
- [ ] The Australia card does not run off the bottom of the map
- [ ] Level 10 still appears only in the OPERATIONAL CLEARANCE block below

**Not verifiable from the repo.** Every line above.

### The map loses its route lines and gains leader lines

**Plan.** Three changes, one commit: delete the country-to-country route; draw a
leader from each card to its own pin; stop the card header colliding with a long
tag.

**Criterion.** `DERIVED` — only the green lines were asked for. The header
collision and the unattributable cards were assumed unwanted, since both make the
map harder to read rather than easier.

**Checklist — map open, above 1100px.**

- [ ] No lines run between one country and another
- [ ] A thin dashed line joins each card to its own pin, and it is obvious which card belongs to which country
- [ ] A finished level's leader is faintly green; the rest are grey
- [ ] Every card's header reads "LEVEL n" cleanly, with the level's name on the line below
- [ ] No header shows the level's name twice, or wraps into two jammed columns
- [ ] The pins, the checkpoints, the tier bar and the Operational block are unchanged

**Still open, and the reason this is not finished.** Four levels — 1, 2, 3 and 8 —
draw no card and appear in no "not on the map" strip, which are the only two
outcomes the code has. Waiting on the level-to-country assignment from the
catalogue before diagnosing it; guessing at it twice today was enough.

### The world map draws everything the grid draws

**Plan.** Four changes, one commit: emit `mapCountry` from LevelService beside `tag`;
draw the reward banner from the `vr` already carried in the model; derive the
checkpoint from `AppState.examStatus` — the same five branches `_buildExamCard`
reads — instead of two invented ones; pass the Operational hero through like the
hero bar.

**Criterion.** `STATED`, from the ticket's own inventory: items 2, 6 and 7 appear in
the map, and `mapCountry` is emitted by the server rather than read from nothing.

**Checklist — walk this with the map open, above 1100px wide.**

- [ ] A **Map view** button sits above the level cards. Below 1100px it is not there
- [ ] Pressing it draws a world map; pressing **Grid view** returns, and the choice survives a reload
- [ ] Nine flag pins, each in its country, joined by a dashed route
- [ ] The pin for a finished level has a green ring; the current one amber; a locked one shows a padlock
- [ ] Hovering a card opens its description, its flight phases and its scenario count
- [ ] **Exactly one** card offers "Unlock with a plan", in gold — never two, never seven
- [ ] A level with a reward event shows a gold banner naming it, what it is worth and when it closes
- [ ] A finished level's banner says "Replay for bonus XP"; a locked one says "Unlock to claim this clearance"
- [ ] Each checkpoint reads one of: LOCKED · READY TO SIT · PASSED · ONE ATTEMPT LEFT · REVIEW REQUIRED
- [ ] A passed checkpoint shows the score
- [ ] If the sheet publishes an Operational level, the OPERATIONAL CLEARANCE block appears below the map
- [ ] Clicking any card opens that level's country screen, and **Back** from the simulator returns to the map
- [ ] Every flag renders correctly — none loses its colours to the one before it
- [ ] Nothing in the light theme is invisible
- [ ] A level whose country has no coordinates appears in a "NOT ON THE MAP" strip below, still clickable

**Not verifiable from the repo.** Every line above. They are all geometry or a
browser, which is the reason this checklist exists.

### CLAUDE.md gains the plan / criterion / checklist rule

**Plan.** Append the section as dictated. Create this file, which the section refers to
and which did not exist. Two files, one commit.

**Criterion.** `STATED` — the section appears in CLAUDE.md as written, and WORKLOG.md
exists as the place entries without a ticket ID are recorded.

**Checklist.**

- [ ] CLAUDE.md ends with a section titled "Every piece of work gets a plan, a criterion, and a checklist"
- [ ] Its text is the text that was sent, unedited
- [ ] WORKLOG.md exists and explains what belongs in it
- [ ] Nothing else in CLAUDE.md changed

**Not waiting on this one.** The rule says to produce the three and wait. This was dictated
verbatim with nothing to interpret, so it was applied directly and the rule takes effect
from the next task.
