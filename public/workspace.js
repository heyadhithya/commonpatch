import {categories, icon, esc} from './icons.js';
import {snapshotBoard, onlineBoard, readSaved, toggleSaved, isSaved, filterIssues, starter, parseCollection, collectionLink} from './store.js';
import {openIssue, getIssuePlan} from './detail.js';
import {openSession} from './session.js';
import {describeIndex} from './index-status.js';
import {renderGuide, bindGuide} from './guide.js';

const main = document.getElementById('main');
const select = (selector, root=document) => root.querySelector(selector);
const all = (selector, root=document) => [...root.querySelectorAll(selector)];
const defaultFilters = {query:'',category:'',language:'',label:'',sort:'mix'};
const listSize = 10;
let filters = {...defaultFilters};
let page = 'explore';
let limit = listSize;
let board = {issues:[],projects:[],source:'snapshot',asOf:null};
let settled = false;
let loading = true;
let loadError = '';
let latestRequest = 0;
let routeKey = null;
let toastTimer;
let visibleIssues = new Map();
let sharedRefs = [];
let dialogTrigger = null;
let pendingBoardRefresh = false;
let pendingWorkbenchSync = false;

function toast(message) {
  const box=select('#notice');
  box.textContent=message;
  box.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>box.classList.remove('show'),3000);
}
function savedCount() {select('#saved-count').textContent=String(readSaved().length);}
function age(iso) {
  const value=Date.parse(iso);
  if(!Number.isFinite(value))return 'date unavailable';
  const days=Math.max(0,Math.floor((Date.now()-value)/86400000));
  if(!days)return 'today';
  if(days===1)return '1d ago';
  if(days<60)return days+'d ago';
  return new Date(value).toLocaleDateString(undefined,{day:'numeric',month:'short',year:new Date(value).getFullYear()===new Date().getFullYear()?undefined:'numeric'});
}
function checkedTime(iso) {
  if(!iso)return '';
  const d=new Date(iso);
  return Number.isFinite(+d)?d.toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'';
}
function feedLabel() {
  const {label}=describeIndex(board,loading);
  return board.asOf?label+' · '+checkedTime(board.asOf):label;
}
function syncLabel(){
  const box=select('#feed-status');
  if(box){box.classList.toggle('snapshot',board.source!=='live'||board.cache==='stale');box.innerHTML='<i aria-hidden="true"></i><span>'+esc(feedLabel())+'</span>'+icon('help',14);}
  const count=select('#index-issues');
  if(count){count.textContent=board.asOf?board.issues.length:'–';select('#index-projects').textContent=board.asOf?board.projects.length:'–';select('#index-causes').textContent=board.asOf?new Set(board.projects.map(p=>p.category)).size:'–';}
}
function updateIndexExplanation(){
  const section=select('#index-explanation');
  if(!section)return;
  const info=describeIndex(board,loading);
  const time=board.asOf?'<p>Checked <time datetime="'+esc(board.asOf)+'">'+esc(new Date(board.asOf).toLocaleString(undefined,{dateStyle:'long',timeStyle:'short'}))+'</time>.</p>':'';
  section.innerHTML='<p class="index-source"><strong>'+esc(info.label)+'</strong></p><p>'+esc(info.detail)+'</p>'+time+'<p>CommonPatch reuses recent results for up to five minutes. The original GitHub issue has the latest discussion and assignment.</p>';
}
function setNav(){
  document.querySelectorAll('[data-nav]').forEach(a=>{
    const on=a.dataset.nav===(page==='collection'?'workbench':page);
    a.classList.toggle('active',on);
    if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
  });
  savedCount();
}
function projectIcon(cat,size=23){
  const def=categories[cat]||categories['Civic tech'];
  return '<span class="project-ico tone-'+def.tone+'">'+icon(def.icon,size)+'</span>';
}
function planSummary(plan) {
  return plan.checks.filter(Boolean).length + '/3 prepared' + (plan.note ? ' · Private note' : '');
}

function renderIssue(issue, planInfo=false) {
  visibleIssues.set(issue.id.toLowerCase(),issue);
  const saved=isSaved(issue.id);
  const label = issue.labels.find(l=>/good first|first[- ]timer|beginner|starter|newcomer/i.test(l)) || issue.labels.find(l=>/help wanted|contribution|help welcome/i.test(l)) || issue.labels[0];
  const labelClass=starter(issue)?'':' help';
  const date=age(issue.updatedAt);
  const plan = planInfo ? getIssuePlan(issue) : null;
  const progress = plan ? '<span class="plan-status">'+icon('check',13)+'<span data-plan-summary="'+esc(issue.id)+'">'+esc(planSummary(plan))+'</span></span>' : '';
  const statusNote=issue.offIndex?'<span class="check-source">Recheck on GitHub</span>':'';
  return '<article class="issue-card">'+projectIcon(issue.category)+'<div class="row-info"><div class="row-meta"><strong>'+esc(issue.project||issue.repo)+'</strong><span aria-hidden="true">/</span><code>#'+issue.number+'</code></div><button type="button" class="issue-open" data-issue="'+esc(issue.id)+'">'+esc(issue.title)+'</button><div class="row-tags">'+(label?'<span class="issue-label'+labelClass+'">'+esc(label)+'</span>':'')+(issue.language?'<span><i class="language-dot" aria-hidden="true"></i>'+esc(issue.language)+'</span>':'')+'<span class="activity" title="'+esc(checkedTime(issue.updatedAt))+'">'+icon('clock',12)+'Updated '+esc(date)+'</span>'+progress+statusNote+'</div></div><button class="bookmark-btn" data-save="'+esc(issue.id)+'" aria-pressed="'+saved+'" aria-label="'+(saved?'Remove from':'Save to')+' workbench: '+esc(issue.title)+'" title="'+(saved?'Remove from workbench':'Save to workbench')+'">'+icon('bookmark',18)+'</button></article>';
}
function emptyState(ico,title,copy,control=''){
  return '<div class="empty-state">'+icon(ico,30)+'<h3>'+esc(title)+'</h3><p>'+esc(copy)+'</p>'+control+'</div>';
}
function button(action,label,ic='',cls=''){
  return '<button type="button" class="btn '+cls+'" data-action="'+action+'">'+(ic?icon(ic,16):'')+esc(label)+'</button>';
}
function options(pairs,selected) {return pairs.map(([key,label])=>'<option value="'+esc(key)+'" '+(key===selected?'selected':'')+'>'+esc(label)+'</option>').join('');}
function selectField(key,title,pairs){
  return '<div class="filter-control"><label for="filter-'+key+'">'+title+'</label><span class="select-shell"><select id="filter-'+key+'" data-filter="'+key+'">'+options(pairs,filters[key])+'</select>'+icon('chevron',14)+'</span></div>';
}
function filterPanel(){
  const counts=new Map();
  board.issues.forEach(issue=>counts.set(issue.category,1+(counts.get(issue.category)||0)));
  const langs=[...new Set(board.projects.map(p=>p.language).filter(Boolean))].sort();
  const causeBtn=(name,label,ic,n)=>'<button class="cause-btn" data-category="'+esc(name)+'" aria-pressed="'+(filters.category===name)+'">'+icon(ic,17)+'<b>'+esc(label)+'</b><small>'+n+'</small></button>';
  return '<aside class="filter-panel" aria-label="Issue filters"><div class="filter-heading">'+icon('filter',15)+'Filter by cause</div><div class="cause-list">'+causeBtn('','All causes','grid',board.issues.length)+Object.entries(categories).map(([cat,def])=>causeBtn(cat,cat,def.icon,counts.get(cat)||0)).join('')+'</div>'+selectField('language','Project language',[['','All languages'],...langs.map(l=>[l,l])])+selectField('label','Issue label',[['','All opportunity labels'],['starter','Beginner labels'],['help','Help wanted']])+'<button class="clear-filter" data-action="clear" '+(hasFilter()?'':'disabled')+'>Reset filters</button></aside>';
}
function hasFilter(){return Boolean(filters.query||filters.category||filters.language||filters.label||filters.sort!=='mix');}
function hero(){
  return '<section class="hero"><div class="shell hero-inner"><div class="hero-copy"><span class="eyebrow">Public-interest open source</span><h1>Open source for<br><em>the public good.</em></h1><p>Find a place to contribute to the tools communities rely on, from accessible software to open maps.</p><div class="hero-actions">'+button('browse','Explore issues','compass','btn-lime')+'<a class="hero-guide" href="#guide">How it works</a></div></div><div class="hero-art"><img src="./art/hero.svg" alt="An illustrated community map with two pins connected through a park, across a river, and into town." width="570" height="300"></div></div></section>';
}
function indexStrip(){
  const stat=(ic,id,label)=>'<span class="index-stat">'+icon(ic,16)+'<strong id="'+id+'">–</strong>'+label+'</span>';
  return '<div class="index-strip"><div class="shell index-inner">'+stat('issue','index-issues','unassigned issues')+stat('layers','index-projects','projects')+stat('map','index-causes','causes')+'<button type="button" class="feed-status" id="feed-status" data-action="index-status" title="About the issue index"></button></div></div>';
}
function explore(){
  main.innerHTML=hero()+indexStrip()+'<section class="shell board" id="board" aria-labelledby="board-title"><div class="board-titlebar"><div><h2 id="board-title" tabindex="-1">Opportunity board</h2><p>Open, unassigned issues from public-interest projects.</p></div><div class="board-tools"><label class="search-box">'+icon('search',17)+'<input type="search" id="issue-search" placeholder="Search issues or projects…" aria-label="Search issues or projects" value="'+esc(filters.query)+'"></label><button class="btn filters-btn" data-action="filters">'+icon('filter',16)+'Filters</button></div></div><div class="board-columns"><div id="desktop-filters"></div><div class="result-rail"><div class="results-toolbar"><span id="result-count" role="status"></span><label class="sort-control">'+icon('sort',15)+'<span class="sr-only">Sort issues</span><span class="select-shell"><select data-filter="sort">'+options([['mix','Mix of causes'],['active','Recently updated'],['new','Recently opened'],['discussion','Fewest comments']],filters.sort)+'</select>'+icon('chevron',13)+'</span></label></div><div id="issue-rows" class="issue-list"></div><div id="load-more" class="more-row"></div></div></div></section>';
  select('#issue-search').oninput=e=>{filters.query=e.target.value;limit=listSize;writeFilterUrl();renderResults();};
  renderFilters();renderResults();syncLabel();
}
function renderFilters(){
  const aside=select('#desktop-filters');
  if(aside)aside.innerHTML=filterPanel();
  const mobile=select('#filter-dialog-body');
  if(mobile)mobile.innerHTML=filterPanel().replaceAll('id="filter-','id="mobile-filter-').replaceAll('for="filter-','for="mobile-filter-');
  select('.filters-btn')?.classList.toggle('active',hasFilter());
}
function renderResults(){
  const rows=select('#issue-rows');if(!rows)return;
  visibleIssues=new Map();
  const results=filterIssues(board.issues,filters);
  select('#result-count').innerHTML='<strong>'+results.length+'</strong> '+(results.length===1?'opportunity':'opportunities')+(filters.category?' in '+esc(filters.category):'');
  if(!results.length){
    const body=!board.asOf?(loading?'Loading the project index…':loadError||'Unable to retrieve the issue index.'):'Try another cause, language, or search term.';
    rows.innerHTML=emptyState(loading&&!board.asOf?'signal':'search',!board.asOf?'Issue index':'No matching issues',body,button(!board.asOf?'refresh':'clear',!board.asOf?'Try again':'Clear filters'));
  }else rows.innerHTML=results.slice(0,limit).map(i=>renderIssue(i)).join('');
  const more=select('#load-more');
  more.innerHTML=results.length>limit?button('more','Show '+Math.min(listSize,results.length-limit)+' more issues','plus')+'<p>Showing '+limit+' of '+results.length+'</p>':'';
  select('.clear-filter')?.toggleAttribute('disabled',!hasFilter());
}
function projects(){
  const items=board.projects;
  main.innerHTML='<div class="shell info-page"><header class="page-heading"><span class="eyebrow">Project directory</span><h1>The projects</h1><p>Meet the maintainers’ projects behind the board. Browse issues or read how each project accepts contributions.</p></header><div class="project-grid">'+items.map(proj=>{
    const count=board.issues.filter(i=>i.repo.toLowerCase()===proj.repo.toLowerCase()).length;
    return '<article class="project-card">'+projectIcon(proj.category)+'<span class="project-category">'+esc(proj.category)+'</span><h2>'+esc(proj.name)+'</h2><p>'+esc(proj.description)+'</p><div class="project-links"><button class="btn" data-project="'+esc(proj.repo)+'">'+count+' '+(count===1?'issue':'issues')+'</button><a class="text-link" href="'+esc('https://github.com/'+proj.repo)+'" target="_blank" rel="noopener noreferrer">Repository ↗</a></div></article>';
  }).join('')+'</div>'+(!items.length?emptyState('signal','Loading project directory',loadError||'The catalog is loading.',button('refresh','Retry')):'')+'</div>';
}
function workbench(){
  visibleIssues=new Map();
  const saved=readSaved();
  const indexed=new Map(board.issues.map(i=>[i.id.toLowerCase(),i]));
  let items=page==='collection'?sharedRefs.map(ref=>indexed.get(ref)||saved.find(i=>i.id.toLowerCase()===ref)).filter(Boolean):saved.map(item=>indexed.get(item.id.toLowerCase())||{...item,offIndex:true});
  const known=new Set(items.map(i=>i.id.toLowerCase()));
  const missing=page==='collection'?sharedRefs.filter(id=>!known.has(id)):[];
  const collection=page==='collection';
  const extra=missing.length?'<div class="collection-note">'+missing.length+' '+(missing.length===1?'issue is':'issues are')+' outside the current index. Check the original on GitHub.<ul>'+missing.map(id=>{const [repo,num]=id.split('#');return '<li><a class="text-link" href="https://github.com/'+esc(repo)+'/issues/'+num+'" target="_blank" rel="noopener noreferrer">'+esc(id)+' ↗</a></li>';}).join('')+'</ul></div>':'';
  main.innerHTML='<div class="shell info-page"><header class="page-heading"><span class="eyebrow">'+(collection?'Public shortlist':'Personal shortlist')+'</span><h1>'+(collection?'Shared collection':'Your workbench')+'</h1><p>'+(collection?'A collection of public GitHub issues. Save any issue to start a private contribution plan.':'Keep issues you’re considering and pick up your preparation where you left off. Saved work stays in this browser.')+'</p></header><div class="bench-tools">'+(saved.length&&!collection?button('session','Plan a patch session','clock','btn-dark')+button('share','Share shortlist','share'):'')+'<a class="btn" href="#explore">'+icon('compass',16)+'Explore issues</a></div>'+extra+'<div class="issue-list work-list">'+(items.length?items.map(i=>renderIssue(i,!collection)).join(''):missing.length?'':emptyState('bookmark',collection?'No valid issues in this link':'Your workbench is empty',collection?'Ask the sender to copy the collection link again.':'Bookmark an issue on the board. Open it here to keep a private note, prepare a question, and plan your first contribution.'))+'</div></div>';
}
function drawView(){
  setNav();
  if(page==='explore') explore();
  else if(page==='projects')projects();
  else if(page==='guide'){main.innerHTML=renderGuide();bindGuide(main);}
  else workbench();
}
function updateBoardView(){
  updateIndexExplanation();
  if(select('.cpd-dialog[open]')){pendingBoardRefresh=true;return;}
  if(page==='explore'){renderFilters();renderResults();syncLabel();}
  else if(page==='projects')projects();
  else if(page==='collection'||page==='workbench')workbench();
}
async function refresh(force=false){
  const token=++latestRequest;loading=true;loadError='';
  if(!board.asOf) snapshotBoard().then(data=>{if(token===latestRequest&&!settled){board=data;updateBoardView();}}).catch(()=>{});
  try {
    const next=await onlineBoard(force);
    if(token!==latestRequest)return;
    board=next;
  }catch {
    if(token!==latestRequest)return;
    if(!board.asOf){try{board=await snapshotBoard();}catch{loadError='The server and the dated index could not be reached. Check your connection and try again.';}}
    else if(board.source==='live')board={...board,cache:'stale'};
  }finally{
    if(token===latestRequest){settled=true;loading=false;updateBoardView();if(force)toast(feedLabel());}
  }
}
function writeFilterUrl(){
  const params=new URLSearchParams();
  for(const [key,val] of Object.entries(filters)) if(val&&val!==defaultFilters[key])params.set(key,val);
  const hash='#explore'+(params.size?'?'+params:'');
  history.replaceState(null,'',location.pathname+location.search+hash);routeKey=hash;
}
function route(){
  const hash=location.hash||'#explore';
  if(hash==='#main'){history.replaceState(null,'',location.pathname+location.search+'#explore');route();main.focus();return;}
  if(hash===routeKey)return;
  const [view,qs='']=hash.slice(1).split('?');
  page=hash.startsWith('#collection=')?'collection':['projects','guide','workbench'].includes(view)?view:'explore';
  if(page==='explore'){
    const params=new URLSearchParams(qs);
    filters={...defaultFilters};
    for(const key of Object.keys(filters)){const val=params.get(key);if(val)filters[key]=val.slice(0,160);}
    if(filters.category&&!Object.hasOwn(categories,filters.category))filters.category='';
    if(!['mix','active','new','discussion'].includes(filters.sort))filters.sort='mix';
    if(!['','starter','help'].includes(filters.label))filters.label='';
  }
  if(page==='collection')sharedRefs=parseCollection(hash);
  limit=listSize;routeKey=hash;
  document.title=({explore:'Open source for the public good',guide:'Field guide',projects:'Project directory',workbench:'Your workbench',collection:'Shared collection'})[page]+' — CommonPatch';
  drawView();window.scrollTo(0,0);
  if(page==='explore'&&qs)requestAnimationFrame(()=>select('#board')?.scrollIntoView());
}
function patchBookmarks(issue, saved) {
  const id = issue.id.toLowerCase();
  for (const button of all('[data-save]', main)) {
    if (button.dataset.save.toLowerCase() !== id) continue;
    button.setAttribute('aria-pressed', String(saved));
    button.setAttribute('aria-label', (saved ? 'Remove from' : 'Save to') + ' workbench: ' + issue.title);
    button.title = saved ? 'Remove from workbench' : 'Save to workbench';
  }
}

function updatePlanSummary(issue, plan) {
  if (page !== 'workbench') return;
  const summary = all('[data-plan-summary]', main).find(node => node.dataset.planSummary.toLowerCase() === issue.id.toLowerCase());
  const text = planSummary(plan);
  if (summary && summary.textContent !== text) summary.textContent = text;
}

function cardFocus(trigger) {
  const kind = trigger?.dataset?.issue ? 'issue' : trigger?.dataset?.save ? 'save' : '';
  if (!kind) return null;
  return { kind, id: trigger.dataset[kind].toLowerCase(), index: all('[data-' + kind + ']', main).indexOf(trigger), route: routeKey, trigger };
}

function focusTarget(context) {
  if (!context) return null;
  if (context.route !== routeKey) return main;
  if (context.trigger.isConnected) return context.trigger;
  const cards = all('[data-' + context.kind + ']', main);
  return cards.find(node => node.dataset[context.kind].toLowerCase() === context.id) ||
    cards[Math.max(0, Math.min(context.index, cards.length - 1))] ||
    select('.bench-tools a[href="#explore"]', main) || select('#board-title', main) || main;
}

function syncWorkbenchMembership() {
  if (page !== 'workbench') return;
  if (select('.cpd-dialog[open]')) { pendingWorkbenchSync = true; return; }
  const saved = readSaved();
  const shown = all('.work-list [data-issue]', main);
  if (shown.length === saved.length && shown.every((node, i) => node.dataset.issue.toLowerCase() === saved[i].id.toLowerCase())) return;
  const focus = cardFocus(document.activeElement);
  workbench();
  if (focus) focusTarget(focus)?.focus({ preventScroll: true });
}

function finishIssue(context) {
  const refresh = pendingBoardRefresh, sync = pendingWorkbenchSync;
  pendingBoardRefresh = false;
  pendingWorkbenchSync = false;
  if (refresh) updateBoardView();
  else if (sync) syncWorkbenchMembership();
  return focusTarget(context);
}

function saveIssue(issue){
  try{
    const added = toggleSaved(issue);
    savedCount();
    patchBookmarks(issue, added);
    syncWorkbenchMembership();
    toast(added ? 'Saved to your workbench.' : 'Removed from your workbench.');
    return added;
  } catch(error){toast(error.message);throw error;}
}

function setFilter(key,value){
  filters[key]=value;limit=listSize;
  writeFilterUrl();renderFilters();renderResults();
  const restored=key==='category'?'[data-category="'+CSS.escape(value)+'"]':'[data-filter="'+key+'"]';
  const inDialog=select('#utility-dialog[open]');
  (inDialog||main).querySelector(restored)?.focus({preventScroll:true});
}
function utilityDialog(title,html){
  const prev=select('#utility-dialog');if(prev)prev.remove();
  dialogTrigger=document.activeElement;
  const dlg=document.createElement('dialog');dlg.id='utility-dialog';dlg.className='native-dialog';
  dlg.setAttribute('aria-labelledby','util-title');
  dlg.innerHTML='<div class="dialog-heading"><h2 id="util-title">'+esc(title)+'</h2><button data-action="close" aria-label="Close">'+icon('close',19)+'</button></div>'+html;
  document.body.append(dlg);dlg.showModal();
  dlg.addEventListener('close',()=>{dlg.remove();if(dialogTrigger?.isConnected)dialogTrigger.focus({preventScroll:true});},{once:true});
  dlg.onclick=e=>{if(e.target===dlg){const b=dlg.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)dlg.close();}};
  return dlg;
}
async function shareList(){
  const saved=readSaved();if(!saved.length)return;
  const link=collectionLink(saved.map(i=>i.id));
  const limitNote=saved.length>20?' The link includes the first 20 saved issues.':'';
  const dlg=utilityDialog('Share your shortlist','<p>Anyone with this link can see the public issue references. Your draft notes and checklist stay on this device.'+limitNote+'</p><label class="sr-only" for="share-url">Public collection link</label><input id="share-url" class="share-field" readonly value="'+esc(link)+'">'+button('copy-link','Copy collection link','share','btn-dark')+'<p id="share-state" role="status"></p>');
  select('#share-url',dlg).select();
}
async function command(name){
  if(name==='browse'){select('#board-title')?.focus({preventScroll:true});select('#board')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
  if(name==='filters'){utilityDialog('Filter opportunities','<div id="filter-dialog-body"></div>'+button('close','Show results','check','btn-dark'));renderFilters();}
  if(name==='close'){select('#utility-dialog')?.close();}
  if(name==='clear'){filters={...defaultFilters};limit=listSize;writeFilterUrl();if(select('#issue-search'))select('#issue-search').value='';if(select('[data-filter=sort]'))select('[data-filter=sort]').value='mix';renderFilters();renderResults();}
  if(name==='more'){const old=limit;limit+=listSize;renderResults();all('.issue-open')[old]?.focus({preventScroll:true});}
  if(name==='share')await shareList();
  if(name==='session')openSession(readSaved(),{makeLink:ids=>collectionLink(ids)});
  if(name==='copy-link'){
    const input=select('#share-url');
    try{await navigator.clipboard.writeText(input.value);select('#share-state').textContent='Collection link copied.';}
    catch{input.focus();input.select();select('#share-state').textContent='Link selected. Use your device’s Copy command.';}
  }
  if(name==='index-status'){
    utilityDialog('About this index','<div id="index-explanation"></div>'+button('recheck-index','Refresh index','refresh','btn-dark'));
    updateIndexExplanation();
  }
  if(name==='recheck-index'){
    const action=select('[data-action="recheck-index"]');
    if(action)action.disabled=true;
    await refresh(true);
    if(action?.isConnected){action.disabled=false;action.focus();}
  }
  if(name==='refresh')await refresh(true);
}
document.addEventListener('click',e=>{
  if(e.target.closest('.skip-link')){e.preventDefault();main.focus();return;}
  const el=e.target.closest('button');
  if(!el)return;
  const d=el.dataset;
  if(d.issue){
    const item=visibleIssues.get(d.issue.toLowerCase());
    const focus = cardFocus(el);
    if(item)openIssue(item,{
      projects:board.projects,
      onClose:()=>finishIssue(focus),
      isSaved:item=>isSaved(typeof item==='string'?item:item.id),
      toggleSaved:saveIssue,
      onPlanChange:(issue,plan)=>{
        updatePlanSummary(issue,plan);
        if(isSaved(issue.id))return true;
        if(!plan.note && !plan.approach && !plan.checks.some(Boolean))return false;
        try{return saveIssue(issue);}catch{return false;}
      },
      initialFocus:el,
      source:item.offIndex?'saved':board.source,
      asOf:item.offIndex?null:board.asOf,
      cache:item.offIndex?null:board.cache
    });
  }else if(d.save){const issue=visibleIssues.get(d.save.toLowerCase());if(issue)try{saveIssue(issue);}catch{}}
  else if(d.category!==undefined)setFilter('category',d.category);
  else if(d.project){location.hash='explore?query='+encodeURIComponent(d.project);}
  else if(d.action)command(d.action);
});
document.addEventListener('change',e=>{if(e.target.dataset.filter)setFilter(e.target.dataset.filter,e.target.value);});
window.addEventListener('hashchange',()=>{select('#utility-dialog[open]')?.close();select('.cpd-dialog[open]')?.close();route();});
window.addEventListener('storage',e=>{
  if(e.key==='commonpatch:saved:v1'||e.key===null){
    savedCount();
    const savedIds = new Set(readSaved().map(issue => issue.id.toLowerCase()));
    for(const item of visibleIssues.values())patchBookmarks(item,savedIds.has(item.id.toLowerCase()));
    syncWorkbenchMembership();
  }
  if(page==='workbench'&&(e.key===null||e.key?.startsWith('commonpatch-plan-v1:'))){
    const id=e.key?.slice('commonpatch-plan-v1:'.length);
    for(const issue of visibleIssues.values())if(!id||issue.id.toLowerCase()===id)updatePlanSummary(issue,getIssuePlan(issue));
  }
});
route();refresh();
