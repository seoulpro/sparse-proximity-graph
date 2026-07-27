# Benchmarking

The benchmark suite is intended for repeatable performance-regression work on
`buildSparsePlanarGraph`. It does not establish a universal latency guarantee
or compare algorithms with different output semantics.

## Profiles

Run the quick profile during development:

```sh
npm run benchmark
```

Run size sweeps that keep the expected neighborhood density approximately
constant:

```sh
npm run benchmark:scaling
```

Run dense and coincident inputs that exercise the documented worst-case
neighbor discovery:

```sh
npm run benchmark:stress
```

Use `npm run benchmark -- --help` for case, size, sample, warmup, and JSON
options. For example:

```sh
npm run benchmark -- --case=uniform --sizes=1000,4000 --runs=30
```

## Methodology

- Fixtures use fixed seeds and do not count input generation in measured time.
- Every case and point count runs in a separate Node.js process so V8 state
  from another configuration does not affect it.
- The quick profile uses three warmups and ten measured samples. Scaling and
  stress profiles use two warmups and five samples to keep exploratory runs
  practical.
- Each measured sample batches enough graph builds to target about 500 ms, then
  normalizes the result to one graph build. This reduces timer, scheduler, and
  garbage-collection noise for small inputs.
- Timing uses `process.hrtime.bigint()`. Reports include median, p95, sample
  coefficient of variation (CV), and operations per second.
- Edge count, isolated-point count, maximum degree, and an output checksum are
  checked across every sample. A checksum change means performance results may
  also include a behavior change.
- Environment metadata includes Node.js, V8, platform, architecture, CPU,
  source revision, and dirty-worktree state, but excludes hostnames, usernames,
  and local paths.

An individual run is exploratory. Before making a performance claim, use at
least 30 samples, run both revisions on the same idle machine and Node.js
version, and investigate any case whose CV exceeds 10%. Node.js core likewise
uses repeated runs and statistical analysis rather than treating one timing as
conclusive; see its
[benchmark guide](https://github.com/nodejs/node/blob/main/doc/contributing/writing-and-running-benchmarks.md).

## Machine-readable comparison

Capture reports before and after a change:

```sh
npm run benchmark -- --profile=scaling --runs=30 --json > benchmark-before.json
npm run benchmark -- --profile=scaling --runs=30 --json > benchmark-after.json
npm run benchmark:compare -- benchmark-before.json benchmark-after.json
```

The comparison reports median deltas and flags output-checksum changes. It does
not label a delta statistically significant. Keep the raw JSON reports with
any published benchmark claim so sample counts, variance, environment, graph
quality, and timing data remain reviewable. Local benchmark JSON and Node.js
CPU or heap profiles are ignored by Git to prevent machine-specific artifacts
from entering commits accidentally.
