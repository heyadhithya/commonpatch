import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {calendarFile, createPlan, foldLine, markdownHandout, publicIssues} from '../public/session.js';

const sampleIssue = {
  id: 'CivicTeam/Mapping#19', repo: 'CivicTeam/Mapping', number: 19,
  title: 'Improve keyboard navigation',
  url: 'https://private.example/secret-source', note: 'private-group-note',
  approach: 'unshared-approach', body: 'unshared-issue-body'
};
const options = {
  title: 'Mapping workshop', date: '2028-02-29', time: '23:45',
  duration: 60, issues: [sampleIssue]
};
const stamp = {uid: 'fixed-event@commonpatch.test', now: new Date('2026-09-10T13:45:00Z')};

function utcValue(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

test('public references are canonical, deduplicated, and exclude private fields', () => {
  const issues = publicIssues([
    sampleIssue,
    {...sampleIssue, id: 'civicteam/mapping#19', repo: 'civicteam/mapping'},
    {...sampleIssue, id: 'maps/other#19'},
    {...sampleIssue, number: 20},
    {...sampleIssue, id: 'CivicTeam/Mapping#0', number: 0},
    {...sampleIssue, id: 'example/..#19', repo: 'example/..'}
  ]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].id.toLowerCase(), sampleIssue.id.toLowerCase());
  assert.equal(issues[0].url.toLowerCase(), 'https://github.com/civicteam/mapping/issues/19');
  assert.doesNotMatch(JSON.stringify(issues), /private\.example|private-group-note|unshared-/);
});

test('each supported duration partitions exactly into four consecutive phases', () => {
  for (const duration of [30, 60, 90]) {
    const plan = createPlan({...options, duration});
    assert.equal(plan.duration, duration);
    assert.equal(plan.agenda.length, 4);
    assert.equal(plan.start.getHours(), 23);
    assert.equal(plan.start.getMinutes(), 45);
    assert.equal(plan.start.getDate(), 29);
    assert.equal(plan.end.getTime() - plan.start.getTime(), duration * 60_000);
    assert.equal(plan.end.getDate(), 1);
    let elapsed = 0;
    for (const phase of plan.agenda) {
      assert.ok(phase.title && phase.description);
      assert.ok(Number.isInteger(phase.minutes) && phase.minutes > 0);
      assert.equal(phase.offset, elapsed);
      elapsed += phase.minutes;
    }
    assert.equal(elapsed, duration);
  }
});

test('invalid inputs and oversized selections fail explicitly', () => {
  for (const invalid of [
    {title: '    '}, {date: '2027-02-29'}, {date: '2028-13-01'}, {time: '24:00'},
    {time: '11:61'}, {duration: 45}, {issues: []}
  ]) assert.throws(() => createPlan({...options, ...invalid}));
  const issues = Array.from({length: 13}, (_, i) => ({
    ...sampleIssue, number: i + 1, id: sampleIssue.repo + '#' + (i + 1)
  }));
  assert.equal(createPlan({...options, issues: issues.slice(0, 12)}).issues.length, 12);
  assert.throws(() => createPlan({...options, issues}));
});

test('local time conversion handles a DST gap and its UTC transition correctly', () => {
  const moduleURL = new URL('../public/session.js', import.meta.url).href;
  const input = {...options, date: '2028-03-12', time: '02:30'};
  const script = `import assert from 'node:assert/strict';
    import {createPlan, calendarFile} from ${JSON.stringify(moduleURL)};
    const data = ${JSON.stringify(input)};
    assert.throws(() => createPlan(data));
    const plan = createPlan({...data, time: '01:45'});
    const text = calendarFile(plan, {uid: 'dst@commonpatch.test', now: new Date(0)});
    assert.ok(text.includes('DTSTART:20280312T064500Z'));
    assert.ok(text.includes('DTEND:20280312T074500Z'));
    assert.equal(plan.end.getHours(), 3);
  `;
  execFileSync(process.execPath, ['--input-type=module', '--eval', script], {
    env: {...process.env, TZ: 'America/New_York'}, stdio: 'pipe'
  });
});

test('folding keeps Unicode code points and limits every physical line to 75 octets', () => {
  const input = 'SUMMARY:' + 'a'.repeat(64) + '🌎é地'.repeat(36);
  const folded = foldLine(input);
  const lines = folded.split('\r\n');
  assert.ok(lines.length > 2);
  assert.ok(lines.slice(1).every(line => line.startsWith(' ')));
  assert.ok(lines.every(line => Buffer.byteLength(line, 'utf8') <= 75));
  for (const line of lines) assert.equal(line, Buffer.from(line, 'utf8').toString('utf8'));
  assert.equal(folded.replaceAll('\r\n ', ''), input);
});

test('calendar exports UTC times, TEXT escaping, and no injected event properties', () => {
  const title = 'Café, maps; paths \\ workshop';
  const issue = {...sampleIssue, title: 'Update routes 🌎\r\nATTENDEE:mailto:phantom@example.test'};
  const plan = createPlan({...options, title, issues: [issue]});
  const ics = calendarFile(plan, stamp);
  assert.equal(ics.replaceAll('\r\n', '').match(/[\r\n]/g), null);
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
  const logical = ics.replaceAll('\r\n ', '').split('\r\n');
  assert.ok(logical.includes('BEGIN:VEVENT'));
  assert.ok(logical.includes('DTSTART:' + utcValue(plan.start)));
  assert.ok(logical.includes('DTEND:' + utcValue(plan.end)));
  assert.ok(logical.includes('DTSTAMP:20260910T134500Z'));
  assert.ok(logical.includes('SUMMARY:Café\\, maps\\; paths \\\\ workshop'));
  assert.ok(logical.some(line => line.startsWith('UID:') && line.length > 4));
  assert.ok(!logical.some(line => /^(?:ATTENDEE|ORGANIZER):|^METHOD:(?:REQUEST|REPLY|ADD|CANCEL)$/i.test(line)));
  const combined = logical.join('\n');
  assert.match(combined, /https:\/\/github\.com\/CivicTeam\/Mapping\/issues\/19/i);
  for (const phase of plan.agenda) assert.ok(combined.includes(phase.title));
  assert.doesNotMatch(combined, /private\.example|private-group-note|unshared-/);
});

test('Markdown handouts contain the public agenda and escape untrusted issue markup', () => {
  const issue = {...sampleIssue, title: 'Fix ![pixel](https://tracker.invalid/a) <img src=x>'};
  const plan = createPlan({...options, issues: [issue]});
  const md = markdownHandout(plan);
  assert.ok(md.includes(options.title));
  for (const phase of plan.agenda) assert.ok(md.includes(phase.title));
  assert.match(md, /https:\/\/github\.com\/CivicTeam\/Mapping\/issues\/19/i);
  assert.doesNotMatch(md, /!\[pixel\]\(https:\/\/tracker\.invalid\/a\)|<img src=x>|private-group-note|private\.example|unshared-/);
});
