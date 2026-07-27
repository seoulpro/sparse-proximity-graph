# Contributing to sparse-proximity-graph

Bug reports, benchmarks, and focused pull requests are welcome. Open an issue
before changing the pruning pipeline, defaults, or output schema so quality and
complexity tradeoffs can be evaluated.

## Development

Use Node.js 22 or newer:

```sh
npm install
npm run check
```

The package has no runtime dependencies. Development uses TypeScript to check
the bundled declarations.

## Tests and benchmarks

Use small named point sets for correctness tests and seeded data for
performance work. Tests for algorithm changes should consider:

- stable output under reordered input;
- duplicate or invalid point identifiers;
- degree and candidate limits;
- crossing removal;
- isolated-point reconnection;
- the distinction between an omitted edge set and an authoritative empty set;
- agreement between the JavaScript API and its TypeScript declarations.

Do not describe the heuristic as guaranteeing planarity or connectivity unless
the implementation and proof actually provide that guarantee. Include input
size, distribution, options, runtime, and machine details with benchmark
claims. Use at least 30 measured samples on the same idle machine and Node.js
version for before-and-after performance claims. Include the JSON reports, and
call out checksum or graph-quality changes separately from timing changes. See
the
[benchmark guide](https://github.com/seoulpro/sparse-proximity-graph/blob/main/benchmark/README.md)
for profiles and comparison commands.

The package remains coordinate-system agnostic and free of runtime
dependencies. Rendering, storage, and domain policy belong in callers. New
development dependencies need a clear maintenance or verification benefit.

See [SECURITY.md](./SECURITY.md) for private reporting. Contributions are
licensed under the [MIT license](./LICENSE).
