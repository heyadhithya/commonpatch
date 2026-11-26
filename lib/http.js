import { readFile } from 'node:fs/promises';
import { createService, ServiceError } from './board-service.js';

let servicePromise;

async function readService() {
  const [catalogText, snapshot] = await Promise.all([
    readFile(new URL('../public/data/projects.json', import.meta.url), 'utf8'),
    readFile(new URL('../public/data/board.json', import.meta.url), 'utf8').then(JSON.parse).catch(() => null)
  ]);
  const catalog = JSON.parse(catalogText);
  return createService({ projects: Array.isArray(catalog) ? catalog : catalog.projects, snapshot });
}

function getService() {
  if (!servicePromise) {
    servicePromise = readService().catch(error => {
      servicePromise = undefined;
      throw error;
    });
  }
  return servicePromise;
}

function singleParameter(query, key) {
  const values = query.getAll(key);
  if (values.length !== 1) throw new ServiceError(400, 'Specify exactly one ' + key + ' parameter.');
  return values[0];
}

export function createHandler(route, load = getService) {
  return async function handler(req, res) {
    let status = 200;
    let payload;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD');
        throw new ServiceError(405, 'Use GET to read this endpoint.');
      }
      const service = await load();
      if (route === 'board') {
        payload = await service.getBoard();
      } else {
        const query = new URL(req.url, 'https://commonpatch.invalid').searchParams;
        payload = await service.getIssue(singleParameter(query, 'repo'), singleParameter(query, 'number'));
      }
      const maxAge = payload.source === 'snapshot' ? 30 : route === 'board' ? 180 : 60;
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=' + maxAge + ', stale-while-revalidate=30');
    } catch (error) {
      status = error instanceof ServiceError ? error.status : 503;
      payload = { error: error instanceof ServiceError ? error.message : 'The Commonpatch data service is temporarily unavailable.' };
    }
    res.statusCode = status;
    res.end(req.method === 'HEAD' ? undefined : JSON.stringify(payload));
  };
}
