import { randomUUID } from 'node:crypto';

const MAX_RUNS = 100;
const MAX_SAMPLES = 500;
const METRICS = ['durationMs', 'memoryMb', 'cpuPct'];

export class InputError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, allowed) {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) {
    throw new InputError(`Expected only: ${allowed.join(', ')}`);
  }
}

function label(value, name) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(value)) {
    throw new InputError(`${name} must be 1-64 letters, digits, dots, underscores or hyphens`);
  }
  return value;
}

function finite(value, name, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new InputError(`${name} must be a finite number from ${min} to ${max}`);
  }
  return value;
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const weight = index - lower;
  return sorted[lower] + (sorted[Math.ceil(index)] - sorted[lower]) * weight;
}

const round = value => Math.round(value * 1000) / 1000;

export function summarize(samples) {
  return {
    sampleCount: samples.length,
    p50DurationMs: round(percentile(samples.map(s => s.durationMs), 0.5)),
    p95DurationMs: round(percentile(samples.map(s => s.durationMs), 0.95)),
    peakMemoryMb: round(Math.max(...samples.map(s => s.memoryMb))),
    meanCpuPct: round(samples.reduce((sum, s) => sum + s.cpuPct, 0) / samples.length),
    failureRate: round(samples.filter(s => !s.success).length / samples.length)
  };
}

export function createProfiler() {
  const runs = new Map();

  function addRun(input) {
    exactKeys(input, ['service', 'environment', 'workload', 'version', 'samples']);
    const service = label(input.service, 'service');
    const environment = label(input.environment, 'environment');
    const workload = label(input.workload, 'workload');
    const version = label(input.version, 'version');
    if (!Array.isArray(input.samples) || input.samples.length < 5 || input.samples.length > MAX_SAMPLES) {
      throw new InputError(`samples must contain 5-${MAX_SAMPLES} measurements`);
    }
    const samples = input.samples.map((sample, index) => {
      exactKeys(sample, [...METRICS, 'success']);
      if (typeof sample.success !== 'boolean') throw new InputError(`samples[${index}].success must be boolean`);
      return {
        durationMs: finite(sample.durationMs, `samples[${index}].durationMs`, 0, 3600000),
        memoryMb: finite(sample.memoryMb, `samples[${index}].memoryMb`, 0, 1048576),
        cpuPct: finite(sample.cpuPct, `samples[${index}].cpuPct`, 0, 100),
        success: sample.success
      };
    });
    const run = { id: randomUUID(), service, environment, workload, version,
      createdAt: new Date().toISOString(), summary: summarize(samples) };
    if (runs.size >= MAX_RUNS) runs.delete(runs.keys().next().value);
    runs.set(run.id, run);
    return run;
  }

  function getRun(id) {
    const run = runs.get(id);
    if (!run) throw new InputError('Run not found', 404);
    return run;
  }

  function compare(input) {
    exactKeys(input, ['baselineId', 'candidateId']);
    const baseline = getRun(input.baselineId);
    const candidate = getRun(input.candidateId);
    if (baseline.id === candidate.id) throw new InputError('Choose two different runs');
    for (const field of ['service', 'environment', 'workload']) {
      if (baseline[field] !== candidate[field]) throw new InputError(`Runs must share ${field}`);
    }
    const checks = [
      { metric: 'p95DurationMs', limit: round(baseline.summary.p95DurationMs * 1.2), unit: 'ms' },
      { metric: 'peakMemoryMb', limit: round(baseline.summary.peakMemoryMb * 1.25), unit: 'MB' },
      { metric: 'failureRate', limit: round(Math.min(1, baseline.summary.failureRate + 0.02)), unit: 'fraction' }
    ].map(check => ({ ...check, baseline: baseline.summary[check.metric],
      candidate: candidate.summary[check.metric], pass: candidate.summary[check.metric] <= check.limit }));
    return { baselineId: baseline.id, candidateId: candidate.id,
      verdict: checks.every(c => c.pass) ? 'pass' : 'fail', checks };
  }

  return { addRun, getRun, compare, listRuns: () => [...runs.values()] };
}
