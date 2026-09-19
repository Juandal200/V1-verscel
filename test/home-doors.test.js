/* The three doors on the home page: Hangar, Maintenance, Weather.
 *
 * Only Weather has a module. The failure this guards is the quiet one: a door
 * that looks like a way in and does nothing, or a Weather door that opens some
 * other module because it picked by position instead of by topic. */
const fs = require('fs');
const S = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
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

console.log('--- the doors ---');
const doorsHtml = new Function('uiIcon', grab('function _homeDoorsHtml(layout)') + '\nreturn _homeDoorsHtml;')
  (n => '<svg data-icon="' + n + '"></svg>');
const rail = doorsHtml('rail'), row = doorsHtml('row');
const door = (html, name) => (html.match(new RegExp('<button[^>]*aria-label="' + name + '[^"]*"[^>]*>')) || [''])[0];
['Hangar', 'Maintenance'].forEach(n => {
  ok(n + ' says it is coming',        /coming soon/.test(door(rail, n)));
  ok(n + ' is aria-disabled',         /aria-disabled="true"/.test(door(rail, n)));
  ok(n + ' has no action',            !/onclick=/.test(door(rail, n)));
});
ok('Weather opens the weather module', /onclick="_navTo\(_openWeatherModule\)"/.test(door(rail, 'Weather')));
ok('and is not disabled',              !/aria-disabled/.test(door(rail, 'Weather')));
ok('each door draws its own mark',
   ['hangar', 'maintenance', 'weather'].every(n => rail.includes('data-icon="' + n + '"')));
ok('the phone gets the same three doors', row.split('<button').length === rail.split('<button').length);
ok('the map hangs the rail beside the mock test',
   /_homeExamSquare\(\) \+ _homeDoorsHtml\('rail'\)/.test(S));
ok('and the phone draws the row only where there is no map',
   /\(mapShown \? '' : _homeViewSwitch\(homeView\) \+ _homeDoorsHtml\('row'\)\)/.test(S));
ok('and the phone globe carries them in its sheet', /_homeDoorsHtml\('row'\) \+\s*\(exam \?/.test(S));

console.log('--- the Weather door picks by topic ---');
const open = grab('function _openWeatherModule()');
function run(modules) {
  const seen = {};
  const chain = { withSuccessHandler(f) { this.s = f; return this; },
                  withFailureHandler() { return this; },
                  apiModuleGetAll() { this.s({ ok: true, modules }); } };
  new Function('setActiveNav', 'renderRadarLoader', 'google', 'AppState', 'showContentError', 'handleServerError',
               'renderModuleDetail', '_renderModuleRoadmap', 'window', 'var _navToken = 0;\n' + open + '\n_openWeatherModule();')(
    () => {}, () => null, { script: { run: chain } }, {}, () => {}, () => {},
    id => { seen.detail = id; }, () => { seen.list = true; }, { _reportClientError: () => { seen.reported = true; } });
  return seen;
}
const W = (id, topic, unlocked) => ({ moduleId: id, topic, unlocked });
let r = run([W('M1', 'Grammar', true), W('M2', 'Weather', true)]);
ok('one Weather module, open: straight into it, not into the first module', r.detail === 'M2' && !r.list);
r = run([W('M2', ' weather ', true)]);
ok('the topic is matched without case or spaces', r.detail === 'M2');
r = run([W('M2', 'Weather', false)]);
ok('locked: the list, which explains the lock, not the module', !r.detail && r.list && !r.reported);
r = run([W('M1', 'Grammar', true)]);
ok('none: the list, and it is reported', !r.detail && r.list && r.reported);
r = run([W('M2', 'Weather', true), W('M3', 'Weather', true)]);
ok('two: the list, and it is reported, rather than a guess', !r.detail && r.list && r.reported);

console.log(fails ? ('\n' + fails + ' FAILING') : '\nall green');
process.exit(fails ? 1 : 0);
