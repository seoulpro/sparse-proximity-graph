# Changelog

Notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). During the `0.x`
series, the public API and heuristic defaults may change between minor
versions.

## [Unreleased]

### Added

- Reproducible quick, scaling, and stress benchmark profiles with variance,
  graph-quality, JSON, and before-and-after comparison output.

## [0.1.0] - 2026-07-28

### Added

- Deterministic sparse-graph construction from finite 2D points.
- Bounded candidate, degree, and angular-sector selection.
- Approximate relative-neighborhood pruning and crossing removal.
- Conservative reconnection for locally isolated points.
- Normalization of authoritative edge lists, including explicit empty lists.
- Deterministically ordered adjacency maps and a segment-intersection helper.
- Runtime input validation and TypeScript declarations for the public API.
- Tests and coverage thresholds for graph invariants and validation behavior.
- A fixed-seed benchmark for uniform, clustered, and grid point sets.

[Unreleased]: https://github.com/seoulpro/sparse-proximity-graph/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/seoulpro/sparse-proximity-graph/releases/tag/v0.1.0
