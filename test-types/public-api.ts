import {
  buildAdjacency,
  buildSparsePlanarGraph,
  resolveGraphEdges,
  segmentsIntersect,
  type GraphEdge,
  type GraphPoint,
  type SparseGraphOptions,
} from "sparse-proximity-graph";

const points = [
  { id: "a", x: 0, y: 0, label: "Start" },
  { id: "b", x: 3, y: 4, label: "Finish" },
] as const satisfies readonly GraphPoint<string>[];

const options: SparseGraphOptions = {
  maxDistance: 10,
  maxDegreePerPoint: 2,
  preventCrossings: true,
};

const computed: GraphEdge<"a" | "b">[] = buildSparsePlanarGraph(
  points,
  options,
);
const supplied = resolveGraphEdges(points, [
  { a: "a", b: "b" },
]);
const adjacency = buildAdjacency(supplied);

adjacency.get("a")?.[0]?.distance.toFixed(2);
segmentsIntersect(points[0], points[1], points[1], points[0]);

// @ts-expect-error Point identifiers must be strings or numbers.
buildSparsePlanarGraph([{ id: false, x: 0, y: 0 }]);

// @ts-expect-error Option values are not coerced from strings.
buildSparsePlanarGraph(points, { maxDistance: "10" });

// @ts-expect-error Edge distances must be numbers.
buildAdjacency([{ a: "a", b: "b", distance: "5" }]);

void computed;
