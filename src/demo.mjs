import assert from 'node:assert/strict';
import { createServer } from './server.mjs';

const token = 'demo-token';
const server = createServer({ token });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

async function post(path, body) {
  const response = await fetch(base + path, { method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body) });
  assert.ok(response.ok, `${path}: ${response.status}`);
  return response.json();
}

function samples(durations, memory) {
  return durations.map(durationMs => ({ durationMs, memoryMb: memory, cpuPct: 55, success: true }));
}

try {
  const common = { service: 'checkout', environment: 'staging', workload: 'load-100rps' };
  const baseline = await post('/api/runs', { ...common, version: 'v1',
    samples: samples([95, 98, 100, 102, 105, 108], 200) });
  const candidate = await post('/api/runs', { ...common, version: 'v2',
    samples: samples([99, 101, 103, 108, 112, 158], 220) });
  const comparison = await post('/api/compare', { baselineId: baseline.id, candidateId: candidate.id });
  assert.equal(comparison.verdict, 'fail');
  console.log(JSON.stringify({ baseline: baseline.summary, candidate: candidate.summary, comparison }, null, 2));
} finally {
  await new Promise(resolve => server.close(resolve));
}
