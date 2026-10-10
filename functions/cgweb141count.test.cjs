'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {fromFit}=require('./cgweb141count');
const vault=fs.readFileSync(path.join(__dirname,'fitvault.js'),'utf8');

function excerpt(a,b) {
  const start=vault.indexOf(a), end=vault.indexOf(b,start+a.length);
  assert.ok(start>=0 && end>start, `ancrage absent : ${a}`);
  return vault.slice(start,end);
}

test('CGWEB141/01 : 271 points FIT font autorite face aux 1348 historiques',()=>{
  const firestore={record_count:1348,source_point_count:1348};
  const trueFitRecordCount=271;
  assert.equal(fromFit(trueFitRecordCount),271);
  assert.equal(fromFit(trueFitRecordCount,firestore),271);
});

test('CGWEB141/02 : refuse les FIT vides ou les comptages invalides',()=>{
  for(const n of [0,-1,NaN,Infinity,1.5,undefined,null,'271'])
    assert.throws(()=>fromFit(n),/FIT sans enregistrement valide/);
});

test('CGWEB141/03 : export base exclusivement sur le comptage binaire du FIT',()=>{
  const section=excerpt('    const originalRecordCount=cgweb140.recordDigest(',
    '    const clock=await require("./cgweb140clock")');
  assert.match(section,/const declared=cgweb141count\.fromFit\(originalRecordCount\)/);
  assert.doesNotMatch(section,/source_point_count|activity\.record_count|declaredSourceCount/);
  assert.match(vault,/cgweb140\.candidate\(clock\.buffer,expected,declared\)/);
  assert.match(vault,/cgweb140\.sha\(originalBuffer\)!==originalHash/);
});

test('CGWEB141/04 : edition conserve exactement les Record du FIT source',()=>{
  const section=excerpt('            const sourceRecordCount=cgweb140.recordDigest(',
    '            generated={buffer:output,fileName:');
  assert.match(section,/cgweb141count\.fromFit\(sourceRecordCount\)/);
  assert.match(section,/finalCount!==sourceRecordCount/);
  assert.doesNotMatch(section,/source_point_count|activity\?\.record_count|\bminimum\b/);
  assert.match(vault,/sha256\(sourceBytes\)!==parentHash/);
});
