"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fit=require("./cgweb140");
const {augmentHeartRate,targetHeartRates}=require("./cgweb140fix3");
function makeFit({count=30,compressed=false,developer=false,withHR=false}={}){
 const segments=[];
 // file_id: type=activity
 segments.push(Buffer.from([0x40,0,0,0,0,1,0,1,2]));
 segments.push(Buffer.from([0,4]));
 // Local 1: record, timestamp first. Optional developer field.
 const def=Buffer.from([developer?0x61:0x41,0,0,20,0,withHR?3:2,
   253,4,0x86,5,4,0x86,...(withHR?[3,1,2]:[]),...(developer?[1,8,1,0]:[])]);
 segments.push(def);
 for(let i=0;i<count;i++){
   let rec;
   if(compressed && i>0){
     rec=Buffer.alloc(1+4+(withHR?1:0)+(developer?1:0));
     rec[0]=0xa0|(i&31);
     rec.writeUInt32LE(i*100,1);
     if(withHR)rec[5]=135;
     if(developer)rec[rec.length-1]=0x7a;
   }else{
     rec=Buffer.alloc(1+4+4+(withHR?1:0)+(developer?1:0));
     rec[0]=1;rec.writeUInt32LE(0x10000000+i,1);rec.writeUInt32LE(i*100,5);
     if(withHR)rec[9]=135;
     if(developer)rec[rec.length-1]=0x7a;
   }
   segments.push(rec);
 }
 // lap, session and activity definitions not required for this byte-preservation unit test.
 const header=Buffer.alloc(14);header[0]=14;header[1]=0x10;header.writeUInt16LE(0x0100,2);
 const data=Buffer.concat(segments);header.writeUInt32LE(data.length,4);header.write('.FIT',8,4,'ascii');
 header.writeUInt16LE(fit.crc(header.subarray(0,12)),12);
 const body=Buffer.concat([header,data]),checksum=Buffer.alloc(2);
 checksum.writeUInt16LE(fit.crc(body));return Buffer.concat([body,checksum]);
}
test('synthetic HR uses exactly the requested average and maximum',()=>{
 for(const n of [2,3,25,500,4000]){
  const v=targetHeartRates(n,150,170);
  assert.equal(v.length,n);assert.equal(v.reduce((a,b)=>a+b,0),n*150);
  assert.equal(v.reduce((a,b)=>Math.max(a,b),0),170);
 }
 assert.deepEqual(targetHeartRates(2,150,150),[150,150]);
});
for(const compressed of [false,true])for(const developer of [false,true])for(const withHR of [false,true]){
 test(`preserves every source Record attribute: compressed=${compressed}, dev=${developer}, existingHR=${withHR}`,()=>{
   const raw=makeFit({count:40,compressed,developer,withHR});
   const before=fit.scan(raw);
   const result=augmentHeartRate(raw,150,170);
   const after=fit.scan(result.buffer);
   assert.equal(after.rows.filter(r=>!r.definition&&r.global===20).length,40);
   assert.equal(before.rows.length,after.rows.length);
   assert.equal(result.report.all_original_non_hr_record_fields_preserved,true);
   assert.equal(result.report.all_non_record_messages_preserved,true);
   assert.equal(fit.crc(result.buffer),0);
 });
}
test('4000 input Records produce exactly 4000 verified output Records',()=>{
  const raw=makeFit({count:4000,compressed:true,developer:true});
  const changed=augmentHeartRate(raw,150,170);
  assert.equal(fit.scan(changed.buffer).rows.filter(r=>!r.definition&&r.global===20).length,4000);
});
test('corrupted source FIT is rejected without output',()=>{
 const broken=makeFit({count:10});broken[25]^=0xff;
 assert.throws(()=>augmentHeartRate(broken,150,170),/INVALID_SIZE_OR_CRC/);
});
