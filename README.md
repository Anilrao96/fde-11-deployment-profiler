# FDE Project 11: Deployment Profiler

A dependency-free Node.js service that turns load-test measurements into a deployment gate. Submit a baseline and a candidate for the same service, environment and workload; compare p95 latency, peak memory and failure rate against explicit limits.

## Run

Requires Node.js 20 or later. Run `npm start` and the API listens on `http://127.0.0.1:3011`. `PORT` and `HOST` override the bind address. All `/api` routes require `Authorization: Bearer <token>`. The local default is `local-demo-token`; set `PROFILER_TOKEN` to a private value for any nonlocal use. `GET /health` is public. State is in memory and resets on restart.

Run `npm run demo` for a self-contained walkthrough. It records checkout v1 and v2 under the same staging workload, then prints a failed gate because v2's p95 latency regressed. Run `npm test` for the full test suite.

## API workflow

`POST /api/runs` accepts JSON with `service`, `environment`, `workload`, `version`, and `samples`. A run needs 5-500 samples. Every sample has numeric `durationMs`, `memoryMb`, `cpuPct`, and boolean `success`. Labels are short identifiers. The response contains an ID and summary, not raw samples. `GET /api/runs` lists retained summaries; `GET /api/runs/:id` fetches one.

`POST /api/compare` accepts `{ "baselineId": "...", "candidateId": "..." }`. It rejects the same run or mismatched service, environment or workload. A candidate passes if p95 duration is at most 120% of baseline, peak memory at most 125%, and failure rate at most baseline plus two percentage points. The response shows each observed value, limit and pass flag. The gate is a deterministic signal for human review, not an automatic deploy action.

Example sample:

```json
{"service":"checkout","environment":"staging","workload":"load-100rps","version":"v1","samples":[{"durationMs":100,"memoryMb":200,"cpuPct":50,"success":true},{"durationMs":101,"memoryMb":201,"cpuPct":51,"success":true},{"durationMs":102,"memoryMb":202,"cpuPct":52,"success":true},{"durationMs":103,"memoryMb":203,"cpuPct":53,"success":true},{"durationMs":104,"memoryMb":204,"cpuPct":54,"success":true}]}
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for assumptions, tradeoffs and a production path.
