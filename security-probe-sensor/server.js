'use strict';
const http=require('node:http');
const express=require('express');
const {createSensor,LIMITS}=require('./sensor');

function createApp(sensor) {
  const app=express();
  app.disable('x-powered-by');
  app.set('trust proxy',false);
  if(sensor.enabled) app.use((req,res,next)=>{
    let done=false;
    const complete=aborted=>{
      if(done) return;
      done=true;
      try{sensor.observe(req,res.statusCode,aborted);}catch{/* Never change HTTP behavior. */}
    };
    res.once('finish',()=>complete(false));
    res.once('close',()=>complete(!res.writableFinished));
    next();
  });
  // No body parser, static file serving, redirects, auth or business endpoints.
  app.use((req,res)=>{
    res.set('Cache-Control','no-store');
    res.set('X-Content-Type-Options','nosniff');
    if((req.method==='GET'||req.method==='HEAD')&&req.url.split('?',1)[0]==='/health') return res.status(200).type('text/plain').send('ok\n');
    return res.status(404).type('text/plain').send('Not Found\n');
  });
  app.use((err,req,res,next)=>{
    if(res.headersSent) return res.destroy();
    res.status(500).type('text/plain').send('Internal Server Error\n');
  });
  return app;
}
function createServer(sensor) {
  const server=http.createServer({maxHeaderSize:8192,requestTimeout:15000,headersTimeout:10000,keepAliveTimeout:5000,connectionsCheckingInterval:1000},createApp(sensor));
  server.maxHeadersCount=64;
  server.maxConnections=256;
  server.maxRequestsPerSocket=100;
  server.setTimeout(15000,socket=>socket.destroy());
  // Parser errors never reach Express and must not expose raw packet data.
  server.on('clientError',(_err,socket)=>socket.destroy());
  return server;
}
function stdoutSink(stream=process.stdout){
  let ready=true,skipped=0;
  stream.on('drain',()=>{ready=true;});
  stream.on('error',()=>{ready=false;});
  return report=>{
    if(!ready){skipped=Math.min(Number.MAX_SAFE_INTEGER,skipped+1);return;}
    const line=JSON.stringify({...report,skippedReportsBefore:skipped})+'\n';
    ready=stream.write(line);skipped=0;
  };
}
function main(env=process.env) {
  const port=Number(env.SENSOR_PORT||8080),host=env.SENSOR_HOST||'127.0.0.1';
  if(!Number.isInteger(port)||port<1||port>65535) throw Error('Invalid sensor port');
  const sensor=createSensor({env,emit:stdoutSink()});
  const server=createServer(sensor);
  let timer;
  if(sensor.enabled) timer=setInterval(()=>sensor.flush(),LIMITS.reportMs).unref();
  server.on('error',()=>{clearInterval(timer);sensor.close();process.stderr.write('sensor listener failed\n');process.exitCode=1;});
  server.listen(port,host);
  let stopping=false;
  function stop(){
    if(stopping)return;stopping=true;
    clearInterval(timer);
    const deadline=setTimeout(()=>server.closeAllConnections(),5000).unref();
    server.close(()=>{clearTimeout(deadline);sensor.flush();sensor.close();});
  }
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  return {server,sensor,stop};
}
if(require.main===module) main();
module.exports={createApp,createServer,stdoutSink,main};
