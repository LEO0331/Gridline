'use strict';
const el=id=>document.getElementById(id);
const fmt=value=>Number.isFinite(value)?value.toLocaleString('en-US'):'—';
const utcDate=ms=>new Date(ms).toISOString().slice(0,10);
const DAY=86400000;
function node(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function table(id,headers,rows){
  const target=el(id);target.replaceChildren();
  if(!rows.length){target.append(node('p','No recorded observations.'));return;}
  const wrap=node('div',undefined,'scroll'),t=node('table'),head=node('thead'),hr=node('tr');
  for(const h of headers){const cell=node('th',h);cell.scope='col';hr.append(cell);}head.append(hr);t.append(head);
  const body=node('tbody');for(const row of rows){const tr=node('tr');for(const v of row)tr.append(node('td',String(v)));body.append(tr);}
  t.append(body);wrap.append(t);target.append(wrap);
}
function bars(id,group){
  const target=el(id);target.replaceChildren();const entries=Object.entries(group||{});
  if(!entries.length){target.append(node('p','No recorded observations.'));return;}
  entries.sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
  const max=Math.max(1,...entries.map(x=>x[1]));
  for(const [key,count] of entries){const row=node('div',undefined,'barrow'),bar=node('progress');bar.max=max;bar.value=count;bar.setAttribute('aria-label',key+' '+count);row.append(node('span',key.replaceAll('_',' ')),bar,node('span',fmt(count)));target.append(row);}
}
function render(data){
  const t=data.totals, k=el('kpis');k.replaceChildren();
  for(const [label,key] of [['Observed requests','observed'],['Matched probes','matched'],['Repeated probes','repeated'],['Multi-category probes','multiCategory'],['Unexpected probe 2xx','unexpectedSuccess'],['Suspected scanner requests','suspectedScanner']]){
    const m=node('div',undefined,'metric');m.append(node('span',label),node('strong',fmt(t?.[key])));k.append(m);
  }
  const coverage=data.windowCount?data.windowCount+' recorded windows · '+(data.coverageMs/60000).toFixed(1)+' recorded minutes · latest '+data.lastWindow:'No recorded windows in this range (missing coverage, not zero)';
  el('status').textContent=(data.observationEnabled?'Observation enabled. ':'Observation disabled. ')+coverage+'. Current incomplete window is not included.';
  for(const group of ['categories','identity','statuses','methods','clients','claimedBots'])bars(group,data.distributions[group]);
  const hourMap=new Map(data.hours.map(h=>[h.utc,h]));
  const start=Date.parse(data.range.from),end=Date.parse(data.range.to)+DAY;
  // Include cross-midnight interval contributions from windows attributed by their start.
  const keys=new Set(hourMap.keys());
  for(let at=start;at<end;at+=3600000)keys.add(new Date(at).toISOString().slice(0,13)+':00:00Z');
  const hourRows=[...keys].sort().map(key=>{
    const h=hourMap.get(key);return [key,h?fmt(h.observed):'—',h?fmt(h.matched):'—',h?(h.coverageMs/60000).toFixed(1)+(h.limited?' (limited)':''):'Missing'];
  });
  table('hours',['UTC hour','Requests','Probes','Recorded min'],hourRows);
  table('days',['UTC day','Requests','Probes','Recorded min'],data.days.map(d=>[d.utc,fmt(d.observed),fmt(d.matched),(d.coverageMs/60000).toFixed(1)+(d.limited?' (limited)':'')]));
  table('coverage',['Metric','Count'],[
    ['Aborted',fmt(t?.aborted)],['Dropped',fmt(t?.dropped)],['Observation errors',fmt(t?.observationErrors)],['Hour overflow',fmt(t?.hourOverflow)],
    ['Correlation tracked',fmt(t?.correlationTracked)],['Correlation unavailable',fmt(t?.correlationUnavailable)],['Correlation saturated',fmt(t?.correlationSaturated)],
    ['Retained windows',fmt(data.retention.retainedWindows)],['Evicted windows since restart',fmt(data.retention.evicted)],['Rejected windows since restart',fmt(data.retention.rejected)]
  ]);
}
let busy=false;
async function refresh(){
  if(busy)return;busy=true;el('refresh').disabled=true;
  const from=el('from').value,to=el('to').value;
  const query=new URLSearchParams({from,to}).toString();el('export').href='/operator/export.csv?'+query;
  try{
    const r=await fetch('/operator/metrics?'+query,{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(10000)});
    if(!r.ok)throw Error('HTTP '+r.status);render(await r.json());
  }catch{el('status').textContent='Unable to load selected range. Check credentials, UTC dates or service availability. Previous values, if shown, may be stale.';}
  finally{busy=false;el('refresh').disabled=false;}
}
function setRange(days){const now=Date.now();el('from').value=utcDate(now-(days-1)*DAY);el('to').value=utcDate(now);refresh();}
const now=Date.now();for(const id of ['from','to']){el(id).min=utcDate(now-6*DAY);el(id).max=utcDate(now);}
el('today').addEventListener('click',()=>setRange(1));el('week').addEventListener('click',()=>setRange(7));el('refresh').addEventListener('click',refresh);setRange(1);
