import test from 'node:test';
import assert from 'node:assert/strict';
import {privacyReceipt} from '../functions/lib/privacy-receipts.js';

const choice={id:'12345678-1234-4123-8123-123456789abc',version:3,action:'reject',analytics:false,external_media:false,chosen_at:new Date().toISOString()};
const request=(body=choice,origin='https://example.test')=>new Request('https://example.test/api/privacy/receipt',{
  method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)
});
test('receipt strips unsolicited identity data and stores an authoritative notice',async()=>{
  let saved;
  const response=await privacyReceipt(request({...choice,ip:'do-not-save',account:'secret'}),async row=>{saved=row;});
  assert.equal(response.status,201);
  assert.equal(saved.ip,undefined);assert.equal(saved.account,undefined);
  assert.equal(saved.notice.version,3);
  assert.equal(saved.notice.receipt_days,365);
});
test('cross-origin, unsupported versions, inconsistent rejection and oversized bodies are rejected',async()=>{
  const store=()=>{throw new Error('Must not write');};
  assert.equal((await privacyReceipt(request(choice,'https://other.test'),store)).status,403);
  for(const value of [{...choice,version:2},{...choice,analytics:true},{...choice,chosen_at:'bad'},{...choice,id:'bad'}])
    assert.equal((await privacyReceipt(request(value),store)).status,400);
  assert.equal((await privacyReceipt(request({...choice,padding:'x'.repeat(3000)}),store)).status,413);
});
test('database failures never falsely acknowledge a receipt',async()=>{
  const response=await privacyReceipt(request(),async()=>{throw new Error('DB unavailable');});
  assert.equal(response.status,503);assert.equal((await response.json()).accepted,false);
});
