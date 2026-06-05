// Unit tests for Issue 5 — aircraft type prefix expansion
// Run: node tests/aircraftTypePrefix.test.js

'use strict';

var passed = 0;
var failed = 0;

function assert(label, condition, detail) {
  if (condition) {
    console.log('  ✓ ' + label);
    passed++;
  } else {
    console.error('  ✗ ' + label + (detail ? ' — ' + detail : ''));
    failed++;
  }
}

// ---------- stub matching TTSService.js step 9b ----------

var TYPE_PREFIXES = { 'CRJ':'C R J', 'MD':'M D', 'B':'Boeing', 'A':'Airbus', 'E':'Embraer' };

function expandDigitsIcao(numStr) {
  return String(numStr || '').split('').join(' ');
}

function expandTypePrefix(text) {
  return String(text || '').replace(/\b(CRJ|MD|B|A|E)(\d{2,4})\b/gi, function(_, prefix, digits) {
    return TYPE_PREFIXES[prefix.toUpperCase()] + ' ' + expandDigitsIcao(digits);
  });
}

// ---------- tests ----------

console.log('\nIssue 5 — aircraft type prefix expansion\n');

console.log('Individual type codes:');
assert('B747  → "Boeing 7 4 7"',   expandTypePrefix('B747')  === 'Boeing 7 4 7',   'got "' + expandTypePrefix('B747') + '"');
assert('A320  → "Airbus 3 2 0"',   expandTypePrefix('A320')  === 'Airbus 3 2 0',   'got "' + expandTypePrefix('A320') + '"');
assert('E175  → "Embraer 1 7 5"',  expandTypePrefix('E175')  === 'Embraer 1 7 5',  'got "' + expandTypePrefix('E175') + '"');
assert('MD11  → "M D 1 1"',        expandTypePrefix('MD11')  === 'M D 1 1',         'got "' + expandTypePrefix('MD11') + '"');
assert('CRJ700 → "C R J 7 0 0"',   expandTypePrefix('CRJ700') === 'C R J 7 0 0',   'got "' + expandTypePrefix('CRJ700') + '"');

console.log('\nCase-insensitive input:');
assert('b737 → "Boeing 7 3 7"',    expandTypePrefix('b737')  === 'Boeing 7 3 7',   'got "' + expandTypePrefix('b737') + '"');
assert('a319 → "Airbus 3 1 9"',    expandTypePrefix('a319')  === 'Airbus 3 1 9',   'got "' + expandTypePrefix('a319') + '"');

console.log('\nIn sentence context:');
var sentence = expandTypePrefix('traffic is a B737 on final');
assert('B737 expanded in sentence', sentence.indexOf('Boeing 7 3 7') !== -1, 'got "' + sentence + '"');

console.log('\nEdge cases:');
assert('B7 (too short, 1 digit) — no match', expandTypePrefix('B7') === 'B7');
assert('B12345 (5 digits) — no match',        expandTypePrefix('B12345') === 'B12345');
assert('plain text unchanged',                expandTypePrefix('cleared ILS approach') === 'cleared ILS approach');

// ---------- summary ----------
console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
