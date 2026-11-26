'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {once}=require('node:events');
const {createHistory,parseRange}=require('../history');
const {createSensor}=require('../sensor');
const {createOperator}=require('../operator');
const {createServer}=require('../server');
const password='synthetic-dashboard-password-0123456789';
const env={ENABLE_SENSOR_DASHBOARD:'true',ENABLE_PASSIVE_PROBE_SENSOR:'true',SENSOR_OPERATOR_PASSWORD:password};
const authorization='Basic '+Buffer.from('operator:'+password).toString('base64');
const day='2026-01-03',at=Date.parse(day+'T00:00:00Z');
const range={from:day,to:day};
function fixture(start,requests=0){
  let now=start;const sensor=createSensor({env,now:()=>now});
  for(let i=0;i<requests;i++)sensor.observe({url:'/.env?token=private',headers:{authorization:'private'},socket:{remoteAddress:'127.0.0.1'},method:'GET'},404);
  now+=300000;const report=sensor.flush();sensor.close();return report;
}
test('history distinguishes missing, observed zero and partial UTC coverage',()=>{
  const h=createHistory({now:()=>at+3600000});
  assert.equal(h.summarize(range).totals,null);
  h.add(fixture(at));h.add(fixture(at+600000,2));
  const result=h.summarize(range);
  assert.equal(result.windowCount,2);assert.equal(result.totals.observed,2);assert.equal(result.totals.matched,2);
  assert.equal(result.coverageMs,600000);assert.equal(result.hours.length,1);assert.equal(result.hours[0].observed,2);
  assert.equal(result.days[0].coverageMs,600000);assert.equal(result.distributions.statuses['404'],2);
  assert.equal(h.summarize({from:'2026-01-02',to:'2026-01-02'}).totals,null);
  assert.equal(h.exportCsv(range).includes('private'),false);
  const zero=createHistory({now:()=>at+3600000});zero.add(fixture(at));
  assert.equal(zero.summarize(range).totals.observed,0);assert.equal(zero.summarize(range).hours[0].observed,0);
});
test('range validation is UTC, bounded and rejects ambiguous or injection parameters',()=>{
  const q=s=>parseRange(new URLSearchParams(s),at);
  assert.deepEqual(q(''),range);
  assert.deepEqual(q('from=2025-12-28&to=2026-01-03'),{from:'2025-12-28',to:day});
  for(const query of ['from=2025-12-27','to=2026-01-04','from=2026-02-30','from=2026-01-03&from=2026-01-02','from=2026-01-03&to=2026-01-02','token=secret','from=%3Dformula','from='])assert.equal(q(query),null,query);
});
test('retention, memory budget, overlap and CSV allowlist',()=>{
  let now=at+3600000;
  const h=createHistory({now:()=>now,maxWindows:2});
  const first=fixture(at,1);first.categories['=HYPERLINK("bad")']=1;first.categories.git='=bad';h.add(first);
  assert.ok(!h.exportCsv(range).includes('HYPERLINK'));assert.ok(!h.exportCsv(range).includes('=bad'));
  h.add(fixture(at,1));h.add(fixture(at+300000,2));h.add(fixture(at+600000,3));
  const summary=h.summarize(range);assert.equal(summary.retention.evicted,1);assert.equal(summary.retention.rejected,1);
  assert.equal(summary.totals.observed,5);
  now+=8*86400000;assert.equal(h.summarize(range).totals,null);
  const small=createHistory({now:()=>at+3600000,maxBytes:100});small.add(fixture(at));assert.equal(small.summarize(range).retention.rejected,1);
});
test('cross-midnight windows are attributed by start and retain actual hourly contributions',()=>{
  const start=at-60000;let now=start;
  const s=createSensor({env,now:()=>now});const req={url:'/.git',headers:{},method:'GET'};
  s.observe(req,404);now=at+60000;s.observe(req,404);const report=s.flush();
  const h=createHistory({now:()=>at+3600000});h.add(report);
  const summary=h.summarize({from:'2026-01-02',to:'2026-01-02'});
  assert.equal(summary.windowCount,1);assert.equal(summary.hours.length,2);
  assert.equal(summary.hours[0].matched,1);assert.equal(summary.hours[1].matched,1);
  assert.equal(h.summarize(range).totals,null);
});
async function withServer(config,fn){
  let time=at;const history=createHistory({now:()=>time});
  const sensor=createSensor({env:config,now:()=>time,emit:r=>history.add(r)});
  const operator=createOperator({env:config,history,sensor,now:()=>time});
  const server=createServer(sensor,operator);server.listen(0,'127.0.0.1');await once(server,'listening');
  const send=(path,headers={},method='GET')=>new Promise((resolve,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port:server.address().port,path,method,headers,agent:false},res=>{
      let body='';res.setEncoding('utf8');res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));
    });req.on('error',reject);req.end();
  });
  try{await fn(send,()=>{time+=300000;return sensor.flush();},history);}
  finally{await new Promise(r=>server.close(r));sensor.close();}
}
test('all exact operator routes require authorization, deny cross-site and preserve ordinary 404',async()=>{
  await withServer(env,async(send,flush)=>{
    const paths=['/operator','/operator/app.js','/operator/style.css','/operator/metrics','/operator/export.csv'];
    for(const path of paths){
      const r=await send(path);assert.equal(r.status,401,path);assert.match(r.headers['www-authenticate'],/^Basic /);
      assert.equal(r.headers['cache-control'],'no-store');assert.equal(r.headers['access-control-allow-origin'],undefined);
      assert.equal((await send(path,{authorization:'Basic '+Buffer.from('operator:wrong').toString('base64')})).status,401);
      const ok=await send(path,{authorization});assert.equal(ok.status,200,path);assert.match(ok.headers['content-security-policy'],/frame-ancestors 'none'/);
      assert.equal(ok.headers['x-frame-options'],'DENY');assert.ok(!ok.body.includes(password));
    }
    assert.equal((await send('/operator/metrics',{authorization,'sec-fetch-site':'cross-site'})).status,403);
    assert.equal((await send('/operator/metrics?token=secret',{authorization})).status,400);
    assert.equal((await send('/operator/metrics',{authorization:[authorization,authorization]})).status,401);
    assert.equal((await send('/operator/metrics',{authorization},'POST')).status,404);
    assert.equal((await send('/operator/unknown',{authorization})).status,404);
    assert.equal((await send('/.env',{authorization})).status,404);
    const result=flush();assert.equal(result.observed,15);assert.equal(result.statuses['401'],11);assert.equal(result.statuses['403'],1);assert.equal(result.statuses['404'],3);
    const response=await send('/operator/metrics',{authorization});
    const data=JSON.parse(response.body);assert.equal(data.totals.observed,15);assert.equal(data.totals.matched,1);
    assert.equal(data.observationEnabled,true);assert.ok(!response.body.includes(password));
    const csv=await send('/operator/export.csv',{authorization});assert.match(csv.headers['content-disposition'],/attachment/);assert.ok(csv.body.includes(',total,observed,15'));
    assert.equal(flush().observed,0);
  });
});
test('dashboard and observation independently disabled; invalid password fails closed',async()=>{
  for(const config of [{...env,ENABLE_SENSOR_DASHBOARD:'false'},{...env,SENSOR_OPERATOR_PASSWORD:'short'}]){
    await withServer(config,async(send,flush)=>{assert.equal((await send('/operator',{authorization})).status,404);assert.equal(flush().observed,1);});
  }
  await withServer({...env,ENABLE_PASSIVE_PROBE_SENSOR:'false'},async(send,flush)=>{
    const result=JSON.parse((await send('/operator/metrics',{authorization})).body);
    assert.equal(result.observationEnabled,false);assert.equal(result.totals,null);assert.equal(flush(),null);
  });
});
