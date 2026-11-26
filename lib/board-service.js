import { TIMELINE_LIMIT, timelineActivity, unavailableActivity } from './activity.js';

// Public GitHub requests only. Every destination and repository comes from the catalog.
const API = 'https://api.github.com';
const LABELS = ['good first issue', 'help wanted', 'first-timers-only', 'beginner'];
const BOARD_TTL = 5 * 60_000;
const ISSUE_TTL = 90_000;
const FALLBACK_TTL = 30_000;
const STALE_LIMIT = 24 * 60 * 60_000;
const REPO_PATTERN = /^[a-z\d][a-z\d-]{0,38}\/[\w.-]{1,100}$/i;

export class ServiceError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function positiveNumber(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (!/^[1-9]\d{0,9}$/.test(String(value))) return null;
  return Number(value);
}

function canonicalDate(value) {
  const time = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function projectLabels(project) {
  const aliases = Array.isArray(project.opportunityLabels) ? project.opportunityLabels : [];
  const labels = new Set(LABELS);
  for (const alias of aliases) {
    if (typeof alias === 'string' && alias.trim() && alias.length <= 50 && !/[,"\\\r\n]/.test(alias)) {
      labels.add(alias.trim().toLowerCase());
    }
  }
  return labels;
}

function isOpportunity(issue, labels) {
  return issue.state === 'open' && issue.locked === false && issue.assigneeCount === 0 &&
    issue.labels.some(label => typeof label === 'string' && labels.has(label.toLowerCase()));
}

function decodeIssue(item, catalog) {
  if (!item || item.pull_request || !positiveNumber(item.number) || typeof item.title !== 'string') return null;
  const repo = /^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/?#]+)$/i.exec(item.repository_url)?.[1];
  const project = catalog.get(repo?.toLowerCase());
  const createdAt = canonicalDate(item.created_at);
  const updatedAt = canonicalDate(item.updated_at);
  if (!project || !createdAt || !updatedAt || !['open', 'closed'].includes(item.state)) return null;
  if (!Array.isArray(item.assignees) || typeof item.locked !== 'boolean' || !Array.isArray(item.labels)) return null;
  const number = Number(item.number);
  return {
    id: project.repo + '#' + number,
    repo: project.repo,
    number,
    title: item.title,
    url: 'https://github.com/' + project.repo + '/issues/' + number,
    updatedAt,
    createdAt,
    comments: Number.isSafeInteger(item.comments) && item.comments >= 0 ? item.comments : 0,
    labels: item.labels.map(label => typeof label === 'string' ? label : label?.name).filter(label => typeof label === 'string'),
    category: project.category,
    language: project.language,
    project: project.name,
    assigneeCount: Math.max(item.assignees.length, item.assignee ? 1 : 0),
    body: typeof item.body === 'string' ? item.body : '',
    state: item.state,
    locked: item.locked
  };
}

function boardRow({ body, state, locked, ...summary }) {
  return summary;
}

function groupLabels(projects) {
  return [...new Set(projects.flatMap(project => [...projectLabels(project)]))];
}

function queryGroups(projects) {
  const groups = [];
  const groupSize = Math.max(4, Math.ceil(projects.length / 3));
  let group = [];
  for (const project of projects) {
    // Keep qualifier values below GitHub's query length limit, including local label aliases.
    const candidate = [...group, project];
    const termLength = groupLabels(candidate).join(',').length + candidate.map(p => p.repo).join(' ').length;
    if (group.length && (group.length >= groupSize || termLength > 217)) {
      groups.push(group);
      group = [];
    }
    group.push(project);
  }
  if (group.length) groups.push(group);
  return groups;
}

function searchUrl(projects) {
  const scopes = projects.map(project => 'repo:' + project.repo).join(' ');
  const labels = groupLabels(projects).map(label => '"' + label + '"').join(',');
  const url = new URL(API + '/search/issues');
  url.search = new URLSearchParams({
    q: 'is:issue is:open is:unlocked no:assignee ' + scopes + ' label:' + labels,
    per_page: '100',
    sort: 'updated',
    order: 'desc'
  });
  return url;
}

function staleVersion(cached, fallback, now) {
  const recorded = cached?.value;
  const recordedTime = Date.parse(recorded?.asOf);
  const snapshotTime = Date.parse(fallback?.asOf);
  if (recorded && now - recordedTime <= STALE_LIMIT && (!fallback || recordedTime >= snapshotTime)) {
    return { ...recorded, source: 'snapshot', cache: 'stale' };
  }
  return fallback ? { ...fallback, source: 'snapshot', cache: 'miss' } : null;
}

export function createService({ projects, snapshot, fetchImpl = fetch, now = Date.now }) {
  if (!Array.isArray(projects) || !projects.length || projects.some(project => !REPO_PATTERN.test(project.repo))) {
    throw new Error('Invalid project catalog.');
  }
  const catalog = new Map(projects.map(project => [project.repo.toLowerCase(), project]));
  const labelsByRepo = new Map(projects.map(project => [project.repo, projectLabels(project)]));
  const cache = new Map();
  const requests = new Map();
  const cooldown = { search: 0, core: 0 };
  const asOf = () => new Date(now()).toISOString();
  const snapshotAsOf = canonicalDate(snapshot?.asOf);
  const snapshotIssues = Array.isArray(snapshot?.issues) ? snapshot.issues : null;

  async function githubResponse(url, resource, timeout = 8000) {
    if (now() < cooldown[resource]) throw new Error('GitHub rate limit');
    const result = await fetchImpl(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Commonpatch-opportunity-board',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      signal: AbortSignal.timeout(timeout),
      redirect: 'error'
    });
    if (result.status === 429 || (result.status === 403 && (result.headers.get('x-ratelimit-remaining') === '0' || result.headers.has('retry-after')))) {
      const retrySeconds = Number(result.headers.get('retry-after')) || 0;
      const resetAt = Number(result.headers.get('x-ratelimit-reset')) * 1000;
      cooldown[resource] = Math.max(cooldown[resource], now() + 60_000, now() + retrySeconds * 1000, resetAt);
    }
    if (resource === 'core' && (result.status === 404 || result.status === 410)) {
      throw new ServiceError(404, 'This GitHub issue could not be found.');
    }
    if (!result.ok) throw new Error('GitHub request failed');
    return result;
  }

  async function cached(key, lifetime, fresh, fallback) {
    const previous = cache.get(key);
    if (previous && now() < previous.expires) {
      return { ...previous.value, cache: previous.value.cache === 'stale' ? 'stale' : 'hit' };
    }
    if (requests.has(key)) return requests.get(key);
    const pending = (async () => {
      let value;
      try {
        value = { ...await fresh(), source: 'live', asOf: asOf(), cache: 'miss' };
      } catch (error) {
        if (error instanceof ServiceError) {
          cache.delete(key);
          throw error;
        }
        value = staleVersion(previous, fallback(), now());
        if (!value) throw new ServiceError(503, 'GitHub is unavailable and there is no saved copy of this result.');
      }
      cache.delete(key);
      cache.set(key, { value, expires: now() + (value.source === 'live' ? lifetime : FALLBACK_TTL) });
      if (cache.size > 160) cache.delete(cache.keys().next().value);
      return value;
    })();
    requests.set(key, pending);
    try { return await pending; } finally { requests.delete(key); }
  }

  function snapshotDetail(row, project) {
    return {
      ...row,
      id: project.repo + '#' + row.number,
      repo: project.repo,
      project: project.name,
      category: project.category,
      language: project.language,
      url: 'https://github.com/' + project.repo + '/issues/' + row.number,
      body: typeof row.body === 'string' ? row.body : '',
      state: row.state ?? 'open',
      locked: row.locked ?? false
    };
  }

  function getBoard() {
    return cached('board', BOARD_TTL, async () => {
      const groups = queryGroups(projects);
      const results = await Promise.allSettled(groups.map(async group => {
        const response = await githubResponse(searchUrl(group), 'search');
        const data = await response.json();
        if (!Array.isArray(data?.items)) throw new Error('Malformed GitHub search result');
        return data;
      }));
      const successful = results.filter(result => result.status === 'fulfilled').map(result => result.value);
      if (!successful.length) throw new Error('GitHub search unavailable');
      const matches = new Map();
      for (const page of successful) {
        for (const item of page.items) {
          const issue = decodeIssue(item, catalog);
          if (issue && isOpportunity(issue, labelsByRepo.get(issue.repo))) matches.set(issue.id, boardRow(issue));
        }
      }
      const issues = [...matches.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
      const partial = successful.length !== groups.length || successful.some(page => page.incomplete_results || page.total_count > page.items.length);
      return { issues, projects, ...(partial ? { partial: true } : {}) };
    }, () => {
      if (!snapshotAsOf || !snapshotIssues) return null;
      const issues = [];
      for (const row of snapshotIssues) {
        const project = catalog.get(row.repo?.toLowerCase());
        if (!project || !positiveNumber(row.number) || !Array.isArray(row.labels)) continue;
        const issue = snapshotDetail(row, project);
        if (isOpportunity(issue, labelsByRepo.get(issue.repo))) issues.push(boardRow(issue));
      }
      return { issues, projects, asOf: snapshotAsOf, ...(snapshot.partial ? { partial: true } : {}) };
    });
  }

  async function getIssue(repo, value) {
    if (typeof repo !== 'string' || !REPO_PATTERN.test(repo)) throw new ServiceError(400, 'Supply a valid owner/repository.');
    const project = catalog.get(repo.toLowerCase());
    if (!project) throw new ServiceError(404, 'This project is outside the Commonpatch catalog.');
    const number = positiveNumber(value);
    if (!number) throw new ServiceError(400, 'Supply a positive issue number.');
    return cached(project.repo + '#' + number, ISSUE_TTL, async () => {
      const endpoint = API + '/repos/' + project.repo + '/issues/' + number;
      const response = await githubResponse(endpoint, 'core');
      const data = await response.json();
      if (data?.pull_request) throw new ServiceError(404, 'This number belongs to a pull request.');
      const issue = decodeIssue(data, catalog);
      if (!issue || issue.repo !== project.repo || issue.number !== number) throw new Error('Unexpected issue record');
      // Preserve the last few unauthenticated core requests for primary issue reads.
      const remaining = response.headers.get('x-ratelimit-remaining');
      let activity = unavailableActivity(asOf());
      if (remaining === null || Number(remaining) >= 3) {
        try {
          const timeline = await githubResponse(endpoint + '/timeline?per_page=' + TIMELINE_LIMIT + '&page=1', 'core', 2600);
          activity = timelineActivity(await timeline.json(), timeline.headers.get('link'), project.repo, number, asOf());
        } catch { /* The detail remains useful if the public timeline is absent, slow, or rate-limited. */ }
      }
      return { issue, activity };
    }, () => {
      const row = snapshotIssues?.find(issue => issue.repo?.toLowerCase() === project.repo.toLowerCase() && issue.number === number);
      return row && snapshotAsOf ? { issue: snapshotDetail(row, project), asOf: snapshotAsOf } : null;
    });
  }

  return { getBoard, getIssue };
}
