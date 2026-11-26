'use strict';
const {createHash,timingSafeEqual}=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {parseRange}=require('./history');
const {parseImport,MAX_IMPORT_BYTES}=require('./restore');
const ROUTES=new Set(['/operator','/operator/app.js','/operator/style.css','/operator/metrics','/operator/export.csv','/operator/import']);
const hash=value=>createHash('sha256').update(value).digest();
function createOperator({env=process.env,history,sensor,now=Date.now}={}){
  const password=env.SENSOR_OPERATOR_PASSWORD;
  const enabled=env.ENABLE_SENSOR_DASHBOARD==='true'&&typeof password==='string'&&/^[\x21-\x7e]{32,256}$/.test(password)&&history;
  if(!enabled)return ()=>false;
  const expected=hash('operator:'+password);
  const assets={
    '/operator':['text/html',fs.readFileSync(path.join(__dirname,'operator','index.html'),'utf8')],
    '/operator/app.js':['application/javascript',fs.readFileSync(path.join(__dirname,'operator','app.js'),'utf8')],
    '/operator/style.css':['text/css',fs.readFileSync(path.join(__dirname,'operator','style.css'),'utf8')]
  };
  function authorized(req){
    const header=req.headers.authorization;
    if(typeof header!=='string'||header.length>512||!/^Basic [A-Za-z0-9+/]+={0,2}$/i.test(header)||
      (req.headersDistinct?.authorization?.length??1)!==1)return false;
    const encoded=header.slice(6),decoded=Buffer.from(encoded,'base64');
    if(decoded.toString('base64')!==encoded)return false;
    return timingSafeEqual(hash(decoded),expected);
  }
  let reportsInFlight=0,importInFlight=false;
  return (req,res)=>{
    const target=req.url;
    if(typeof target!=='string')return false;
    const q=target.indexOf('?'),pathname=q<0?target:target.slice(0,q);
    if(!ROUTES.has(pathname)||(pathname==='/operator/import'?req.method!=='POST':!['GET','HEAD'].includes(req.method)))return false;
    res.set({
      'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',
      'Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin',
      'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
    });
    if(req.headers['sec-fetch-site']==='cross-site'&&!(pathname==='/operator'&&req.method==='GET'&&req.headers['sec-fetch-mode']==='navigate'&&req.headers['sec-fetch-dest']==='document')){res.status(403).type('text/plain').send('Forbidden\n');return true;}
    if(!authorized(req)){
      res.set('WWW-Authenticate','Basic realm="Gridline sensor operator", charset="UTF-8"');
      res.status(401).type('text/plain').send('Unauthorized\n');return true;
    }
    // Exclude only authenticated, exact operator requests from sensor totals.
    res.locals.operatorAuthorized=true;
    if(target.length>256){res.status(400).type('text/plain').send('Invalid request\n');return true;}
    if(pathname==='/operator/import'){
      // Browser POST must be same-origin with a non-simple header. No CORS or
      // preflight route is exposed. Non-browser authenticated clients may omit
      // Fetch Metadata but must still supply the dedicated header.
      if(q>=0||req.headers['x-sensor-import']!=='1'||req.headers['content-type']!=='text/plain'||
        (req.headers['sec-fetch-site']&&req.headers['sec-fetch-site']!=='same-origin')){
        res.status(403).type('text/plain').send('Forbidden\n');return true;
      }
      if(importInFlight){res.status(503).type('text/plain').send('Import busy\n');return true;}
      const length=Number(req.headers['content-length']);
      if(!Number.isInteger(length)||length<1||length>MAX_IMPORT_BYTES){
        res.set('Connection','close');res.status(413).type('text/plain').send('Invalid import size\n');return true;
      }
      importInFlight=true;
      const chunks=[];let size=0,done=false;
      const finish=()=>{if(done)return false;done=true;importInFlight=false;clearTimeout(timer);chunks.length=0;return true;};
      const timer=setTimeout(()=>{if(finish())req.destroy();},10000).unref();
      req.on('data',chunk=>{
        if(done)return;
        size+=chunk.length;
        if(size>MAX_IMPORT_BYTES||size>length){if(finish())req.destroy();return;}
        chunks.push(chunk);
      });
      req.once('aborted',finish);req.once('error',finish);res.once('close',finish);
      req.once('end',()=>{
        if(done)return;
        try{
          if(size!==length)throw Error('length mismatch');
          const reports=parseImport(Buffer.concat(chunks,size).toString('utf8'));
          const result=history.restore(reports);
          if(finish())res.json(result);
        }catch{if(finish())res.status(400).type('text/plain').send('Invalid aggregate export\n');}
      });
      return true;
    }
    if(Object.hasOwn(assets,pathname)){
      if(q>=0){res.status(400).type('text/plain').send('Invalid request\n');return true;}
      res.type(assets[pathname][0]).send(assets[pathname][1]);return true;
    }
    const range=parseRange(new URLSearchParams(q<0?'':target.slice(q+1)),now());
    if(!range){res.status(400).type('text/plain').send('Invalid UTC date range\n');return true;}
    // Bound expensive operator responses and outstanding socket buffers. Public
    // probe requests are never limited based on classifier output.
    if(reportsInFlight>=2){res.status(503).type('text/plain').send('Report capacity busy\n');return true;}
    reportsInFlight++;
    let released=false;
    const release=()=>{if(!released){released=true;reportsInFlight--;}};
    res.once('finish',release);res.once('close',release);
    if(pathname==='/operator/metrics'){
      res.json({observationEnabled:sensor.enabled,asOf:new Date(now()).toISOString(),diagnostics:sensor.diagnostics?.()||null,...history.summarize(range)});return true;
    }
    res.set('Content-Disposition','attachment; filename="sensor-aggregates.csv"');
    res.type('text/csv').send(history.exportCsv(range));return true;
  };
}
module.exports={createOperator};
