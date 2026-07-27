import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { arch, cpus, platform } from "node:os";
import { hrtime } from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { buildSparsePlanarGraph } from "../src/index.js";

const packageMetadata = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const benchmarkPath = fileURLToPath(import.meta.url);
const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const referencePointCount = 1_000;
const defaultOptions = Object.freeze({
  maxCandidatesPerPoint: 12,
  maxDegreePerPoint: 4,
  sectorCount: 8,
});

const profiles = Object.freeze({
  quick: {
    cases: {
      uniform: [1_000],
      clustered: [1_000],
      grid: [1_024],
    },
    runs: 10,
    warmup: 3,
    targetSampleDurationMs: 500,
  },
  scaling: {
    cases: {
      uniform: [250, 1_000, 4_000],
      clustered: [250, 1_000, 4_000],
      grid: [256, 1_024, 4_096],
    },
    runs: 5,
    warmup: 2,
    targetSampleDurationMs: 500,
  },
  stress: {
    cases: {
      dense: [250, 500, 1_000],
      coincident: [250, 500, 1_000],
    },
    runs: 5,
    warmup: 2,
    targetSampleDurationMs: 500,
  },
});

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

const createGridPoints = (count, spacing) => {
  const side = Math.ceil(Math.sqrt(count));
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    x: index % side * spacing,
    y: Math.floor(index / side) * spacing,
  }));
};

const createCoincidentPoints = (count) => Array.from(
  { length: count },
  (_, index) => ({ id: index, x: 0, y: 0 }),
);

const scaleSpread = (spread, count) => (
  spread * Math.sqrt(count / referencePointCount)
);

const cases = Object.freeze({
  uniform: {
    description: "Uniform points with approximately constant spatial density.",
    create(count) {
      return {
        points: createRandomPoints(
          count,
          scaleSpread(2_000, count),
          0x1a2b3c4d,
        ),
        options: { ...defaultOptions, maxDistance: 120 },
      };
    },
  },
  clustered: {
    description: "Tighter uniform clusters with constant density across sizes.",
    create(count) {
      return {
        points: createRandomPoints(
          count,
          scaleSpread(300, count),
          0x5e6f7788,
        ),
        options: { ...defaultOptions, maxDistance: 50 },
      };
    },
  },
  grid: {
    description: "Regular grids with fixed spacing and local neighborhood size.",
    create(count) {
      return {
        points: createGridPoints(count, 20),
        options: { ...defaultOptions, maxDistance: 30 },
      };
    },
  },
  dense: {
    description: "Increasing density in a fixed area.",
    create(count) {
      return {
        points: createRandomPoints(count, 300, 0x5e6f7788),
        options: { ...defaultOptions, maxDistance: 50 },
      };
    },
  },
  coincident: {
    description: "All points share one cell and one coordinate.",
    create(count) {
      return {
        points: createCoincidentPoints(count),
        options: { ...defaultOptions, maxDistance: 1 },
      };
    },
  },
});

const round = (value, digits = 4) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const calculateStatistics = (samples) => {
  const sorted = samples.slice().sort((left, right) => left - right);
  const mean = samples.reduce((total, value) => total + value, 0) / samples.length;
  const variance = samples.length === 1
    ? 0
    : samples.reduce((total, value) => total + (value - mean) ** 2, 0)
      / (samples.length - 1);
  const percentile = (ratio) => {
    const position = (sorted.length - 1) * ratio;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  };
  const medianMs = percentile(0.5);
  const standardDeviation = Math.sqrt(variance);

  return {
    minMs: round(sorted[0]),
    medianMs: round(medianMs),
    p95Ms: round(percentile(0.95)),
    maxMs: round(sorted.at(-1)),
    meanMs: round(mean),
    standardDeviationMs: round(standardDeviation),
    coefficientOfVariationPercent: round(
      mean === 0 ? 0 : standardDeviation / mean * 100,
      2,
    ),
    operationsPerSecond: round(1_000 / medianMs, 2),
  };
};

const summarizeGraph = (points, edges) => {
  const degree = new Map();
  for (const edge of edges) {
    degree.set(edge.a, (degree.get(edge.a) ?? 0) + 1);
    degree.set(edge.b, (degree.get(edge.b) ?? 0) + 1);
  }
  let maximumDegree = 0;
  for (const value of degree.values()) {
    maximumDegree = Math.max(maximumDegree, value);
  }
  return {
    edges: edges.length,
    isolatedPoints: points.length - degree.size,
    maximumDegree,
    checksum: createHash("sha256")
      .update(JSON.stringify(edges))
      .digest("hex")
      .slice(0, 16),
  };
};

const assertStableGraph = (expected, actual, caseName, pointCount) => {
  if (
    expected.edges !== actual.edges
    || expected.isolatedPoints !== actual.isolatedPoints
    || expected.maximumDegree !== actual.maximumDegree
    || expected.checksum !== actual.checksum
  ) {
    throw new Error(
      `${caseName}:${pointCount} produced non-deterministic graph output`,
    );
  }
};

const runWorker = ({
  caseName,
  pointCount,
  runs,
  warmup,
  targetSampleDurationMs,
}) => {
  const scenario = cases[caseName];
  if (!scenario) throw new Error(`unknown benchmark case: ${caseName}`);
  const { points, options } = scenario.create(pointCount);
  let graphSummary;
  const warmupSamplesMs = [];

  for (let iteration = 0; iteration < warmup; iteration += 1) {
    const startedAt = hrtime.bigint();
    const edges = buildSparsePlanarGraph(points, options);
    warmupSamplesMs.push(
      Number(hrtime.bigint() - startedAt) / 1_000_000,
    );
    const summary = summarizeGraph(points, edges);
    if (graphSummary) {
      assertStableGraph(graphSummary, summary, caseName, pointCount);
    } else {
      graphSummary = summary;
    }
  }

  if (warmupSamplesMs.length === 0) {
    const startedAt = hrtime.bigint();
    const edges = buildSparsePlanarGraph(points, options);
    warmupSamplesMs.push(
      Number(hrtime.bigint() - startedAt) / 1_000_000,
    );
    graphSummary = summarizeGraph(points, edges);
  }
  const calibrationMs = calculateStatistics(warmupSamplesMs).medianMs;
  const operationsPerSample = Math.max(
    1,
    Math.min(1_000, Math.ceil(targetSampleDurationMs / calibrationMs)),
  );

  const samplesMs = [];
  for (let iteration = 0; iteration < runs; iteration += 1) {
    const startedAt = hrtime.bigint();
    let edges;
    for (let operation = 0; operation < operationsPerSample; operation += 1) {
      edges = buildSparsePlanarGraph(points, options);
    }
    const elapsedMs = Number(hrtime.bigint() - startedAt)
      / 1_000_000
      / operationsPerSample;
    const summary = summarizeGraph(points, edges);
    if (graphSummary) {
      assertStableGraph(graphSummary, summary, caseName, pointCount);
    } else {
      graphSummary = summary;
    }
    samplesMs.push(elapsedMs);
  }

  return {
    case: caseName,
    description: scenario.description,
    points: pointCount,
    options,
    ...graphSummary,
    operationsPerSample,
    targetSampleDurationMs,
    samplesMs: samplesMs.map((value) => round(value, 6)),
    statistics: calculateStatistics(samplesMs),
  };
};

const parsePositiveInteger = (value, name, { allowZero = false } = {}) => {
  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed)
    || (allowZero ? parsed < 0 : parsed <= 0)
  ) {
    throw new TypeError(
      `${name} must be ${allowZero ? "a non-negative" : "a positive"} integer`,
    );
  }
  return parsed;
};

const parseList = (value) => value
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const parseArguments = (argumentsList) => {
  const { values } = parseArgs({
    args: argumentsList,
    options: {
      profile: { type: "string", default: "quick" },
      case: { type: "string" },
      size: { type: "string" },
      sizes: { type: "string" },
      runs: { type: "string" },
      warmup: { type: "string" },
      "sample-time": { type: "string" },
      json: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
  });
  if (values.size !== undefined && values.sizes !== undefined) {
    throw new TypeError("--size and --sizes cannot be used together");
  }

  return {
    profile: values.profile,
    selectedCases: values.case === undefined
      ? undefined
      : parseList(values.case),
    sizes: values.size !== undefined
      ? [parsePositiveInteger(values.size, "--size")]
      : values.sizes === undefined
        ? undefined
        : parseList(values.sizes).map((value) => (
          parsePositiveInteger(value, "--sizes")
        )),
    runs: values.runs === undefined
      ? undefined
      : parsePositiveInteger(values.runs, "--runs"),
    warmup: values.warmup === undefined
      ? undefined
      : parsePositiveInteger(
        values.warmup,
        "--warmup",
        { allowZero: true },
      ),
    targetSampleDurationMs: values["sample-time"] === undefined
      ? undefined
      : parsePositiveInteger(values["sample-time"], "--sample-time"),
    json: values.json,
    help: values.help,
  };
};

const resolveMatrix = ({ profile, selectedCases, sizes }) => {
  const profileConfiguration = profiles[profile];
  if (!profileConfiguration) {
    throw new TypeError(
      `--profile must be one of: ${Object.keys(profiles).join(", ")}`,
    );
  }
  const caseNames = selectedCases ?? Object.keys(profileConfiguration.cases);
  const matrix = [];
  for (const caseName of caseNames) {
    if (!cases[caseName]) {
      throw new TypeError(
        `--case must contain only: ${Object.keys(cases).join(", ")}`,
      );
    }
    const pointCounts = sizes ?? profileConfiguration.cases[caseName];
    if (!pointCounts) {
      throw new TypeError(
        `${caseName} is not in the ${profile} profile; provide --sizes`,
      );
    }
    for (const pointCount of pointCounts) {
      matrix.push({ caseName, pointCount });
    }
  }
  return matrix;
};

const runInChildProcess = (configuration) => {
  const child = spawnSync(
    process.execPath,
    [benchmarkPath, "--worker", JSON.stringify(configuration)],
    {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (child.status !== 0) {
    throw new Error(
      `benchmark worker failed for ${configuration.caseName}:`
      + `${configuration.pointCount}\n${child.stderr.trim()}`,
    );
  }
  return JSON.parse(child.stdout);
};

const environment = () => ({
  node: process.version,
  v8: process.versions.v8,
  platform: platform(),
  architecture: arch(),
  cpu: cpus()[0]?.model ?? "unknown",
  logicalCpuCount: cpus().length,
});

const sourceRevision = () => {
  const revision = spawnSync("git", ["rev-parse", "--verify", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const status = spawnSync("git", ["status", "--porcelain"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return {
    revision: revision.status === 0 ? revision.stdout.trim() : null,
    dirty: status.status === 0 ? status.stdout.trim().length > 0 : null,
  };
};

const printHumanReadable = (report) => {
  const runtime = report.environment;
  const revision = report.source.revision?.slice(0, 12) ?? "unavailable";
  console.log(
    `${report.suite} ${report.packageVersion} benchmark (${report.profile})`
    + ` at ${revision}${report.source.dirty ? " (dirty)" : ""}`,
  );
  console.log(
    `${runtime.node} / V8 ${runtime.v8} / ${runtime.platform}`
    + ` ${runtime.architecture} / ${runtime.cpu}`,
  );
  console.table(report.results.map((result) => ({
    case: result.case,
    points: result.points,
    edges: result.edges,
    isolated: result.isolatedPoints,
    "max degree": result.maximumDegree,
    batch: result.operationsPerSample,
    "median ms": result.statistics.medianMs.toFixed(2),
    "p95 ms": result.statistics.p95Ms.toFixed(2),
    "CV %": result.statistics.coefficientOfVariationPercent.toFixed(2),
    "ops/s": result.statistics.operationsPerSecond.toFixed(2),
    checksum: result.checksum,
  })));

  const unstable = report.results.filter(
    (result) => result.statistics.coefficientOfVariationPercent > 10,
  );
  if (unstable.length > 0) {
    console.warn(
      "Warning: CV exceeds 10% for "
      + unstable.map((result) => `${result.case}:${result.points}`).join(", ")
      + "; repeat on an idle machine before drawing conclusions.",
    );
  }
};

const printHelp = () => {
  console.log(`Usage: node benchmark/graph.mjs [options]

Options:
  --profile <quick|scaling|stress>  Select a predefined benchmark matrix.
  --case <name[,name]>              Filter cases or select custom cases.
  --size <count>                    Run one point count for every selected case.
  --sizes <count[,count]>           Run point counts for every selected case.
  --runs <count>                    Override measured samples per combination.
  --warmup <count>                  Override warmup runs per combination.
  --sample-time <milliseconds>      Target duration used to batch each sample.
  --json                            Emit machine-readable JSON only.
  --help                            Show this help.

Cases: ${Object.keys(cases).join(", ")}`);
};

const runController = (argumentsList) => {
  const options = parseArguments(argumentsList);
  if (options.help) {
    printHelp();
    return;
  }
  const profileConfiguration = profiles[options.profile];
  const matrix = resolveMatrix(options);
  const runs = options.runs ?? profileConfiguration.runs;
  const warmup = options.warmup ?? profileConfiguration.warmup;
  const targetSampleDurationMs = options.targetSampleDurationMs
    ?? profileConfiguration.targetSampleDurationMs;
  const results = matrix.map(({ caseName, pointCount }) => runInChildProcess({
    caseName,
    pointCount,
    runs,
    warmup,
    targetSampleDurationMs,
  }));
  const report = {
    schemaVersion: 1,
    suite: packageMetadata.name,
    packageVersion: packageMetadata.version,
    generatedAt: new Date().toISOString(),
    profile: options.profile,
    source: sourceRevision(),
    configuration: {
      runs,
      warmup,
      targetSampleDurationMs,
      matrix,
    },
    environment: environment(),
    results,
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    printHumanReadable(report);
  }
};

const workerIndex = process.argv.indexOf("--worker");
if (workerIndex >= 0) {
  const configuration = JSON.parse(process.argv[workerIndex + 1]);
  process.stdout.write(`${JSON.stringify(runWorker(configuration))}\n`);
} else {
  runController(process.argv.slice(2));
}
