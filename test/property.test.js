import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSparsePlanarGraph,
  segmentsIntersect,
} from "../src/index.js";

const createRandom = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
};

const createPoints = (seed, count) => {
  const random = createRandom(seed);
  return Array.from({ length: count }, (_, id) => ({
    id,
    x: random() * 200,
    y: random() * 200,
  }));
};

const shuffled = (values, seed) => {
  const random = createRandom(seed);
  const result = values.slice();
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
};

const edgeKey = (edge) => JSON.stringify([
  `${typeof edge.a}:${String(edge.a)}`,
  `${typeof edge.b}:${String(edge.b)}`,
].sort());

const assertGraphInvariants = (points, edges, maximumDegree) => {
  const pointById = new Map(points.map((point) => [point.id, point]));
  const seen = new Set();
  const degree = new Map();

  for (const edge of edges) {
    assert.equal(pointById.has(edge.a), true);
    assert.equal(pointById.has(edge.b), true);
    assert.notEqual(edge.a, edge.b);
    assert.equal(Number.isFinite(edge.distance), true);
    assert.equal(edge.distance >= 0, true);
    assert.equal(
      edge.distance,
      Math.hypot(
        pointById.get(edge.b).x - pointById.get(edge.a).x,
        pointById.get(edge.b).y - pointById.get(edge.a).y,
      ),
    );
    const key = edgeKey(edge);
    assert.equal(seen.has(key), false);
    seen.add(key);
    degree.set(edge.a, (degree.get(edge.a) ?? 0) + 1);
    degree.set(edge.b, (degree.get(edge.b) ?? 0) + 1);
  }

  for (const value of degree.values()) {
    assert.equal(value <= maximumDegree + 1, true);
  }

  for (let first = 0; first < edges.length; first += 1) {
    for (let second = first + 1; second < edges.length; second += 1) {
      const a = edges[first];
      const b = edges[second];
      assert.equal(
        segmentsIntersect(
          pointById.get(a.a),
          pointById.get(a.b),
          pointById.get(b.a),
          pointById.get(b.b),
        ),
        false,
      );
    }
  }
};

test("preserves graph invariants and ordering across seeded inputs", () => {
  const options = {
    maxDistance: 55,
    maxCandidatesPerPoint: 10,
    maxDegreePerPoint: 4,
    sectorCount: 8,
  };

  for (let seed = 1; seed <= 16; seed += 1) {
    const points = createPoints(seed, 60);
    const expected = buildSparsePlanarGraph(points, options);
    assert.deepEqual(
      buildSparsePlanarGraph(points.toReversed(), options),
      expected,
    );
    assert.deepEqual(
      buildSparsePlanarGraph(shuffled(points, seed ^ 0x9e3779b9), options),
      expected,
    );
    assertGraphInvariants(points, expected, options.maxDegreePerPoint);
  }
});

test("keeps degenerate and unsafe-cell coordinates deterministic", () => {
  const fixtures = [
    Array.from({ length: 24 }, (_, id) => ({ id, x: id * 2, y: 0 })),
    Array.from({ length: 24 }, (_, id) => ({ id, x: 10, y: 10 })),
    Array.from(
      { length: 24 },
      (_, id) => ({ id, x: 1e20, y: 1e20 }),
    ),
  ];

  for (const points of fixtures) {
    const options = {
      maxDistance: 50,
      maxCandidatesPerPoint: 8,
      maxDegreePerPoint: 3,
      sectorCount: 6,
    };
    const expected = buildSparsePlanarGraph(points, options);
    assert.deepEqual(
      buildSparsePlanarGraph(points.toReversed(), options),
      expected,
    );
    assertGraphInvariants(points, expected, options.maxDegreePerPoint);
  }
});
