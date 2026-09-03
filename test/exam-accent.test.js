const fs=require('fs');
const h=fs.readFileSync(__dirname+'/../Scripts.html','utf8');
const a=h.indexOf('  function _icaoCountryForLang(lang) {');
const b=h.indexOf('  var ICAO_REPLAY_MULTIPLIER');
const src=h.slice(a,b);
const pools={USA:['us1','us2'],UK:['gb1'],AUSTRALIA:['au1'],CANADA:['ca1'],INDIA:['in1','in2']};
const warns=[];
const M=new Function('ICAO_TEST_VOICE_POOL','_pickRate','window','console',
  src+'return {_icaoCountryForLang,_icaoVoiceFor,_pickTestVoice};')(
  pools,()=>0.93,{console:{warn:m=>warns.push(m)}},{warn:m=>warns.push(m)});

let fails=0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};

console.log('--- language maps to the accent it names ---');
[['en-US','USA'],['en-GB','UK'],['en-IN','INDIA'],['en-AU','AUSTRALIA'],['en-CA','CANADA'],
 ['en-GB-Standard-A','UK'],['','USA']].forEach(([l,c])=>
  ok(`"${l||'(blank)'}" -> ${c}`, M._icaoCountryForLang(l)===c));

console.log('--- the three versions now sound different ---');
const A=M._icaoVoiceFor({id:'a1',voice:'en-US-Chirp3-HD-Achird',lang:'en-US'});
const B=M._icaoVoiceFor({id:'b1',voice:'en-IN-Chirp3-HD-Enceladus',lang:'en-IN'});
const C=M._icaoVoiceFor({id:'c1',voice:'en-GB-Chirp3-HD-Iapetus',lang:'en-GB'});
ok('A keeps its American voice', A.voice==='en-US-Chirp3-HD-Achird' && A.country==='USA');
ok('B is Indian, not American',  B.voice==='en-IN-Chirp3-HD-Enceladus' && B.country==='INDIA');
ok('C is British, not American', C.voice==='en-GB-Chirp3-HD-Iapetus'  && C.country==='UK');
ok('all three differ', new Set([A.voice,B.voice,C.voice]).size===3);
ok('lang travels to the server', B.lang==='en-IN' && C.lang==='en-GB');

console.log('--- a blank row degrades loudly, not silently ---');
warns.length=0;
const blank=M._icaoVoiceFor({id:'x9',voice:'',lang:'en-IN'});
ok('still uses the right accent pool', pools.INDIA.indexOf(blank.voice)!==-1);
ok('and says so', warns.length===1 && /x9/.test(warns[0]));

console.log('--- the old bug cannot recur ---');
const old=M._icaoVoiceFor({id:'z',voice:'en-IN-Chirp3-HD-Sadachbia',lang:'en-IN'});
ok('an Indian item never returns an American voice', old.voice.indexOf('en-IN')===0);

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
