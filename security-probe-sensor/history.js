'use strict';
const {toCsv}=require('./csv');
const DAY=86400000, HOUR=3600000;
const RETENTION_DAYS=7, MAX_WINDOWS=2016, MAX_BYTES=4*1024*1024;
const HEADER='window_start_utc,window_end_utc,dimension,key,count\n';
const dateKey=ms=>new Date(ms).toISOString().slice(0,10);
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&dateKey(Date.parse(s))===s;
function parseRange(query,now=Date.now()){
  const today=dateKey(now);
  if([...query.keys()].some(k=>k!=='from'&&k!=='to')||query.getAll('from').length>1||query.getAll('to').length>1) return null;
  const from=query.get('from')??today,to=query.get('to')??today;
  if(!validDate(from)||!validDate(to)||from>to||to>today||from<dateKey(now-(RETENTION_DAYS-1)*DAY)) return null;
  return {from,to};
}
function createHistory({now=Date.now,maxWindows=MAX_WINDOWS,maxBytes=MAX_BYTES}={}){
  if(!Number.isInteger(maxWindows)||maxWindows<1||maxWindows>MAX_WINDOWS||!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>MAX_BYTES) throw Error('Invalid history limits');
  const entries=[];let bytes=0,evicted=0,rejected=0;
  function remove(){bytes-=entries.shift().bytes;evicted++;}
  function prune(at=now()){
    const cutoff=at-RETENTION_DAYS*DAY;
    while(entries.length&&(entries[0].end<=cutoff||entries.length>maxWindows||bytes>maxBytes)) remove();
  }
  function add(report){
    const start=Date.parse(report?.windowStart),end=Date.parse(report?.windowEnd);
    // Use only the existing fixed-schema CSV sanitizer, never copy arbitrary report keys.
    const rows=toCsv(report);
    const content=rows.join('\n');
    const size=Buffer.byteLength(content);
    const last=entries[entries.length-1];
    if(!rows.length||!Number.isFinite(start)||!Number.isFinite(end)||end<start||end>now()+1000||
      end-start>DAY||size>maxBytes||(last&&start<last.end)||(last&&start===last.start&&end===last.end)){
      rejected++;return;
    }
    entries.push({start,end,content,bytes:size});bytes+=size;prune();
  }
  function select(range){
    prune();
    return entries.filter(e=>dateKey(e.start)>=range.from&&dateKey(e.start)<=range.to);
  }
  function summarize(range){
    const selected=select(range);
    const totals={},distributions={},hours=new Map(),days=new Map();
    let coverageMs=0;
    const addCount=(obj,key,n)=>{obj[key]=(obj[key]||0)+n;};
    const ensure=(map,key)=>{
      if(!map.has(key))map.set(key,{observed:0,matched:0,coverageMs:0,limited:false});
      return map.get(key);
    };
    for(const e of selected){
      const limited=/(?:^|\n)[^\n]*,total,(?:dropped|observationErrors|hourOverflow),[1-9]\d*(?:\n|$)/.test(e.content);
      coverageMs+=e.end-e.start;
      // Coverage is elapsed recorded interval, not proof all inbound traffic was seen.
      // Keep zeros for covered hours, leave absent hours missing.
      for(let t=Math.floor(e.start/HOUR)*HOUR;t<e.end;t+=HOUR){
        const h=new Date(t).toISOString().slice(0,13)+':00:00Z';
        const duration=Math.max(0,Math.min(t+HOUR,e.end)-Math.max(t,e.start));
        for(const bucket of [ensure(hours,h),ensure(days,h.slice(0,10))]){
          bucket.coverageMs+=duration;bucket.limited||=limited;
        }
      }
      for(const row of e.content.split('\n')){
        const [,,group,key,value]=row.split(',');const count=Number(value);
        if(group==='total')addCount(totals,key,count);
        else if(group==='hour_observed'||group==='hour_matched'||group==='day_observed'||group==='day_matched'){
          const map=group.startsWith('hour')?hours:days;
          const bucket=ensure(map,key);addCount(bucket,group.endsWith('observed')?'observed':'matched',count);bucket.limited||=limited;
        }else{distributions[group]||={};addCount(distributions[group],key,count);}
      }
    }
    const series=map=>[...map.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([utc,counts])=>({utc,...counts}));
    return {range,windowCount:selected.length,coverageMs,firstWindow:selected.length?new Date(selected[0].start).toISOString():null,
      lastWindow:selected.length?new Date(selected[selected.length-1].end).toISOString():null,
      retention:{days:RETENTION_DAYS,maxWindows,maxBytes,retainedWindows:entries.length,evicted,rejected},
      totals:selected.length?totals:null,distributions,hours:series(hours),days:series(days)};
  }
  function exportCsv(range){const selected=select(range);return HEADER+selected.map(e=>e.content).join('\n')+(selected.length?'\n':'');}
  return {add,prune,summarize,exportCsv};
}
module.exports={createHistory,parseRange,RETENTION_DAYS,MAX_WINDOWS,MAX_BYTES};
