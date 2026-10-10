"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const session=require("./cgweb143session");
const fit=require("./cgweb140");
function wrap(data){
  const h=Buffer.alloc(14);h[0]=14;h[1]=0x10;h.writeUInt16LE(0x0100,2);
  h.writeUInt32LE(data.length,4);h.write(".FIT",8);
  h.writeUInt16LE(fit.crc(h.subarray(0,12)),12);
  const bytes=Buffer.concat([h,data]);const tail=Buffer.alloc(2);tail.writeUInt16LE(fit.crc(bytes));
  return Buffer.concat([bytes,tail]);
}
function make({developer=false,bigEndian=false}={}){
 const arch=bigEndian?1:0;
 function def(local,global,fields,dev=[]){
   const b=Buffer.alloc(6+fields.length*3+(dev.length?1+dev.length*3:0));
   b[0]=0x40|local|(dev.length?0x20:0);b[1]=0;b[2]=arch;
   bigEndian?b.writeUInt16BE(global,3):b.writeUInt16LE(global,3);
   b[5]=fields.length;let off=6;
   for(const [num,size,type] of fields){b[off++]=num;b[off++]=size;b[off++]=type;}
   if(dev.length){b[off++]=dev.length;for(const [n,size,index] of dev){b[off++]=n;b[off++]=size;b[off++]=index;}}
   return b;
 }
 const idDef=def(0,0,[[0,1,0x00]]),idData=Buffer.from([0,4]);
 const recordDef=def(1,20,[[253,4,0x86],[5,4,0x86],[3,1,2]]);
 const records=[];
 for(let i=0;i<30;i++){
   const r=Buffer.alloc(10);r[0]=1;
   bigEndian?r.writeUInt32BE(0x10000000+i,1):r.writeUInt32LE(0x10000000+i,1);
   bigEndian?r.writeUInt32BE(i*100,5):r.writeUInt32LE(i*100,5);
   r[9]=150;records.push(r);
 }
 const sessionDef=def(2,18,[[7,4,0x86],[8,4,0x86],[9,4,0x86]],developer?[[0,1,0]]:[]);
 const sessionRecord=Buffer.alloc(1+12+(developer?1:0));sessionRecord[0]=2;
 for(const [pos,value] of [[1,100000],[5,99999],[9,123456]])
   bigEndian?sessionRecord.writeUInt32BE(value,pos):sessionRecord.writeUInt32LE(value,pos);
 if(developer)sessionRecord[sessionRecord.length-1]=0x7a;
 const activityDef=def(3,34,[[0,1,0x00]]),activityRecord=Buffer.from([3,0]);
 return wrap(Buffer.concat([idDef,idData,recordDef,...records,sessionDef,sessionRecord,activityDef,activityRecord]));
}
function patched(original,additions){
 const parsed=fit.scan(original);
 const s=parsed.rows.find(r=>!r.definition&&r.global===18);
 const data=session.extend(original,parsed,s,additions,fit.crc);
 return wrap(data);
}
for(const developer of [false,true])for(const bigEndian of [false,true]){
 test(`fields: Session without calories or ascent, developer=${developer}, bigEndian=${bigEndian}`,()=>{
  const source=make({developer,bigEndian});const before=fit.recordDigest(source,fit.scan(source));
  const output=patched(source,[{field:11,value:150},{field:22,value:38}]);
  const parsed=fit.scan(output),after=fit.recordDigest(output,parsed);
  assert.equal(fit.crc(output),0);
  assert.equal(after.count,before.count);
  assert.equal(after.sha256,before.sha256);
  assert.equal(parsed.rows.filter(r=>!r.definition&&r.global===18).length,1);
  const s=parsed.rows.find(r=>!r.definition&&r.global===18);
  assert.deepEqual(s.fields.map(f=>f.num),[7,8,9,11,22]);
  const calories=s.fields.find(f=>f.num===11).offset,ascent=s.fields.find(f=>f.num===22).offset;
  assert.equal(bigEndian?output.readUInt16BE(calories):output.readUInt16LE(calories),150);
  assert.equal(bigEndian?output.readUInt16BE(ascent):output.readUInt16LE(ascent),38);
  if(developer)assert.equal(output[s.end-1],0x7a);
  assert.equal(parsed.rows.filter(r=>r.definition&&r.global===18).length,3);
 });
}
test('adding missing summary fields does not change any Record bytes',()=>{
 const src=make(),parsed=fit.scan(src),s=parsed.rows.find(r=>!r.definition&&r.global===18);
 const output=patched(src,[{field:11,value:180},{field:22,value:62}]);
 assert.deepEqual(fit.recordDigest(src,parsed),fit.recordDigest(output,fit.scan(output)));
});
test('FIT unit quantization rounds fractional values; invalid numbers and overflow fail',()=>{
 assert.equal(session.quantize(22,42.49),42);
 assert.equal(session.quantize(22,42.51),43);
 assert.equal(session.quantize(9,1234.125*100),123413);
 assert.equal(session.quantize(7,70000.25),70000);
 assert.throws(()=>session.quantize(11,100000),/METRIC_OUT_OF_RANGE/);
 assert.throws(()=>session.quantize(22,NaN),/METRIC_INVALID/);
});
test('bad session layout never produces a new FIT',()=>{
 const b=make(),p=fit.scan(b),s=p.rows.find(r=>!r.definition&&r.global===18);
 assert.throws(()=>session.extend(b,p,{...s,compressed:true},[{field:11,value:100}],fit.crc),/UNSAFE_SESSION_LAYOUT/);
 assert.throws(()=>session.extend(b,p,s,[{field:9,value:100}],fit.crc),/INVALID_ADDED_FIELD/);
});
test('live cgweb140 engine is wired to Session extension and integer metric quantization',()=>{
 const fs=require('node:fs');const source=fs.readFileSync(require.resolve('./cgweb140'),'utf8');
 assert.ok(source.includes('require("./cgweb143session")'));
 assert.ok(source.includes('cgweb143.quantize(field,n)'));
 assert.ok(source.includes('cgweb143.extend(out,parsed,s,missing,crc)'));
 assert.ok(source.includes('after.sha256!==records.sha256'));
});
