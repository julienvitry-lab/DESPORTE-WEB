'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const fit=require('./cgweb140');
const hr=require('./cgweb149hr');
function wrap(data){
 const header=Buffer.alloc(14);header[0]=14;header[1]=0x10;header.writeUInt16LE(0x100,2);header.writeUInt32LE(data.length,4);header.write('.FIT',8);
 header.writeUInt16LE(fit.crc(header.subarray(0,12)),12);
 const body=Buffer.concat([header,data]),crc=Buffer.alloc(2);crc.writeUInt16LE(fit.crc(body));return Buffer.concat([body,crc]);
}
function definition(local,global,fields){
 const b=Buffer.alloc(6+3*fields.length);b[0]=0x40|local;b.writeUInt16LE(global,3);b[5]=fields.length;
 fields.forEach(([f,size,type],i)=>{b[6+i*3]=f;b[7+i*3]=size;b[8+i*3]=type;});return b;
}
function fixture(n=60){
 const list=[definition(0,0,[[0,1,2]]),Buffer.from([0,4]),
   definition(1,20,[[253,4,0x86],[5,4,0x86],[6,2,0x84],[2,2,0x84]])];
 for(let i=0;i<n;i++){
  const b=Buffer.alloc(13);b[0]=1;
  b.writeUInt32LE(900000000+i,1);b.writeUInt32LE(i*270,5);
  b.writeUInt16LE(2400+(i%15)*60,9);b.writeUInt16LE(3750+Math.round(Math.sin(i/10)*30),11);list.push(b);
 }
 list.push(definition(2,19,[[15,1,2],[16,1,2]]),Buffer.from([2,40,42]));
 list.push(definition(3,18,[[16,1,2],[17,1,2]]),Buffer.from([3,39,40]));
 list.push(definition(4,34,[[0,1,2]]),Buffer.from([4,0]));
 return wrap(Buffer.concat(list));
}
test('effort profile follows speed/grade and exact 150/170 targets',()=>{
 const original=fixture(300),p=fit.scan(original),rows=p.rows.filter(r=>!r.definition&&r.global===20);
 const result=hr.buildHeartSeries(original,rows,150,170);
 assert.equal(result.length,300);assert.equal(result.reduce((a,b)=>a+b,0),300*150);
 assert.equal(result.reduce((a,b)=>Math.max(a,b),0),170);assert.ok(new Set(result).size>8);
});
test('FIT Session and Lap summaries no longer preserve stale 39/40 bpm',()=>{
 const source=fixture();const result=hr.updateSummaries(source,150,170);const parsed=fit.scan(result);
 assert.equal(fit.crc(result),0);
 assert.equal(fit.recordDigest(source,fit.scan(source)).sha256,fit.recordDigest(result,parsed).sha256);
 const session=parsed.rows.find(r=>!r.definition&&r.global===18),lap=parsed.rows.find(r=>!r.definition&&r.global===19);
 assert.equal(hr.readNumber(result,session,16),150);assert.equal(hr.readNumber(result,session,17),170);
 assert.equal(hr.readNumber(result,lap,15),150);assert.equal(hr.readNumber(result,lap,16),170);
});
test('missing HR fields in Session/Lap are added without any Record changes',()=>{
 let b=fixture();const p=fit.scan(b),pieces=[];
 // A fully detached, synthetic summary-only fixture using the same Record stream.
 for(const r of p.rows){
  if(r.definition&&(r.global===18||r.global===19)){
   const raw=b.subarray(r.start,r.end),copy=Buffer.concat([raw.subarray(0,6),raw.subarray(12)]);copy[5]=0;pieces.push(copy);
  }else if(!r.definition&&(r.global===18||r.global===19))pieces.push(b.subarray(r.start,r.start+1));
  else pieces.push(b.subarray(r.start,r.end));
 }
 b=wrap(Buffer.concat(pieces));fit.scan(b);
 const result=hr.updateSummaries(b,150,170),parsed=fit.scan(result);
 assert.equal(fit.crc(result),0);
 assert.equal(fit.recordDigest(b,fit.scan(b)).sha256,fit.recordDigest(result,parsed).sha256);
 for(const r of parsed.rows.filter(r=>!r.definition&&(r.global===18||r.global===19))){
  const fields=r.global===18?[16,17]:[15,16];assert.equal(hr.readNumber(result,r,fields[0]),150);assert.equal(hr.readNumber(result,r,fields[1]),170);
 }
});
test('full synthetic HR generation preserves 60 Record messages and repairs stale 39 bpm Session',async()=>{
 const source=fixture(60),before=fit.scan(source);
 const edited=await hr.augmentSyntheticHeartRate(source,150,170);
 const after=fit.scan(edited.buffer);
 assert.equal(fit.crc(edited.buffer),0);
 assert.equal(fit.recordDigest(source,before).count,fit.recordDigest(edited.buffer,after).count);
 const summary=after.rows.find(r=>!r.definition&&r.global===18);
 assert.equal(hr.readNumber(edited.buffer,summary,16),150);
 assert.equal(hr.readNumber(edited.buffer,summary,17),170);
 const records=after.rows.filter(r=>!r.definition&&r.global===20);
 const values=records.map(r=>hr.readNumber(edited.buffer,r,3));
 assert.equal(values.reduce((a,b)=>a+b,0),9000);
 assert.equal(values.reduce((a,b)=>Math.max(a,b),0),170);
 assert.ok(source.equals(fixture(60)));
});
test('only explicit SIMULATED editor mode uses the CGWEB149 engine',()=>{
 const s=fs.readFileSync(path.join(__dirname,'fitvault.js'),'utf8');
 assert.match(s,/if\(edited\.edits\.heart_rate_mode==="SIMULATED"\)/);
 assert.match(s,/cgweb149hr\.augmentSyntheticHeartRate\(output,/);
 assert.match(s,/finalCount!==sourceRecordCount/);
});
test('outbound Strava FormData uses the same minute-only name and upload filename',()=>{
 const s=fs.readFileSync(path.join(__dirname,'index.js'),'utf8');
 assert.match(s,/form\.append\("name", cgweb149UploadTitle\)/);
 assert.match(s,/cgweb149UploadTitle\s*\+\s*"\.fit"/);
 assert.match(s,/CGWEB149 : titre de transfert Strava non canonique/);
 assert.doesNotMatch(s.slice(s.indexOf('CGWEB149 : titre de transfert Strava non canonique'),s.indexOf('const response =',s.indexOf('CGWEB149 : titre de transfert Strava non canonique'))),/candidate\.fileName/);
});
