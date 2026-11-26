import http from 'node:http';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.woff2':'font/woff2'};
const args = process.argv.slice(2);
const port = Number(process.env.PORT || (args.includes('--port') && args[args.indexOf('--port') + 1]) || 3000);
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    const route = pathname.match(/^\/api\/(board|issue)\/?$/);
    if (route) {
      req.query = Object.fromEntries(url.searchParams);
      res.status = code => {res.statusCode = code; return res;};
      res.json = obj => {res.setHeader('Content-Type','application/json');res.end(JSON.stringify(obj));};
      const {default: handler} = await import('../api/' + route[1] + '.js');
      await handler(req, res);
      return;
    }
    if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405).end();return;}
    const filename = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!filename.startsWith(root)) {res.writeHead(404).end();return;}
    const body = await readFile(filename);
    res.writeHead(200, {'Content-Type': types[path.extname(filename)] || 'application/octet-stream'});
    res.end(req.method==='HEAD' ? undefined : body);
  } catch (e) {
    res.writeHead(e.code==='ENOENT'?404:500, {'Content-Type':'text/plain'});
    res.end(e.code==='ENOENT'?'File not found':'Unable to load this resource.');
  }
});
server.listen(port, '0.0.0.0', () => console.log('CommonPatch listening on port '+port));
