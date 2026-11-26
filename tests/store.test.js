import test from 'node:test';
import assert from 'node:assert/strict';
import {toggleSaved,saveCollection,readSaved,filterIssues,collectionLink,parseCollection} from '../public/store.js';

function storage(){const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,val)=>data.set(key,val)};}
const sample={id:'abc/test#12',repo:'abc/test',number:12,title:'Add accessible map controls',updatedAt:'2026-10-01',category:'Mapping',project:'Atlas',language:'TypeScript',labels:['good first issue'],comments:1};

test('saved issues contain public metadata only and survive a reload',()=>{
  const local=storage();
  assert.equal(toggleSaved({...sample,note:'private',body:'extra'},local),true);
  assert.equal(readSaved(local)[0].note,undefined);
  assert.equal(readSaved(local)[0].body,undefined);
  assert.equal(toggleSaved(sample,local),false);
  assert.deepEqual(readSaved(local),[]);
});
test('storage failure is visible to callers',()=>{
  assert.throws(()=>toggleSaved(sample,{getItem:()=>null,setItem(){throw Error();}}),/could not save/);
});
test('collections deduplicate and never include private state or URL credentials from issues',()=>{
  const url=collectionLink(['ABC/Test#12',sample.id,'https://evil.test/path','abc/other#1'],'https://demo.org/commonpatch/?secret=123#old');
  assert.equal(new URL(url).pathname,'/commonpatch/');
  assert.deepEqual(parseCollection(new URL(url).hash),['abc/test#12','abc/other#1']);
  assert.ok(!url.includes('secret'));
});
test('filters combine within an issue and preserve caller order',()=>{
  const other={...sample,id:'xyz/name#1',category:'Climate',title:'Publish data',language:'Python',labels:['help wanted']};
  assert.deepEqual(filterIssues([sample,other],{category:'Climate',label:'starter'}),[]);
  assert.deepEqual(filterIssues([other,sample],{query:'Atlas accessible',label:'starter'}),[sample]);
});
test('public browsing survives a browser that denies the localStorage getter',()=>{
  const old=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('Denied');}});
  try {assert.deepEqual(readSaved(),[]); assert.throws(()=>toggleSaved(sample),/unavailable/);}
  finally {if(old)Object.defineProperty(globalThis,'localStorage',old);else delete globalThis.localStorage;}
});
test('board descriptions and source state survive normalization but stay out of bookmarks',async()=>{
  const {normalizeBoard}=await import('../public/store.js');
  const item={...sample,body:'Read the public guide.',state:'open',locked:false};
  const result=normalizeBoard({issues:[item],asOf:'2026-11-25T01:00:00Z'},[]);
  assert.equal(result.issues[0].body,item.body);
  assert.equal(result.issues[0].state,'open');
  const local=storage();toggleSaved(result.issues[0],local);
  assert.equal(readSaved(local)[0].body,undefined);
});

test('bulk collection save commits once, preserves existing entries and ignores repeated references',()=>{
  const local=storage();
  const issue=n=>({...sample,id:'abc/test#'+n,number:n,title:'Issue '+n});
  toggleSaved(issue(5),local);
  const noteKey='commonpatch-plan-v1:abc/test#5';
  local.setItem(noteKey,'{"checks":[true,false,true],"note":"private draft"}');
  const before=local.getItem(noteKey);
  let writes=0;
  const counted={getItem:local.getItem,setItem:(key,value)=>{writes++;local.setItem(key,value);}};
  const duplicate={...issue(5),id:'ABC/TEST#5',title:'Changed incoming title'};
  assert.equal(saveCollection([issue(8),duplicate,issue(9),issue(8)],counted),2);
  assert.equal(writes,1);
  assert.deepEqual(readSaved(local).map(i=>i.number),[8,9,5]);
  assert.equal(readSaved(local).at(-1).title,'Issue 5');
  assert.equal(local.getItem(noteKey),before);
  assert.equal(saveCollection([issue(9),issue(8),duplicate],counted),0);
  assert.equal(writes,1);
});

test('collection additions enforce the 80-item cap atomically and leave plan storage untouched',()=>{
  const local=storage();
  const issue=n=>({...sample,id:'abc/test#'+n,number:n});
  saveCollection(Array.from({length:79},(_,i)=>issue(i+1)),local);
  const before=local.getItem('commonpatch:saved:v1');
  const plan='commonpatch-plan-v1:abc/test#79';
  local.setItem(plan,'existing');
  assert.throws(()=>saveCollection([issue(80),issue(81)],local),/80 issues/);
  assert.equal(local.getItem('commonpatch:saved:v1'),before);
  assert.equal(local.getItem(plan),'existing');
  assert.equal(saveCollection([issue(1),issue(80)],local),1);
  assert.equal(readSaved(local).length,80);
  assert.equal(saveCollection([issue(80)],local),0);
});

test('unresolved references, unreadable storage and quota failure never partially add a collection',()=>{
  const local=storage();
  const another={...sample,id:'abc/test#13',number:13};
  assert.throws(()=>saveCollection([sample,'abc/test#13'],local),/verified/);
  assert.deepEqual(readSaved(local),[]);
  local.setItem('commonpatch:saved:v1','broken data');
  assert.throws(()=>saveCollection([sample],local),/could not be read/);
  assert.equal(local.getItem('commonpatch:saved:v1'),'broken data');
  let attempts=0;
  const quota={getItem:()=>null,setItem(){attempts++;throw Error('quota');}};
  assert.throws(()=>saveCollection([sample,another],quota),/could not save/);
  assert.equal(attempts,1);
});

test('bulk-saved entries include public metadata only',()=>{
  const local=storage();
  saveCollection([{...sample,note:'secret note',approach:'private plan',body:'original body',checks:[true]}],local);
  const raw=local.getItem('commonpatch:saved:v1');
  for(const privateData of ['secret note','private plan','original body','checks'])assert.ok(!raw.includes(privateData));
});
