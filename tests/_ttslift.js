/* Lift the real TTS pronunciation chain out of TTSService.js and run it.
 *
 * The suites that used to live here pasted their own copies in and renamed
 * them. Every one of those copies spaced the digits out — "230" became
 * "2 3 0" — and the product has said "two three zero" for long enough that
 * nobody noticed three green suites asserting the opposite. Nothing is copied
 * now; the methods are taken from the file and called on an object, so `self`
 * and `this` resolve exactly as they do in Apps Script. */
const fs = require('fs');
const SRC = fs.readFileSync(__dirname + '/../TTSService.js', 'utf8');

function braceEnd(s, from) {
  let d = 0;
  for (let k = s.indexOf('{', from); k < s.length; k++) {
    if (s[k] === '{') d++; else if (s[k] === '}') { d--; if (!d) return k + 1; }
  }
  return -1;
}
function grabMethod(name) {
  const i = SRC.indexOf(name + ': function(');
  if (i < 0) return null;
  const s = i + name.length + 2;
  return SRC.slice(s, braceEnd(SRC, s));
}
function grabArrayVar(name) {
  const i = SRC.indexOf('var ' + name + ' = [');
  if (i < 0) return null;
  let d = 0;
  for (let k = SRC.indexOf('[', i); k < SRC.length; k++) {
    if (SRC[k] === '[') d++; else if (SRC[k] === ']') { d--; if (!d) return SRC.slice(i, k + 1) + ';'; }
  }
  return null;
}
const METHODS = ['prepareAtcPronunciation_', '_expandDigitsIcao_', '_icaoDigit_',
                 '_icaoPhoneticLetter_', '_expandAltitude_'];
const missing = METHODS.filter(n => !grabMethod(n));
const designators = grabArrayVar('TELEPHONY_DESIGNATORS');
const TTS = missing.length || !designators ? null : new Function(
  designators + '\nreturn {' + METHODS.map(n => JSON.stringify(n) + ':' + grabMethod(n)).join(',') + '};')();

module.exports = {
  TTS, missing, designators,
  say:    t => TTS.prepareAtcPronunciation_.call(TTS, t),
  digits: t => TTS._expandDigitsIcao_.call(TTS, t),
};
