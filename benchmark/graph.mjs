import { performance } from "node:perf_hooks";

import { buildSparsePlanarGraph } from "../src/index.js";

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

const createRandomPoints = (count, spread, seed) => {
  const random = createRandom(seed);
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    x: random() * spread,
    y: random() * spread,
  }));
};

const createGridPoints = (side, spacing) => Array.from(
  { length: side * side },
  (_, index) => ({
    id: index,
    x: index % side * spacing,
    y: Math.floor(index / side) * spacing,
  }),
);

const cases = [
  {
    name: "uniform",
    points: createRandomPoints(1_000, 2_000, 0x1a2b3c4d),
    maxDistance: 120,
  },
  {
    name: "clustered",
    points: createRandomPoints(1_000, 300, 0x5e6f7788),
    maxDistance: 50,
  },
  {
    name: "grid",
    points: createGridPoints(32, 20),
    maxDistance: 30,
  },
];

const median = (values) => {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const run = ({ name, points, maxDistance }) => {
  const options = {
    maxDistance,
    maxCandidatesPerPoint: 12,
    maxDegreePerPoint: 4,
    sectorCount: 8,
  };
  buildSparsePlanarGraph(points, options);

  const timings = [];
  let edgeCount = 0;
  for (let iteration = 0; iteration < 5; iteration += 1) {
    const startedAt = performance.now();
    edgeCount = buildSparsePlanarGraph(points, options).length;
    timings.push(performance.now() - startedAt);
  }

  return {
    case: name,
    points: points.length,
    edges: edgeCount,
    "median ms": median(timings).toFixed(2),
  };
};

console.log(`sparse-proximity-graph benchmark (${process.version})`);
console.table(cases.map(run));
