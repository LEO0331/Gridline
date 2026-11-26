'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {once}=require('node:events');
const {compileDataset,loadEnrichment}=require('../enrichment');
const {createSensor}=require('../sensor');
const {createHistory}=require('../history');
const {parseImport}=require('../restore');
const {toCsv}=require('../csv');
const {createOperator}=require('../operator');
const {createServer}=require('../server');
const at=Date.parse('2026-01-03T00:00:00Z'),range={from:'2026-01-03',to:'2026-01-03'};
const password='synthetic-dashboard-password-0123456789';
const env={ENABLE_PASSIVE_PROBE_SENSOR:'true',ENABLE_SENSOR_DASHBOARD:'true',SENSOR_OPERATOR_PASSWORD:password};
const auth='Basic '+Buffer.from('operator:'+password).toString('base64');
const direct={...env,SENSOR_NETWORK_MODE:'direct',SENSOR_TOPOLOGY_VERIFIED:'true',SENSOR_HMAC_SECRET:'synthetic-key-for-test-only-1234567890'};
const req=(url,ua='Googlebot')=>({url,method:'GET',headers:{'user-agent':ua},socket:{remoteAddress:'8.8.8.8'}});
const dataset={version:1,generatedAt:new Date(at).toISOString(),geo:[{cidr:'8.8.0.0/16',country:'US',asn:'AS123'},{cidr:'8.8.8.0/24',country:'TW',asn:'AS456'},{cidr:'2600::/16',country:'JP',asn:null}],bots:[{cidr:'8.8.8.0/24',bot:'googlebot'}]};
function fixture(start=at,paths=['/.env']){
  let now=start;const s=createSensor({env,now:()=>now});
  for(const path of paths)s.observe(req(path),404);
  now+=300000;return s.flush();
}
const csvHeader='window_start_utc,window_end_utc,dimension,key,count\n';
test('local prefix enrichment longest match, IPv6 and stale fail closed',()=>{
  let now=at;const e=compileDataset(dataset,{now:()=>now,geo:true,bots:true});
  assert.deepEqual(e.lookup('8.8.8.8','googlebot'),{country:'TW',asn:'AS456',verification:'range_match'});
  assert.deepEqual(e.lookup('8.8.1.1','googlebot'),{country:'US',asn:'AS123',verification:'unverified'});
  assert.equal(e.lookup('2600::123','none').country,'JP');
  assert.deepEqual(e.lookup(null,'googlebot'),{country:'unknown',asn:'unknown',verification:'unverified'});
  now+=31*86400000;assert.equal(e.state(),'stale');assert.equal(e.lookup('8.8.8.8','googlebot').verification,'unverified');
  assert.throws(()=>compileDataset({...dataset,geo:[{cidr:'8.8.8.1/24',country:'TW',asn:'AS456'}]},{now:()=>at,geo:true}));
  assert.throws(()=>compileDataset({...dataset,geo:[{cidr:'0.0.0.0/0',country:'TW',asn:'AS456'}]},{now:()=>at,geo:true}));
  assert.equal(loadEnrichment({ENABLE_SENSOR_GEO_ENRICHMENT:'true'}).state(),'missing');
  assert.equal(loadEnrichment({}).state(),'disabled');
});
test('trusted-only enrichment, health separation, patterns and redaction',()=>{
  const e=compileDataset(dataset,{now:()=>at,geo:true,bots:true});
  const s=createSensor({env:direct,now:()=>at,enrichment:e});
  s.observe(req('/health'),200);s.observe(req('/health?token=secret'),200);
  s.observe(req('/health'),404);s.observe(req('/.env'),404);s.observe(req('/.git'),404);
  const forged=req('/.env');forged.headers['x-forwarded-for']='8.8.8.8';s.observe(forged,404);
  const r=s.flush();
  assert.equal(r.healthChecks,2);assert.equal(r.observed,4);assert.equal(r.matched,3);
  assert.equal(r.countries.TW,3);assert.equal(r.countries.unknown,1);assert.equal(r.asns.AS456,3);
  assert.equal(r.verification.range_match,3);assert.equal(r.verification.unverified,1);
  assert.equal(r.repeated,1);assert.equal(r.patterns.git,1);assert.equal(r.identity.unresolved,1);
  const text=JSON.stringify(r)+JSON.stringify(s.diagnostics());
  for(const secret of ['8.8.8.8','token=secret',direct.SENSOR_HMAC_SECRET])assert.ok(!text.includes(secret));
  assert.ok(toCsv(r).some(row=>row.includes(',asns,AS456,3')));
});
test('CSV and JSONL restoration accepts only consistent canonical aggregate data',()=>{
  const r=fixture(at,['/.env','/.git']);
  const csv=csvHeader+toCsv(r).join('\n')+'\n';
  assert.deepEqual(toCsv(parseImport(csv)[0]),toCsv(r));
  assert.deepEqual(toCsv(parseImport(JSON.stringify(r))[0]),toCsv(r));
  for(const bad of [csv+toCsv(r)[0]+'\n',csv.replace(',total,matched,2',',total,matched,999'),
    csv.replace(',categories,environment,1',',categories,=formula,1'),JSON.stringify({...r,observed:999}), 'x'.repeat(1024*1024+1)])assert.throws(()=>parseImport(bad));
  const legacy={...r};delete legacy.healthChecks;delete legacy.patterns;
  assert.ok(!Object.hasOwn(parseImport(JSON.stringify(legacy))[0],'healthChecks'));
});
test('restore before process start only, ordered non-overlapping windows and coverage',()=>{
  let now=at+3600000;const h=createHistory({now:()=>now});
  assert.deepEqual(h.restore([fixture(at),fixture(at+600000)]),{accepted:2,skipped:0});
  assert.deepEqual(h.restore([fixture(at),fixture(at+3600000)]),{accepted:0,skipped:2});
  let r=h.summarize(range);assert.equal(r.restoredWindows,2);assert.equal(r.inRangeRecordedMs,600000);assert.equal(r.missingMs,3000000);
  const legacy=fixture(at+1200000);delete legacy.healthChecks;delete legacy.patterns;
  assert.equal(h.restore([legacy]).accepted,1);r=h.summarize(range);assert.equal(r.legacyWindows,1);assert.equal(r.anomaly.limitedCoverage,true);
  assert.equal(r.totals.observed,3);
});
test('protected import requires non-simple same-origin request and valid bounded content',async()=>{
  const now=at+3600000,history=createHistory({now:()=>now}),sensor=createSensor({env,now:()=>now});
  const server=createServer(sensor,createOperator({env,history,sensor,now:()=>now}));
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const send=(path,headers={},body='',method='POST')=>new Promise((resolve,reject)=>{
    const request=http.request({hostname:'127.0.0.1',port:server.address().port,path,method,agent:false,headers:{'Content-Length':Buffer.byteLength(body),...headers}},res=>{
      let text='';res.setEncoding('utf8');res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve({status:res.statusCode,text}));
    });request.on('error',reject);request.end(body);
  });
  try{
    const body=JSON.stringify(fixture(at));
    const headers={authorization:auth,'Content-Type':'text/plain','X-Sensor-Import':'1','Sec-Fetch-Site':'same-origin'};
    assert.equal((await send('/operator/import',{},body)).status,401);
    assert.equal((await send('/operator/import',{...headers,'Sec-Fetch-Site':'cross-site'},body)).status,403);
    assert.equal((await send('/operator/import',{...headers,'X-Sensor-Import':'0'},body)).status,403);
    assert.equal((await send('/operator/import',headers,'malformed')).status,400);
    assert.deepEqual(JSON.parse((await send('/operator/import',headers,body)).text),{accepted:1,skipped:0});
    assert.deepEqual(JSON.parse((await send('/operator/import',headers,body)).text),{accepted:0,skipped:1});
    assert.equal((await send('/operator/import',headers,'x'.repeat(1024*1024+1))).status,413);
    assert.equal((await send('/operator',{authorization:auth,'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'},'','GET')).status,200);
    const m=JSON.parse((await send('/operator/metrics',{authorization:auth},'','GET')).text);
    assert.equal(m.totals.observed,1);assert.equal(m.diagnostics.networkMode,'unresolved');assert.ok(!JSON.stringify(m).includes(password));
  }finally{await new Promise(r=>server.close(r));sensor.close();}
});
