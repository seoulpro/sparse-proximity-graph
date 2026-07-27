const DEFAULTS = Object.freeze({
  maxDistance: 40,
  maxCandidatesPerPoint: 12,
  maxDegreePerPoint: 4,
  sectorCount: 8,
  relativeNeighborhood: true,
  preventCrossings: true,
  reconnectIsolated: true,
});
const OPTION_NAMES = new Set(Object.keys(DEFAULTS));

const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const isPointId = (value) => (
  typeof value === "string"
  || (typeof value === "number" && Number.isFinite(value))
);

const assertSegmentPoint = (point, name) => {
  if (typeof point !== "object" || point === null || Array.isArray(point)) {
    throw new TypeError(`${name} must be a point object`);
  }
  if (
    !Object.hasOwn(point, "id")
    || !Object.hasOwn(point, "x")
    || !Object.hasOwn(point, "y")
  ) {
    throw new TypeError(`${name} must have own id, x, and y properties`);
  }
  if (!isPointId(point.id)) {
    throw new TypeError(`${name}.id must be a string or finite number`);
  }
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new TypeError(`${name} must have finite coordinates`);
  }
};

const compareIds = (a, b) => {
  const aValue = `${typeof a}:${String(a)}`;
  const bValue = `${typeof b}:${String(b)}`;
  return compareText(aValue, bValue);
};

const orderedIds = (a, b) => compareIds(a, b) <= 0 ? [a, b] : [b, a];
const edgeKey = (a, b) => JSON.stringify(orderedIds(a, b));
const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

const orientation = (a, b, c) => {
  let abX = b.x - a.x;
  let abY = b.y - a.y;
  let acX = c.x - a.x;
  let acY = c.y - a.y;
  let firstProduct = abX * acY;
  let secondProduct = abY * acX;

  if (!Number.isFinite(firstProduct) || !Number.isFinite(secondProduct)) {
    const scale = Math.max(
      Math.abs(a.x),
      Math.abs(a.y),
      Math.abs(b.x),
      Math.abs(b.y),
      Math.abs(c.x),
      Math.abs(c.y),
    );
    abX = b.x / scale - a.x / scale;
    abY = b.y / scale - a.y / scale;
    acX = c.x / scale - a.x / scale;
    acY = c.y / scale - a.y / scale;
    firstProduct = abX * acY;
    secondProduct = abY * acX;
  }

  const cross = firstProduct - secondProduct;
  const tolerance = Number.EPSILON * 8
    * (Math.abs(firstProduct) + Math.abs(secondProduct));
  if (Math.abs(cross) <= tolerance) return 0;
  return cross > 0 ? 1 : -1;
};

const onSegment = (a, b, c) => {
  const scale = Math.max(
    1,
    Math.abs(a.x),
    Math.abs(a.y),
    Math.abs(b.x),
    Math.abs(b.y),
    Math.abs(c.x),
    Math.abs(c.y),
  );
  const tolerance = Number.EPSILON * 8 * scale;
  return b.x <= Math.max(a.x, c.x) + tolerance
    && b.x + tolerance >= Math.min(a.x, c.x)
    && b.y <= Math.max(a.y, c.y) + tolerance
    && b.y + tolerance >= Math.min(a.y, c.y);
};

const segmentsIntersectUnchecked = (a, b, c, d) => {
  if (a.id === c.id || a.id === d.id || b.id === c.id || b.id === d.id) {
    return false;
  }
  const first = orientation(a, b, c);
  const second = orientation(a, b, d);
  const third = orientation(c, d, a);
  const fourth = orientation(c, d, b);
  if (first !== second && third !== fourth) return true;
  if (first === 0 && onSegment(a, c, b)) return true;
  if (second === 0 && onSegment(a, d, b)) return true;
  if (third === 0 && onSegment(c, a, d)) return true;
  if (fourth === 0 && onSegment(c, b, d)) return true;
  return false;
};

const edgeBounds = (edge) => ({
  minX: Math.min(edge.a.x, edge.b.x),
  maxX: Math.max(edge.a.x, edge.b.x),
  minY: Math.min(edge.a.y, edge.b.y),
  maxY: Math.max(edge.a.y, edge.b.y),
});

const boundsOverlap = (first, second) => (
  first.minX <= second.maxX
  && second.minX <= first.maxX
  && first.minY <= second.maxY
  && second.minY <= first.maxY
);

const axisCells = (minimum, maximum, cellSize) => {
  const first = Math.floor(minimum / cellSize);
  const last = Math.floor(maximum / cellSize);
  if (
    !Number.isSafeInteger(first)
    || !Number.isSafeInteger(last)
    || last - first > 4
  ) {
    return null;
  }
  return Array.from(
    { length: last - first + 1 },
    (_, index) => first + index,
  );
};

const edgeCellKeys = (bounds, cellSize) => {
  const columns = axisCells(bounds.minX, bounds.maxX, cellSize);
  const rows = axisCells(bounds.minY, bounds.maxY, cellSize);
  if (!columns || !rows) return null;
  return columns.flatMap((column) => (
    rows.map((row) => `${column},${row}`)
  ));
};

const createCrossingIndex = (cellSize) => {
  const accepted = [];
  const unindexed = [];
  const buckets = new Map();

  return {
    accept(edge) {
      const bounds = edgeBounds(edge);
      const keys = edgeCellKeys(bounds, cellSize);
      const candidates = keys
        ? new Set([
          ...unindexed,
          ...keys.flatMap((key) => buckets.get(key) ?? []),
        ])
        : new Set(accepted);

      for (const candidate of candidates) {
        if (
          boundsOverlap(bounds, candidate.bounds)
          && segmentsIntersectUnchecked(
            edge.a,
            edge.b,
            candidate.edge.a,
            candidate.edge.b,
          )
        ) {
          return false;
        }
      }

      const descriptor = { edge, bounds };
      accepted.push(descriptor);
      if (!keys) {
        unindexed.push(descriptor);
      } else {
        for (const key of keys) {
          if (!buckets.has(key)) buckets.set(key, []);
          buckets.get(key).push(descriptor);
        }
      }
      return true;
    },
  };
};

export const segmentsIntersect = (a, b, c, d) => {
  assertSegmentPoint(a, "a");
  assertSegmentPoint(b, "b");
  assertSegmentPoint(c, "c");
  assertSegmentPoint(d, "d");
  return segmentsIntersectUnchecked(a, b, c, d);
};

const normalizePoints = (points) => {
  if (!Array.isArray(points)) {
    throw new TypeError("points must be an array");
  }
  const seen = new Set();
  return Array.from(points, (point) => {
    if (typeof point !== "object" || point === null || Array.isArray(point)) {
      throw new TypeError("every point must be an object");
    }
    if (
      !Object.hasOwn(point, "id")
      || !Object.hasOwn(point, "x")
      || !Object.hasOwn(point, "y")
    ) {
      throw new TypeError("every point needs own id, x, and y properties");
    }
    if (point.id === undefined || point.id === null) {
      throw new TypeError("every point needs an id");
    }
    if (!isPointId(point.id)) {
      throw new TypeError("point ids must be strings or finite numbers");
    }
    const key = `${typeof point.id}:${String(point.id)}`;
    if (seen.has(key)) throw new TypeError(`duplicate point id: ${String(point.id)}`);
    seen.add(key);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new TypeError(`point ${String(point.id)} has invalid coordinates`);
    }
    return { ...point, id: point.id, x: point.x, y: point.y };
  }).sort((left, right) => compareIds(left.id, right.id));
};

const normalizeOptions = (overrides) => {
  if (
    typeof overrides !== "object"
    || overrides === null
    || Array.isArray(overrides)
  ) {
    throw new TypeError("options must be an object");
  }
  for (const name of Object.keys(overrides)) {
    if (!OPTION_NAMES.has(name)) {
      throw new TypeError(`unknown graph option: ${name}`);
    }
  }
  const options = { ...DEFAULTS, ...overrides };
  if (!Number.isFinite(options.maxDistance) || options.maxDistance < 0) {
    throw new TypeError("maxDistance must be a finite non-negative number");
  }
  for (const name of [
    "maxCandidatesPerPoint",
    "maxDegreePerPoint",
    "sectorCount",
  ]) {
    if (!Number.isSafeInteger(options[name]) || options[name] <= 0) {
      throw new TypeError(`${name} must be a positive safe integer`);
    }
  }
  for (const name of [
    "relativeNeighborhood",
    "preventCrossings",
    "reconnectIsolated",
  ]) {
    if (typeof options[name] !== "boolean") {
      throw new TypeError(`${name} must be a boolean`);
    }
  }
  return options;
};

export const buildSparsePlanarGraph = (inputPoints, overrides = {}) => {
  const points = normalizePoints(inputPoints);
  const options = normalizeOptions(overrides);
  if (points.length < 2 || options.maxDistance === 0) return [];
  const maximumCandidates = options.maxCandidatesPerPoint;
  const maximumDegree = options.maxDegreePerPoint;
  const sectors = options.sectorCount;
  const pointById = new Map(points.map((point) => [point.id, point]));

  const cellSize = options.maxDistance;
  const grid = new Map();
  for (const point of points) {
    const cellX = Math.floor(point.x / cellSize);
    const cellY = Math.floor(point.y / cellSize);
    const key = `${cellX},${cellY}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(point);
  }

  const neighbors = new Map();
  for (const point of points) {
    const cellX = Math.floor(point.x / cellSize);
    const cellY = Math.floor(point.y / cellSize);
    const candidates = [];
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (const other of grid.get(`${cellX + offsetX},${cellY + offsetY}`) ?? []) {
          if (other.id === point.id) continue;
          const candidateDistance = distance(point, other);
          if (candidateDistance <= options.maxDistance) {
            candidates.push({ point: other, distance: candidateDistance });
          }
        }
      }
    }
    candidates.sort(
      (a, b) => a.distance - b.distance || compareIds(a.point.id, b.point.id),
    );
    neighbors.set(point.id, candidates.slice(0, maximumCandidates));
  }

  const candidateByKey = new Map();
  for (const point of points) {
    for (const candidate of neighbors.get(point.id) ?? []) {
      const key = edgeKey(point.id, candidate.point.id);
      const [aId, bId] = orderedIds(point.id, candidate.point.id);
      const edge = {
        a: pointById.get(aId),
        b: pointById.get(bId),
        distance: candidate.distance,
      };
      const previous = candidateByKey.get(key);
      if (!previous || edge.distance < previous.distance) candidateByKey.set(key, edge);
    }
  }

  let kept = [...candidateByKey.values()];
  if (options.relativeNeighborhood) {
    kept = kept.filter((edge) => {
      const blockers = [
        ...(neighbors.get(edge.a.id) ?? []),
        ...(neighbors.get(edge.b.id) ?? []),
      ];
      for (const { point } of blockers) {
        if (point.id === edge.a.id || point.id === edge.b.id) continue;
        if (
          distance(edge.a, point) < edge.distance
          && distance(edge.b, point) < edge.distance
        ) {
          return false;
        }
      }
      return true;
    });
  }

  const edgesByPoint = new Map();
  for (const edge of kept) {
    if (!edgesByPoint.has(edge.a.id)) edgesByPoint.set(edge.a.id, []);
    if (!edgesByPoint.has(edge.b.id)) edgesByPoint.set(edge.b.id, []);
    edgesByPoint.get(edge.a.id).push(edge);
    edgesByPoint.get(edge.b.id).push(edge);
  }

  const allowed = new Map();
  for (const [pointId, edges] of edgesByPoint) {
    const point = pointById.get(pointId);
    const bestPerSector = new Map();
    for (const edge of edges) {
      const other = edge.a.id === pointId ? edge.b : edge.a;
      const angle = Math.atan2(other.y - point.y, other.x - point.x);
      const normalized = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const sector = Math.floor(normalized / (Math.PI * 2) * sectors);
      const previous = bestPerSector.get(sector);
      if (
        !previous
        || edge.distance < previous.distance
        || (
          edge.distance === previous.distance
          && compareText(
            edgeKey(edge.a.id, edge.b.id),
            edgeKey(previous.a.id, previous.b.id),
          ) < 0
        )
      ) {
        bestPerSector.set(sector, edge);
      }
    }
    const chosen = [...bestPerSector.values()]
      .sort(
        (a, b) => a.distance - b.distance
          || compareText(edgeKey(a.a.id, a.b.id), edgeKey(b.a.id, b.b.id)),
      )
      .slice(0, maximumDegree);
    allowed.set(pointId, new Set(chosen.map((edge) => edgeKey(edge.a.id, edge.b.id))));
  }

  kept = kept.filter((edge) => {
    const key = edgeKey(edge.a.id, edge.b.id);
    return allowed.get(edge.a.id)?.has(key) && allowed.get(edge.b.id)?.has(key);
  });

  const selected = [];
  const crossingIndex = options.preventCrossings
    ? createCrossingIndex(options.maxDistance)
    : null;
  kept
    .sort(
      (a, b) => a.distance - b.distance
        || compareText(edgeKey(a.a.id, a.b.id), edgeKey(b.a.id, b.b.id)),
    )
    .forEach((edge) => {
      if (crossingIndex && !crossingIndex.accept(edge)) return;
      selected.push(edge);
    });

  if (options.reconnectIsolated) {
    const degree = new Map();
    for (const edge of selected) {
      degree.set(edge.a.id, (degree.get(edge.a.id) ?? 0) + 1);
      degree.set(edge.b.id, (degree.get(edge.b.id) ?? 0) + 1);
    }
    const relaxedNeighborDegree = maximumDegree + 1;
    for (const point of points) {
      if ((degree.get(point.id) ?? 0) > 0) continue;
      for (const candidate of neighbors.get(point.id) ?? []) {
        if ((degree.get(candidate.point.id) ?? 0) >= relaxedNeighborDegree) continue;
        const key = edgeKey(point.id, candidate.point.id);
        if (selected.some((edge) => edgeKey(edge.a.id, edge.b.id) === key)) continue;
        const [aId, bId] = orderedIds(point.id, candidate.point.id);
        const edge = {
          a: pointById.get(aId),
          b: pointById.get(bId),
          distance: candidate.distance,
        };
        if (crossingIndex && !crossingIndex.accept(edge)) continue;
        selected.push(edge);
        degree.set(point.id, 1);
        degree.set(candidate.point.id, (degree.get(candidate.point.id) ?? 0) + 1);
        break;
      }
    }
  }

  return selected
    .map((edge) => ({
      a: edge.a.id,
      b: edge.b.id,
      distance: edge.distance,
    }))
    .sort(
      (a, b) => a.distance - b.distance
        || compareText(edgeKey(a.a, a.b), edgeKey(b.a, b.b)),
    );
};

export const resolveGraphEdges = (points, suppliedEdges, options) => {
  if (suppliedEdges === undefined) return buildSparsePlanarGraph(points, options);
  if (!Array.isArray(suppliedEdges)) {
    throw new TypeError("suppliedEdges must be an array when provided");
  }
  const normalizedPoints = normalizePoints(points);
  const pointById = new Map(normalizedPoints.map((point) => [point.id, point]));
  const resolved = new Map();
  for (const input of suppliedEdges) {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      continue;
    }
    if (!Object.hasOwn(input, "a") || !Object.hasOwn(input, "b")) continue;
    if (input.a === input.b) continue;
    const a = pointById.get(input.a);
    const b = pointById.get(input.b);
    if (!a || !b) continue;
    const key = edgeKey(a.id, b.id);
    const [aId, bId] = orderedIds(a.id, b.id);
    const measured = distance(a, b);
    const edgeDistance = Number.isFinite(input.distance) && input.distance >= 0
      ? Number(input.distance)
      : measured;
    const edge = { a: aId, b: bId, distance: edgeDistance };
    const previous = resolved.get(key);
    if (!previous || edge.distance < previous.distance) resolved.set(key, edge);
  }
  return [...resolved.values()].sort(
    (a, b) => a.distance - b.distance
      || compareText(edgeKey(a.a, a.b), edgeKey(b.a, b.b)),
  );
};

export const buildAdjacency = (edges) => {
  if (!Array.isArray(edges)) {
    throw new TypeError("edges must be an array");
  }
  const adjacency = new Map();
  const seen = new Set();
  for (const edge of edges) {
    if (
      typeof edge !== "object"
      || edge === null
      || Array.isArray(edge)
      || !Object.hasOwn(edge, "a")
      || !Object.hasOwn(edge, "b")
      || !Object.hasOwn(edge, "distance")
      || !isPointId(edge.a)
      || !isPointId(edge.b)
      || !Number.isFinite(edge.distance)
      || edge.distance < 0
    ) {
      throw new TypeError(
        "every edge must have endpoints and a finite non-negative distance",
      );
    }
    if (edge.a === edge.b) {
      throw new TypeError("self edges are not supported");
    }
    const key = edgeKey(edge.a, edge.b);
    if (seen.has(key)) {
      throw new TypeError("duplicate undirected edges are not supported");
    }
    seen.add(key);
    if (!adjacency.has(edge.a)) adjacency.set(edge.a, []);
    if (!adjacency.has(edge.b)) adjacency.set(edge.b, []);
    adjacency.get(edge.a).push({ id: edge.b, distance: edge.distance });
    adjacency.get(edge.b).push({ id: edge.a, distance: edge.distance });
  }
  for (const neighbors of adjacency.values()) {
    neighbors.sort(
      (a, b) => a.distance - b.distance || compareIds(a.id, b.id),
    );
  }
  return adjacency;
};
