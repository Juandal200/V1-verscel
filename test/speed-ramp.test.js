/* The per-level speed ramp must reach the audio.
 * It stopped doing so when lines became pre-rendered: the server returns the rate
 * the FILE was made at and ignores the one asked for, so every level sounded the
 * same. Nothing failed; the difficulty just flattened. */
const fs = require('fs');
const h  = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
// the two functions live far apart in the file, so take each region
const src =
  h.slice(h.indexOf('  function _pickRate()'), h.indexOf('  function _icaoBandFor')) +
  h.slice(h.indexOf('  function _atcLevelFactor'), h.indexOf('  function playBase64Audio'));

let level = 1;
const AppState = { training: { get selectedLevel() { return level; } } };
const M = new Function('window','AppState','Math',
  src + 'return {_pickRate,_atcLevelFactor,_atcPlaybackRate};')({AppState}, AppState, Math);

let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};
const RENDERED = 0.91;                       // what every clip was actually made at
const speed = lv => { level = lv; return M._atcLevelFactor(RENDERED) * RENDERED; };

console.log('--- effective speed rises with the level ---');
const s1 = speed(1), s5 = speed(5), s9 = speed(9);
console.log(`  L1 ${s1.toFixed(3)}   L5 ${s5.toFixed(3)}   L9 ${s9.toFixed(3)}`);
ok('level 1 is slower than level 5', s1 < s5);
ok('level 5 is slower than level 9', s5 < s9);
ok('level 9 is audibly faster than level 1 (>10%)', (s9 - s1) / s1 > 0.10);

console.log('--- it lands on the rate the level asks for ---');
[1,5,9].forEach(lv => { level = lv;
  ok(`L${lv} reaches _pickRate (${M._pickRate().toFixed(3)})`,
     Math.abs(M._atcLevelFactor(RENDERED) * RENDERED - M._pickRate()) < 0.001); });

console.log('--- independent of how the file was rendered ---');
level = 9;
ok('a clip made at 0.80 still reaches the level speed',
   Math.abs(M._atcLevelFactor(0.80) * 0.80 - M._pickRate()) < 0.001);
ok('a clip made at 1.00 still reaches the level speed',
   Math.abs(M._atcLevelFactor(1.00) * 1.00 - M._pickRate()) < 0.001);

console.log('--- a bad or missing rate cannot produce an unusable clip ---');
ok('missing rate falls back, not NaN', isFinite(M._atcLevelFactor(undefined)));
ok('absurd rate is clamped low',  M._atcLevelFactor(99)   >= 0.75);
ok('absurd rate is clamped high', M._atcLevelFactor(0.01) <= 1.45);

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
