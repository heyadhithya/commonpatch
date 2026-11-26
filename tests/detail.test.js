import test from 'node:test';
import assert from 'node:assert/strict';
import { activityView, availabilityBadges, externalUrl, firstComment, getIssuePlan, issueLink, markdownBlocks, normalizePlan, planStorageKey } from '../public/detail.js';

const issue = { repo: 'pandas-dev/pandas', number: 34, state: 'open', assigneeCount: 0 };

test('issue and plan identity use only a valid GitHub repo and positive issue number', () => {
  assert.equal(issueLink({ ...issue, url: 'https://other.example/' }), 'https://github.com/pandas-dev/pandas/issues/34');
  assert.equal(planStorageKey(issue), planStorageKey({ ...issue, repo: 'Pandas-Dev/Pandas' }));
  for (const bad of [{ repo: 'A/..', number: 1 }, { repo: 'a/b#x', number: 1 }, { repo: 'a/b', number: 0 }, { repo: 'a/b', number: '3?url=x' }]) {
    assert.equal(issueLink(bad), '');
    assert.throws(() => planStorageKey(bad));
  }
});

test('guide links require HTTPS without embedded credentials', () => {
  assert.equal(externalUrl('https://docs.example.org/contribute'), 'https://docs.example.org/contribute');
  for (const value of ['javascript:alert(1)', 'data:text/html,', 'https://u:p@example.org', 'http://example.org', '/relative']) {
    assert.equal(externalUrl(value), '');
  }
});

test('private notes and explicitly shareable approach are separately bounded', () => {
  const plan = normalizePlan({ checks: [true, 'true', false, true], note: 'x'.repeat(5000), approach: 'y'.repeat(1000), extra: 'drop' });
  assert.deepEqual(plan.checks, [true, false, false]);
  assert.equal(plan.note.length, 4000);
  assert.equal(plan.approach.length, 700);
  assert.ok(!('extra' in plan));
  const comment = firstComment(issue, plan.approach);
  assert.ok(!comment.includes('xxx'));
  assert.ok(comment.includes(plan.approach));
  assert.deepEqual(normalizePlan(null), { checks: [false, false, false], note: '', approach: '' });
});

test('comment draft respects issue activity and user supplied approach', () => {
  assert.match(firstComment(issue, ''), /Is anyone working/);
  assert.match(firstComment(issue, 'Add a regression test.'), /Add a regression test/);
  assert.match(firstComment({ ...issue, assigneeCount: 1 }, ''), /already has an assignee/);
  assert.match(firstComment({ ...issue, state: 'closed' }, ''), /open follow-up/);
  assert.match(firstComment({ ...issue, locked: true }, ''), /locked discussion/);
});

test('Markdown becomes bounded text blocks, with image and link URLs omitted', () => {
  const body = [
    '<!-- hidden -->', '## Steps', '', '- **Start** with [the guide](https://t.example/abc).', '- ![Example](https://t.example/pixel.png)', '',
    '<em>Then</em> try `format()`.', '', '```js', 'if (a < b) { run(); }', '```'
  ].join('\n');
  const blocks = markdownBlocks(body);
  assert.deepEqual(blocks.map(b => b.kind), ['heading','list','p','code']);
  assert.deepEqual(blocks[1].items, ['Start with the guide.', '[Image: Example]']);
  assert.equal(blocks[2].text, 'Then try format().');
  assert.equal(blocks[3].text, 'if (a < b) { run(); }');
  assert.ok(!JSON.stringify(blocks).includes('https://'));
  assert.deepEqual(markdownBlocks(null), []);
  assert.match(markdownBlocks('x'.repeat(50000)).at(-1).text,/rest of the description/);
});

const observed = {
  status: 'checked', checkedAt: '2026-11-26T12:00:00.000Z', examined: 72, limit: 100, hasMore: false,
  linkedPullRequests: [
    { title: 'Improve setup docs', url: 'https://github.com/partner/docs/pull/12', state: 'open', merged: false },
    { title: 'Prototype', url: 'https://github.com/pandas-dev/pandas/pull/15', state: 'closed', merged: true }
  ],
  lastDiscussion: { date: '2026-11-21T12:00:00Z', url: 'https://github.com/pandas-dev/pandas/issues/34#issuecomment-222', excerpt: '**Update:** another contributor offered testing.' }
};

test('timeline preserves checked and incomplete coverage, PR states and original comment', () => {
  const result = activityView({ ...observed, hasMore: true }, issue);
  assert.equal(result.status, 'checked');
  assert.equal(result.hasMore, true);
  assert.equal(result.examined, 72);
  assert.equal(result.limit, 100);
  assert.deepEqual(result.pulls.map(p => p.state), ['open', 'merged']);
  assert.equal(result.pulls[0].ref, 'partner/docs#12');
  assert.equal(result.discussion.url, observed.lastDiscussion.url);
  assert.equal(result.discussion.excerpt, 'Update: another contributor offered testing.');
  assert.match(firstComment(issue, 'Review the test plan.', result), /partner\/docs\/pull\/12/);
  assert.match(firstComment(issue, 'Review the test plan.', result), /Review the test plan/);
});

test('missing, unavailable, invalid, and checked-empty timelines remain distinct', () => {
  assert.equal(activityView(null, issue).status, 'missing');
  assert.equal(activityView({ ...observed, status:'unavailable' }, issue).status, 'unavailable');
  assert.equal(activityView({ ...observed, examined: 101 }, issue).status, 'missing');
  assert.equal(activityView({ ...observed, checkedAt: 'broken' }, issue).status, 'missing');
  const result = activityView({ ...observed, examined: 0, linkedPullRequests: [], lastDiscussion: null }, issue);
  assert.equal(result.status,'checked');
  assert.deepEqual(result.pulls,[]);
  assert.equal(result.discussion,null);
});

test('activity links use trusted GitHub pull routes and only link to a comment on this issue', () => {
  const result = activityView({ ...observed, linkedPullRequests: [
    { ...observed.linkedPullRequests[0], url: 'https://github.com.evil.example/partner/docs/pull/12' },
    { ...observed.linkedPullRequests[0], url: 'https://github.com/partner/docs/issues/12' },
    ...observed.linkedPullRequests, ...observed.linkedPullRequests
  ], lastDiscussion: { ...observed.lastDiscussion, url: 'https://github.com/another/project/issues/4#issuecomment-222' } }, issue);
  assert.equal(result.pulls.length, 2);
  assert.equal(result.discussion.url, '');
  const many = Array.from({length:10}, (_, i) => ({ title:'PR', url:'https://github.com/partner/repo/pull/' + (i+1), state:'open' }));
  assert.equal(activityView({...observed, linkedPullRequests:many}, issue).pulls.length, 5);
});

test('saved issue availability is unknown until detail or dated snapshot loads', () => {
  const current = availabilityBadges({ ...issue, locked: true, comments: 8 }, 'live');
  assert.ok(current.some(([label]) => label === 'Discussion locked'));
  assert.deepEqual(availabilityBadges(issue, 'saved'), [['Current status unverified','']]);
});

test('workbench can look up saved plan progress by issue ref or object', t => {
  const records = new Map([[planStorageKey(issue), JSON.stringify({checks:[true,false,true],note:'private notes',approach:'a check',hidden:'no'})]]);
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable:true, value:{getItem: k => records.get(k) ?? null} });
  t.after(() => { if (previous) Object.defineProperty(globalThis,'localStorage',previous); else delete globalThis.localStorage; });
  assert.deepEqual(getIssuePlan(issue), normalizePlan({checks:[true,false,true],note:'private notes',approach:'a check'}));
  assert.deepEqual(getIssuePlan('pandas-dev/pandas#34'),getIssuePlan(issue));
  assert.deepEqual(getIssuePlan('invalid'),normalizePlan());
  records.set(planStorageKey(issue), 'corrupt');
  assert.deepEqual(getIssuePlan(issue),normalizePlan());
});
