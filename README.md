# sparse-proximity-graph

Build a deterministic, low-degree, approximately planar graph from unstructured
2D points.

The package is intended for sparse navigation links, local proximity networks,
interactive diagrams, sensor layouts, and other cases where a full Delaunay
triangulation is noisier than the desired result.

## Pipeline

1. Spatial-hash neighbor discovery within `maxDistance`.
2. Per-point top-k candidate truncation.
3. Approximate relative-neighborhood pruning.
4. Angular-sector and degree capping.
5. Shortest-first crossing removal.
6. Conservative reconnection of isolated points.

The relative-neighborhood step is approximate because it inspects a bounded
candidate neighborhood. The output is a practical sparse graph, not a formal
proof of global planarity or connectivity.

## Install

```sh
npm install sparse-proximity-graph
```

Node.js 22 or newer is required. The package is ESM-only, includes TypeScript
declarations, and has no runtime dependencies.

## Example

```js
import {
  buildAdjacency,
  buildSparsePlanarGraph
} from "sparse-proximity-graph";

const points = [
  { id: "a", x: 0, y: 0 },
  { id: "b", x: 10, y: 2 },
  { id: "c", x: 18, y: 9 },
  { id: "d", x: 3, y: 14 }
];

const edges = buildSparsePlanarGraph(points, {
  maxDistance: 20,
  maxCandidatesPerPoint: 12,
  maxDegreePerPoint: 4,
  sectorCount: 8
});

const adjacency = buildAdjacency(edges);
```

Each point must provide its own `id`, `x`, and `y` properties. Identifiers may
be strings or finite numbers; coordinates must be finite numbers and are
unit-agnostic. The functions read their inputs without mutating the arrays,
points, or edges passed by the caller.

The result is sorted deterministically and contains `{ a, b, distance }` for
each undirected edge. Identifier tie-breaking uses type-prefixed code-unit
ordering and therefore does not depend on the host locale.

## Options

```js
{
  maxDistance: 40,
  maxCandidatesPerPoint: 12,
  maxDegreePerPoint: 4,
  sectorCount: 8,
  relativeNeighborhood: true,
  preventCrossings: true,
  reconnectIsolated: true
}
```

`maxDistance` uses the same unit as the input coordinates. Reconnection may
raise the selected neighbor's degree by one; it does not search beyond
`maxDistance`. A zero distance returns no edges. Unknown options and malformed
numeric or boolean option values throw a `TypeError`. Candidate, degree, and
sector counts must be positive safe integers.

## Authoritative edges

`resolveGraphEdges(points, suppliedEdges, options)` distinguishes two cases:

- `suppliedEdges === undefined`: compute a spatial graph;
- an array, including an empty array: normalize only those explicit edges.

This prevents a client from silently inventing links when an upstream source
has explicitly supplied an authoritative empty graph. A finite, non-negative
`distance` is preserved; otherwise it is measured from the endpoints.
Malformed entries, unknown endpoints, and self-edges are dropped. Duplicate
undirected edges are collapsed to the shortest supplied distance.

## Public API

- `buildSparsePlanarGraph(points, options)` computes the heuristic graph.
- `resolveGraphEdges(points, suppliedEdges, options)` either computes the graph
  or normalizes an authoritative edge list as described above.
- `buildAdjacency(edges)` returns a `Map` whose neighbor arrays are ordered by
  distance and identifier. It rejects malformed, self, and duplicate edges.
- `segmentsIntersect(a, b, c, d)` tests two closed 2D segments. Points that
  share an `id` are treated as a common endpoint rather than a crossing. All
  four points are validated before the test is performed.

## Complexity

The spatial hash avoids comparing every pair for normally distributed points.
It cannot bound the work when many points occupy the same cell, so dense or
coincident input can still require quadratic neighbor comparisons. Crossing
removal also compares selected edges pairwise. Candidate and degree caps bound
the later stages and the output size, but not every part of discovery.
Isolated-point reconnection may relax a neighbor's configured degree cap by
one.

The algorithm is deterministic for the same inputs and options, but it does
not promise a connected graph. Benchmark the point distributions used by your
application before relying on a latency budget. API and heuristic defaults may
change during the `0.x` series.

## Development

```sh
npm install
npm run check
npm run benchmark
```

`check` validates the source and TypeScript declarations, runs the test suite,
and enforces coverage thresholds. See
[CONTRIBUTING.md](./CONTRIBUTING.md) for correctness and benchmark
expectations, and [SECURITY.md](./SECURITY.md) for how to report a
vulnerability.

The benchmark uses fixed point sets and reports the median of five warmed runs.
Results are intended for comparisons on the same machine and Node.js version,
not as a cross-system latency guarantee.

## License

[MIT](./LICENSE) © Sumin Lim
