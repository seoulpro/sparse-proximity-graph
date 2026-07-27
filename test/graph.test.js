import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdjacency,
  buildSparsePlanarGraph,
  resolveGraphEdges,
  segmentsIntersect,
} from "../src/index.js";

test("builds deterministic edges for string identifiers", () => {
  const points = [
    { id: "north-west", x: 0, y: 10 },
    { id: "south-east", x: 10, y: 0 },
    { id: "south-west", x: 0, y: 0 },
    { id: "north-east", x: 10, y: 10 },
  ];
  const first = buildSparsePlanarGraph(points, { maxDistance: 20 });
  const second = buildSparsePlanarGraph(points.slice().reverse(), { maxDistance: 20 });
  assert.deepEqual(first, second);
});

test("uses locale-independent identifier ordering", () => {
  const points = [
    { id: "a", x: 0, y: 0 },
    { id: "z", x: 1, y: 0 },
    { id: "ä", x: -1, y: 0 },
  ];
  assert.deepEqual(
    resolveGraphEdges(points, [
      { a: "a", b: "ä", distance: 1 },
      { a: "a", b: "z", distance: 1 },
    ]),
    [
      { a: "a", b: "z", distance: 1 },
      { a: "a", b: "ä", distance: 1 },
    ],
  );
});

test("removes crossing diagonals when shorter planar alternatives exist", () => {
  const points = [
    { id: 1, x: 0, y: 0 },
    { id: 2, x: 10, y: 0 },
    { id: 3, x: 10, y: 10 },
    { id: 4, x: 0, y: 10 },
  ];
  const options = {
    maxDistance: 20,
    relativeNeighborhood: false,
    maxDegreePerPoint: 6,
    sectorCount: 16,
    reconnectIsolated: false,
  };
  const crossingEdges = buildSparsePlanarGraph(points, {
    ...options,
    preventCrossings: false,
  });
  assert.deepEqual(
    crossingEdges
      .filter((edge) => edge.distance > 10)
      .map((edge) => `${edge.a}-${edge.b}`),
    ["1-3", "2-4"],
  );

  const edges = buildSparsePlanarGraph(points, options);
  assert.deepEqual(
    edges
      .filter((edge) => edge.distance > 10)
      .map((edge) => `${edge.a}-${edge.b}`),
    ["1-3"],
  );
  const pointById = new Map(points.map((point) => [point.id, point]));
  for (let index = 0; index < edges.length; index += 1) {
    for (let other = index + 1; other < edges.length; other += 1) {
      assert.equal(
        segmentsIntersect(
          pointById.get(edges[index].a),
          pointById.get(edges[index].b),
          pointById.get(edges[other].a),
          pointById.get(edges[other].b),
        ),
        false,
      );
    }
  }
});

test("classifies segment intersections and validates public inputs", () => {
  const a = { id: "a", x: 0, y: 0 };
  const b = { id: "b", x: 10, y: 10 };
  const c = { id: "c", x: 0, y: 10 };
  const d = { id: "d", x: 10, y: 0 };
  assert.equal(segmentsIntersect(a, b, c, d), true);
  assert.equal(
    segmentsIntersect(a, b, { ...b }, { id: "e", x: 20, y: 0 }),
    false,
  );
  assert.equal(
    segmentsIntersect(
      { id: "f", x: 0, y: 0 },
      { id: "g", x: 10, y: 0 },
      { id: "h", x: 5, y: 0 },
      { id: "i", x: 15, y: 0 },
    ),
    true,
  );
  assert.equal(
    segmentsIntersect(
      { id: "j", x: 0, y: 0 },
      { id: "k", x: 1e-6, y: 0 },
      { id: "l", x: 5e-7, y: 5e-10 },
      { id: "m", x: 5e-7, y: 1e-6 },
    ),
    false,
  );
  assert.equal(
    segmentsIntersect(
      { id: "n", x: -1e308, y: -1e308 },
      { id: "o", x: 1e308, y: 1e308 },
      { id: "p", x: -1e308, y: 1e308 },
      { id: "q", x: 1e308, y: -1e308 },
    ),
    true,
  );
  assert.throws(
    () => segmentsIntersect(
      { x: 0, y: 0 },
      b,
      c,
      d,
    ),
    /a must have own id, x, and y properties/,
  );
  assert.throws(
    () => segmentsIntersect(null, b, c, d),
    /a must be a point object/,
  );
  assert.throws(
    () => segmentsIntersect({ id: Infinity, x: 0, y: 0 }, b, c, d),
    /a\.id must be a string or finite number/,
  );
  assert.throws(
    () => segmentsIntersect({ id: "a", x: Infinity, y: 0 }, b, c, d),
    /a must have finite coordinates/,
  );
});

test("keeps node degree bounded in a dense cluster", () => {
  const points = [
    { id: "center", x: 0, y: 0 },
    ...Array.from({ length: 16 }, (_, index) => {
      const angle = index / 16 * Math.PI * 2;
      return {
        id: `p-${index}`,
        x: Math.cos(angle) * 10,
        y: Math.sin(angle) * 10,
      };
    }),
  ];
  const edges = buildSparsePlanarGraph(points, {
    maxDistance: 15,
    maxDegreePerPoint: 3,
    reconnectIsolated: false,
  });
  const adjacency = buildAdjacency(edges);
  assert.ok(
    [...adjacency.values()].every((neighbors) => neighbors.length <= 3),
  );
});

test("reconnects a locally isolated point when a non-crossing neighbor exists", () => {
  const points = [
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 10, y: 0 },
    { id: "c", x: 20, y: 0 },
  ];
  const edges = buildSparsePlanarGraph(points, {
    maxDistance: 11,
    maxDegreePerPoint: 1,
  });
  const adjacency = buildAdjacency(edges);
  assert.equal(adjacency.has("a"), true);
  assert.equal(adjacency.has("c"), true);
});

test("rejects crossing candidates while reconnecting isolated points", () => {
  const points = [
    { id: "a", x: 2, y: 13 },
    { id: "b", x: 6, y: 17 },
    { id: "c", x: 9, y: 11 },
    { id: "d", x: 7, y: 15 },
    { id: "e", x: 13, y: 5 },
  ];
  const options = {
    maxDistance: 30,
    maxCandidatesPerPoint: 4,
    maxDegreePerPoint: 1,
    sectorCount: 8,
    relativeNeighborhood: false,
    reconnectIsolated: true,
  };
  const crossingAllowed = buildSparsePlanarGraph(points, {
    ...options,
    preventCrossings: false,
  });
  const crossingPrevented = buildSparsePlanarGraph(points, options);
  const hasEdge = (edges, a, b) => edges.some(
    (edge) => edge.a === a && edge.b === b,
  );

  assert.equal(hasEdge(crossingAllowed, "b", "c"), true);
  assert.equal(hasEdge(crossingPrevented, "b", "c"), false);
  assert.equal(segmentsIntersect(points[1], points[2], points[0], points[3]), true);
  assert.deepEqual(
    [...buildAdjacency(crossingPrevented).keys()].sort(),
    ["a", "b", "c", "d", "e"],
  );
});

test("treats explicitly supplied edges as authoritative", () => {
  const points = [
    { id: 1, x: 0, y: 0 },
    { id: 2, x: 10, y: 0 },
    { id: 3, x: 20, y: 0 },
  ];
  const edges = resolveGraphEdges(points, [{ a: 1, b: 2 }]);
  assert.deepEqual(edges, [{ a: 1, b: 2, distance: 10 }]);
  assert.deepEqual(resolveGraphEdges(points, []), []);
});

test("does not mutate caller-owned points, edges, or arrays", () => {
  const points = Object.freeze([
    Object.freeze({ id: "a", x: 0, y: 0, label: "start" }),
    Object.freeze({ id: "b", x: 3, y: 4, label: "finish" }),
  ]);
  const supplied = Object.freeze([
    Object.freeze({ a: "a", b: "b" }),
  ]);
  const normalized = resolveGraphEdges(points, supplied);
  assert.deepEqual(normalized, [{ a: "a", b: "b", distance: 5 }]);
  assert.doesNotThrow(() => buildSparsePlanarGraph(points));
  assert.doesNotThrow(() => buildAdjacency(normalized));
  assert.deepEqual(points[0], { id: "a", x: 0, y: 0, label: "start" });
  assert.deepEqual(supplied[0], { a: "a", b: "b" });
});

test("drops malformed and duplicate supplied edges", () => {
  const points = [
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 3, y: 4 },
  ];
  const edges = resolveGraphEdges(points, [
    null,
    [],
    "invalid",
    { a: "b", b: "a", distance: 9 },
    { a: "a", b: "b", distance: 5 },
    { a: "a", b: "missing" },
    { a: "a", b: "a" },
  ]);
  assert.deepEqual(edges, [{ a: "a", b: "b", distance: 5 }]);
});

test("rejects identifiers outside the documented string and number contract", () => {
  assert.throws(
    () => buildSparsePlanarGraph([
      { id: { nested: true }, x: 0, y: 0 },
      { id: "valid", x: 1, y: 0 },
    ]),
    /strings or finite numbers/,
  );
});

test("rejects malformed points, options, and edge collections", () => {
  assert.throws(
    () => buildSparsePlanarGraph(null),
    /points must be an array/,
  );
  assert.throws(
    () => buildSparsePlanarGraph([null]),
    /every point must be an object/,
  );
  assert.throws(
    () => buildSparsePlanarGraph([{ id: null, x: 0, y: 0 }]),
    /every point needs an id/,
  );
  assert.throws(
    () => buildSparsePlanarGraph([
      { id: "same", x: 0, y: 0 },
      { id: "same", x: 1, y: 1 },
    ]),
    /duplicate point id/,
  );
  const sparsePoints = new Array(2);
  sparsePoints[1] = { id: "b", x: 1, y: 0 };
  assert.throws(
    () => buildSparsePlanarGraph(sparsePoints),
    /every point must be an object/,
  );
  assert.throws(
    () => buildSparsePlanarGraph([
      Object.create({ id: "a", x: 0, y: 0 }),
      { id: "b", x: 1, y: 0 },
    ]),
    /own id, x, and y properties/,
  );
  assert.throws(
    () => buildSparsePlanarGraph([
      { id: "a", x: "0", y: 0 },
      { id: "b", x: 1, y: 0 },
    ]),
    /invalid coordinates/,
  );
  assert.throws(
    () => buildSparsePlanarGraph([], { maxDegrePerPoint: 2 }),
    /unknown graph option/,
  );
  assert.throws(
    () => buildSparsePlanarGraph([], null),
    /options must be an object/,
  );
  assert.throws(
    () => buildSparsePlanarGraph([], { maxDistance: -1 }),
    /finite non-negative number/,
  );
  assert.throws(
    () => buildSparsePlanarGraph([], { sectorCount: 1.5 }),
    /positive safe integer/,
  );
  assert.throws(
    () => buildSparsePlanarGraph([], {
      maxCandidatesPerPoint: Number.MAX_SAFE_INTEGER + 1,
    }),
    /positive safe integer/,
  );
  assert.throws(
    () => buildSparsePlanarGraph([], { preventCrossings: "yes" }),
    /must be a boolean/,
  );
  assert.deepEqual(
    buildSparsePlanarGraph([
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 1, y: 0 },
    ], { maxDistance: 0 }),
    [],
  );
  assert.throws(
    () => resolveGraphEdges([], null),
    /suppliedEdges must be an array/,
  );
  assert.throws(
    () => buildAdjacency([{ a: "a", b: "b", distance: Infinity }]),
    /finite non-negative distance/,
  );
  assert.throws(
    () => buildAdjacency(null),
    /edges must be an array/,
  );
  assert.throws(
    () => buildAdjacency([{ a: "a", b: "a", distance: 0 }]),
    /self edges/,
  );
  assert.throws(
    () => buildAdjacency([
      { a: "a", b: "b", distance: 1 },
      { a: "b", b: "a", distance: 1 },
    ]),
    /duplicate undirected edges/,
  );
});

test("preserves graph invariants for a seeded point set", () => {
  let state = 0x6d2b79f5;
  const random = () => {
    state = Math.imul(state ^ state >>> 15, state | 1);
    state ^= state + Math.imul(state ^ state >>> 7, state | 61);
    return ((state ^ state >>> 14) >>> 0) / 4294967296;
  };
  const points = Array.from({ length: 60 }, (_, index) => ({
    id: `point-${index}`,
    x: random() * 100,
    y: random() * 100,
  }));
  const shuffled = points.slice();
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  const options = {
    maxDistance: 30,
    maxCandidatesPerPoint: 10,
    maxDegreePerPoint: 4,
  };
  const first = buildSparsePlanarGraph(points, options);
  const second = buildSparsePlanarGraph(shuffled, options);
  assert.deepEqual(first, second);

  const pointById = new Map(points.map((point) => [point.id, point]));
  const edgeKeys = new Set();
  const degree = new Map();
  for (const edge of first) {
    const key = [edge.a, edge.b].sort().join("\0");
    assert.equal(edgeKeys.has(key), false);
    edgeKeys.add(key);
    assert.ok(Number.isFinite(edge.distance));
    assert.ok(edge.distance <= options.maxDistance);
    degree.set(edge.a, (degree.get(edge.a) ?? 0) + 1);
    degree.set(edge.b, (degree.get(edge.b) ?? 0) + 1);
  }
  assert.ok(
    [...degree.values()].every(
      (value) => value <= options.maxDegreePerPoint + 1,
    ),
  );
  for (let index = 0; index < first.length; index += 1) {
    for (let other = index + 1; other < first.length; other += 1) {
      assert.equal(
        segmentsIntersect(
          pointById.get(first[index].a),
          pointById.get(first[index].b),
          pointById.get(first[other].a),
          pointById.get(first[other].b),
        ),
        false,
      );
    }
  }
});
