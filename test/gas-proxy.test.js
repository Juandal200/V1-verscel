/* The proxy is where a slow Apps Script becomes a message the student sees.
 *
 * Two things must hold: a timeout comes back as structured JSON the UI can render
 * rather than a killed function returning nothing, and the log names WHICH call was
 * slow — without that a 45-second failure is indistinguishable from any other. */
const path = require('path');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};

(async () => {
  const handler = (await import(path.join(__dirname, '..', 'api', 'gas.mjs'))).default;

  const mkRes = () => { const r={_h:{},_code:0,_json:null,
    setHeader(k,v){this._h[k]=v;}, status(c){this._code=c;return this;},
    json(o){this._json=o;return this;}, end(){return this;}}; return r; };

  const warn=console.warn, log=console.log;
  const realFetch = global.fetch;

  console.log('--- a call that cannot complete still answers usefully ---');
  const logs2=[]; console.warn=m=>logs2.push(String(m)); console.log=m=>logs2.push(String(m));
  global.fetch = () => Promise.reject(Object.assign(new Error('boom'),{name:'AbortError'}));
  res = mkRes();
  await handler({method:'POST', body:{action:'apiSubmitAttempt', args:[]}}, res);
  console.warn=warn; console.log=log; global.fetch = realFetch;

  ok('answers 200, not a dead function', res._code===200);
  ok('body says it failed',              res._json && res._json.ok===false);
  ok('carries a message the UI can show',/took too long/.test(res._json.message||''));
  ok('log names which call was slow',    logs2.some(l=>/apiSubmitAttempt/.test(l)));
  ok('log says it timed out',            logs2.some(l=>/timed out/.test(l)));

  // 3. a call with no action still logs something usable
  const logs3=[]; console.warn=m=>logs3.push(String(m));
  global.fetch = () => Promise.reject(Object.assign(new Error('x'),{name:'AbortError'}));
  res = mkRes();
  await handler({method:'POST', body:{}}, res);
  console.warn=warn; global.fetch = realFetch;
  ok('a nameless call logs "unknown", not undefined', logs3.some(l=>/unknown/.test(l)));

  console.log(fails?('\n'+fails+' FAILING'):'\nall green');
  process.exit(fails?1:0);
})();
