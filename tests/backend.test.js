import test from 'node:test';
import assert from 'node:assert/strict';
import { createService } from '../lib/board-service.js';
import { createHandler } from '../lib/http.js';

const project = {
  repo: 'sample/maps', name: 'Sample Maps', description: 'A map editor', category: 'Mapping',
  language: 'JavaScript', url: 'https://github.com/sample/maps', contributingUrl: 'https://github.com/sample/maps/contribute'
};
const historicTime = '2026-03-01T12:00:00.000Z';
const startTime = Date.parse('2026-03-02T12:00:00.000Z');

function githubIssue(number, changes = {}) {
  return {
    number, title: 'Improve the crossing marker', body: 'Add a visible symbol.',
    repository_url: 'https://api.github.com/repos/sample/maps', state: 'open', locked: false,
    labels: [{ name: 'Good First Issue' }], assignees: [], assignee: null, comments: 2,
    created_at: '2025-06-01T12:00:00Z', updated_at: '2026-03-01T11:00:00Z', ...changes
  };
}
const snapshotIssue = {
  id: 'sample/maps#1', repo: 'sample/maps', number: 1, title: 'Original issue title', body: 'Original description.',
  url: 'https://github.com/sample/maps/issues/1', createdAt: historicTime, updatedAt: historicTime,
  labels: ['good first issue'], assigneeCount: 0, comments: 1, state: 'open', locked: false,
  category: 'Mapping', language: 'JavaScript', project: 'Sample Maps'
};
const snapshot = { source: 'snapshot', issues: [snapshotIssue], asOf: historicTime };
const page = (items, extra = {}) => Response.json({ total_count: items.length, incomplete_results: false, items, ...extra });
const scenario = (fetchImpl, options = {}) => createService({ projects: [project], snapshot, fetchImpl, now: () => startTime, ...options });

test('builds a scoped label search, independently verifies eligibility, deduplicates and sorts', async () => {
  let calls = 0;
  const service = scenario(async address => {
    calls++;
    const query = new URL(address).searchParams.get('q');
    assert(query.includes('repo:sample/maps'));
    assert(query.includes('no:assignee'));
    assert(query.includes('label:"good first issue","help wanted","first-timers-only","beginner"'));
    return page([
      githubIssue(1), githubIssue(1), githubIssue(2, { labels: ['HELP WANTED'], updated_at: '2026-03-02T01:00:00Z' }),
      githubIssue(3, { locked: true }), githubIssue(4, { state: 'closed' }), githubIssue(5, { pull_request: {} }),
      githubIssue(6, { labels: ['sometimes beginner friendly'] }), githubIssue(7, { assignees: [{ login: 'volunteer' }] }),
      githubIssue(8, { assignee: { login: 'volunteer' } }), githubIssue(9, { repository_url: 'https://api.github.com/repos/other/repo' })
    ]);
  });
  const [a, b] = await Promise.all([service.getBoard(), service.getBoard()]);
  assert.equal(calls, 1);
  assert.deepEqual(a, b);
  assert.deepEqual(a.issues.map(issue => issue.id), ['sample/maps#2', 'sample/maps#1']);
  assert.equal(a.issues[0].category, project.category);
  assert.equal(a.issues[0].url, 'https://github.com/sample/maps/issues/2');
  assert.equal(a.issues[0].body, undefined);
  assert.equal(a.source, 'live');
  assert.equal(a.asOf, new Date(startTime).toISOString());
  assert.equal((await service.getBoard()).cache, 'hit');
});

test('a live empty result never brings back a snapshot issue', async () => {
  const svc = scenario(async () => page([]));
  const result = await svc.getBoard();
  assert.equal(result.source, 'live');
  assert.deepEqual(result.issues, []);
});

test('reported partial coverage includes search caps, incomplete results, and missing batches', async () => {
  const projects = Array.from({ length: 9 }, (_, i) => ({ ...project, repo: 'sample/map' + i }));
  let calls = 0;
  const svc = scenario(async () => {
    calls++;
    return calls === 1 ? Response.json({}, { status: 503 }) : page([], { total_count: 200, incomplete_results: true });
  }, { projects });
  const result = await svc.getBoard();
  assert.equal(calls, 3);
  assert.equal(result.source, 'live');
  assert.equal(result.partial, true);
});

test('rate limit falls back to the dated snapshot and respects the upstream reset', async () => {
  let clock = startTime;
  let calls = 0;
  const svc = scenario(async () => {
    calls++;
    return Response.json({}, { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(startTime / 1000 + 600) } });
  }, { now: () => clock });
  const first = await svc.getBoard();
  assert.equal(first.asOf, historicTime);
  assert.equal(first.source, 'snapshot');
  assert.equal(first.issues[0].id, snapshotIssue.id);
  clock += 60_000;
  assert.equal((await svc.getBoard()).source, 'snapshot');
  assert.equal(calls, 1);
});

test('a failed refresh retains the newer previous fetch with its original timestamp', async () => {
  let clock = startTime;
  let calls = 0;
  const svc = scenario(async () => {
    if (++calls > 1) throw new TypeError('Network unavailable');
    return page([githubIssue(25)]);
  }, { now: () => clock });
  const live = await svc.getBoard();
  clock += 6 * 60_000;
  const fallback = await svc.getBoard();
  assert.equal(fallback.source, 'snapshot');
  assert.equal(fallback.cache, 'stale');
  assert.equal(fallback.asOf, live.asOf);
  assert.equal(fallback.issues[0].number, 25);
});

test('detail accepts a closed or assigned issue and handles removed issues and pull requests', async () => {
  const svc = scenario(async address => {
    const n = Number(new URL(address).pathname.split('/').at(-1));
    if (n === 1) return Response.json({}, { status: 404 });
    if (n === 2) return Response.json(githubIssue(2, { pull_request: {} }));
    return Response.json(githubIssue(n, { state: 'closed', assignees: [{ login: 'x' }] }));
  });
  const detail = await svc.getIssue('SAMPLE/maps', '3');
  assert.equal(detail.issue.state, 'closed');
  assert.equal(detail.issue.assigneeCount, 1);
  assert.equal(detail.issue.body, 'Add a visible symbol.');
  assert.equal(detail.source, 'live');
  assert.equal((await svc.getIssue('sample/MAPS', 3)).cache, 'hit');
  // A real deletion must take precedence even when the bundled snapshot still contains #1.
  await assert.rejects(svc.getIssue('sample/maps', 1), { status: 404 });
  await assert.rejects(svc.getIssue('sample/maps', 2), { status: 404 });
});

test('detail requires a curated repository and a strict positive integer before making a request', async () => {
  let calls = 0;
  const svc = scenario(async () => { calls++; return Response.json({}); });
  for (const value of ['-4', '2.5', '1/../../', '01', ['1'], 0]) {
    await assert.rejects(svc.getIssue(project.repo, value), { status: 400 });
  }
  await assert.rejects(svc.getIssue('project/unknown', 1), { status: 404 });
  await assert.rejects(svc.getIssue('https://example.com/repo', 1), { status: 400 });
  assert.equal(calls, 0);
});

test('detail fallback distinguishes a saved description from an unknown issue during an outage', async () => {
  const svc = scenario(async () => { throw new TypeError('Network unavailable'); });
  const result = await svc.getIssue(project.repo, 1);
  assert.equal(result.source, 'snapshot');
  assert.equal(result.asOf, historicTime);
  assert.equal(result.issue.body, 'Original description.');
  await assert.rejects(svc.getIssue(project.repo, 11), { status: 503 });
});

test('HTTP handlers support HEAD and cache successful results, reject duplicate parameters and POST', async () => {
  const svc = scenario(async () => Response.json(githubIssue(1)));
  const handler = createHandler('issue', async () => svc);
  async function request(method, query) {
    const res = {
      headers: {}, setHeader(key, value) { this.headers[key] = value; },
      end(body) { this.body = body; }
    };
    await handler({ method, url: '/api/issue?' + query }, res);
    return res;
  }
  const valid = 'repo=sample%2Fmaps&number=1';
  const get = await request('GET', valid);
  assert.equal(get.statusCode, 200);
  assert.equal(JSON.parse(get.body).issue.id, 'sample/maps#1');
  assert.match(get.headers['Cache-Control'], /s-maxage=/);
  const head = await request('HEAD', valid);
  assert.equal(head.statusCode, 200);
  assert.equal(head.body, undefined);
  const duplicate = await request('GET', valid + '&number=2');
  assert.equal(duplicate.statusCode, 400);
  assert.equal(duplicate.headers['Cache-Control'], 'no-store');
  const post = await request('POST', valid);
  assert.equal(post.statusCode, 405);
  assert.equal(post.headers.Allow, 'GET, HEAD');
});

test('curated label aliases search across the batch but qualify only their owning project', async () => {
  const civic = { ...project, repo: 'sample/civic', category: 'Civic tech', opportunityLabels: ['Help welcome', '👍 Beginner friendly'] };
  const service = scenario(async url => {
    assert.match(new URL(url).searchParams.get('q'), /"help welcome","👍 beginner friendly"/);
    return page([
      githubIssue(1, { labels: ['Help welcome'] }),
      githubIssue(2, { repository_url: 'https://api.github.com/repos/sample/civic', labels: ['HELP WELCOME'] }),
      githubIssue(2, { repository_url: 'https://api.github.com/repos/sample/civic', labels: ['HELP WELCOME'] }),
      githubIssue(3, { repository_url: 'https://api.github.com/repos/sample/civic', labels: ['Almost beginner friendly'] }),
      githubIssue(4, { repository_url: 'https://api.github.com/repos/sample/civic', labels: ['👍 Beginner friendly'] })
    ]);
  }, { projects: [project, civic] });
  const board = await service.getBoard();
  assert.deepEqual(board.issues.map(issue => issue.id), ['sample/civic#2', 'sample/civic#4']);
});

test('detail summarizes verified public pull-request mentions and the latest in-window issue comment', async () => {
  const day = '2026-03-01T00:00:00Z';
  function referenced(url, extra = {}) {
    return { event: 'cross-referenced', created_at: day, source: { type: 'issue', issue: {
      number: 18, title: 'Add the marker', html_url: url, state: 'closed',
      pull_request: { html_url: url, merged_at: day }, ...extra
    } } };
  }
  const url = 'https://github.com/helpful/other-project/pull/18';
  const thread = 'https://github.com/sample/maps/issues/1#issuecomment-577';
  const events = [
    referenced(url), referenced(url),
    referenced('https://github.com.evil.example/helpful/other-project/pull/18'),
    referenced('https://github.com/helpful/other-project/pull/18?redirect=anything'),
    referenced('https://github.com/helpful/other-project/pull/19'),
    referenced('https://github.com/helpful/secret/pull/18', { repository: { private: true } }),
    referenced('https://github.com/helpful/other-project/issues/18', { pull_request: null }),
    { event: 'commented', created_at: day, html_url: thread, body: '<p>See [the plan](https://example.com).</p>' },
    { event: 'commented', created_at: '2026-03-02T00:00:00Z', html_url: 'https://github.com/sample/maps/issues/200#issuecomment-99', body: 'Different issue' },
    { event: 'commented', created_at: '2026-01-01T00:00:00Z', html_url: thread, body: 'Earlier comment' }
  ];
  const calls = [];
  const svc = scenario(async address => {
    const request = new URL(address);
    calls.push(request.pathname);
    if (!request.pathname.endsWith('/timeline')) return Response.json(githubIssue(1));
    assert.equal(request.searchParams.get('page'), '1');
    assert.equal(request.searchParams.get('per_page'), '100');
    return Response.json(events, { headers: { link: '<https://api.github.com/next>; rel="next"' } });
  });
  const { activity } = await svc.getIssue(project.repo, 1);
  assert.equal(activity.status, 'checked');
  assert.equal(activity.examined, events.length);
  assert.equal(activity.limit, 100);
  assert.equal(activity.hasMore, true);
  assert.deepEqual(activity.linkedPullRequests, [{ url, state: 'closed', merged: true, title: 'Add the marker' }]);
  assert.deepEqual(activity.lastDiscussion, { date: '2026-03-01T00:00:00.000Z', url: thread, excerpt: 'See the plan.' });
  assert.equal((await svc.getIssue(project.repo, 1)).cache, 'hit');
  assert.equal(calls.length, 2);
});

test('the timeline is optional, skips a depleted quota, and distinguishes an empty timeline', async () => {
  for (const outcome of ['forbidden', 'quota', 'empty']) {
    let calls = 0;
    const svc = scenario(async address => {
      calls++;
      if (!new URL(address).pathname.endsWith('/timeline')) {
        return Response.json(githubIssue(1), { headers: { 'x-ratelimit-remaining': outcome === 'quota' ? '1' : '40' } });
      }
      return outcome === 'empty' ? Response.json([]) : Response.json({}, { status: 403 });
    });
    const result = await svc.getIssue('sample/maps', 1);
    assert.equal(result.source, 'live');
    assert.equal(result.issue.body, 'Add a visible symbol.');
    assert.equal(result.activity.status, outcome === 'empty' ? 'checked' : 'unavailable');
    assert.deepEqual(result.activity.linkedPullRequests, []);
    assert.equal(calls, outcome === 'quota' ? 1 : 2);
  }
});
