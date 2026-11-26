'use strict';
const { createHmac } = require('node:crypto');
const { isIP } = require('node:net');
const { performance } = require('node:perf_hooks');
const {loadEnrichment,validAsn,COUNTRY}=require('./enrichment');

const CATEGORIES = Object.freeze(['traversal','environment','git','wordpress','backup','configuration','database_dump','administration','credential']);
const METHODS = Object.freeze(['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS','CONNECT','TRACE','OTHER']);
const CLIENTS = Object.freeze(['browser_like','claimed_bot','automated_client','suspected_scanner','unknown']);
const BOTS = Object.freeze(['googlebot','bingbot','duckduckbot','gptbot','oai-searchbot','claudebot','perplexitybot','none']);
const CONFIDENCE = Object.freeze(['trusted_direct','trusted_proxy','unresolved']);
const PATH_RESULTS = Object.freeze(['matched','unmatched','malformed','oversized']);
const VERIFICATION = Object.freeze(['unverified','not_applicable','range_match']);
const LIMITS = Object.freeze({ path:4096, agent:1024, windowMs:300000, identities:4096, reportMs:300000, observations:100000, hourBuckets:4 });
const zeros = keys => Object.fromEntries(keys.map(k=>[k,0]));
const increment = (object,key) => { object[key] = Math.min(Number.MAX_SAFE_INTEGER, (object[key] || 0) + 1); };

function classifyPath(target) {
  if (typeof target !== 'string') return {category:null,result:'malformed'};
  // Stop at the first literal query delimiter; never decode the query.
  const prefix = target.slice(0, LIMITS.path+1);
  const end = prefix.indexOf('?');
  let path = end === -1 ? prefix : prefix.slice(0,end);
  if (path.length > LIMITS.path) return {category:null,result:'oversized'};
  if (!path.startsWith('/') || path.startsWith('//') || /[\x00-\x1f\x7f#]/.test(path)) return {category:null,result:'malformed'};
  for (let i=0;i<2 && path.includes('%');i++) {
    try { path=decodeURIComponent(path); }
    catch { return {category:null,result:'malformed'}; }
  }
  if (/[\x00-\x1f\x7f]/.test(path)) return {category:null,result:'malformed'};
  path=path.replace(/\\/g,'/').toLowerCase();
  const segments=path.split('/').filter(Boolean);
  const rules=[
    ['traversal', s=>s==='..'],
    ['environment', s=>/^\.env(?:\.[a-z0-9_-]+)*$/.test(s)],
    ['git', s=>s==='.git'],
    ['wordpress', s=>/^(wp-admin|wp-login\.php|xmlrpc\.php|wp-config\.php)$/.test(s)],
    ['credential', s=>/^(?:\.aws|\.ssh|\.htpasswd|id_rsa|id_ed25519|credentials(?:\.json)?|secrets\.(?:json|ya?ml)|service-account\.json)$/.test(s)],
    ['database_dump', s=>/^(?:db|database|dump|backup|mysql|postgres)(?:[-_.][a-z0-9_.-]+)?\.sql(?:\.gz)?$/.test(s)],
    ['backup', s=>/^(?:backup|site-backup|www-backup|site|www|archive)\.(?:zip|tar(?:\.gz)?|tgz|bak)$/.test(s)||/\.(?:bak|old|orig)$/.test(s)],
    ['configuration', s=>/^(?:config\.(?:php|json|ya?ml|ini)|web\.config|\.htaccess|appsettings(?:\.[a-z0-9_-]+)?\.json|application\.(?:properties|ya?ml)|docker-compose\.ya?ml)$/.test(s)],
    ['administration', s=>/^(?:phpmyadmin|adminer(?:\.php)?|phpinfo\.php|pma|server-status|actuator)$/.test(s)]
  ];
  for(const [category,match] of rules) if(segments.some(match)) return {category,result:'matched'};
  return {category:null,result:'unmatched'};
}
function classifyClient(value) {
  const ua=typeof value==='string'&&value.length<=LIMITS.agent&&!/[\x00-\x1f\x7f]/.test(value)?value:'';
  const bot=BOTS.slice(0,-1).find(name=>new RegExp('(?:^|[^a-z0-9])'+name+'(?:[^a-z0-9]|$)','i').test(ua))||'none';
  let client='unknown';
  if(bot!=='none') client='claimed_bot';
  else if(/\b(?:sqlmap|nikto|nuclei|masscan|nmap|zgrab)\b/i.test(ua)) client='suspected_scanner';
  else if(/\b(?:curl|wget|python-requests|go-http-client|postmanruntime|headlesschrome)\b/i.test(ua)) client='automated_client';
  else if(/mozilla\//i.test(ua)&&/chrome\/|firefox\/|safari\/|edg\//i.test(ua)) client='browser_like';
  return {client,bot,verification:bot==='none'?'not_applicable':'unverified'};
}
function normalizeIp(value) {
  if(typeof value!=='string'||value.length>64||value.includes('%')) return null;
  const ip=value.trim();
  if(isIP(ip)===4) return ip;
  if(isIP(ip)!==6) return null;
  const canonical=new URL('http://['+ip+']/').hostname.slice(1,-1);
  const mapped=/^::ffff:([a-f\d]{1,4}):([a-f\d]{1,4})$/.exec(canonical);
  if(!mapped) return canonical;
  const a=parseInt(mapped[1],16),b=parseInt(mapped[2],16);
  return [a>>8,a&255,b>>8,b&255].join('.');
}
function publicIp(ip) {
  if(!ip) return false;
  if(isIP(ip)===4) {
    const [a,b,c]=ip.split('.').map(Number);
    return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0||b===88))||(a===198&&(b===18||b===19||(b===51&&c===100)))||(a===203&&b===0&&c===113));
  }
  const parts=ip.split(':');
  const first=parseInt(parts[0],16),second=parseInt(parts[1]||'0',16);
  return first>=0x2000&&first<=0x3fff&&!(first===0x2001&&(second<=0x1ff||second===0xdb8))&&first!==0x2002&&first!==0x3fff;
}
function networkConfig(env={}) {
  const mode=['direct','single_proxy'].includes(env.SENSOR_NETWORK_MODE)&&env.SENSOR_TOPOLOGY_VERIFIED==='true'?env.SENSOR_NETWORK_MODE:'unresolved';
  const raw=typeof env.SENSOR_TRUSTED_PROXY_IPS==='string'&&env.SENSOR_TRUSTED_PROXY_IPS.length<=1024?env.SENSOR_TRUSTED_PROXY_IPS.split(','):[];
  const ips=raw.map(normalizeIp);
  const trusted=new Set(ips.length<=16&&ips.every(Boolean)?ips:[]);
  const value=env.SENSOR_HMAC_SECRET;
  const secret=typeof value==='string'&&Buffer.byteLength(value)>=32&&Buffer.byteLength(value)<=4096?value:null;
  return {mode,trusted,secret};
}
function resolveNetwork(req,config,onTrustedIp) {
  const peer=normalizeIp(req.socket?.remoteAddress);
  const headers=req.headers||{};
  const forwarding=['x-forwarded-for','forwarded','x-real-ip','cf-connecting-ip','true-client-ip'].some(k=>headers[k]!==undefined);
  let ip=null,confidence='unresolved';
  if(config.mode==='direct'&&!forwarding&&publicIp(peer)) {
    ip=peer;confidence='trusted_direct';
  } else if(config.mode==='single_proxy'&&peer&&config.trusted.has(peer)) {
    // Only a verified, ingress-restricted proxy overwriting XFF with exactly one
    // client address is supported. Multi-hop or malformed chains fail closed.
    const xff=headers['x-forwarded-for'];
    const distinct=req.headersDistinct?.['x-forwarded-for'];
    const candidate=typeof xff==='string'&&!xff.includes(',')&&(!distinct||distinct.length===1)?normalizeIp(xff):null;
    if(publicIp(candidate)&&!config.trusted.has(candidate)) {ip=candidate;confidence='trusted_proxy';}
  }
  if(ip&&onTrustedIp)onTrustedIp(ip);
  const fingerprint=ip&&config.secret?createHmac('sha256',config.secret).update(ip).digest('hex'):null;
  return {confidence,fingerprint};
}
function createCorrelation({now=()=>performance.now(),windowMs=LIMITS.windowMs,maxEntries=LIMITS.identities}={}) {
  if(!Number.isInteger(maxEntries)||maxEntries<1||maxEntries>LIMITS.identities||!Number.isInteger(windowMs)||windowMs<1||windowMs>LIMITS.windowMs) throw Error('Invalid correlation bounds');
  const entries=new Map();
  function expire(at=now()) {
    // Fixed lifetime from first observation; insertion order is expiry order.
    for(const [key,entry] of entries) {
      if(entry.expires>at) break;
      entries.delete(key);
    }
  }
  return {
    observe(key,category) {
      if(!key||!CATEGORIES.includes(category)) return {repeated:false,multi:false,tracked:false,saturated:false};
      const at=now();expire(at);
      let entry=entries.get(key);
      if(!entry) {
        if(entries.size>=maxEntries) return {repeated:false,multi:false,tracked:false,saturated:true};
        entry={expires:at+windowMs,categories:new Set()};
        entries.set(key,entry);
      }
      const repeated=entry.categories.size>0;
      entry.categories.add(category);
      return {repeated,multi:entry.categories.size>=2,tracked:true,saturated:false};
    },
    expire,clear:()=>entries.clear(),get size(){return entries.size;}
  };
}
function blank(start) {
  return {
    event:'security_probe.aggregate.v1',windowStart:new Date(start).toISOString(),
    observed:0,healthChecks:0,matched:0,suspectedScanner:0,unexpectedSuccess:0,repeated:0,multiCategory:0,
    correlationTracked:0,correlationSaturated:0,correlationUnavailable:0,aborted:0,dropped:0,observationErrors:0,
    categories:zeros(CATEGORIES),methods:zeros(METHODS),statuses:{},
    clients:zeros(CLIENTS),claimedBots:zeros(BOTS),verification:zeros(VERIFICATION),
    identity:zeros(CONFIDENCE),pathResults:zeros(PATH_RESULTS),
    countries:{unknown:0,other:0},asns:{unknown:0,other:0},patterns:{},hours:{},hourOverflow:0
  };
}
function createSensor({env=process.env,now=Date.now,monotonic=()=>performance.now(),correlation,emit,enrichment}={}) {
  const enabled=env.ENABLE_PASSIVE_PROBE_SENSOR==='true';
  const config=enabled?networkConfig(env):null;
  const lookup=enabled?(enrichment||loadEnrichment(env,now)):null;
  const startedAt=now();
  const corr=enabled?(correlation||createCorrelation({now:monotonic})):null;
  let report=enabled?blank(now()):null;
  function error(){if(report) increment(report,'observationErrors');}
  function observe(req,status,aborted=false) {
    if(!enabled) return;
    try {
      if(aborted){increment(report,'aborted');return;}
      if(status===200&&['GET','HEAD'].includes(req.method)&&req.url?.split('?',1)[0]==='/health'){increment(report,'healthChecks');return;}
      if(report.observed>=LIMITS.observations){increment(report,'dropped');return;}
      const at=now(), hour=new Date(at).toISOString().slice(0,13)+':00:00Z';
      const path=classifyPath(req.url), client=classifyClient(req.headers?.['user-agent']);
      let trustedIp=null;
      const net=resolveNetwork(req,config,ip=>{trustedIp=ip;});
      let enriched={country:'unknown',asn:'unknown',verification:client.verification};
      try{if(lookup)enriched=lookup.lookup(trustedIp,client.bot);}catch{/* Optional enrichment fails closed. */}
      trustedIp=null;
      const method=METHODS.includes(req.method)?req.method:'OTHER';
      const code=Number.isInteger(status)&&status>=100&&status<=599?String(status):'unknown';
      const result=path.category?corr.observe(net.fingerprint,path.category):null;
      increment(report,'observed');
      increment(report.methods,method);increment(report.statuses,code);increment(report.clients,client.client);
      increment(report.claimedBots,client.bot);increment(report.verification,VERIFICATION.includes(enriched.verification)?enriched.verification:client.verification);
      increment(report.identity,net.confidence);increment(report.pathResults,path.result);
      const country=typeof enriched.country==='string'&&COUNTRY.test(enriched.country)?enriched.country:'unknown';
      const asn=validAsn(enriched.asn)?enriched.asn:'unknown';
      for(const [group,key,limit] of [[report.countries,country,64],[report.asns,asn,128]])increment(group,Object.hasOwn(group,key)||Object.keys(group).length<limit+2?key:'other');
      if(!Object.hasOwn(report.hours,hour)&&Object.keys(report.hours).length<LIMITS.hourBuckets) report.hours[hour]={observed:0,matched:0};
      const bucket=report.hours[hour];
      if(bucket) increment(bucket,'observed');else increment(report,'hourOverflow');
      if(path.category||client.client==='suspected_scanner') increment(report,'suspectedScanner');
      if(path.category) {
        increment(report,'matched');increment(report.categories,path.category);
        if(bucket) increment(bucket,'matched');
        if(status>=200&&status<300) increment(report,'unexpectedSuccess');
        if(result.repeated) increment(report,'repeated');
        if(result.multi){increment(report,'multiCategory');increment(report.patterns,path.category);}
        if(result.tracked) increment(report,'correlationTracked');
        else if(result.saturated) increment(report,'correlationSaturated');
        else increment(report,'correlationUnavailable');
      }
    } catch {error();}
  }
  function flush() {
    if(!enabled) return null;
    const end=now(), days={};
    for(const [hour,counts] of Object.entries(report.hours)) {
      const day=hour.slice(0,10);
      days[day] ||= {observed:0,matched:0};
      days[day].observed+=counts.observed;
      days[day].matched+=counts.matched;
    }
    const output={...report,days,windowEnd:new Date(end).toISOString(),coverage:'completed_http_only'};
    report=blank(end);
    try {corr.expire();emit?.(output);} catch {error();}
    return output;
  }
  function close(){corr?.clear();}
  return {enabled,observe,flush,close,error,expire:()=>corr?.expire(),diagnostics:()=>({
    startedAt:new Date(startedAt).toISOString(),uptimeSeconds:Math.max(0,Math.floor((now()-startedAt)/1000)),
    networkMode:config?.mode||'unresolved',topologyAsserted:env.SENSOR_TOPOLOGY_VERIFIED==='true',
    proxyConfigured:Boolean(config?.trusted.size),correlationConfigured:Boolean(config?.secret&&config.mode!=='unresolved'&&(config.mode!=='single_proxy'||config.trusted.size)),
    enrichment:lookup?.state?.()||'disabled',geoEnabled:enabled&&env.ENABLE_SENSOR_GEO_ENRICHMENT==='true',botVerificationEnabled:enabled&&env.ENABLE_SENSOR_BOT_VERIFICATION==='true'
  })};
}
module.exports={CATEGORIES,METHODS,CLIENTS,BOTS,CONFIDENCE,PATH_RESULTS,VERIFICATION,LIMITS,classifyPath,classifyClient,normalizeIp,networkConfig,resolveNetwork,createCorrelation,createSensor};
