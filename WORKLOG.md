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
