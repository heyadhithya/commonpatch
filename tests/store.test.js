import test from 'node:test';
import assert from 'node:assert/strict';
import {toggleSaved,readSaved,filterIssues,collectionLink,parseCollection} from '../public/store.js';

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
