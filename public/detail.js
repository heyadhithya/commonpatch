const checklist = [
  'Read the project’s contributing guidelines',
  'Check the issue discussion and assignment',
  'Outline an approach and how to verify it'
];
const noteLimit = 4000;
const approachLimit = 700;
let current = null;

const clean = (value, max = 4000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const validRepo = value => typeof value === 'string' && /^[a-z\d][a-z\d-]{0,38}\/[a-z\d_.-]{1,100}$/i.test(value) && !/[\/]\.{1,2}$/.test(value);
const validNumber = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;

export function planStorageKey(issue) {
  if (!validRepo(issue?.repo) || !validNumber(issue.number)) throw new Error('Unknown issue.');
  return 'commonpatch-plan-v1:' + issue.repo.toLowerCase() + '#' + Number(issue.number);
}

export function normalizePlan(input = {}) {
  return {
    checks: checklist.map((_, i) => input?.checks?.[i] === true),
    note: typeof input?.note === 'string' ? input.note.slice(0, noteLimit) : '',
    approach: typeof input?.approach === 'string' ? input.approach.slice(0, approachLimit) : ''
  };
}

export function firstComment(issue, approach, activity) {
  const idea = clean(approach, approachLimit);
  if (issue.locked) return 'Hi, I came across the locked discussion for ' + issue.repo + '#' + Number(issue.number) +
    '. Is there an open follow-up where another contributor could help?' + (idea ? '\n\nMy initial idea is:\n' + idea : '');
  if (issue.state === 'closed') return 'Thanks for the work on this issue. Is there an open follow-up where another contributor could help?' +
    (idea ? '\n\nOne idea I could explore is:\n' + idea : '');
  const referenced = activity?.pulls?.find(pr => pr.state === 'open' && pullSource(pr.url));
  if (referenced) return 'Hi! I saw that ' + pullSource(referenced.url) + ' references this issue. Does that change cover the work here? If there’s a gap, I’d be glad to help with verification or documentation.' +
    (idea ? '\n\nHere is the approach I had in mind:\n' + idea : '');
  if (Number(issue.assigneeCount) > 0) return 'Hi! I noticed this issue already has an assignee. Is there a specific part I could help with, such as testing or documentation?' +
    (idea ? '\n\nI could contribute the following:\n' + idea : '');
  if (idea) return 'Hi! I’m interested in helping with this issue. Here’s the approach I have in mind:\n\n' + idea +
    '\n\nDoes that fit the intended outcome, and is anyone already working on it?';
  return 'Hi! I’m interested in helping with this issue. Is anyone working on it already? I can start by confirming the expected outcome and sharing a small first step for feedback.';
}

export function issueLink(issue) {
  return validRepo(issue?.repo) && validNumber(issue.number) ? 'https://github.com/' + issue.repo + '/issues/' + Number(issue.number) : '';
}

export function externalUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.href : '';
  } catch { return ''; }
}

function pullSource(value) {
  const safe = externalUrl(value);
  if (!safe) return '';
  const url = new URL(safe);
  const match = url.pathname.match(/^\/([^/]+\/[^/]+)\/pull\/([1-9]\d*)\/?$/);
  if (url.origin !== 'https://github.com' || !match || !validRepo(match[1]) || !validNumber(match[2])) return '';
  return 'https://github.com/' + match[1] + '/pull/' + Number(match[2]);
}

function discussionSource(value, issue) {
  const safe = externalUrl(value);
  if (!safe || !issueLink(issue)) return '';
  const url = new URL(safe), target = new URL(issueLink(issue));
  if (url.origin !== target.origin || url.pathname.toLowerCase() !== target.pathname.toLowerCase() || !/^#issuecomment-\d+$/.test(url.hash)) return '';
  return target.href + url.hash;
}

export function activityView(raw, issue) {
  const missing = { status: raw?.status === 'unavailable' ? 'unavailable' : 'missing', pulls: [], discussion: null };
  if (raw?.status !== 'checked' || !Number.isInteger(raw.examined) || raw.examined < 0 || !Number.isInteger(raw.limit) ||
      raw.limit <= 0 || raw.limit > 100 || raw.examined > raw.limit || !dateLabel(raw.checkedAt)) return missing;
  const pulls = [];
  const seen = new Set();
  for (const pr of Array.isArray(raw.linkedPullRequests) ? raw.linkedPullRequests : []) {
    const url = pullSource(pr?.url);
    if (!url || seen.has(url.toLowerCase()) || !['open','closed'].includes(pr.state)) continue;
    seen.add(url.toLowerCase());
    const ref = new URL(url).pathname.slice(1).replace('/pull/', '#');
    pulls.push({ title: clean(pr.title, 250) || ref, url, ref, state: pr.merged === true ? 'merged' : pr.state });
    if (pulls.length === 5) break;
  }
  const comment = raw.lastDiscussion;
  const date = dateLabel(comment?.date);
  const discussion = date ? {
    date, excerpt: plainInline(clean(comment.excerpt, 480)).replace(/\s+/g, ' '),
    url: discussionSource(comment.url, issue)
  } : null;
  return { status: 'checked', examined: raw.examined, limit: raw.limit, checkedAt: dateLabel(raw.checkedAt),
    hasMore: raw.hasMore === true, pulls, discussion };
}

function activityScope(view) {
  const events = view.examined === 1 ? 'event' : 'events';
  return 'Checked ' + view.examined + ' timeline ' + events + ' on ' + view.checkedAt + ' (limit ' + view.limit + '). ' +
    (view.hasMore ? 'Later events fall outside this check. ' : '') + 'Up to five referenced pull requests are shown.';
}

function plainInline(line) {
  return line
    .replace(/!\[([^\]]{0,800})\]\([^\n]{0,1500}?\)/g, (_, alt) => alt ? '[Image: ' + alt + ']' : '[Image]')
    .replace(/\[([^\]]{1,800})\]\((?:[^()\n]|\([^()\n]*\)){1,1500}\)/g, '$1')
    .replace(/<https?:\/\/[^>\s]+>/gi, '')
    .replace(/<\/?[a-z][^>\n]{0,1500}>/gi, '')
    .replace(/(\*\*|__|~~)(\S(?:.*?\S)?)\1/g, '$2')
    .replace(/(^|\s)[*_]([^*_\n]{1,400})[*_](?=\s|[.,!?;:]|$)/g, '$1$2')
    .replace(/`([^`\n]+)`/g, '$1')
    .trim();
}

// Return a small text-only document. Issue authors cannot insert DOM, images or active links.
export function markdownBlocks(body) {
  if (typeof body !== 'string') return [];
  const source = body.slice(0, 45000).replace(/\r\n?/g, '\n').replace(/<!--[\s\S]*?(?:-->|$)/g, '');
  const blocks = [];
  let fence = '', code = [], paragraph = [], items = [];
  const flushText = () => { if (paragraph.length) blocks.push({ kind: 'p', text: paragraph.join(' ') }); paragraph = []; };
  const flushList = () => { if (items.length) blocks.push({ kind: 'list', items }); items = []; };
  for (const raw of source.split('\n')) {
    const line = raw.trim();
    const marker = line.match(/^(`{3,}|~{3,})/);
    if (fence) {
      if (marker && marker[1].length >= fence.length && marker[1][0] === fence[0]) {
        if (code.length) blocks.push({ kind: 'code', text: code.join('\n') });
        fence = ''; code = [];
      } else code.push(raw);
      continue;
    }
    if (marker) {
      flushText(); flushList();
      fence = marker[1];
      continue;
    }
    if (!line || /^[-*_]{3,}$/.test(line)) { flushText(); flushList(); continue; }
    if (/^\[[^\]]+\]:\s*(?:https?:|\/)/i.test(line)) continue;
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    const bullet = line.match(/^(?:[-*+]\s+|\d{1,4}[.)]\s+)(?:\[[ xX]\]\s+)?(.+)$/);
    if (heading) {
      flushText(); flushList();
      const text = plainInline(heading[1]);
      if (text) blocks.push({ kind: 'heading', text });
    } else if (bullet) {
      flushText();
      const text = plainInline(bullet[1]);
      if (text) items.push(text);
    } else {
      flushList();
      const text = plainInline(line.replace(/^>\s?/, ''));
      if (text) paragraph.push(text);
    }
  }
  flushText(); flushList();
  if (code.length) blocks.push({ kind: 'code', text: code.join('\n') });
  if (body.length > 45000) blocks.push({ kind: 'p', text: 'Open the GitHub issue for the rest of the description.' });
  return blocks;
}

const shapes = {
  close: ['m6 6 12 12M6 18 18 6'], bookmark: ['M6 3.5h12v17l-6-4-6 4z'],
  external: ['M13 4h7v7m0-7-10 10', 'M10 6H5v13h13v-5'],
  book: ['M3.5 5.5c3-1.4 5.8-.6 8.5 1 2.7-1.6 5.5-2.4 8.5-1v13c-3-1.4-5.8-.6-8.5 1-2.7-1.6-5.5-2.4-8.5-1zM12 6.5v13'],
  copy: ['M8.5 8.5h12v12h-12z', 'M15 8.5V3.5H3.5V15h5'],
  check: ['m4.5 12 4.8 4.8L19.5 6.5']
};

function element(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function icon(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  for (const [key,value] of Object.entries({ viewBox: '0 0 24 24', width: '17', height: '17', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(key, value);
  for (const d of shapes[name]) { const path = document.createElementNS(ns, 'path'); path.setAttribute('d', d); svg.append(path); }
  return svg;
}

function button(label, graphic, action, className = 'cpd-btn') {
  const btn = element('button', className);
  btn.type = 'button';
  if (graphic) btn.append(icon(graphic));
  btn.append(document.createTextNode(label));
  btn.addEventListener('click', action);
  return btn;
}

function external(label, url, graphic) {
  const a = element('a', 'cpd-btn');
  a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.referrerPolicy = 'no-referrer';
  if (graphic) a.append(icon(graphic));
  a.append(document.createTextNode(label));
  return a;
}

function renderBody(parent, body) {
  const blocks = markdownBlocks(body);
  if (!blocks.length) { parent.replaceChildren(element('p', 'cpd-muted', 'No description was included. Open the GitHub issue for the discussion.')); return; }
  const fragment = document.createDocumentFragment();
  for (const block of blocks) {
    if (block.kind === 'list') {
      const list = element('ul');
      for (const text of block.items) list.append(element('li', '', text));
      fragment.append(list);
    } else {
      const tag = { heading: 'h4', code: 'pre', p: 'p' }[block.kind];
      fragment.append(element(tag, '', block.text));
    }
  }
  const text = blocks.map(block => block.text ?? block.items.join(' · ')).join(' ');
  if (text.length > 1200 || blocks.length > 10) {
    const excerpt = element('p', 'cpd-excerpt', text.length > 560 ? text.slice(0, 555).replace(/\s+\S*$/, '') + '…' : text);
    const more = element('details', 'cpd-entire');
    const summary = element('summary', '', 'Read full description');
    const full = element('div', 'cpd-full');
    full.append(fragment);
    more.append(summary, full);
    parent.replaceChildren(excerpt, more);
  } else parent.replaceChildren(fragment);
}

function readPlan(key) {
  const raw = localStorage.getItem(key);
  if (raw === null) return normalizePlan();
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid saved plan');
  return normalizePlan(parsed);
}

export function getIssuePlan(issueOrId) {
  try {
    let issue = issueOrId;
    if (typeof issueOrId === 'string') {
      const parsed = issueOrId.match(/^([^#]+)#([1-9]\d*)$/);
      if (!parsed) return normalizePlan();
      issue = { repo: parsed[1], number: parsed[2] };
    }
    return readPlan(planStorageKey(issue));
  } catch { return normalizePlan(); }
}

function dateLabel(value) {
  const time = new Date(value);
  if (!value || !Number.isFinite(time.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(time);
}

function projectMetadata(projects, repo) {
  const all = Array.isArray(projects) ? projects : Object.values(projects || {});
  return all.find(project => typeof project?.repo === 'string' && project.repo.toLowerCase() === repo.toLowerCase()) || projects?.[repo];
}

export function availabilityBadges(issue, source) {
  if (source === 'saved') return [['Current status unverified', '']];
  const labels = [];
  if (issue.state === 'closed') labels.push(['Closed', 'closed']);
  if (issue.state === 'open') labels.push(['Open', 'open']);
  if (issue.locked) labels.push(['Discussion locked', 'closed']);
  if (Number.isInteger(issue.assigneeCount) && issue.assigneeCount >= 0) {
    labels.push([issue.assigneeCount ? 'Assigned · ' + issue.assigneeCount : 'No assignee listed', '']);
  }
  if (Number.isInteger(issue.comments) && issue.comments >= 0) labels.push([issue.comments + (issue.comments === 1 ? ' comment' : ' comments'), '']);
  return labels;
}

function statusBadges(row, issue, source) {
  row.replaceChildren(...availabilityBadges(issue, source).map(([label, tone]) => element('span', 'cpd-pill ' + (tone ? 'cpd-' + tone : ''), label)));
}

function provenance(response, loading) {
  const stamp = dateLabel(response.asOf);
  const time = stamp ? ' · ' + stamp : '';
  if (response.source === 'saved') return loading ? 'Saved issue. Checking current activity…' : 'Saved issue. Verify its status and assignment on GitHub.';
  if (response.source === 'snapshot') return 'Saved snapshot' + time + '. Check GitHub for current availability.';
  if (response.cache === 'stale') return 'Cached GitHub data' + time + '. Current availability may have changed.';
  if (response.source === 'live') return 'GitHub data' + time + '.';
  return loading ? 'Loading details from the issue index…' : 'Current issue availability is unverified.';
}

function renderActivity(region, view, source, loading, issue) {
  const summary = element('p', 'cpd-activity-summary');
  const details = document.createDocumentFragment();
  if (loading) {
    summary.textContent = 'Checking timeline references and discussion…';
  } else if (view.status !== 'checked') {
    summary.textContent = view.status === 'unavailable' ? 'GitHub’s timeline could not be checked.' :
      source === 'snapshot' ? 'This snapshot includes no timeline check.' : 'Timeline activity is unavailable.';
    details.append(element('p', 'cpd-activity-scope', 'Review the original discussion for existing work before starting.'));
    details.append(external('Check issue discussion', issueLink(issue), 'external'));
  } else {
    const open = view.pulls.filter(pr => pr.state === 'open').length;
    if (open) summary.textContent = open + (open === 1 ? ' open pull request references' : ' open pull requests reference') +
      ' this issue. Read the proposed changes before starting a similar fix.';
    else if (view.pulls.length) summary.textContent = 'Earlier pull requests reference this issue. Check what they cover before choosing your next step.';
    else summary.textContent = 'The checked events returned no pull-request references. Someone may still be working on the issue.';
    if (view.pulls.length) {
      const links = element('ul', 'cpd-linked');
      for (const pr of view.pulls) {
        const li = element('li');
        const link = external('', pr.url);
        link.className = 'cpd-pr-link';
        const state = element('span', 'cpd-pr-state cpd-pr-' + pr.state, pr.state);
        const copy = element('span', 'cpd-pr-copy');
        copy.append(element('strong', '', pr.title), element('small', '', pr.ref));
        link.append(state, copy, icon('external')); li.append(link); links.append(li);
      }
      details.append(links);
    }
    if (view.discussion) {
      const last = element('div', 'cpd-last-comment');
      last.append(element('h4', '', 'Latest comment in this window'), element('p', 'cpd-activity-date', view.discussion.date));
      if (view.discussion.excerpt) last.append(element('blockquote', '', view.discussion.excerpt));
      last.append(external(view.discussion.url ? 'Read comment on GitHub' : 'Open issue discussion', view.discussion.url || issueLink(issue), 'external'));
      details.append(last);
    } else {
      details.append(element('p', 'cpd-activity-scope', 'The timeline check returned no discussion comment to show.'));
    }
    details.append(element('p', 'cpd-activity-scope', activityScope(view)));
  }
  region.setAttribute('aria-busy', String(loading));
  region.replaceChildren(element('h3', '', 'Linked work & discussion'), summary, details);
}

export async function openIssue(issue, options = {}) {
  const key = planStorageKey(issue);
  const issueUrl = issueLink(issue);
  const trigger = options.initialFocus && typeof options.initialFocus.focus === 'function' ? options.initialFocus : document.activeElement;
  current?.retire();
  const dialog = element('dialog', 'cpd-dialog');
  dialog.setAttribute('aria-labelledby', 'cpd-title');
  const panel = element('div', 'cpd-panel');
  const bar = element('div', 'cpd-bar');
  const sectionLabel = element('span', 'cpd-bar-title', 'Issue detail');
  const close = button('', 'close', () => dialog.close(), 'cpd-close');
  close.setAttribute('aria-label', 'Close issue detail');
  bar.append(sectionLabel, close);
  const body = element('div', 'cpd-content');
  const header = element('header', 'cpd-heading');
  const repo = element('p', 'cpd-repo', issue.repo + ' / #' + Number(issue.number));
  const title = element('h2', '', issue.title || 'Issue #' + Number(issue.number));
  title.id = 'cpd-title';
  const badges = element('div', 'cpd-badges');
  const source = element('p', 'cpd-source');
  source.setAttribute('role','status');
  const actions = element('div', 'cpd-actions');
  const bookmark = button('Save issue', 'bookmark', toggleBookmark);
  const opener = external('Open on GitHub', issueUrl, 'external');
  opener.classList.add('cpd-primary');
  actions.append(opener);
  if (typeof options.toggleSaved === 'function') actions.append(bookmark);
  header.append(repo, title, badges, source, actions);
  const activityRegion = element('section', 'cpd-section cpd-activity');
  const description = element('section', 'cpd-section');
  const descriptionText = element('div', 'cpd-description');
  const descriptionActions = element('div', 'cpd-description-actions');
  description.append(element('h3', '', 'Issue description'), descriptionText, descriptionActions);
  const guide = externalUrl(projectMetadata(options.projects, issue.repo)?.contributingUrl);
  const prep = element('section', 'cpd-section');
  prep.append(element('h3', '', 'Your contribution plan'));
  const prepHelp = element('p', 'cpd-muted', 'Editing this plan keeps the issue in your workbench. Your personal notes stay in this browser.');
  prep.append(prepHelp);
  if (guide) prep.append(external('Contributing guide', guide, 'book'));
  const checks = element('fieldset', 'cpd-checks');
  const legend = element('legend', 'cpd-sr', 'Preparation checklist');
  checks.append(legend);
  let plan, storageProblem = '';
  try { plan = readPlan(key); }
  catch { plan = normalizePlan(); storageProblem = 'The saved plan could not be read. Changes are held in this tab.'; }
  let memoryOnly = !!storageProblem;
  const signals = element('p', 'cpd-notice', storageProblem);
  signals.setAttribute('role', 'status');
  let activeIssue = options.source === 'saved' ? { ...issue, state: undefined, locked: false, assigneeCount: undefined } : { ...issue };
  let activeActivity = activityView(null, issue);
  let currentRequest = null, retired = false;
  function announce(message) { signals.textContent = message; }
  function changePlan(update) {
    let latest = plan;
    if (!memoryOnly) { try { latest = readPlan(key); } catch { memoryOnly = true; } }
    plan = normalizePlan(update(latest));
    if (!memoryOnly) {
      try {
        if (plan.checks.some(Boolean) || plan.note || plan.approach) localStorage.setItem(key, JSON.stringify(plan));
        else localStorage.removeItem(key);
      } catch { memoryOnly = true; }
    }
    if (memoryOnly) announce('This plan is held in this tab. Browser storage is unavailable.');
    else signals.textContent = '';
    function reflectBookmark(result) {
      if (result === true && !saved && !retired) { saved = true; showBookmark(); }
    }
    try {
      const result = options.onPlanChange?.(issue, normalizePlan(plan));
      if (result && typeof result.then === 'function') result.then(reflectBookmark).catch(() => announce('Your workbench could not be updated.'));
      else reflectBookmark(result);
    } catch { announce('Your workbench could not be updated.'); }
  }
  checklist.forEach((caption, i) => {
    const label = element('label', 'cpd-check-row');
    const input = element('input');
    input.type = 'checkbox'; input.checked = plan.checks[i];
    input.addEventListener('change', () => changePlan(latest => {
      const checks = [...latest.checks]; checks[i] = input.checked;
      return { ...latest, checks };
    }));
    label.append(input, element('span', '', caption)); checks.append(label);
  });
  prep.append(checks);
  function textarea(label, value, max, placeholder, onInput) {
    const wrap = element('label', 'cpd-field');
    const caption = element('span', '', label);
    const input = element('textarea');
    input.rows = 3; input.maxLength = max; input.value = value; input.placeholder = placeholder;
    input.addEventListener('input', () => onInput(input.value));
    wrap.append(caption, input);
    return { wrap, input };
  }
  const notes = textarea('Private notes', plan.note, noteLimit, 'Keep links, questions, or context for yourself.', value => {
    changePlan(latest => ({ ...latest, note: value }));
  });
  prep.append(notes.wrap);
  const draftSection = element('section', 'cpd-section cpd-draft');
  const approach = textarea('Approach to include (optional)', plan.approach, approachLimit, 'What would you look at or try first?', value => {
    changePlan(latest => ({ ...latest, approach: value }));
    draft.value = firstComment(activeIssue, value, activeActivity);
  });
  const draftLabel = element('label', 'cpd-field');
  const draft = element('textarea', 'cpd-output');
  draft.rows = 4; draft.readOnly = true;
  draftLabel.append(element('span', '', 'Comment draft'), draft);
  const copyStatus = element('p', 'cpd-notice'); copyStatus.setAttribute('role', 'status');
  const copy = button('Copy comment draft', 'copy', async () => {
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(draft.value); copied = true; }
    } catch {}
    if (retired) return;
    if (!copied) {
      draft.focus(); draft.select();
      try { copied = document.execCommand('copy'); } catch {}
    }
    copyStatus.textContent = copied ? 'Draft copied. Review it before posting on GitHub.' : 'Draft selected. Use your device’s copy command.';
  });
  draftSection.append(element('h3', '', 'First comment'), element('p', 'cpd-muted', 'Only the comment draft is copied. You decide whether to post it on GitHub.'), approach.wrap, draftLabel, copy, copyStatus);
  function jump(section) {
    const heading = section.querySelector('h3');
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    section.scrollIntoView({ block: 'start' });
  }
  const jumps = element('nav', 'cpd-jumps');
  jumps.setAttribute('aria-label', 'Issue detail shortcuts');
  jumps.append(button('Read issue', 'book', () => jump(description), 'cpd-jump'), button('My plan', 'check', () => jump(prep), 'cpd-jump'));
  bar.insertBefore(jumps, close);
  body.append(header, activityRegion, description, prep, draftSection, signals);
  panel.append(bar, body); dialog.append(panel); document.body.append(dialog);

  let saved = typeof options.isSaved === 'function' ? !!options.isSaved(issue) : !!options.isSaved;
  function showBookmark() {
    bookmark.replaceChildren(icon(saved ? 'check' : 'bookmark'), document.createTextNode(saved ? 'Saved issue' : 'Save issue'));
    bookmark.setAttribute('aria-pressed', String(saved));
  }
  async function toggleBookmark() {
    bookmark.disabled = true;
    try {
      const result = await options.toggleSaved(issue);
      if (typeof result === 'boolean') saved = result;
      else if (typeof options.isSaved === 'function') saved = !!options.isSaved(issue);
      else saved = !saved;
      showBookmark();
    } catch { announce('The bookmark could not be updated.'); }
    finally { bookmark.disabled = false; }
  }
  showBookmark();
  function updateHeader(data, loading = false) {
    title.textContent = activeIssue.title || 'Issue #' + Number(issue.number);
    statusBadges(badges, activeIssue, data.source);
    source.textContent = provenance(data, loading);
    activeActivity = activityView(data.activity, issue);
    renderActivity(activityRegion, activeActivity, data.source, loading, issue);
    draft.value = firstComment(activeIssue, approach.input.value, activeActivity);
  }
  function retire(restoreFocus) {
    if (retired) return;
    retired = true; currentRequest?.abort();
    if (dialog.open) dialog.close();
    dialog.remove();
    if (current?.dialog === dialog) current = null;
    const returnTarget = options.onClose?.() || trigger;
    if (restoreFocus && returnTarget?.isConnected) returnTarget.focus({ preventScroll: true });
  }
  current = { dialog, retire: () => retire(false) };
  dialog.addEventListener('close', () => retire(true), { once: true });
  dialog.addEventListener('click', event => { if (event.target === dialog) {
    const b = dialog.getBoundingClientRect();
    if (event.clientX < b.left || event.clientX > b.right || event.clientY < b.top || event.clientY > b.bottom) dialog.close();
  }});
  dialog.showModal(); close.focus({ preventScroll: true });
  const listing = { source: options.source ?? issue.source, asOf: options.asOf ?? issue.asOf, cache: options.cache ?? issue.cache };
  updateHeader(listing, true);
  async function load() {
    currentRequest?.abort();
    const controller = new AbortController();
    currentRequest = controller;
    descriptionText.setAttribute('aria-busy','true');
    descriptionText.replaceChildren(element('p','cpd-muted','Loading the issue description…'));
    descriptionActions.replaceChildren();
    const timer = setTimeout(() => controller.abort(), 16000);
    try {
      const base = new URL(options.apiBase || './api/', document.baseURI);
      if (!base.pathname.endsWith('/')) base.pathname += '/';
      const endpoint = new URL('issue', base);
      endpoint.searchParams.set('repo', issue.repo); endpoint.searchParams.set('number', String(Number(issue.number)));
      const response = await fetch(endpoint, { signal: controller.signal, headers: {Accept:'application/json'} });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (retired || currentRequest !== controller) return;
      if (typeof data.issue?.repo !== 'string' || data.issue.repo.toLowerCase() !== issue.repo.toLowerCase() || Number(data.issue.number) !== Number(issue.number)) throw new Error();
      activeIssue = { ...issue, ...data.issue };
      updateHeader(data);
      renderBody(descriptionText, activeIssue.body);
    } catch {
      if (retired || currentRequest !== controller) return;
      let local = null;
      // Static deployments can still display the original, dated issue body.
      if (!controller.signal.aborted) {
        try {
          const response = await fetch(new URL('./data/board.json', document.baseURI), { signal: controller.signal });
          if (response.ok) {
            const snapshot = await response.json();
            const row = Array.isArray(snapshot.issues) && snapshot.issues.find(item =>
              typeof item?.repo === 'string' && item.repo.toLowerCase() === issue.repo.toLowerCase() &&
              Number(item.number) === Number(issue.number) && typeof item.body === 'string');
            if (row && dateLabel(snapshot.asOf)) local = { row, asOf: snapshot.asOf };
          }
        } catch {}
      }
      if (retired || currentRequest !== controller) return;
      if (local) {
        activeIssue = { ...issue, ...local.row };
        updateHeader({ source: 'snapshot', asOf: local.asOf });
        renderBody(descriptionText, activeIssue.body);
      } else {
        updateHeader(listing);
        source.textContent += ' The latest detail request was unavailable.';
        if (issue.body) renderBody(descriptionText, issue.body);
        else descriptionText.replaceChildren(element('p','cpd-muted','The description could not be loaded. Open GitHub to read the issue and check its current status.'));
      }
      descriptionActions.append(button('Retry details', '', load));
    } finally {
      clearTimeout(timer);
      if (!retired && currentRequest === controller) descriptionText.removeAttribute('aria-busy');
    }
  }
  await load();
}
