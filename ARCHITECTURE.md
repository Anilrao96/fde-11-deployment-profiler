# Architecture

```text
load-test exporter -> bearer-token HTTP API -> validated run summaries
                                                -> comparison gate
```

The service is one Node.js process with no runtime dependencies. It retains at most 100 run summaries in insertion order. A run is immutable after creation. Inputs are limited to 256 KiB, 5-500 samples, bounded metric ranges and strict fields. Linear-interpolated p50 and p95 latency, peak memory, mean CPU and failure rate are computed at ingestion. Raw measurements are discarded after summarization. A comparison checks three fixed thresholds and requires the same service, environment and workload, so a light candidate cannot be compared with a heavy baseline by mistake.

## Security and tenancy

This v1 is a single-operator local tool, not a multi-tenant service. There is one bearer token and one shared in-memory namespace. Service labels are grouping data, not an authorization boundary. The default token is published for local evaluation only. The server binds loopback by default; changing `HOST` for network use requires a private `PROFILER_TOKEN`, TLS at a trusted proxy and network access controls. API errors and request logs omit tokens and sample bodies. The health endpoint reveals only process availability. There is no rate limiting, identity provider or per-user audit trail.

## Observability and tradeoffs

The HTTP server logs request ID, method, status and elapsed time, without URL query, body or headers. It does not include deployment labels in logs. A failed comparison is returned to the caller but is not persisted as an event. Measurements can be noisy: five samples are enough for a demo but too few for a reliable p95. Fixed relative gates are deliberately simple; small baselines and low failure rates may need workload-specific limits and confidence intervals. CPU is summarized but not gated because host CPU measurements vary across machines. Restart loses all runs and evicts the oldest when the 100-run cap is reached.

## Production path

Ingest signed, versioned load-test artifacts through CI. Store raw measurements and immutable summaries in durable object storage and a database with tenant IDs, retention policies and encrypted backups. Put authorization on tenant and service scopes, rotate short-lived credentials and add rate limits. Record the exact test harness, hardware, commit SHA, workload definition and sampling window; reject incompatible environments. Derive thresholds from service SLOs, include statistical uncertainty and minimum sample sizes, and support explicit human overrides with an audit trail. Export comparison outcomes, latency histograms, error counters and request traces to an observability backend. Integrate a gate with deployment tooling only after its failure behavior and override process are reviewed.
