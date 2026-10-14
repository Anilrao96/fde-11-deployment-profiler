import test from 'node:test';
import assert from 'node:assert/strict';
import { createProfiler } from '../src/profiler.mjs';
import { createServer } from '../src/server.mjs';

const samples = (durationMs, memoryMb, success = true) =>
  Array.from({ length: 5 }, () => ({ durationMs, memoryMb, cpuPct: 50, success }));
const base = { service: 'api', environment: 'staging', workload: 'steady' };

test('a candidate passes only when every threshold passes', () => {
  const profiler = createProfiler();
  const baseline = profiler.addRun({ ...base, version: 'v1', samples: samples(100, 200) });
  const good = profiler.addRun({ ...base, version: 'v2', samples: samples(110, 220) });
  const slow = profiler.addRun({ ...base, version: 'v3', samples: samples(121, 220) });
  assert.equal(profiler.compare({ baselineId: baseline.id, candidateId: good.id }).verdict, 'pass');
  const comparison = profiler.compare({ baselineId: baseline.id, candidateId: slow.id });
  assert.equal(comparison.verdict, 'fail');
  assert.equal(comparison.checks.find(c => c.metric === 'p95DurationMs').pass, false);
});

test('incomparable runs and malformed measurements are rejected', () => {
  const profiler = createProfiler();
  const baseline = profiler.addRun({ ...base, version: 'v1', samples: samples(100, 200) });
  const other = profiler.addRun({ ...base, workload: 'burst', version: 'v2', samples: samples(100, 200) });
  assert.throws(() => profiler.compare({ baselineId: baseline.id, candidateId: other.id }), /share workload/);
  assert.throws(() => profiler.addRun({ ...base, version: 'bad', samples: samples(Infinity, 200) }), /finite/);
  assert.throws(() => profiler.addRun({ ...base, version: 'bad', samples: samples(100, 200).slice(0, 4) }), /5-500/);
});

test('HTTP API requires bearer auth and does not expose raw samples', async () => {
  const server = createServer({ token: 'test-secret' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const denied = await fetch(url + '/api/runs');
    assert.equal(denied.status, 401);
    const added = await fetch(url + '/api/runs', { method: 'POST',
      headers: { authorization: 'Bearer test-secret', 'content-type': 'application/json' },
      body: JSON.stringify({ ...base, version: 'v1', samples: samples(100, 200) }) });
    assert.equal(added.status, 201);
    const run = await added.json();
    assert.equal(run.summary.sampleCount, 5);
    assert.equal('samples' in run, false);
    const listed = await fetch(url + '/api/runs', { headers: { authorization: 'Bearer test-secret' } });
    assert.equal((await listed.json()).runs.length, 1);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
