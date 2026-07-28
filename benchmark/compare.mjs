import { readFileSync } from "node:fs";
import { basename } from "node:path";

const readReport = (path) => {
  const report = JSON.parse(readFileSync(path, "utf8"));
  if (
    report.schemaVersion !== 1
    || typeof report.suite !== "string"
    || !Array.isArray(report.results)
  ) {
    throw new TypeError(`${path} is not a supported benchmark report`);
  }
  return report;
};

const resultKey = (result) => `${result.case}:${result.points}`;

const environmentDifferences = (baseline, candidate) => {
  const fields = [
    "node",
    "v8",
    "platform",
    "architecture",
    "cpu",
    "logicalCpuCount",
  ];
  return fields.filter(
    (field) => baseline.environment[field] !== candidate.environment[field],
  );
};

const configurationDifferences = (baseline, candidate) => {
  const fields = ["runs", "warmup", "targetSampleDurationMs"];
  return fields.filter(
    (field) => baseline.configuration[field] !== candidate.configuration[field],
  );
};

const formatChange = (baseline, candidate) => {
  const percent = (candidate / baseline - 1) * 100;
  if (Math.abs(percent) < 0.005) return "0.00%";
  return `${percent > 0 ? "+" : ""}${percent.toFixed(2)}%`;
};

const compare = (baselinePath, candidatePath) => {
  const baseline = readReport(baselinePath);
  const candidate = readReport(candidatePath);
  if (baseline.suite !== candidate.suite) {
    throw new TypeError("benchmark reports are for different suites");
  }

  const differences = environmentDifferences(baseline, candidate);
  if (differences.length > 0) {
    console.warn(
      `Warning: environment differs in ${differences.join(", ")};`
      + " performance deltas may not be comparable.",
    );
  }
  const changedConfiguration = configurationDifferences(baseline, candidate);
  if (changedConfiguration.length > 0) {
    console.warn(
      `Warning: configuration differs in ${changedConfiguration.join(", ")};`
      + " sample quality may not be comparable.",
    );
  }

  const candidateByKey = new Map(
    candidate.results.map((result) => [resultKey(result), result]),
  );
  const rows = baseline.results.map((before) => {
    const key = resultKey(before);
    const after = candidateByKey.get(key);
    if (!after) throw new TypeError(`candidate report is missing ${key}`);
    if (JSON.stringify(before.options) !== JSON.stringify(after.options)) {
      throw new TypeError(`benchmark options differ for ${key}`);
    }
    candidateByKey.delete(key);
    return {
      case: before.case,
      points: before.points,
      "before ms": before.statistics.medianMs.toFixed(2),
      "after ms": after.statistics.medianMs.toFixed(2),
      change: formatChange(
        before.statistics.medianMs,
        after.statistics.medianMs,
      ),
      "before CV %":
        before.statistics.coefficientOfVariationPercent.toFixed(2),
      "after CV %":
        after.statistics.coefficientOfVariationPercent.toFixed(2),
      output: before.checksum === after.checksum ? "same" : "changed",
    };
  });
  if (candidateByKey.size > 0) {
    throw new TypeError(
      `candidate report has extra results: ${[...candidateByKey.keys()].join(", ")}`,
    );
  }

  console.log(
    `${baseline.suite}: ${basename(baselinePath)}`
    + ` (${baseline.source?.revision?.slice(0, 12) ?? "unknown"})`
    + ` -> ${basename(candidatePath)}`
    + ` (${candidate.source?.revision?.slice(0, 12) ?? "unknown"})`,
  );
  console.table(rows);
  console.log(
    "Positive change is slower. Deltas are descriptive; inspect sample counts"
    + " and CV before drawing conclusions.",
  );
};

const paths = process.argv.slice(2);
if (paths.length !== 2 || paths.includes("--help") || paths.includes("-h")) {
  console.error(
    "Usage: node benchmark/compare.mjs <baseline.json> <candidate.json>",
  );
  process.exitCode = paths.includes("--help") || paths.includes("-h") ? 0 : 1;
} else {
  compare(paths[0], paths[1]);
}
