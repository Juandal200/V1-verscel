/* The scripted sitting had no audio cache at all: every replay re-downloaded the
 * whole MP3 through Apps Script and a Drive read, on the one screen where the
 * candidate is under a clock. */
const fs = require('fs');
const h  = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
const src = h.slice(h.indexOf('  var _scAudio   = {};'), h.indexOf('  function _scSpeak'));

let sent=[], now=0, timers=[];
function runner(){ const r={};
  r.withSuccessHandler=f=>{r._s=f;return r;};
  r.withFailureHandler=f=>{r._f=f;return r;};
  r.apiGetIcaoTestAudio=(t,id,bank)=>{sent.push({id,bank,s:r._s,f:r._f});return r;};
  return r; }
const _sc={bank:'VERSION_B'};
const M=new Function('_sc','AppState','google','setTimeout','clearTimeout',
  src+'return {_scFetchAudio,_scAudioReset,_scAudioKey,peek:function(){return _scAudio;}};')(
  _sc,{sessionToken:'t'},{script:{get run(){return runner();}}},
  (fn,ms)=>{const t={fn,at:now+ms,dead:false};timers.push(t);return t;},
  t=>{if(t)t.dead=true;});
const advance=ms=>{now+=ms;timers.filter(t=>!t.dead&&t.at<=now).forEach(t=>{t.dead=true;t.fn();});};

let fails=0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};
const STEP={id:'audio_01'};

console.log('--- a replay does not re-download ---');
sent=[]; let got=[];
M._scFetchAudio(STEP, r=>got.push(r));
ok('first play fetches', sent.length===1);
ok('the bank travels with it', sent[0].bank==='VERSION_B');
sent[0].s({ok:true,audioBase64:'MP3',source:'drive'});
ok('first play served', got.length===1 && got[0].audioBase64==='MP3');
sent=[];
M._scFetchAudio(STEP, r=>got.push(r));
ok('replay served from cache, no request', sent.length===0 && got.length===2);

console.log('--- a replay pressed twice makes one request ---');
sent=[]; M._scAudioReset(); let n=0;
M._scFetchAudio({id:'audio_02'}, ()=>n++);
M._scFetchAudio({id:'audio_02'}, ()=>n++);
ok('one request for two callers', sent.length===1);
sent[0].s({ok:true,audioBase64:'X'});
ok('both callers served', n===2);

console.log('--- a lost request does not strand the item ---');
sent=[]; M._scAudioReset(); let r1='none';
M._scFetchAudio({id:'audio_03'}, r=>{r1=r;});
advance(25000);
ok('waiter released with null', r1===null);
sent=[]; M._scFetchAudio({id:'audio_03'}, ()=>{});
ok('the item can be retried', sent.length===1);

console.log('--- a failed fetch is never cached as audio ---');
sent=[]; M._scAudioReset();
M._scFetchAudio({id:'audio_04'}, ()=>{});
sent[0].s({ok:false,error:'nope'});
ok('not stored', !M.peek()['VERSION_B|audio_04']);

console.log('--- a new paper never serves the old one’s recordings ---');
sent=[]; M._scAudioReset();
M._scFetchAudio({id:'line_open'}, ()=>{});
sent[0].s({ok:true,audioBase64:'INDIAN'});
ok('cached under its own paper', !!M.peek()['VERSION_B|line_open']);
_sc.bank='VERSION_C'; M._scAudioReset();
sent=[]; M._scFetchAudio({id:'line_open'}, ()=>{});
ok('same item id on a new paper refetches', sent.length===1 && sent[0].bank==='VERSION_C');

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
