const fs=require('fs');
const h=fs.readFileSync(__dirname+'/../Scripts.html','utf8');
const src=h.slice(h.indexOf('  var _ttsVariants = {};'), h.indexOf('  var _TTS_LS_PREFIX'));

let LS={}, sent=[], now=0, timers=[];
function makeRunner(){
  const r={_s:null,_f:null};
  r.withSuccessHandler=f=>{r._s=f;return r;};
  r.withFailureHandler=f=>{r._f=f;return r;};
  r.apiGenerateScenarioVoice=(tok,payload)=>{sent.push({payload,s:r._s,f:r._f});return r;};
  return r;
}
const sandbox={
  _ttsLsGet:k=>LS[k]||null, _ttsLsSet:(k,v)=>{LS[k]=v;},
  setTimeout:(fn,ms)=>{const t={fn,at:now+ms,dead:false};timers.push(t);return t;},
  clearTimeout:t=>{if(t)t.dead=true;},
  AppState:{sessionToken:'tok'},
  google:{script:{get run(){return makeRunner();}}},
  console
};
const advance=ms=>{now+=ms;timers.filter(t=>!t.dead&&t.at<=now).forEach(t=>{t.dead=true;t.fn();});};
const M=new Function(...Object.keys(sandbox),src+`
  return {_ttsFetchVariant,_ttsPickVariant,_ttsVariantList,_ttsBaseKey,_ttsRemember,
          _ttsPending,_ttsWaiters,_TTS_VARIANT_TARGET,_ttsVariants};`)(...Object.values(sandbox));

let fails=0;
const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};
const K=t=>M._ttsBaseKey(t,0.94);

console.log('--- a lost request must not poison the line ---');
sent=[]; let got='none';
M._ttsFetchVariant('s1','CLIMB 5000',0.94,r=>{got=r;});
ok('one request sent', sent.length===1);
ok('line marked in flight', M._ttsPending[K('CLIMB 5000')]===true);
advance(20000);
ok('give-up releases the line', !M._ttsPending[K('CLIMB 5000')]);
ok('waiter told null, not left hanging', got===null);
ok('waiter list drained', !M._ttsWaiters[K('CLIMB 5000')]);
sent=[]; M._ttsFetchVariant('s1','CLIMB 5000',0.94,()=>{});
ok('line requestable again', sent.length===1);

console.log('--- concurrent callers share one round-trip ---');
sent=[]; let n=0;
for(let i=0;i<3;i++) M._ttsFetchVariant('s2','TURN LEFT',0.94,()=>n++);
ok('three callers, one request', sent.length===1);
sent[0].s({ok:true,audioBase64:'AAA',voiceName:'Achird'});
ok('all three served', n===3);

console.log('--- filed under the voice actually returned ---');
sent=[]; M._ttsFetchVariant('s3','HOLD SHORT',0.94,null);
ok('request names no voice', !('voice' in sent[0].payload));
sent[0].s({ok:true,audioBase64:'BBB',voiceName:'Fenrir'});
ok('stored under returned voice', !!M._ttsVariants[K('HOLD SHORT')]['Fenrir']);
ok('retrievable', M._ttsVariantList(K('HOLD SHORT')).length===1);

console.log('--- variety without extra round-trips ---');
sent=[];
['Achird','Fenrir','Puck'].forEach(v=>{
  M._ttsFetchVariant('s5','LINE UP',0.94,null);
  const last=sent[sent.length-1]; last.s({ok:true,audioBase64:'X'+v,voiceName:v});
});
ok('three variants held', M._ttsVariantList(K('LINE UP')).length===3);
const seen=new Set(); for(let i=0;i<300;i++) seen.add(M._ttsPickVariant(K('LINE UP')).audioBase64);
ok('replays span all three', seen.size===3);

console.log('--- failures and late replies ---');
sent=[]; M._ttsFetchVariant('s6','MAYDAY',0.94,null);
sent[0].s({ok:false,message:'nope'});
ok('failure not stored as audio', M._ttsVariantList(K('MAYDAY')).length===0);
ok('failure releases the line', !M._ttsPending[K('MAYDAY')]);

sent=[]; let calls=0;
M._ttsFetchVariant('s7','DESCEND',0.94,()=>calls++);
advance(20000);
sent[0].s({ok:true,audioBase64:'LATE',voiceName:'Puck'});
ok('late reply does not serve twice', calls===1);

sent=[]; let c2=0;
M._ttsFetchVariant('s8','SQUAWK',0.94,()=>c2++);
sent[0].f('network down');
ok('failure handler serves the waiter', c2===1);
advance(30000);
ok('and the timer does not fire again', c2===1);

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
