export type Owner = "human" | "cpu";

export type Point = { x: number; y: number };
export type Board = {
  seed: number;
  points: Point[];
};

export const SPOTS = 20;
export const BOARD_WIDTH = 760;
export const BOARD_HEIGHT = 560;
const PADDING = 44;
const MIN_GAP = 96;

export const edgeId = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
export const parseEdge = (key: string): [number, number] =>
  key.split("-").map(Number) as [number, number];
export const triId = (a: number, b: number, c: number) =>
  `T${[a, b, c].sort((p, q) => p - q).join(".")}`;
export const parseTriId = (id: string): [number, number, number] =>
  id.slice(1).split(".").map(Number) as [number, number, number];

/** Small deterministic PRNG so host and guest generate the same board. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

export const newSeed = () => Math.floor(Math.random() * 2 ** 31) + 1;

/** Scatter spots with rejection sampling so none crowd their neighbours. */
function scatter(seed: number): Point[] {
  const next = rng(seed);
  const points: Point[] = [];
  let gap = MIN_GAP;
  let guard = 0;
  while (points.length < SPOTS && guard < 20000) {
    guard += 1;
    const p = {
      x: PADDING + next() * (BOARD_WIDTH - PADDING * 2),
      y: PADDING + next() * (BOARD_HEIGHT - PADDING * 2),
    };
    if (points.every((q) => (q.x - p.x) ** 2 + (q.y - p.y) ** 2 >= gap * gap)) points.push(p);
    else if (guard % 800 === 0) gap *= 0.9;
  }
  return points;
}

function orient(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/** Is point `q` on the closed segment `p`–`r`, given the three are collinear? */
function onSegment(p: Point, q: Point, r: Point): boolean {
  return (
    q.x <= Math.max(p.x, r.x) &&
    q.x >= Math.min(p.x, r.x) &&
    q.y <= Math.max(p.y, r.y) &&
    q.y >= Math.min(p.y, r.y)
  );
}

/**
 * Do the closed segments p1–p2 and p3–p4 touch at all — cross in their
 * interiors, meet at a point, or overlap collinearly? This is stricter than
 * a crossing-only test: a line is rejected if it so much as brushes against
 * another, not just when it cuts through it.
 */
export function segmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const d1 = orient(p3, p4, p1);
  const d2 = orient(p3, p4, p2);
  const d3 = orient(p1, p2, p3);
  const d4 = orient(p1, p2, p4);

  if (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  ) {
    return true;
  }
  if (d1 === 0 && onSegment(p3, p1, p4)) return true;
  if (d2 === 0 && onSegment(p3, p2, p4)) return true;
  if (d3 === 0 && onSegment(p1, p3, p2)) return true;
  if (d4 === 0 && onSegment(p1, p4, p2)) return true;
  return false;
}

/**
 * Can a line between spots `a` and `b` be drawn? It must not already exist
 * and must not touch or cross any line already on the board. Two lines may
 * still meet at a shared spot (endpoint), which is how triangles form.
 */
export function canDraw(
  points: Point[],
  lines: Record<string, Owner>,
  a: number,
  b: number,
): boolean {
  if (a === b) return false;
  if (lines[edgeId(a, b)]) return false;
  const pa = points[a]!;
  const pb = points[b]!;
  for (const key of Object.keys(lines)) {
    const [c, d] = parseEdge(key);
    if (a === c || a === d || b === c || b === d) continue; // shared spot is fine
    if (segmentsIntersect(pa, pb, points[c]!, points[d]!)) return false;
  }
  return true;
}

/** Every line that can still be drawn without crossing an existing one. */
export function allLegalLines(points: Point[], lines: Record<string, Owner>): string[] {
  const result: string[] = [];
  for (let a = 0; a < points.length; a += 1) {
    for (let b = a + 1; b < points.length; b += 1) {
      if (canDraw(points, lines, a, b)) result.push(edgeId(a, b));
    }
  }
  return result;
}

/** Is point `q` strictly inside the triangle (a, b, c)? Vertex order is free. */
function pointInTriangle(q: Point, a: Point, b: Point, c: Point): boolean {
  const d1 = orient(a, b, q);
  const d2 = orient(b, c, q);
  const d3 = orient(c, a, q);
  const allPos = d1 > 0 && d2 > 0 && d3 > 0;
  const allNeg = d1 < 0 && d2 < 0 && d3 < 0;
  return allPos || allNeg;
}

/** Does any spot other than `a`, `b`, `c` lie strictly inside their triangle? */
function hasSpotInside(points: Point[], a: number, b: number, c: number): boolean {
  const pa = points[a]!;
  const pb = points[b]!;
  const pc = points[c]!;
  for (let m = 0; m < points.length; m += 1) {
    if (m === a || m === b || m === c) continue;
    if (pointInTriangle(points[m]!, pa, pb, pc)) return true;
  }
  return false;
}

/**
 * Triangles completed by drawing the line `a`–`b`, assuming `lines` already
 * includes it. A triangle is three mutually joined spots with no other spot
 * trapped inside it; here its other two sides must already be drawn and the
 * triangle not yet claimed.
 */
export function trianglesClosedBy(
  points: Point[],
  lines: Record<string, Owner>,
  a: number,
  b: number,
  claimed: Record<string, Owner>,
): string[] {
  const closed: string[] = [];
  for (let k = 0; k < points.length; k += 1) {
    if (k === a || k === b) continue;
    if (lines[edgeId(a, k)] && lines[edgeId(b, k)]) {
      const id = triId(a, b, k);
      if (claimed[id]) continue;
      if (hasSpotInside(points, a, b, k)) continue;
      closed.push(id);
    }
  }
  return closed;
}

export function makeBoard(seed: number): Board {
  return { seed, points: scatter(seed) };
}

/**
 * Charlotte's line: close a triangle when she can, otherwise avoid handing one
 * over, otherwise anything left.
 */
export function chooseEdge(
  points: Point[],
  lines: Record<string, Owner>,
  claimed: Record<string, Owner>,
): string | null {
  const legal = allLegalLines(points, lines);
  if (!legal.length) return null;

  const scoring = legal.filter((key) => {
    const [a, b] = parseEdge(key);
    return trianglesClosedBy(points, { ...lines, [key]: "cpu" }, a, b, claimed).length > 0;
  });
  if (scoring.length) {
    return scoring.sort((x, y) => {
      const [ax, ay] = parseEdge(x);
      const [bx, by] = parseEdge(y);
      return (
        trianglesClosedBy(points, { ...lines, [y]: "cpu" }, bx, by, claimed).length -
        trianglesClosedBy(points, { ...lines, [x]: "cpu" }, ax, ay, claimed).length
      );
    })[0]!;
  }

  const safe = legal.filter((key) => {
    const [a, b] = parseEdge(key);
    for (let k = 0; k < points.length; k += 1) {
      if (k === a || k === b) continue;
      if (hasSpotInside(points, a, b, k)) continue;
      const drawn = 1 + (lines[edgeId(a, k)] ? 1 : 0) + (lines[edgeId(b, k)] ? 1 : 0);
      if (drawn === 2 && !claimed[triId(a, b, k)]) return false;
    }
    return true;
  });
  const pool = safe.length ? safe : legal;
  return pool[Math.floor(Math.random() * pool.length)]!;
}
