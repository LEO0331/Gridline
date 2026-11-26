'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const yaml=fs.readFileSync(path.join(__dirname,'../../render.yaml'),'utf8');
const active=yaml.split('\n').filter(line=>!line.trimStart().startsWith('#')).join('\n');
test('Blueprint preserves operator-owned runtime configuration',()=>{
  assert.doesNotMatch(active,/^\s*autoDeploy(?:Trigger)?:/m);
  for(const key of ['ENABLE_PASSIVE_PROBE_SENSOR','ENABLE_SENSOR_DASHBOARD','SENSOR_NETWORK_MODE','SENSOR_TOPOLOGY_VERIFIED','SENSOR_TRUSTED_PROXY_IPS']){
    assert.match(active,new RegExp('^\\s*- key: '+key+'\\n\\s+sync: false\\s*$','m'),key);
    assert.equal(active.split('- key: '+key+'\n').length,2,key);
  }
  for(const key of ['SENSOR_OPERATOR_PASSWORD','SENSOR_HMAC_SECRET']){
    assert.match(active,new RegExp('^\\s*- key: '+key+'\\n\\s+generateValue: true\\s*$','m'),key);
  }
  assert.match(active,/^\s+rootDir: security-probe-sensor$/m);
  assert.match(active,/^\s+plan: free$/m);
});
