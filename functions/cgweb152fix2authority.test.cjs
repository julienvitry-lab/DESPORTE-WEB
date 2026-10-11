"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const fit=require('./cgweb140');
const authority=require('./cgweb152fix2authority');
function wrap(data){
  const h=Buffer.alloc(14);h[0]=14;h[1]=0x10;h.writeUInt16LE(256,2);h.writeUInt32LE(data.length,4);h.write('.FIT',8);h.writeUInt16LE(fit.crc(h.subarray(0,12)),12);
  const body=Buffer.concat([h,data]),tail=Buffer.alloc(2);tail.writeUInt16LE(fit.crc(body));return Buffer.concat([body,tail]);
}
function def(local,global,fields){const b=Buffer.alloc(6+fields.length*3);b[0]=0x40|local;b.writeUInt16LE(global,3);b[5]=fields.length;fields.forEach(([num,size,type],i)=>{b[6+i*3]=num;b[7+i*3]=size;b[8+i*3]=type;});return b;}
function sample(n=266){const parts=[def(0,20,[[253,4,0x86],[3,1,2]])];for(let i=0;i<n;i++){const v=Buffer.alloc(6);v[0]=0;v.writeUInt32LE(900000000+i,1);v[5]=39;parts.push(v);}parts.push(def(1,18,[[16,1,2],[17,1,2]]),Buffer.from([1,20,20]));return wrap(Buffer.concat(parts));}
function mockDecode(b){let p=fit.scan(b),count=fit.recordDigest(b,p).count;return {recordMesgs:Array.from({length:count},()=>({})),sessionMesgs:[{}]};}
test('unmarked 266-Record FIT accepts independent binary proof without requiring historical point_count',async()=>{
 const b=sample(),digest=fit.sha(b);const p=await authority.verifyCurrentBytes(b,digest,{...fit,inspect:mockDecode});
 assert.equal(p.sha256,digest);assert.equal(p.record_count,266);assert.match(p.provenance,/CURRENT_FIT_BINARY/);
});
test('missing or truncated Record data cannot pass',async()=>{
 const b=sample(2);await assert.rejects(()=>authority.verifyCurrentBytes(b,fit.sha(b),{...fit,inspect:mockDecode}),/enregistrements/);
});
test('SHA and CRC mismatch fail before any mutation',async()=>{
 const b=sample();await assert.rejects(()=>authority.verifyCurrentBytes(b,'0'.repeat(64),{...fit,inspect:mockDecode}),/SHA/);
 const c=Buffer.from(b);c[50]^=1;await assert.rejects(()=>authority.verifyCurrentBytes(c,fit.sha(c),{...fit,inspect:mockDecode}),/CRC|INVALID/);
});
test('SDK count discrepancy fails',async()=>{
 const b=sample();await assert.rejects(()=>authority.verifyCurrentBytes(b,fit.sha(b),{...fit,inspect:async()=>({recordMesgs:[{}],sessionMesgs:[{}]})}),/décodage/);
});
test('manual editor still denies uncertified source; only export_hr_prepare can use proof',()=>{
 const s=fs.readFileSync(path.join(__dirname,'fitvault.js'),'utf8');
 assert.match(s,/cgweb152Auto && cgweb152LegacyProof\?\.sha256===parentHash/);
 assert.match(s,/cgweb152fix2authority\.verifyCurrentBytes/);
 assert.match(s,/sourceRecordCount\)/);
 assert.match(s,/finalCount!==sourceRecordCount/);
 assert.match(s,/CGWEB152_FIX2_VERIFIED_CURRENT_FIT_BINARY|cgweb152LegacyProof\.provenance/);
});
