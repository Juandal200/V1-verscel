/* The hook that re-runs what a commit body claims.
 *
 * CLAUDE.md rule 2 says the REAL output goes in every commit body. Three times
 * in one week the number written was the one expected, not the one printed —
 * the last inside the commit adding a rule about exactly that. Discipline is
 * demonstrably not the mechanism, so this is one.
 *
 * The hook itself shipped broken on the first attempt: it required output
 * indented DEEPER than the `$`, parsed nothing, and passed every message
 * including the ones it exists to reject. A checker that silently approves is
 * worse than no checker. These run it. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HOOK = path.join(__dirname, '..', '.githooks', 'commit-msg');
let fails = 0; const ok = (n, c, d) => { if (!c) fails++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c || !d ? '' : ' — ' + d)); };

function run(body) {
  const f = path.join(os.tmpdir(), 'cmsg-' + Math.random().toString(36).slice(2) + '.txt');
  fs.writeFileSync(f, body);
  const r = spawnSync(process.execPath, [HOOK, f], { encoding: 'utf8' });
  fs.unlinkSync(f);
  return { code: r.status, err: r.stderr || '' };
}

console.log('\nthe commit-msg hook\n');
ok('the hook exists', fs.existsSync(HOOK));
ok('and is executable', !!(fs.statSync(HOOK).mode & 0o111));

// A command whose answer cannot drift: it is computed from the message itself.
const TRUE_N = String(fs.readFileSync(path.join(__dirname, '..', 'CLAUDE.md'), 'utf8')
                        .split('\n').filter(l => l.startsWith('## ')).length);

console.log('\na body that lies about its own output is rejected:');
let r = run("chore: x\n\n  $ grep -c '^## ' CLAUDE.md\n  999\n");
ok('exit code 1', r.code === 1, String(r.code));
ok('and it shows both sides', /body claims/.test(r.err) && /actually prints/.test(r.err));
ok('naming the command',      /grep -c/.test(r.err));

console.log('\na body that tells the truth passes:');
r = run("chore: x\n\n  $ grep -c '^## ' CLAUDE.md\n  " + TRUE_N + "\n");
ok('exit code 0', r.code === 0, String(r.code) + ' ' + r.err);
ok('and says how many it checked', /re-run and matched/.test(r.err));

console.log('\nmulti-line output is compared line for line:');
r = run("chore: x\n\n  $ grep -n '^## ' CLAUDE.md\n  3:## Repo shape\n  87:## wrong\n");
ok('a wrong line in the middle is caught', r.code === 1, String(r.code));

console.log('\nan elided tail is allowed — quoting a prefix is normal:');
r = run("chore: x\n\n  $ grep -n '^## ' CLAUDE.md\n  3:## Repo shape\n");
ok('a true prefix passes', r.code === 0, String(r.code) + ' ' + r.err);

console.log('\n$! means ran-but-not-replayable:');
r = run("chore: x\n\n  $! clasp deployments\n  - AKfycb... @667\n");
ok('it is skipped, not run', r.code === 0, String(r.code));
ok('and reported so nobody thinks it was checked', /NOT re-run/.test(r.err));

console.log('\na body with no commands is not the hook\'s business:');
r = run("chore: just prose\n\nNothing to check here.\n");
ok('passes silently', r.code === 0 && !/REJECTED/.test(r.err));

console.log('\na command that fails still gets compared, not ignored:');
r = run("chore: x\n\n  $ grep -c 'zzz-not-present' CLAUDE.md\n  4\n");
ok('a wrong claim about a failing command is caught', r.code === 1, String(r.code));

/* The bug the first version had: output at the SAME indent as the `$` was not
 * parsed at all, so nothing was compared and everything passed. */
console.log('\nthe regression that made it useless:');
r = run("chore: x\n\n  $ grep -c '^## ' CLAUDE.md\n  999\n");
ok('same-indent output IS parsed and compared', r.code === 1, String(r.code));
r = run("chore: x\n\n    $ grep -c '^## ' CLAUDE.md\n    999\n");
ok('and so is a deeper indent', r.code === 1, String(r.code));

console.log(fails ? ('\n' + fails + ' FAILING') : '\nall green');
process.exit(fails ? 1 : 0);
