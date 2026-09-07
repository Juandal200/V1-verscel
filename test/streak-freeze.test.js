/* A freeze that works in silence is a freeze nobody can tell they bought.
 *
 * The mechanism was sound: five hundred XP, stored in the StreakFreezes sheet, and
 * lmsUpdateStreak_ spends one when it finds a gap instead of resetting the count.
 * What was missing was any evidence of it having happened. The snowflake left the
 * top bar at a moment the student was not watching, and the streak it rescued
 * looked exactly like a streak that had never been at risk.
 *
 * The rescue IS the product. Nothing else about the purchase is visible.
 *
 * Two things are worth knowing about the mechanic itself, both true before this
 * and both unchanged: a freeze is spent lazily, on the student's next scoring
 * activity rather than on the night they miss; and one freeze covers a gap of any
 * length, so a forty-day streak survives a six-week absence for five hundred XP. */
const fs = require('fs');
const S = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
const L = fs.readFileSync(__dirname + '/../LMSModuleService.js', 'utf8');
const A = fs.readFileSync(__dirname + '/../Attemptservice.js', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};

console.log('--- the server says what it did ---');
ok('there is a slot for it',        /var _LMS_LAST_STREAK_EVENT_ = null;/.test(L));
ok('and it is cleared on every update, so no news is inherited',
   /_LMS_LAST_STREAK_EVENT_ = null;[\s\S]{0,400}if \(daysDiff === 0\)/.test(L));
ok('a saved streak reports what it saved',
   /_LMS_LAST_STREAK_EVENT_ = \{\s*\n\s*saved:\s*true,[\s\S]{0,200}freezesLeft:/.test(L));
ok('a lost streak reports what it was, before the reset',
   /lost:\s*true,[\s\S]{0,120}streakDays: streakDays,\s*\/\/ what it WAS/.test(L));
ok('reading it clears it, so it cannot be told twice',
   /function lmsTakeStreakEvent_\(\)[\s\S]{0,140}_LMS_LAST_STREAK_EVENT_ = null;\s*\n\s*return e;/.test(L));
// The count is still the return value. Three of the four callers only want that.
ok('the day count is still what the function returns', /\n    return streakDays;/.test(L));

console.log('--- both paths carry it to the client ---');
ok('an attempt does',      (A.match(/streakEvent = lmsTakeStreakEvent_\(\)/g) || []).length === 2);
ok('and both responses include it',
   (A.match(/streakEvent:\s*streakEvent/g) || []).length === 2);

console.log('--- the panel, rendered for real ---');
const grab = (a, b) => S.slice(S.indexOf(a), S.indexOf(b));
const src = grab('var UI_ICONS = {', 'function uiIcon(name, size)') + '\n' +
            grab('function uiIcon(name, size)', 'function uiIconInline') + '\n' +
            grab('function uiIconInline(name, size)', 'function getCountryUi') + '\n' +
            grab('var _pendingStreakEvent', 'function renderShop');
let html = '';
const doc = { createElement: () => ({ className: '', classList: { add() {}, remove() {} },
                set innerHTML(v) { html = v; }, get innerHTML() { return html; } }),
              body: { appendChild() {} } };
const win = {};
const api = new Function('document', 'window', 'requestAnimationFrame', 'setTimeout', 'safeText',
  src + '\n; return { note: noteStreakEvent, show: showPendingStreakEvent };'
)(doc, win, f => f(), () => {}, v => String(v));
const text = () => html.replace(/<svg[\s\S]*?<\/svg>/g, '[mark]')
                       .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

api.note({ saved: true, streakDays: 12, daysMissed: 1, freezesLeft: 2 });
api.show();
console.log('    ' + text());
ok('it says the streak was saved',     /Your streak was saved/.test(html));
ok('it shows the streak that survived', /12/.test(html) && /day streak/.test(html));
ok('it says what was missed',           /You missed a day/.test(html));
ok('and what is left',                  /2 freezes left/.test(html));
ok('the top bar count is corrected from the server, not guessed',
   win._lmsStreakFreezes === 2);

// A gap of more than one day is the case the shop copy does not describe, so the
// panel had better describe it accurately rather than say "a day".
html = '';
api.note({ saved: true, streakDays: 40, daysMissed: 6, freezesLeft: 0 });
api.show();
console.log('    ' + text());
ok('a longer gap is counted honestly',  /You missed 6 days/.test(html));
ok('the last freeze says it was the last', /That was your last freeze/.test(html));
ok('and offers another only when there are none left', /Get another/.test(html));

html = '';
api.note({ lost: true, streakDays: 12, daysMissed: 3 });
api.show();
console.log('    ' + text());
ok('a lost streak is told too, not only a saved one', /Your streak reset/.test(html));
ok('it names what was lost',            /Your 12-day streak/.test(html));
ok('and the new count is one',          />1</.test(html));
ok('the top bar is corrected to match', win._lmsStreakDays === 1);

console.log('--- an ordinary day says nothing ---');
html = '';
api.note(null); api.show();
api.note({ saved: false, lost: false }); api.show();
ok('no panel on a day that changed nothing', html === '');

console.log('--- and it does not land on top of the exercise ---');
// The panel is drawn after the feedback card, not instead of it, and after the
// debrief rather than over it. One piece of news at a time.
ok('after the feedback panel',
   /renderAttemptFeedback\(\{[\s\S]{0,260}\}\);\s*\n\s*showPendingStreakEvent\(\);/.test(S));
ok('and after the debrief, not during it',
   /_injectDebriefTable\(debriefRows\);\s*\n[\s\S]{0,120}setTimeout\(showPendingStreakEvent/.test(S));
ok('the event is noted before anything draws',
   S.indexOf('if (res.streakEvent) noteStreakEvent(res.streakEvent);') <
   S.indexOf('showPendingStreakEvent();'));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
