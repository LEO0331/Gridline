'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {once}=require('node:events');
const {classifyPath,classifyClient,normalizeIp,networkConfig,resolveNetwork,createCorrelation,createSensor,LIMITS}=require('../sensor');
const {createServer,stdoutSink}=require('../server');
const {toCsv}=require('../csv');
const secret='synthetic-test-key-not-for-production-123456';
const enabled={ENABLE_PASSIVE_PROBE_SENSOR:'true'};
const direct={...enabled,SENSOR_NETWORK_MODE:'direct',SENSOR_TOPOLOGY_VERIFIED:'true',SENSOR_HMAC_SECRET:secret};
const proxy={...direct,SENSOR_NETWORK_MODE:'single_proxy',SENSOR_TRUSTED_PROXY_IPS:'10.0.0.1'};
const request=(url='/',headers={},peer='8.8.8.8',method='GET')=>({url,headers,socket:{remoteAddress:peer},method});

test('deterministic fixed categories and bounded path decoding',()=>{
  for(const [path,category] of [
    ['/.env.local','environment'],['/.git/config','git'],['/a/wp-admin/','wordpress'],
    ['/site.zip','backup'],['/config.yaml','configuration'],['/db-2025.sql.gz','database_dump'],
    ['/phpmyadmin/index.php','administration'],['/.aws/credentials','credential'],
    ['/a/%252e%252e%252fconfig.json','traversal'],['/a/..\\b','traversal'],
    ['/.ENV?password=synthetic','environment']
  ]) assert.deepEqual(classifyPath(path),{category,result:'matched'},path);
  for(const path of ['/','/health','/blog/wp-admin-guide','/assets/git-logo.svg','/environment','/foo.json','/backup-guide.zip','/search?target=/.env','/about/configuration','/.gitignore']) assert.equal(classifyPath(path).category,null,path);
  for(const path of ['/bad%','/a%00','http://example.invalid/.env','//example.invalid/.env']) assert.equal(classifyPath(path).result,'malformed');
  assert.equal(classifyPath('/'+'a'.repeat(LIMITS.path)).result,'oversized');
  assert.equal(classifyPath('/.env?'+'a'.repeat(LIMITS.path+10)).category,'environment');
});
test('bounded UA classification returns claims not identities',()=>{
  assert.deepEqual(classifyClient('Googlebot/2.1 token=secret'),{client:'claimed_bot',bot:'googlebot',verification:'unverified'});
  assert.equal(classifyClient('curl/8').client,'automated_client');
  assert.equal(classifyClient('nuclei').client,'suspected_scanner');
  assert.equal(classifyClient('Mozilla/5.0 Chrome/120').client,'browser_like');
  assert.equal(classifyClient('Googlebot'+'x'.repeat(1024)).client,'unknown');
  assert.equal(classifyClient('notgooglebot').bot,'none');
});
test('network identity requires verified topology and reliable source',()=>{
  assert.equal(normalizeIp('::ffff:8.8.8.8'),'8.8.8.8');
  assert.equal(normalizeIp('fe80::1%eth0'),null);
  const req=request();
  assert.deepEqual(resolveNetwork(req,networkConfig(enabled)),{confidence:'unresolved',fingerprint:null});
  assert.equal(resolveNetwork(req,networkConfig({...direct,SENSOR_TOPOLOGY_VERIFIED:'false'})).fingerprint,null);
  const resolved=resolveNetwork(req,networkConfig(direct));
  assert.equal(resolved.confidence,'trusted_direct');
  assert.match(resolved.fingerprint,/^[a-f0-9]{64}$/);
  assert.equal(resolveNetwork(request('/',{},'::ffff:8.8.8.8'),networkConfig(direct)).fingerprint,resolved.fingerprint);
  assert.equal(resolveNetwork(request('/',{'x-forwarded-for':'1.1.1.1'}),networkConfig(direct)).fingerprint,null);
  assert.equal(resolveNetwork(request('/',{},'127.0.0.1'),networkConfig(direct)).fingerprint,null);
  assert.equal(resolveNetwork(req,networkConfig({...direct,SENSOR_HMAC_SECRET:'short'})).fingerprint,null);
  const forwarded=request('/',{'x-forwarded-for':'8.8.8.8'},'10.0.0.1');
  assert.equal(resolveNetwork(forwarded,networkConfig(proxy)).confidence,'trusted_proxy');
  assert.equal(resolveNetwork(forwarded,networkConfig(proxy)).fingerprint,resolved.fingerprint);
  for(const r of [
    request('/',{'x-forwarded-for':'8.8.8.8'},'10.0.0.2'),
    request('/',{'x-forwarded-for':'8.8.8.8, 1.1.1.1'},'10.0.0.1'),
    request('/',{'x-forwarded-for':'invalid'},'10.0.0.1'),
    request('/',{'x-real-ip':'8.8.8.8'},'10.0.0.1'),
    request('/',{'x-forwarded-for':'10.0.0.1'},'10.0.0.1'),
    {...forwarded,headersDistinct:{'x-forwarded-for':['8.8.8.8','1.1.1.1']}}
  ]) assert.deepEqual(resolveNetwork(r,networkConfig(proxy)),{confidence:'unresolved',fingerprint:null});
});
test('fixed short-lived correlation and capacity saturation',()=>{
  let at=0;
  const c=createCorrelation({now:()=>at,windowMs:10,maxEntries:2});
  assert.deepEqual(c.observe('a','environment'),{repeated:false,multi:false,tracked:true,saturated:false});
  assert.equal(c.observe('a','environment').repeated,true);
  assert.equal(c.observe('a','git').multi,true);
  c.observe('b','git');
  assert.equal(c.observe('c','git').saturated,true);
  assert.equal(c.size,2);
  at=10;c.expire();
  assert.equal(c.size,0);
  assert.equal(c.observe('a','environment').repeated,false);
  c.clear();assert.equal(c.size,0);
});
test('aggregate consistency, UTC boundary, redaction, and unexpected success',()=>{
  let time=Date.parse('2026-01-01T23:59:59Z');
  const emitted=[];
  const s=createSensor({env:direct,now:()=>time,emit:r=>emitted.push(r)});
  const r=request('/.env?token=VERY_PRIVATE_QUERY',{'user-agent':'Googlebot VERY_PRIVATE_UA',cookie:'VERY_PRIVATE_COOKIE',authorization:'Bearer VERY_PRIVATE_AUTH'});
  r.body='VERY_PRIVATE_BODY';
  s.observe(r,404);
  time+=2000;
  s.observe(request('/.git/config'),200);
  s.observe(request('/home',{},'127.0.0.1','HEAD'),404);
  s.observe(request('/unknown'),200,true);
  const a=s.flush();
  assert.equal(a.observed,3);assert.equal(a.matched,2);assert.equal(a.repeated,1);assert.equal(a.multiCategory,1);
  assert.equal(a.unexpectedSuccess,1);assert.equal(a.aborted,1);
  for(const group of ['methods','statuses','clients','claimedBots','verification','identity','pathResults','countries','asns']) assert.equal(Object.values(a[group]).reduce((x,y)=>x+y,0),3,group);
  assert.equal(Object.values(a.categories).reduce((x,y)=>x+y,0),2);
  assert.equal(a.correlationTracked+a.correlationUnavailable+a.correlationSaturated,2);
  assert.equal(a.hours['2026-01-01T23:00:00Z'].observed,1);
  assert.equal(a.days['2026-01-02'].matched,1);
  assert.equal(a.countries.unknown,3);assert.equal(a.asns.unknown,3);
  const json=JSON.stringify(a);
  for(const value of ['VERY_PRIVATE','8.8.8.8','127.0.0.1',secret,resolveNetwork(r,networkConfig(direct)).fingerprint,'/.git/config','/.env']) assert.ok(!json.includes(value),value);
  assert.equal(emitted.length,1);
  assert.equal(s.flush().observed,0);s.close();
});
test('disabled is missing observations rather than observed zero; failures are contained',()=>{
  let calls=0;
  const off=createSensor({env:{},emit:()=>calls++});
  off.observe(request('/.env'),404);assert.equal(off.flush(),null);assert.equal(calls,0);
  const on=createSensor({env:direct,correlation:{observe(){throw Error('private failure');},expire(){},clear(){}}});
  on.observe(request('/.env'),404);
  const a=on.flush();assert.equal(a.observed,0);assert.equal(a.observationErrors,1);assert.ok(!JSON.stringify(a).includes('private failure'));
});
test('per-period observation budget preserves bounded cardinality',()=>{
  const s=createSensor({env:enabled,now:()=>0});
  const r=request('/ordinary');
  for(let i=0;i<LIMITS.observations+1;i++)s.observe(r,404);
  const a=s.flush();assert.equal(a.observed,LIMITS.observations);assert.equal(a.dropped,1);assert.deepEqual(a.statuses,{'404':LIMITS.observations});
});
test('CSV exports only validated fixed fields, UTC keys and numbers',()=>{
  const s=createSensor({env:enabled,now:()=>0});s.observe(request('/.env'),404);
  const a=s.flush();a.categories['=HYPERLINK("secret")']=1;a.categories.git='=evil';a.statuses['+cmd']=9;
  a.hours['=formula']={observed:1,matched:1};
  const rows=toCsv(a);
  assert.ok(rows.some(r=>r.includes(',categories,environment,1')));
  assert.ok(rows.some(r=>r.includes(',day_matched,1970-01-01,1')));
  assert.ok(rows.every(r=>r.split(',').length===5&&!/[=+@\r\n]/.test(r)));
  assert.deepEqual(toCsv({...a,windowStart:'=evil'}),[]);
});
test('ordinary HTTP lifecycle and status unchanged when disabled or observation fails',async()=>{
  for(const mode of ['enabled','disabled','throwing']){
    const s=mode==='throwing'?{enabled:true,observe(){throw Error('secret');}}:createSensor({env:mode==='enabled'?enabled:{}});
    const server=createServer(s);
    server.listen(0,'127.0.0.1');await once(server,'listening');
    try{
      const send=(path,method='GET')=>new Promise((resolve,reject)=>{
        const req=http.request({hostname:'127.0.0.1',port:server.address().port,path,method,agent:false,headers:{'user-agent':'synthetic-private-agent'}},res=>{
          let body='';res.setEncoding('utf8');res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,body,headers:res.headers}));
        });req.on('error',reject);req.end();
      });
      for(const [path,method,status] of [['/.env','GET',404],['/.git/config','POST',404],['/arbitrary','OPTIONS',404],['/health','GET',200],['/health','HEAD',200],['/%bad','GET',404]]){
        const r=await send(path,method);assert.equal(r.status,status);assert.equal(r.headers['cache-control'],'no-store');assert.equal(r.headers['x-powered-by'],undefined);
        assert.ok(!r.body.includes('synthetic-private'));
      }
      if(mode==='enabled'){const a=s.flush();assert.equal(a.observed,6);assert.equal(a.statuses['404'],4);assert.equal(a.statuses['200'],2);assert.equal(a.matched,2);}
      if(mode==='disabled')assert.equal(s.flush(),null);
    }finally{await new Promise(resolve=>server.close(resolve));s.close?.();}
  }
});
test('log backpressure skips windows without queuing arbitrary reports',()=>{
  const {EventEmitter}=require('node:events');
  const stream=new EventEmitter(),lines=[];
  stream.write=line=>{lines.push(JSON.parse(line));return lines.length>1;};
  const sink=stdoutSink(stream);sink({observed:1});sink({observed:2});
  assert.equal(lines.length,1);stream.emit('drain');sink({observed:3});
  assert.equal(lines[1].skippedReportsBefore,1);
});
