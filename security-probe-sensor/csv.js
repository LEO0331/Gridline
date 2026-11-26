'use strict';
// Offline export only. No network listener and no arbitrary strings in cells.
const fs=require('node:fs');
const {CATEGORIES,METHODS,CLIENTS,BOTS,CONFIDENCE,PATH_RESULTS,VERIFICATION}=require('./sensor');
const MAX_BYTES=10*1024*1024;
const METRICS=['observed','matched','suspectedScanner','unexpectedSuccess','repeated','multiCategory','correlationTracked','correlationSaturated','correlationUnavailable','aborted','dropped','observationErrors','hourOverflow','skippedReportsBefore'];
const GROUPS={categories:CATEGORIES,methods:METHODS,statuses:[...Array.from({length:500},(_,i)=>String(i+100)),'unknown'],clients:CLIENTS,claimedBots:BOTS,verification:VERIFICATION,identity:CONFIDENCE,pathResults:PATH_RESULTS,countries:['unknown'],asns:['unknown']};
const validCount=v=>Number.isSafeInteger(v)&&v>=0;
const validTime=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const validHour=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:00:00Z$/.test(v)&&validTime(v.replace('Z','.000Z'));
function toCsv(report){
  if(report?.event!=='security_probe.aggregate.v1'||!validTime(report.windowStart)||!validTime(report.windowEnd)) return [];
  const rows=[];
  const add=(group,key,count)=>{if(validCount(count))rows.push([report.windowStart,report.windowEnd,group,key,count].join(','));};
  for(const key of METRICS)add('total',key,report[key]);
  for(const [group,keys] of Object.entries(GROUPS))for(const key of keys)add(group,key,report[group]?.[key]);
  const days=new Map();
  for(const key of Object.keys(report.hours||{}).slice(0,4)){
    if(!validHour(key))continue;
    const h=report.hours[key];
    if(!validCount(h?.observed)||!validCount(h?.matched)||h.matched>h.observed)continue;
    add('hour_observed',key,h.observed);add('hour_matched',key,h.matched);
    const day=key.slice(0,10),d=days.get(day)||{observed:0,matched:0};
    d.observed+=h.observed;d.matched+=h.matched;days.set(day,d);
  }
  for(const [day,d] of days){add('day_observed',day,d.observed);add('day_matched',day,d.matched);}
  return rows;
}
function main(file){
  if(!file)throw Error('Usage: npm run csv -- aggregate.jsonl');
  const fd=fs.openSync(file,'r');
  try{
    if(!fs.fstatSync(fd).isFile())throw Error('Regular file required');
    const data=Buffer.alloc(MAX_BYTES+1);let total=0,n;
    while(total<data.length&&(n=fs.readSync(fd,data,total,data.length-total,null))>0)total+=n;
    if(total>MAX_BYTES)throw Error('Input exceeds 10 MiB; split locally first');
    const lines=data.subarray(0,total).toString('utf8').split('\n');
    fs.writeSync(1,'window_start_utc,window_end_utc,dimension,key,count\n');
    for(const line of lines){
      if(!line||line.length>65536)continue;
      let parsed;try{parsed=JSON.parse(line);}catch{continue;}
      for(const row of toCsv(parsed))fs.writeSync(1,row+'\n');
    }
  }finally{fs.closeSync(fd);}
}
if(require.main===module){
  try{main(process.argv[2]);}catch{process.stderr.write('CSV export failed; use a regular JSONL file <= 10 MiB\n');process.exitCode=1;}
}
module.exports={toCsv};
