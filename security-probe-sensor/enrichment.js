'use strict';
const fs=require('node:fs');
const {isIP}=require('node:net');
const MAX_FILE=1024*1024, MAX_PREFIXES=4096, MAX_AGE=30*86400000;
const BOTS=['googlebot','bingbot','duckduckbot','gptbot','oai-searchbot','claudebot','perplexitybot'];
const COUNTRY=/^[A-Z]{2}$/;
const ASN=/^AS[1-9]\d{0,9}$/;
function validAsn(s){return typeof s==='string'&&ASN.test(s)&&Number(s.slice(2))<=4294967295;}
function numeric(ip){
  const family=isIP(ip);
  if(family===4)return {bits:32,value:ip.split('.').reduce((a,b)=>(a<<8n)+BigInt(b),0n)};
  if(family!==6||ip.includes('%'))return null;
  const canonical=new URL('http://['+ip+']/').hostname.slice(1,-1);
  if(canonical.startsWith('::ffff:'))return null;
  const halves=canonical.split('::'),left=halves[0]?halves[0].split(':'):[],right=halves[1]?halves[1].split(':'):[];
  const parts=halves.length===2?[...left,...Array(8-left.length-right.length).fill('0'),...right]:left;
  if(parts.length!==8)return null;
  return {bits:128,value:parts.reduce((a,b)=>(a<<16n)+BigInt('0x'+b),0n)};
}
function prefix(cidr){
  if(typeof cidr!=='string'||cidr.length>80)return null;
  const parts=cidr.split('/');
  if(parts.length!==2||!/^(?:0|[1-9]\d{0,2})$/.test(parts[1]))return null;
  const n=numeric(parts[0]),length=Number(parts[1]);
  // Broad catch-all ranges are unsuitable for source verification.
  if(!n||length<1||length>n.bits)return null;
  const shift=BigInt(n.bits-length),key=n.value>>shift;
  if((key<<shift)!==n.value)return null;
  return {bits:n.bits,length,key};
}
function table(){
  const groups=new Map();
  return {
    add(cidr,value){
      const p=prefix(cidr);if(!p)throw Error('invalid prefix');
      const id=p.bits+':'+p.length;
      if(!groups.has(id))groups.set(id,{bits:p.bits,length:p.length,values:new Map()});
      const group=groups.get(id);
      if(group.values.has(p.key))throw Error('duplicate prefix');
      group.values.set(p.key,value);
    },
    lookup(ip){
      if(!ip)return null;
      const n=numeric(ip);if(!n)return null;
      for(const group of [...groups.values()].filter(g=>g.bits===n.bits).sort((a,b)=>b.length-a.length)){
        const match=group.values.get(n.value>>BigInt(n.bits-group.length));
        if(match!==undefined)return match;
      }
      return null;
    }
  };
}
function compileDataset(data,{now=Date.now,geo=false,bots=false}={}){
  const stamp=typeof data?.generatedAt==='string'?Date.parse(data.generatedAt):NaN;
  if(!Number.isFinite(stamp)||stamp>now()||now()-stamp>MAX_AGE||data?.version!==1||
    !Array.isArray(data.geo)||!Array.isArray(data.bots)||data.geo.length+data.bots.length>MAX_PREFIXES)throw Error('invalid or stale dataset');
  const geoTable=table(),botTables=new Map();
  for(const row of data.geo){
    if(!row||!(row.country===null||typeof row.country==='string'&&COUNTRY.test(row.country))||
      !(row.asn===null||validAsn(row.asn)))throw Error('invalid geo');
    geoTable.add(row.cidr,{country:row.country||'unknown',asn:row.asn||'unknown'});
  }
  for(const row of data.bots){
    if(!row||!BOTS.includes(row.bot))throw Error('invalid bot');
    if(!botTables.has(row.bot))botTables.set(row.bot,table());
    botTables.get(row.bot).add(row.cidr,true);
  }
  function state(){return now()-stamp<=MAX_AGE&&now()>=stamp?'ready':'stale';}
  return {
    state,
    lookup(ip,bot){
      const fresh=state()==='ready';
      const result=ip&&fresh&&geo?geoTable.lookup(ip):null;
      return {country:result?.country||'unknown',asn:result?.asn||'unknown',
        verification:bot==='none'?'not_applicable':ip&&fresh&&bots&&botTables.get(bot)?.lookup(ip)?'range_match':'unverified'};
    }
  };
}
function loadEnrichment(env=process.env,now=Date.now){
  const geo=env.ENABLE_SENSOR_GEO_ENRICHMENT==='true',bots=env.ENABLE_SENSOR_BOT_VERIFICATION==='true';
  const fallback=state=>({state:()=>state,lookup:(_ip,bot)=>({country:'unknown',asn:'unknown',verification:bot==='none'?'not_applicable':'unverified'})});
  if(!geo&&!bots)return fallback('disabled');
  let fd;
  try{
    if(typeof env.SENSOR_NETWORK_DATA_FILE!=='string'||!env.SENSOR_NETWORK_DATA_FILE) return fallback('missing');
    fd=fs.openSync(env.SENSOR_NETWORK_DATA_FILE,fs.constants.O_RDONLY|fs.constants.O_NONBLOCK);
    if(!fs.fstatSync(fd).isFile())return fallback('invalid');
    const buf=Buffer.alloc(MAX_FILE+1);let n=0,read;
    while(n<buf.length&&(read=fs.readSync(fd,buf,n,buf.length-n,null))>0)n+=read;
    if(n>MAX_FILE)return fallback('invalid');
    return compileDataset(JSON.parse(buf.subarray(0,n).toString('utf8')),{now,geo,bots});
  }catch{return fallback('invalid_or_stale');}
  finally{if(fd!==undefined)try{fs.closeSync(fd);}catch{}}
}
module.exports={loadEnrichment,compileDataset,validAsn,COUNTRY};
