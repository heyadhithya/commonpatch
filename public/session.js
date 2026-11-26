import { esc, icon } from './icons.js';
import { validRef } from './store.js';

const MAX_ISSUES = 12;
const allocations = new Map([[30, [4, 6, 15, 5]], [60, [5, 10, 35, 10]], [90, [8, 15, 52, 15]]]);
const phases = [
  ['Welcome', 'Introduce the group, agree on a goal and pair people by interest.'],
  ['Choose and check', 'Read the issue on GitHub. Check its current status, recent comments and contribution guide.'],
  ['Paired work', 'Try the setup, reproduce a problem or draft one small change. Record what you learn.'],
  ['Share next steps', 'Each pair shares one finding and a possible next step. Decide who will follow up with the maintainer.']
];

const oneLine = value => String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]+/gu, ' ').trim();
const two = n => String(n).padStart(2, '0');

export function publicIssues(rows) {
  const issues = [];
  const seen = new Set();
  for (const raw of Array.isArray(rows) ? rows : []) {
    if (!validRef(raw?.id) || typeof raw.repo !== 'string') continue;
    const [repo, number] = raw.id.split('#');
    if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?\/[a-z\d_.-]{1,100}$/i.test(repo) || /^\.{1,2}$/.test(repo.split('/')[1])) continue;
    if (repo.toLowerCase() !== raw.repo.toLowerCase() || String(raw.number) !== number) continue;
    const id = repo + '#' + number;
    if (seen.has(id.toLowerCase())) continue;
    seen.add(id.toLowerCase());
    issues.push({ id, repo, number: Number(number), title: oneLine(raw.title).slice(0, 500) || 'Issue #' + number, url: 'https://github.com/' + repo + '/issues/' + number });
  }
  return issues;
}

export function createPlan({ title, date, time, duration, issues }) {
  const name = oneLine(title);
  if (!name || name.length > 100) throw new Error('Enter a session title of 1–100 characters.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new Error('Choose a valid local date and start time.');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const start = new Date(year, month - 1, day, hour, minute);
  if (year < 1000 || start.getFullYear() !== year || start.getMonth() + 1 !== month || start.getDate() !== day || start.getHours() !== hour || start.getMinutes() !== minute) {
    throw new Error('That local date or time does not exist. Choose another start time.');
  }
  const minutes = Number(duration);
  const times = allocations.get(minutes);
  if (!times) throw new Error('Choose a 30, 60 or 90 minute session.');
  const selected = publicIssues(issues);
  if (!selected.length || selected.length > MAX_ISSUES) throw new Error('Select between 1 and 12 public issues.');
  const end = new Date(start.getTime() + minutes * 60000);
  if (end.getUTCFullYear() > 9999) throw new Error('Choose an earlier date.');
  let offset = 0;
  const agenda = phases.map(([title, description], i) => {
    const part = { title, description, minutes: times[i], offset };
    offset += times[i];
    return part;
  });
  return { title: name, start, end, duration: minutes, issues: selected, agenda };
}

export function foldLine(line) {
  const encoder = new TextEncoder();
  const segments = [];
  let segment = '', bytes = 0;
  for (const character of line) {
    const length = encoder.encode(character).length;
    if (bytes + length > 75) {
      segments.push(segment);
      segment = ' ';
      bytes = 1;
    }
    segment += character;
    bytes += length;
  }
  segments.push(segment);
  return segments.join('\r\n');
}

function calendarText(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/\r\n|[\r\n]/g, '\\n')
    .replace(/[,;]/g, character => '\\' + character)
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '');
}

function utc(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function localStamp(date) {
  const mins = -date.getTimezoneOffset();
  const offset = 'UTC' + (mins < 0 ? '−' : '+') + two(Math.floor(Math.abs(mins) / 60)) + ':' + two(Math.abs(mins) % 60);
  return date.getFullYear() + '-' + two(date.getMonth() + 1) + '-' + two(date.getDate()) + ' ' + two(date.getHours()) + ':' + two(date.getMinutes()) + ' ' + offset;
}

function groupAgenda(plan) {
  return plan.agenda.map(phase => ({
    ...phase,
    range: phase.offset + '–' + (phase.offset + phase.minutes) + ' min'
  }));
}

function sessionUID() {
  return (globalThis.crypto?.randomUUID?.() || 'cp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)) + '@commonpatch.local';
}

export function calendarFile(plan, { uid = sessionUID(), now = new Date() } = {}) {
  // Only our generated agenda, session title, and publicly reconstructed rows
  // enter these output properties. No source objects or private plans are serialized.
  const lineup = groupAgenda(plan).map(phase => phase.range + ' · ' + phase.title + '\n' + phase.description);
  const sources = publicIssues(plan.issues).map(issue => issue.id + ' · ' + issue.title + '\n' + issue.url);
  const description = 'Group agenda\n' + lineup.join('\n\n') + '\n\nPublic issues\n' + sources.join('\n\n');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CommonPatch//Patch Session//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', 'UID:' + calendarText(uid), 'DTSTAMP:' + utc(new Date(now)),
    'DTSTART:' + utc(plan.start), 'DTEND:' + utc(plan.end),
    'SUMMARY:' + calendarText(plan.title), 'DESCRIPTION:' + calendarText(description),
    'END:VEVENT', 'END:VCALENDAR'
  ];
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

function markdownText(value) {
  return oneLine(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/[\\`*_{}\[\]()#+.!|~]/g, character => '\\' + character);
}

export function markdownHandout(plan) {
  const lines = ['# ' + markdownText(plan.title), '', 'Start: ' + localStamp(plan.start), 'End: ' + localStamp(plan.end), 'Duration: ' + plan.duration + ' minutes', '', '## Group agenda', ''];
  for (const phase of groupAgenda(plan)) lines.push('- **' + phase.range + ' · ' + phase.title + '** — ' + phase.description);
  lines.push('', '## Public issues', '');
  for (const issue of publicIssues(plan.issues)) lines.push('- [' + markdownText(issue.id) + '](' + issue.url + ') — ' + markdownText(issue.title));
  lines.push('', 'Open the original issue before starting. Check its status, recent discussion and contribution guide.', '');
  return lines.join('\n');
}

function localDate(date) {
  return date.getFullYear() + '-' + two(date.getMonth() + 1) + '-' + two(date.getDate());
}

function saveFile(contents, type, name) {
  const href = URL.createObjectURL(new Blob([contents], { type }));
  const a = document.createElement('a');
  a.href = href; a.download = name;
  document.body.append(a);
  try { a.click(); } finally {
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 30000);
  }
}

let currentDialog;

export function openSession(issues, { makeLink } = {}) {
  const trigger = document.activeElement;
  currentDialog?.close();
  const available = publicIssues(issues);
  const selected = new Set(available.slice(0, MAX_ISSUES).map(issue => issue.id));
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const date = localDate(tomorrow);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'this device’s time zone';
  const dialog = document.createElement('dialog');
  dialog.className = 'cps-dialog';
  dialog.setAttribute('aria-labelledby', 'cps-title');
  const close = '<button type="button" class="cps-close" data-cps-close aria-label="Close session planner">' + icon('close', 19) + '</button>';
  const head = '<div class="cps-head"><div><p>' + icon('map', 16) + 'Workbench</p><h2 id="cps-title">Plan a patch session</h2></div>' + close + '</div>';
  const checkboxes = available.map((issue, i) => '<label class="cps-check"><input type="checkbox" data-cps-index="' + i + '"' + (selected.has(issue.id) ? ' checked' : '') + '><span><b>' + esc(issue.title) + '</b><small>' + esc(issue.id) + '</small></span></label>').join('');
  const body = '<div class="cps-body"><div class="cps-controls">' +
    '<label class="cps-field">Session title<input id="cps-name" type="text" maxlength="100" value="Community patch session" required></label>' +
    '<div class="cps-row"><label class="cps-field">Date<input id="cps-date" type="date" value="' + date + '" required></label>' +
    '<label class="cps-field">Local start time<input id="cps-time" type="time" value="10:00" step="60" required></label></div>' +
    '<p class="cps-hint">Time zone: ' + esc(zone) + '</p>' +
    '<label class="cps-field">Duration<select id="cps-duration"><option value="30">30 minutes</option><option value="60" selected>60 minutes</option><option value="90">90 minutes</option></select></label>' +
    '<fieldset class="cps-fieldset"><legend>Issues for the group</legend><p class="cps-hint" id="cps-count" aria-live="polite"></p><div class="cps-choices">' + checkboxes + '</div></fieldset></div>' +
    '<section class="cps-preview" aria-label="Session preview" data-cps-preview></section></div>' +
    '<div class="cps-foot"><div class="cps-actions">' +
    '<button type="button" class="cps-button cps-primary" data-cps-export="calendar">' + icon('clock', 16) + 'Calendar file (.ics)</button>' +
    '<button type="button" class="cps-button" data-cps-export="handout">' + icon('book', 16) + 'Markdown handout</button>' +
    (typeof makeLink === 'function' ? '<button type="button" class="cps-button" data-cps-export="share">' + icon('share', 16) + 'Share issue list</button>' : '') +
    '</div><div data-cps-fallback></div><p class="cps-status" data-cps-status role="status" aria-live="polite"></p></div>';
  const empty = '<div class="cps-empty">' + icon('bookmark', 28) + '<h3>Start with a saved issue</h3><p>Explore the board and save an issue to your workbench. Then choose the issues your group will look at together.</p><a class="cps-button cps-primary" href="#explore" data-cps-close>Explore opportunities</a></div>';
  dialog.innerHTML = head + (available.length ? body : empty);
  currentDialog = dialog;
  document.body.append(dialog);
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (currentDialog === dialog) {
      currentDialog = undefined;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    }
  }, { once: true });
  dialog.addEventListener('click', event => {
    if (event.target.closest('[data-cps-close]')) dialog.close();
    if (event.target === dialog) {
      const b = dialog.getBoundingClientRect();
      if (event.clientX < b.left || event.clientX > b.right || event.clientY < b.top || event.clientY > b.bottom) dialog.close();
    }
  });
  if (available.length) bindSession(dialog, available, selected, makeLink);
  dialog.showModal();
  (dialog.querySelector('#cps-name') || dialog.querySelector('[data-cps-close]')).focus({ preventScroll: true });
  return dialog;
}

function bindSession(dialog, available, selected, makeLink) {
  const $ = selector => dialog.querySelector(selector);
  const preview = $('[data-cps-preview]');
  const status = $('[data-cps-status]');
  const fallback = $('[data-cps-fallback]');
  const controls = [...dialog.querySelectorAll('[data-cps-export]')];
  const uid = sessionUID();
  let plan;
  function refresh() {
    fallback.replaceChildren();
    status.textContent = '';
    $('#cps-count').textContent = selected.size + ' selected · Choose up to 12.';
    try {
      plan = createPlan({
        title: $('#cps-name').value, date: $('#cps-date').value, time: $('#cps-time').value,
        duration: $('#cps-duration').value, issues: available.filter(issue => selected.has(issue.id))
      });
      const list = groupAgenda(plan).map(phase => '<li><span>' + esc(phase.range) + '</span><div><b>' + esc(phase.title) + '</b><p>' + esc(phase.description) + '</p></div></li>').join('');
      const links = plan.issues.map(issue => '<li><a href="' + esc(issue.url) + '" target="_blank" rel="noopener noreferrer">' + esc(issue.id) + icon('external', 12) + '</a></li>').join('');
      preview.innerHTML = '<p class="cps-cap">' + icon('list', 15) + 'Group agenda</p><h3>' + esc(plan.title) + '</h3><p class="cps-datetime">' + esc(localStamp(plan.start)) + ' · ' + plan.duration + ' min</p><ol class="cps-agenda">' + list + '</ol><h4>Public issue links</h4><ul class="cps-sources">' + links + '</ul>';
    } catch (error) {
      plan = undefined;
      preview.innerHTML = '<p class="cps-cap">' + icon('list', 15) + 'Group agenda</p><p class="cps-error" role="status">' + esc(error.message) + '</p>';
    }
    controls.forEach(button => { button.disabled = !plan; });
  }
  dialog.addEventListener('input', event => {
    if (event.target.matches('[data-cps-index]')) {
      const input = event.target, issue = available[Number(input.dataset.cpsIndex)];
      if (input.checked && selected.size >= MAX_ISSUES) {
        input.checked = false;
        status.textContent = 'Twelve issues are already selected. Deselect one to add a different issue.';
        return;
      }
      if (input.checked) selected.add(issue.id); else selected.delete(issue.id);
    }
    if (event.target.matches('#cps-name,#cps-date,#cps-time,#cps-duration,[data-cps-index]')) refresh();
  });
  dialog.addEventListener('click', async event => {
    const button = event.target.closest('[data-cps-export]');
    if (!button || !plan) return;
    const kind = button.dataset.cpsExport;
    try {
      if (kind === 'calendar') {
        saveFile(calendarFile(plan, { uid }), 'text/calendar;charset=utf-8', 'patch-session.ics');
        status.textContent = 'Calendar file prepared for download. Import it into your calendar.';
      } else if (kind === 'handout') {
        saveFile(markdownHandout(plan), 'text/markdown;charset=utf-8', 'patch-session.md');
        status.textContent = 'Markdown handout prepared for download.';
      } else if (kind === 'share') {
        const requestedPlan = plan;
        const ids = plan.issues.map(issue => issue.id);
        const raw = await makeLink(ids);
        if (plan !== requestedPlan || !dialog.isConnected) return;
        const link = new URL(raw, location.href);
        const references = decodeURIComponent(link.hash.replace(/^#collection=/, '')).split(',');
        if (link.origin !== location.origin || !/^https?:$/.test(link.protocol) || link.username || link.password || link.search || !link.hash.startsWith('#collection=') ||
            references.length !== ids.length || !ids.every((id, i) => references[i].toLowerCase() === id.toLowerCase())) throw new Error('The issue list link could not be created.');
        fallback.innerHTML = '<label class="cps-field cps-share-field">Shareable issue list<input type="text" readonly></label>';
        const input = fallback.querySelector('input');
        input.value = link.href;
        try {
          await navigator.clipboard.writeText(link.href);
          if (plan !== requestedPlan || !dialog.isConnected) return;
          status.textContent = 'Issue list link copied. It contains the selected public issue references.';
        } catch {
          if (plan !== requestedPlan || !dialog.isConnected) return;
          input.focus(); input.select();
          status.textContent = 'Link selected. Use your device’s Copy command.';
        }
      }
    } catch (error) { status.textContent = 'Could not complete this export. ' + (error?.message || 'Please try again.'); }
  });
  refresh();
}
