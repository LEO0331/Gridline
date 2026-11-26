'use strict';
const {createHash,timingSafeEqual}=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {parseRange}=require('./history');
const ROUTES=new Set(['/operator','/operator/app.js','/operator/style.css','/operator/metrics','/operator/export.csv']);
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
  return (req,res)=>{
    const target=req.url;
    if(typeof target!=='string')return false;
    const q=target.indexOf('?'),pathname=q<0?target:target.slice(0,q);
    if(!ROUTES.has(pathname)||!['GET','HEAD'].includes(req.method))return false;
    res.set({
      'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',
      'Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin',
      'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
    });
    if(req.headers['sec-fetch-site']==='cross-site'){res.status(403).type('text/plain').send('Forbidden\n');return true;}
    if(!authorized(req)){
      res.set('WWW-Authenticate','Basic realm="Gridline sensor operator", charset="UTF-8"');
      res.status(401).type('text/plain').send('Unauthorized\n');return true;
    }
    // Exclude only authenticated, exact operator requests from sensor totals.
    res.locals.operatorAuthorized=true;
    if(target.length>256){res.status(400).type('text/plain').send('Invalid request\n');return true;}
    if(Object.hasOwn(assets,pathname)){
      if(q>=0){res.status(400).type('text/plain').send('Invalid request\n');return true;}
      res.type(assets[pathname][0]).send(assets[pathname][1]);return true;
    }
    const range=parseRange(new URLSearchParams(q<0?'':target.slice(q+1)),now());
    if(!range){res.status(400).type('text/plain').send('Invalid UTC date range\n');return true;}
    if(pathname==='/operator/metrics'){
      res.json({observationEnabled:sensor.enabled,asOf:new Date(now()).toISOString(),...history.summarize(range)});return true;
    }
    res.set('Content-Disposition','attachment; filename="sensor-aggregates.csv"');
    res.type('text/csv').send(history.exportCsv(range));return true;
  };
}
module.exports={createOperator};
