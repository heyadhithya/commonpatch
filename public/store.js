const savedKey = 'commonpatch:saved:v1';
const maxSaved = 80;
const maxShared = 20;
const referencePattern = /^([\w.-]+\/[\w.-]+)#([1-9]\d{0,8})$/;

export function validRef(id) {
  return typeof id === 'string' && id.length <= 150 && referencePattern.test(id);
}

function minimalIssue(raw) {
  if (!raw || !validRef(raw.id)) return null;
  const parts = raw.id.match(referencePattern);
  const number = Number(parts[2]);
  const repo = parts[1];
  if (raw.repo?.toLowerCase() !== repo.toLowerCase() || Number(raw.number) !== number || !raw.title) return null;
  const result = {id:raw.id, repo, number, url:'https://github.com/'+repo+'/issues/'+number};
  for (const key of ['title','category','project','language','createdAt','updatedAt']) result[key] = String(raw[key] || '').slice(0,1000);
  result.labels = (Array.isArray(raw.labels) ? raw.labels : []).filter(l => typeof l === 'string').slice(0,35);
  result.comments = Math.max(0, Number(raw.comments)||0);
  result.assigneeCount = Math.max(0, Number(raw.assigneeCount)||0);
  return result;
}

export function readSaved(storage) {
  try {
    storage ??= globalThis.localStorage;
    const records = JSON.parse(storage.getItem(savedKey) || '[]');
    if (!Array.isArray(records)) return [];
    const seen = new Set();
    return records.map(minimalIssue).filter(issue => {
      if (!issue || seen.has(issue.id.toLowerCase())) return false;
      seen.add(issue.id.toLowerCase());
      return true;
    }).slice(0,maxSaved);
  } catch {return [];}
}

export function toggleSaved(issue,storage) {
  try {storage ??= globalThis.localStorage;} catch {throw new Error('Browser storage is unavailable. You can still browse and open issues.');}
  const clean = minimalIssue(issue);
  if (!clean) throw new Error('This issue reference is invalid.');
  const docs = readSaved(storage);
  const index = docs.findIndex(doc => doc.id.toLowerCase() === clean.id.toLowerCase());
  const adding = index === -1;
  if (adding && docs.length >= maxSaved) throw new Error('Your workbench holds 80 issues. Remove one before adding another.');
  if (adding) docs.unshift(clean); else docs.splice(index,1);
  try {storage.setItem(savedKey,JSON.stringify(docs));}
  catch {throw new Error('Your browser could not save this change. Check site storage permissions.');}
  return adding;
}

export function isSaved(id) {
  return readSaved().some(item=>item.id.toLowerCase()===String(id).toLowerCase());
}

export function parseCollection(hash) {
  if (!hash.startsWith('#collection=')) return [];
  try {
    const decoded=decodeURIComponent(hash.slice(12));
    return [...new Set(decoded.split(',').filter(validRef).map(x=>x.toLowerCase()))].slice(0,maxShared);
  } catch {return [];}
}

export function collectionLink(ids, base=globalThis.location.href) {
  const list=[...new Set(ids.filter(validRef).map(ref=>ref.toLowerCase()))].slice(0,maxShared);
  const url=new URL(base); url.search=''; url.hash='collection='+encodeURIComponent(list.join(','));
  return url.href;
}

export function starter(issue){
  return issue.labels.some(label=>/good first|first[- ]timer|beginner|starter|newcomer|easy pick/i.test(label));
}

export function filterIssues(issues, {query='',category='',language='',label='',sort='mix'}={}) {
  const words=query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const list=issues.filter(item=>{
    if(category && item.category!==category) return false;
    if(language && item.language!==language) return false;
    if(label==='starter'&&!starter(item))return false;
    if(label==='help'&&!item.labels.some(l=>l.toLowerCase()==='help wanted'))return false;
    const hay=[item.title,item.repo,item.project,item.category,item.language,...item.labels,'#'+item.number].join(' ').toLowerCase();
    return words.every(word=>hay.includes(word));
  });
  list.sort((a,b)=>{
    if(sort==='discussion' && a.comments!==b.comments) return a.comments-b.comments;
    const field=sort==='new'?'createdAt':'updatedAt';
    return String(b[field]).localeCompare(String(a[field]))||a.id.localeCompare(b.id);
  });
  if(sort!=='mix')return list;
  const groups=new Map();
  list.forEach(item=>{if(!groups.has(item.category))groups.set(item.category,[]);groups.get(item.category).push(item);});
  const mixed=[];
  while(mixed.length<list.length) for(const group of groups.values()) if(group.length)mixed.push(group.shift());
  return mixed;
}

export function normalizeBoard(input,projects) {
  if(!input || !Array.isArray(input.issues) || !Array.isArray(projects) || !Number.isFinite(Date.parse(input.asOf))) throw new Error('The issue index is unavailable.');
  const ids=new Set();
  const issues=input.issues.map(raw=>{
    const item=minimalIssue(raw);
    if(!item)return null;
    if(typeof raw.body==='string') item.body=raw.body.slice(0,45000);
    if(raw.state==='open'||raw.state==='closed') item.state=raw.state;
    if(typeof raw.locked==='boolean') item.locked=raw.locked;
    return item;
  }).filter(item=>{
    if(!item||ids.has(item.id.toLowerCase()))return false;
    ids.add(item.id.toLowerCase());return true;
  });
  return {...input,issues,projects};
}

async function fetchJSON(path,signal,force=false) {
  const result=await fetch(path,{signal,cache:force?'no-cache':'default',headers:{Accept:'application/json'}});
  if(!result.ok)throw new Error('HTTP '+result.status);
  return result.json();
}

export async function snapshotBoard(signal) {
  const [snapshot,projects]=await Promise.all([fetchJSON('./data/board.json',signal),fetchJSON('./data/projects.json',signal)]);
  return normalizeBoard({...snapshot,source:'snapshot'},projects);
}
export async function onlineBoard(force=false) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),14000);
  try {
    const raw=await fetchJSON('./api/board',controller.signal,force);
    return normalizeBoard(raw,raw.projects);
  } finally {clearTimeout(timer);}
}
