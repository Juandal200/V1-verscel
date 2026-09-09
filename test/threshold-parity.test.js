/* Two constants, two runtimes, one number that has to agree.
 *
 * T-5 replaced seven loose `|| 2` literals with a named default on each side.
 * That is better, and it is not closure: there are still two independent
 * values — _DEFAULT_REPLAY_THRESHOLD in Scripts.html and
 * DEFAULT_REPLAY_THRESHOLD in ConfigService.js — and nothing compared them.
 * Either could be edited alone and every test would stay green while the
 * simulator allowed a different number of replays than the server graded
 * against. T-6 is exactly that gap; audit #2 found no test covering it.
 *
 * CLAUDE.md: where a genuine boundary forces two copies (client vs Apps
 * Script), add an executable parity test that compares them directly — never a
 * comment asking them to stay in sync. The boundary is real here: the client
 * cannot import from ConfigService.js, and Apps Script cannot import from
 * Scripts.html. So this compares them. */
'use strict';
const fs = require('fs');
const S  = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
const C  = fs.readFileSync(__dirname + '/../ConfigService.js', 'utf8');
const G  = fs.readFileSync(__dirname + '/../Código.js', 'utf8');
let fails = 0; const ok = (n, c, d) => { if (!c) fails++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c || !d ? '' : ' — ' + d)); };

console.log('\nreplay threshold: client and server must agree\n');

const cm = S.match(/var _DEFAULT_REPLAY_THRESHOLD\s*=\s*(\d+)\s*;/);
const sm = C.match(/var DEFAULT_REPLAY_THRESHOLD\s*=\s*(\d+)\s*;/);

console.log('both sides still declare one:');
ok('the client declares _DEFAULT_REPLAY_THRESHOLD', !!cm);
ok('ConfigService declares DEFAULT_REPLAY_THRESHOLD', !!sm);
if (!cm || !sm) { console.log('\ncannot compare'); process.exit(1); }

const client = Number(cm[1]), server = Number(sm[1]);
console.log('\nand they agree:');
ok('client ' + client + ' === server ' + server, client === server,
   'client ' + client + ', server ' + server);

/* Naming a constant is only worth anything if the consumers use it. A literal
 * that creeps back in is the same defect wearing the constant's clothes. */
console.log('\nno consumer has drifted back to a literal:');
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
const Sc = strip(S), Gc = strip(G);
ok('the client never falls back to `|| 2` for a threshold',
   !/replayThreshold\s*\|\|\s*2\b/.test(Sc) && !/_threshold\s*=\s*2\b/.test(Sc));
ok('Código.js never does either',
   !/replayThreshold\s*\|\|\s*2\b/.test(Gc), (Gc.match(/replayThreshold\s*\|\|\s*2\b/g) || []).join(' '));
const named = (Gc.match(/replayThreshold\s*\|\|\s*DEFAULT_REPLAY_THRESHOLD/g) || []).length;
ok('and every server fallback names the constant (' + named + ')', named >= 3, String(named));

/* The client's own uses, too — this is the side a student experiences. */
const clientUses = (Sc.match(/_DEFAULT_REPLAY_THRESHOLD/g) || []).length;
ok('the client constant is actually used (' + clientUses + ')', clientUses >= 3, String(clientUses));

/* Declaration order caught a real bug once: the constant is read by AtcReplayGate,
 * which is inside an IIFE that opens after it. If the declaration ever moves below
 * its first use, the gate silently reads undefined and every replay is free. */
console.log('\nthe declaration still precedes the gate that reads it:');
const decl = Sc.indexOf('var _DEFAULT_REPLAY_THRESHOLD');
const use  = Sc.indexOf('_DEFAULT_REPLAY_THRESHOLD', decl + 10);
ok('declared before its first use', decl !== -1 && use > decl, 'decl ' + decl + ', use ' + use);

console.log(fails ? ('\n' + fails + ' FAILING') : '\nall green');
process.exit(fails ? 1 : 0);
