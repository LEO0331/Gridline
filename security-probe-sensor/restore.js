'use strict';
const {toCsv,METRICS,GROUPS,validCount,validTime,validHour}=require('./csv');
const {validAsn,COUNTRY}=require('./enrichment');
const MAX_IMPORT_BYTES=1024*1024,MAX_IMPORT_WINDOWS=512,MAX_ROWS=24000;
const HEADER='window_start_utc,window_end_utc,dimension,key,count';
const required=['observed','matched','suspectedScanner','unexpectedSuccess','repeated','multiCategory','correlationTracked','correlationSaturated','correlationUnavailable','aborted','dropped','observationErrors','hourOverflow'];
const sum=obj=>Object.values(obj||{}).reduce((a,b)=>a+b,0);
function validKey(group,key){
  if(group==='total')return METRICS.includes(key);
  if(Object.hasOwn(GROUPS,group))return GROUPS[group].includes(key);
  if(group==='countries')return key==='unknown'||key==='other'||COUNTRY.test(key);
  if(group==='asns')return key==='unknown'||key==='other'||validAsn(key);
  if(group==='hour_observed'||group==='hour_matched')return validHour(key);
  if(group==='day_observed'||group==='day_matched')return /^\d{4}-\d{2}-\d{2}$/.test(key)&&validTime(key+'T00:00:00.000Z');
  return false;
}
function validate(report){
  if(METRICS.some(k=>Object.hasOwn(report,k)&&(!validCount(report[k])||report[k]>1000000000))||required.some(k=>!validCount(report[k]))||report.observed>100000||
    report.matched>report.observed||report.suspectedScanner>report.observed||report.matched>report.suspectedScanner||
    report.unexpectedSuccess>report.matched||report.multiCategory>report.repeated||report.repeated>report.correlationTracked||
    report.correlationTracked+report.correlationSaturated+report.correlationUnavailable!==report.matched||
    sum(report.categories)!==report.matched)return false;
  for(const g of ['methods','statuses','clients','claimedBots','verification','identity','pathResults','countries','asns'])if(sum(report[g])!==report.observed)return false;
  if(report.pathResults?.matched!==report.matched||report.hourOverflow>report.observed)return false;
  if(Object.hasOwn(report,'healthChecks')&&(!validCount(report.healthChecks)||sum(report.patterns)!==report.multiCategory))return false;
  if(Object.keys(report.hours||{}).length>4||Object.keys(report.countries||{}).length>66||Object.keys(report.asns||{}).length>130)return false;
  let hoursObserved=0,hoursMatched=0;
  for(const [key,h] of Object.entries(report.hours||{})){
    if(!validHour(key)||!validCount(h.observed)||!validCount(h.matched)||h.matched>h.observed||
      Date.parse(key)+3600000<=Date.parse(report.windowStart)||Date.parse(key)>Date.parse(report.windowEnd))return false;
    hoursObserved+=h.observed;hoursMatched+=h.matched;
  }
  return hoursObserved+report.hourOverflow===report.observed&&hoursMatched<=report.matched&&report.matched-hoursMatched<=report.hourOverflow;
}
function fromCsv(text){
  const lines=text.split(/\r?\n/);if(lines.shift()!==HEADER||lines.length>MAX_ROWS)throw Error('invalid CSV');
  const groups=new Map();
  for(const line of lines){
    if(!line)continue;
    if(line.length>512)throw Error('invalid row');
    const parts=line.split(',');if(parts.length!==5)throw Error('invalid row');
    const [start,end,group,key,count]=parts;
    if(!validTime(start)||!validTime(end)||!validKey(group,key)||!/^(?:0|[1-9]\d{0,15})$/.test(count)||!validCount(Number(count)))throw Error('invalid row');
    const id=start+' '+end;
    if(!groups.has(id)){
      if(groups.size>=MAX_IMPORT_WINDOWS)throw Error('too many windows');
      groups.set(id,{report:{event:'security_probe.aggregate.v1',windowStart:start,windowEnd:end,hours:{}},rows:new Set(),keys:new Set()});
    }
    const entry=groups.get(id),rowKey=group+','+key;
    if(entry.keys.has(rowKey))throw Error('duplicate row');
    entry.keys.add(rowKey);
    const r=entry.report,n=Number(count);
    if(group==='total')r[key]=n;
    else if(group.startsWith('hour_')){
      r.hours[key]||={};r.hours[key][group.slice(5)]=n;
    }else if(!group.startsWith('day_')){r[group]||={};r[group][key]=n;}
    // Day totals are derived; validate against canonical output below.
    entry.rows.add(rowKey+','+count);
  }
  const out=[];
  for(const {report,rows} of groups.values()){
    if(!validate(report))throw Error('inconsistent window');
    const canonical=toCsv(report).map(row=>row.split(',').slice(2).join(','));
    if(canonical.length!==rows.size||canonical.some(row=>!rows.has(row)))throw Error('noncanonical window');
    out.push(report);
  }
  return out;
}
function fromJsonl(text){
  const lines=text.split(/\r?\n/);if(lines.length>MAX_IMPORT_WINDOWS+1)throw Error('too many windows');
  const reports=[];
  for(const line of lines){
    if(!line)continue;
    if(line.length>65536)throw Error('oversized line');
    const raw=JSON.parse(line);
    if(raw?.event!=='security_probe.aggregate.v1')throw Error('invalid event');
    const rows=toCsv(raw);
    if(!rows.length)throw Error('invalid report');
    reports.push(...fromCsv(HEADER+'\n'+rows.join('\n')));
  }
  if(reports.length>MAX_IMPORT_WINDOWS)throw Error('too many windows');
  return reports;
}
function parseImport(text){
  if(typeof text!=='string'||Buffer.byteLength(text)>MAX_IMPORT_BYTES)throw Error('oversized import');
  const reports=text.startsWith(HEADER+'\n')||text.startsWith(HEADER+'\r\n')?fromCsv(text):fromJsonl(text);
  if(!reports.length)throw Error('empty import');
  return reports.sort((a,b)=>a.windowStart.localeCompare(b.windowStart));
}
module.exports={parseImport,MAX_IMPORT_BYTES,MAX_IMPORT_WINDOWS};
