/* The home page's globe.
 *
 * Three of its defects were invisible from the code and obvious on a screen, so
 * each is asserted here on the engine itself, lifted from source and run on a
 * stand-in canvas:
 *   - the planet mirrored east-west (Britain west of Illinois),
 *   - dragging moving the planet against the finger,
 *   - the world read back from Natural Earth pixels as if they were degrees,
 *     which put Alaska 30 degrees off.
 * And the parts that can only be read — the loop ending, the far side being
 * unreachable — are read. */
const fs = require('fs');
const S = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
const M = fs.readFileSync(__dirname + '/../MapData.html', 'utf8');
const G = fs.readFileSync(__dirname + '/../tools/gen-map.mjs', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};
function grab(sig) {
  const i = S.indexOf(sig);
  if (i < 0) throw new Error('not found: ' + sig);
  let d = 0;
  for (let k = S.indexOf('{', i); k < S.length; k++) {
    if (S[k] === '{') d++;
    else if (S[k] === '}') { d--; if (!d) return S.slice(i, k + 1); }
  }
}
const ctx = new Proxy({}, { get: (t, k) => k in t ? t[k] : (() => ({ addColorStop() {} })), set: (t, k, v) => (t[k] = v, true) });
const canvas = { getContext: () => ctx, getBoundingClientRect: () => ({ width: 1000, height: 720 }), width: 0, height: 0 };
const eng = new Function('window', [
  'var _GLOBE_DEG = Math.PI / 180;',
  grab('function _globeUnit(lon, lat)'), grab('function _globeSky(count)'),
  grab('function _Globe(canvas, geo)'),
  ...['setCanvas', 'resize', '_trig', 'project', 'lookAt', 'drag', '_clamp', 'step']
    .map(m => grab('_Globe.prototype.' + m + ' = function') + ';'),
  'return { Globe: _Globe, unit: _globeUnit };'
].join('\n'))({ devicePixelRatio: 1 });
const g = new eng.Globe(canvas, { land: [], borders: [] });
const at = (lon, lat) => { g._trig(); return g.project(eng.unit(lon, lat)); };

console.log('--- the planet is seen from outside ---');
g.lookAt(0, 50, 0, 1, 80);
ok('Paris is east of London',        at(2.35, 48.86)[0] > at(-0.13, 51.5)[0]);
ok('Edinburgh is north of London',   at(-3.19, 55.95)[1] < at(-0.13, 51.5)[1]);
g.lookAt(-40, 0, 0, 1, 80);
ok('Britain is east of Illinois',    at(-2, 54)[0] > at(-89, 40)[0]);

console.log('--- it starts on the level in progress ---');
g.lookAt(134, -25.3, 16, 0.5, 28);       // Australia, as the desktop home frames it
const au = at(134, -25.3);
ok('it is on the near side',         au[2] > 0.5);
ok('and left of centre, so the next stop fits in view', au[0] < g.cx && au[0] > g.cx - g.R);

console.log('--- the planet moves with the finger ---');
g.lookAt(0, 0, 0, 1, 80);
let before = at(0, 0)[0];
g.drag(20, 0, 0.32, 0.26);
ok('dragging right moves the ground right', at(0, 0)[0] > before);
before = at(0, 0)[1];
g.drag(0, 20, 0.32, 0.26);
ok('dragging down moves the ground down',   at(0, 0)[1] > before);
g.lookAt(0, 0, 0, 1, 80); g.idle = true; g.vel = 0;
before = at(0, 0)[0];
g.step(1, true);
ok('at rest it turns eastward, as the Earth does', at(0, 0)[0] > before);

console.log('--- nothing moves under an open panel, or for reduced motion ---');
g.lookAt(0, 0, 0, 1, 80); g.frozen = true; g.vel = 30;
before = g.rot.lon; g.step(1, true);
ok('frozen: it stays put, and the throw is dropped', g.rot.lon === before && g.vel === 0);
g.frozen = false; g.vel = 0; g.idle = true; const t0 = g.t;
before = g.rot.lon; g.step(1, false);
ok('reduced motion: no drift and no flights',     g.rot.lon === before && g.t === t0);

console.log('--- the world is in degrees, from the generator ---');
ok('MapData.html carries LM_GLOBE',            /window\.LM_GLOBE = \{/.test(M));
ok('and gen-map.mjs is what writes it',         /window\.LM_GLOBE = \{/.test(G) && /ringsOf\(landGeo\)/.test(G));
const land = (M.match(/LM_GLOBE = \{\s*land: '([^']*)'/) || [])[1] || '';
const pts = [...land.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map(m => [+m[1], +m[2]]);
const near = (lon, lat, tol) => pts.some(p => Math.abs(p[0] - lon) < tol && Math.abs(p[1] - lat) < tol);
ok('a coast within a degree of Sydney',        near(151.2, -33.9, 1));
ok('and of Anchorage, which pixels put 30 off', near(-149.9, 61.2, 1.5));
ok('every vertex is a real lon/lat',           pts.length > 3000 && pts.every(p => Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90));

console.log('--- the pins are the flat map\'s, placed by the app\'s coordinates ---');
const stage = grab('function _lmStageHtml(models, tiers, vrSlot, overlayHtml)');
ok('each country carries its lon/lat',    /data-lon="' \+ g\.place\.lon \+ '" data-lat="' \+ g\.place\.lat/.test(stage));
ok('and each checkpoint',                 /data-lon="' \+ at\.lon \+ '" data-lat="' \+ at\.lat/.test(stage));
ok('the prototype\'s plate-carree inverse is not here', !/x \/ 1600 \* 360 - 180/.test(S));

console.log('--- what can only be read ---');
const mount = grab('function _globeMount(wrap, opts)');
ok('the far side is hidden, not only transparent', /style\.visibility = hide \? 'hidden'/.test(mount));
ok('and cannot be clicked',                        /style\.pointerEvents = hide \? 'none'/.test(mount));
ok('the loop ends when its canvas leaves the page', /if \(!canvas\.isConnected\) \{ stop\(\);/.test(mount));
ok('one globe at a time',                          /if \(_globeActive\) \{ _globeActive\.stop\(\);/.test(mount));
ok('pointer capture cannot throw out of a drag',   /try \{ wrap\.setPointerCapture\(pid\); \} catch/.test(mount));
ok('the flat fitter leaves a globe alone',
   /if \(wrap\.classList\.contains\('globo-wrap'\)\) return;/.test(grab('function _lmFitStage()')));

console.log(fails ? ('\n' + fails + ' FAILING') : '\nall green');
process.exit(fails ? 1 : 0);
