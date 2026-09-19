/* Three things found on a phone on 2026-09-19, the day the globe shipped:
 *   1. the home page's section loaders showed two diagonal strokes, not a radar;
 *   2. tapping a flag on the phone globe did nothing;
 *   3. a checkpoint opened from the home globe closed onto the Simulator flat
 *      map, in another tab.
 * Plus the decision that came with 3: the Simulator levels screen honours the same
 * Globe / Flat map choice as home, so there is one drawing of the world. */
const fs = require('fs');
const S = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};
function grab(sig, from) {
  const i = S.indexOf(sig, from || 0);
  if (i < 0) throw new Error('not found: ' + sig);
  let d = 0;
  for (let k = S.indexOf('{', i); k < S.length; k++) {
    if (S[k] === '{') d++;
    else if (S[k] === '}') { d--; if (!d) return S.slice(i, k + 1); }
  }
}
const all = (re) => (S.match(re) || []).length;

console.log('--- 1. one radar, drawn once ---');
const loader = grab('function _planeLoaderHtml(label)');
ok('the section loader draws the radar dish',      /_radarDishHtml\('pl-radar'\)/.test(loader));
ok('and not the briefing backdrop',               !/ff-radar-bg/.test(loader));
ok('the full-screen loader draws the same dish',  /window\._radarDishHtml\(\)/.test(grab('function renderRadarLoader(')));
ok('and so does the route-complete screen',       /window\._radarDishHtml\(\)/.test(grab('function renderTrainingFinished(')));
ok('the rings are written out exactly once',      all(/completion-radar-ring r1/g) === 1);

console.log('--- 2. a tap on the phone globe picks a country ---');
const mount = grab('function _globeMount(wrap, opts)');
ok('a short touch is a tap, not a drag',          /narrow && travelled < 8 && e\.type === 'pointerup'/.test(mount));
ok('and it is hit-tested against the countries',  /pickAt\(e\.clientX, e\.clientY\)/.test(mount));
ok('only countries you can see can be picked',    /if \(k\.el\.style\.visibility === 'hidden'\) continue;/.test(mount));
ok('the globe holds still on the picked country', /g\.frozen = !!picked \|\|/.test(mount));
ok('and tells the page which one',                /new CustomEvent\('globepick'/.test(mount));
const wire = grab('function _globeOrbitWire(wrap)');
ok('the bottom band shows its levels, cut from its own panel', /\.lm-pop \.lm-row/.test(wire) && /cloneNode\(true\)/.test(wire));
ok('or a tapped checkpoint\'s card',              /\.lm-cp\[data-exam="/.test(wire));
ok('with a way back to the level in progress',    /window\._globePick\(null\)/.test(wire));
ok('it starts on the level in progress',          /show\(null\);\s*\}$/.test(wire));
ok('and the home page wires it',                  /if \(narrow\) _globeOrbitWire\(wrap\);/.test(S));
ok('checkpoints can be tapped too',               /for \(var q = 0; q < marks\.length; q\+\+\) \{\s*var k = marks\[q\];/.test(mount));
ok('the planet makes room for the bands',         /this\.cy = this\.inset\.top \+ avail \/ 2;/.test(S));
ok('the phone frame is not out-ranked by the desktop height',
   /\.lm-stage-wrap\.globo-wrap\.globo-wrap--narrow \{/.test(fs.readFileSync(__dirname + '/../Styles.html', 'utf8')));

console.log('--- one aeroplane ---');
ok('the plane icon is the app\'s dart',            /plane:\s*'<path d="M12 2 L19 20 L12 16\.5 L5 20 Z"\/>'/.test(S));
ok('no decorative aeroplane over the tour, the paywall or an expired session',
   !/uiIcon\('plane', 30\)/.test(S));
ok('and no aeroplane emoji left in the client or the crew screen',
   !/&#9992;/.test(S) && !/&#9992;/.test(fs.readFileSync(__dirname + '/../GamificationUI.html', 'utf8')));

console.log('--- 3. an overlay closes onto the screen it opened over ---');
// Run the real helper.
const win = { _navLabel: 'Progress' };
let reported = null, fell = false;
win._reportClientError = (src) => { reported = src; };
win.renderSimulatorPlaceholder = () => { fell = true; };
new Function('window', S.slice(S.indexOf('  window._setRedrawScreen = function'),
                                S.indexOf('  // Incremented only when the user navigates')))(win);
let drew = null;
win._overlayGoBack(() => { drew = 'home'; });
ok('a known screen is redrawn',                    drew === 'home' && !fell && !reported);
win._overlayGoBack(null);
ok('an unknown one falls back to the levels screen', fell);
ok('and is reported, not guessed',                 reported === 'overlayReturn');
const nav = grab('function setActiveNav(label)');
ok('a new tab forgets the last screen',            /window\._redrawScreen = null;/.test(nav));
[['function renderHome()', 'renderHome'],
 ['function renderSimulatorPlaceholder()', 'renderSimulatorPlaceholder'],
 ['function renderLMSHub()', 'renderLMSHub']].forEach(([sig, fn]) => {
  ok(fn + ' says how it is redrawn', new RegExp('window\\._setRedrawScreen\\(' + fn + '\\)').test(grab(sig)));
});
// Both overlays, and both of their _goHome copies.
ok('both overlays close through the helper',       all(/function _goHome\(\) \{ window\._overlayGoBack\(_back\); \}/g) === 2);
ok('and none still jumps to the levels screen',
   !/function _goHome\(\) \{\s*if \(typeof window\.renderSimulatorPlaceholder/.test(S));
['function _examOpen(examNum)', 'function _examViewResult(examNum)', 'function _placementOpen()'].forEach(sig => {
  ok(sig.replace('function ', '') + ' remembers where it was opened',
     /^\s*_back = window\._redrawScreen \|\| null;/m.test(grab(sig).split('\n').slice(1, 3).join('\n')));
});

console.log('--- and one drawing of the world ---');
const levels = grab('  function renderLevelMap(data) {');
ok('the levels screen mounts the globe when it is the choice',
   /_lmHomeView\(\) === 'globe' &&\s*_globeMount\(/.test(levels));
ok('and offers the same switch',                   /_homeViewSwitch\(_lmHomeView\(\)\)/.test(grab('function _lmRenderMap(')));
ok('which redraws the screen it is pressed on',
   /window\._redrawScreen\(\); else renderHome\(\);/.test(S.slice(S.indexOf('window._lmSetHomeView = function'))));

console.log(fails ? ('\n' + fails + ' FAILING') : '\nall green');
process.exit(fails ? 1 : 0);
