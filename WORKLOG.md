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
