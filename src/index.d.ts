export type PointId = string | number;

export interface GraphPoint<Id extends PointId = PointId> {
  readonly id: Id;
  readonly x: number;
  readonly y: number;
  readonly [key: string]: unknown;
}

export interface GraphEdge<Id extends PointId = PointId> {
  a: Id;
  b: Id;
  distance: number;
}

export interface GraphEdgeInput<Id extends PointId = PointId> {
  a: Id;
  b: Id;
  distance?: number;
}

export interface GraphNeighbor<Id extends PointId = PointId> {
  id: Id;
  distance: number;
}

export interface SparseGraphOptions {
  maxDistance?: number;
  maxCandidatesPerPoint?: number;
  maxDegreePerPoint?: number;
  sectorCount?: number;
  relativeNeighborhood?: boolean;
  preventCrossings?: boolean;
  reconnectIsolated?: boolean;
}

export function segmentsIntersect<Id extends PointId>(
  a: GraphPoint<Id>,
  b: GraphPoint<Id>,
  c: GraphPoint<Id>,
  d: GraphPoint<Id>,
): boolean;

export function buildSparsePlanarGraph<Id extends PointId>(
  points: readonly GraphPoint<Id>[],
  options?: SparseGraphOptions,
): GraphEdge<Id>[];

export function resolveGraphEdges<Id extends PointId>(
  points: readonly GraphPoint<Id>[],
  suppliedEdges: readonly GraphEdgeInput<Id>[] | undefined,
  options?: SparseGraphOptions,
): GraphEdge<Id>[];

export function buildAdjacency<Id extends PointId>(
  edges: readonly GraphEdge<Id>[],
): Map<Id, GraphNeighbor<Id>[]>;
