/* It is an Aviation English campus. Every word a student reads is in English.
 *
 * Spanish had settled into three places: the level map told a locked student
 * "Completa el nivel anterior", every plan on the subscription screen was written in
 * Spanish, and the cockpit demo narrated itself in Spanish throughout. All of it was
 * student-facing, on the screens where somebody decides whether to pay.
 *
 * A person's name in a placeholder is not copy — "e.g. Carlos Ramírez" is an example
 * of a name, and names are not translated. */
const fs = require('fs');
const S  = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};

const SPANISH = /[áéíóúñ¿¡]|\b(nivel|niveles|completa|acceso|intentos|examen|d[ií]as|simulaci[oó]n|emergencias|fallas|pago|transmisi[oó]n|autorizaci[oó]n|activado|mes|meses|todos los|primeros|a medida|descargables|generando|verificando|s[ií]ntesis)\b/i;

/* A placeholder name is an example, not a sentence. */
const NOT_COPY = /placeholder="e\.g\./i;

console.log('--- no Spanish in anything a student reads ---');
const found = [];
S.split('\n').forEach((l, i) => {
  if (NOT_COPY.test(l)) return;
  (l.match(/'[^']{2,140}'/g) || []).forEach(str => {
    if (!SPANISH.test(str)) return;
    if (/function|\.js|https?:|var |espa/i.test(str)) return;
    found.push((i + 1) + ': ' + str.slice(0, 70));
  });
});
if (found.length) found.slice(0, 10).forEach(f => console.log('      ' + f));
ok('no Spanish strings remain', found.length === 0);

console.log('--- the screens it was on ---');
const near = (needle, span) => {
  const i = S.indexOf(needle);
  return i < 0 ? '' : S.slice(Math.max(0, i - 600), i + span);
};
ok('the level map lock is in English',
   /Complete the previous level/.test(S) && !/Completa el nivel/.test(S));
ok('the plan cards are in English',
   /Every level, including Operational levels/.test(S) && !/Todos los niveles/.test(S));
ok('the plan features are in English',
   /Engine failure, smoke and fire on board/.test(S) && !/Fallas de motor/.test(S));
ok('payment feedback is in English',
   /Payment not found yet/.test(S) && !/Pago no encontrado/.test(S));
ok('the cockpit demo is in English',
   /ATC transmission playing/.test(S) && !/Transmisi&oacute;n ATC activa|Transmisión ATC activa/.test(S));
ok('its phase hints are in English',
   /Take-off clearance\. Confirm the runway/.test(S) && !/Autorizaci[oó]n de despegue/.test(S));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
