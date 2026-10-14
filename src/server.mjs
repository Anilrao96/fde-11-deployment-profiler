import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createProfiler, InputError } from './profiler.mjs';

const MAX_BODY = 256 * 1024;

function reply(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body), 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff' });
  res.end(body);
}

async function readJson(req) {
  if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
    throw new InputError('Content-Type must be application/json', 415);
  }
  let length = 0;
  const chunks = [];
  for await (const chunk of req) {
    length += chunk.length;
    if (length > MAX_BODY) throw new InputError('Request body too large', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new InputError('Invalid JSON'); }
}

export function createServer({ token = 'local-demo-token', profiler = createProfiler(), log = () => {} } = {}) {
  if (typeof token !== 'string' || !token) throw new Error('A nonempty bearer token is required');
  return http.createServer(async (req, res) => {
    const started = performance.now();
    const requestId = randomUUID();
    let status = 500;
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && path === '/health') {
        status = 200;
        return reply(res, status, { status: 'ok' });
      }
      if (req.headers.authorization !== `Bearer ${token}`) {
        throw new InputError('Unauthorized', 401);
      }
      if (req.method === 'GET' && path === '/api/runs') {
        status = 200;
        return reply(res, status, { runs: profiler.listRuns() });
      }
      if (req.method === 'POST' && path === '/api/runs') {
        const run = profiler.addRun(await readJson(req));
        status = 201;
        return reply(res, status, run);
      }
      if (req.method === 'GET' && /^\/api\/runs\/[^/]+$/.test(path)) {
        status = 200;
        return reply(res, status, profiler.getRun(path.split('/').pop()));
      }
      if (req.method === 'POST' && path === '/api/compare') {
        status = 200;
        return reply(res, status, profiler.compare(await readJson(req)));
      }
      throw new InputError('Route not found', 404);
    } catch (error) {
      status = error instanceof InputError ? error.status : 500;
      reply(res, status, { error: status === 500 ? 'Internal server error' : error.message, requestId });
    } finally {
      log({ requestId, method: req.method, status, durationMs: Math.round(performance.now() - started) });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3011);
  const host = process.env.HOST ?? '127.0.0.1';
  const token = process.env.PROFILER_TOKEN ?? 'local-demo-token';
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid PORT');
  const server = createServer({ token, log: event => console.log(JSON.stringify(event)) });
  server.listen(port, host, () => console.log(`Deployment profiler at http://${host}:${server.address().port}`));
}
