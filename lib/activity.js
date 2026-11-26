// One public timeline page per detail request. Cross-references are mentions, not ownership.
export const TIMELINE_LIMIT = 100;
const PR_LINK = /^https:\/\/github\.com\/[a-z0-9][a-z0-9-]{0,38}\/[\w.-]+\/pull\/([1-9]\d*)$/i;
const COMMENT_LINK = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/issues\/([1-9]\d*)#issuecomment-[1-9]\d*$/i;

function timestamp(value) {
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function excerpt(body) {
  const text = (typeof body === 'string' ? body.slice(0, 2000) : '')
    .replace(/<!--[^]*?-->/g, ' ').replace(/```[^]*?(?:```|$)/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, ' ').replace(/https?:\/\/\S+/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > 180 ? text.slice(0, 179).trimEnd() + '…' : text;
}

function pullReference(event) {
  const source = event.source?.issue;
  const pull = source?.pull_request;
  if (event.source?.type !== 'issue' || !pull || source.repository?.private === true) return null;
  const url = source.html_url;
  const match = typeof url === 'string' && PR_LINK.exec(url);
  if (!match || Number(match[1]) !== source.number || typeof source.title !== 'string' ||
      !['open', 'closed'].includes(source.state)) return null;
  if (pull.html_url && (typeof pull.html_url !== 'string' || pull.html_url.toLowerCase() !== url.toLowerCase())) return null;
  const merged = timestamp(pull.merged_at) ? true : pull.merged_at === null || source.state === 'open' ? false : null;
  return { title: source.title.slice(0, 300), url, state: source.state, merged };
}

export function unavailableActivity(checkedAt) {
  return { status: 'unavailable', checkedAt, examined: 0, limit: TIMELINE_LIMIT, hasMore: false, linkedPullRequests: [] };
}

export function timelineActivity(events, linkHeader, repo, number, checkedAt) {
  if (!Array.isArray(events)) throw new Error('Malformed public timeline.');
  const window = events.slice(0, TIMELINE_LIMIT);
  const result = {
    status: 'checked', checkedAt,
    examined: window.length, limit: TIMELINE_LIMIT,
    hasMore: events.length > TIMELINE_LIMIT || /;\s*rel="next"/i.test(linkHeader || ''),
    linkedPullRequests: []
  };
  const seen = new Set();
  // Sort a copy to handle events whose position differs from their creation timestamp.
  const byDate = window.filter(event => event && timestamp(event.created_at))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  for (const event of byDate) {
    if (event.event === 'cross-referenced' && result.linkedPullRequests.length < 5) {
      const link = pullReference(event);
      if (link && !seen.has(link.url.toLowerCase())) {
        seen.add(link.url.toLowerCase());
        result.linkedPullRequests.push(link);
      }
    }
    if (event.event === 'commented' && !result.lastDiscussion) {
      const url = event.html_url;
      const match = typeof url === 'string' && COMMENT_LINK.exec(url);
      if (match && match[1].toLowerCase() === repo.toLowerCase() && Number(match[2]) === number) {
        result.lastDiscussion = { date: timestamp(event.created_at), url, excerpt: excerpt(event.body) };
      }
    }
  }
  return result;
}
