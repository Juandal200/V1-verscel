/* A duel is decided by the server, and the paper carries no answers.
 *
 * This replaces challenge-toast.test.js, which guarded the ordering bug in
 * F-0028 — the toast read `_gam.targetName` after `_gamCloseModal()` had set it
 * to null. Both of those functions are gone: the modal with its scenario list
 * and its type-your-own-score box was replaced by a five-question duel. A test
 * for a code path that no longer exists passes or fails on nothing, so the
 * subject moved rather than the file being kept green out of habit.
 *
 * What is worth guarding now is different and larger. Two things decide whether
 * this feature is honest:
 *
 *   the answer never reaches the browser — if correctIndex is in the payload,
 *   the page source is the answer key and the duel is theatre;
 *
 *   the score and the clock are the server's — a result the client computes is
 *   a result the client chooses, and the tie-break is time.
 *
 * Both are structural, and both are the kind of thing that gets undone by
 * somebody adding a convenience field months from now.
 */
const fs = require('fs');
const G  = fs.readFileSync(__dirname + '/../Gamification.js', 'utf8');
const S  = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
let fails = 0;
const ok = (n, c, d) => { if (!c) fails++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c || !d ? '' : '   ' + d)); };

/* The builder of what the pilot is sent, bounded by the next function. */
const pfp = (G.match(/function _gamPaperForPlay_[\s\S]*?\n\}\n/) || [''])[0];

console.log('--- the answer stays on the server ---');
ok('_gamPaperForPlay_ exists', pfp !== '');
ok('and never puts correctIndex in what it returns',
   pfp !== '' && !/correctIndex/.test(pfp));
/* The client must not be reading it either, whatever the server sends. */
ok('no client code reads a correctIndex off a challenge payload',
   !/_duel[\s\S]{0,4000}?correctIndex/.test(S));

console.log('--- the score is counted where it cannot be chosen ---');
ok('_gamScorePaper_ compares against the sheet, not against the payload',
   /function _gamScorePaper_[\s\S]*?q\.correctIndex/.test(G));
const submit = (G.match(/function submitChallengeResult[\s\S]*?\n\}\n/) || [''])[0];
ok('submitChallengeResult exists', submit !== '');
ok('and scores by calling the scorer rather than trusting a number sent in',
   submit !== '' && /_gamScorePaper_\(/.test(submit));
/* The signature is the guard: a `correct` parameter would be a number the
 * browser supplies, and no amount of care downstream fixes that. */
ok('its signature takes answers, not a score',
   /function submitChallengeResult\(sessionToken, challengeId, answers\)/.test(G));

console.log('--- the clock is the server\'s ---');
ok('elapsed time is measured from a stored stamp',
   submit !== '' && /_Started_At/.test(submit) && /Date\.now\(\) - new Date\(/.test(submit));
ok('and it is capped so an abandoned paper cannot run forever',
   submit !== '' && /Math\.min\(capMs/.test(submit));
ok('no elapsed time is read out of the submitted payload',
   submit !== '' && !/answers\.(ms|elapsed|time)/.test(submit));

console.log('--- both pilots get the one paper ---');
ok('the drawn paper is frozen on the row', /PaperJson/.test(G));
ok('and the options are shuffled once, at draw time, not per fetch',
   /function _gamDrawPaper_[\s\S]*?_gamShuffle_\(opts\.map/.test(G));
const forPlay = pfp;
ok('serving it reuses the stored order rather than reshuffling',
   forPlay !== '' && /p\.order\.map/.test(forPlay) && !/_gamShuffle_/.test(forPlay));

console.log('--- the duel stays hidden until somebody starts one ---');
/* It did not. `display: flex` on the overlay outranks the browser's own
 * `[hidden] { display: none }`, so the panel rendered empty on every visit to
 * Crew while the script dutifully set an attribute that changed nothing. Any
 * rule that gives this overlay a display needs the attribute spelled out
 * alongside it. */
const UI = fs.readFileSync(__dirname + '/../GamificationUI.html', 'utf8');
ok('the overlay sets a display, which is why this matters',
   /\.gam-duel-overlay \{[^}]*display:\s*flex/.test(UI));
ok('and [hidden] is spelled out so it still wins',
   /\.gam-duel-overlay\[hidden\]\s*\{[^}]*display:\s*none/.test(UI));
ok('the markup ships hidden', /id="gamDuel"[^>]*\shidden/.test(UI));

console.log('--- nothing shows a raw null to a pilot ---');
/* F-0028 was a null reaching the screen. The shape is gone, the lesson is not. */
const result = (S.match(/function _duelResult[\s\S]*?\n  \}\n/) || [''])[0];
ok('_duelResult exists', result !== '');
ok('and interpolates no bare null or undefined',
   result !== '' && !/\+\s*(null|undefined)\b/.test(result));

console.log('--- every sound the duel asks for exists ---');
/* 'click' was passed to _duelSound for a week. SimAudio does not return a click,
 * the guard inside _duelSound returned quietly, and every tap and countdown tick
 * played nothing — while the one real name in the set, 'wrong', worked and made
 * the audio look fine. A sound that does not play is invisible from the code and
 * from the screen, so the names are compared against what SimAudio returns. */
const simReturn = (S.match(/return \{ squelch[\s\S]*?\};/) || [''])[0];
const simNames = new Set([...simReturn.matchAll(/([a-zA-Z_$][\w$]*)\s*:/g)].map(m => m[1]));
ok('SimAudio\'s export was found', simNames.size > 0, [...simNames].join(' '));
const asked = [...S.matchAll(/_duelSound\(\s*'([a-zA-Z_$][\w$]*)'/g)].map(m => m[1]);
const ternary = [...S.matchAll(/_duelSound\([^)]*\?\s*'([a-zA-Z_$]+)'\s*:\s*'([a-zA-Z_$]+)'/g)]
  .flatMap(m => [m[1], m[2]]);
const wanted = [...new Set(asked.concat(ternary))];
console.log('    asks for: ' + wanted.join(' '));
const missing = wanted.filter(n => !simNames.has(n));
if (missing.length) missing.forEach(n => console.log('        SimAudio has no ' + n));
ok(`${missing.length} sounds named that SimAudio does not have`, missing.length === 0);

console.log('--- the quiz music plays on a context that is awake ---');
/* The duel was silent on the music alone while every SimAudio sound worked, and
 * the reason was two contexts: SimAudio's, unlocked by the rest of the app, and
 * a brand new one built by _lmsStartQuizMusic. A context created outside a user
 * gesture starts suspended and its currentTime is frozen, so the melody was
 * scheduled at instant zero on a clock that never moved. Restarting it made a
 * second suspended context and the loop went round again.
 *
 * It borrows SimAudio's now. Which makes closing it somebody else's business —
 * a closed context cannot be reopened, and taking the cockpit's audio down with
 * a quiz would be a worse bug than the silence this replaces. */
ok('SimAudio exposes its context', /context:\s*_ctx/.test(S));
/* Checked inside the function, not anywhere in the file. The first version of
 * this assertion only looked for the string SimAudio.context() somewhere in
 * Scripts.html, so deleting the fallback guard and going back to building a
 * context unconditionally left it green — a check that passes through the defect
 * it exists for. */
const music = (S.match(/function _lmsStartQuizMusic\(\)[\s\S]*?\n    \}/) || [''])[0];
ok('_lmsStartQuizMusic was found', music !== '', String(music.length));
ok('it asks SimAudio for the context', music !== '' && /SimAudio\.context\(\)/.test(music));
ok('and only builds its own when there is none to borrow',
   music !== '' && /if \(!ctx\) ctx = new \(window\.AudioContext/.test(music));
ok('and unlocks it before scheduling', /_lmsQuizCtxBorrowed/.test(S));
ok('a borrowed context is never closed',
   /if \(!window\._lmsQuizCtxBorrowed\) \{ try \{ window\._lmsQuizAudioCtx\.close\(\)/.test(S));

console.log('--- finishing a duel counts as a day ---');
/* The streak was never simulator-only: attempts, the daily challenge and two LMS
 * surfaces all bank it. The duel was new and claimed nothing, so an evening
 * spent duelling lost a streak that had been earned.
 *
 * Banked on the scored paper and not on the draw: createChallenge hands out
 * questions, and a day that counts for opening a screen is not a streak. */
ok('submitChallengeResult banks the day',
   submit !== '' && /lmsUpdateStreak_\(user\.userId\)/.test(submit));
ok('and takes the event, so a freeze can say what it paid for',
   submit !== '' && /lmsTakeStreakEvent_\(\)/.test(submit));
ok('createChallenge does not bank it — drawing a paper is not activity',
   !/function createChallenge[\s\S]*?lmsUpdateStreak_/.test(G.slice(G.indexOf('function createChallenge'),
                                                                     G.indexOf('function getChallengePaper'))));

console.log(fails ? '\n' + fails + ' FAILING' : '\nAll challenge-duel assertions passed.');
process.exit(fails ? 1 : 0);
