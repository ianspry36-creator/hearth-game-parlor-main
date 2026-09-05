export const SIZE = 10;

export const FLEET = [
  { name: "Carrier", size: 5 },
  { name: "Battleship", size: 4 },
  { name: "Cruiser", size: 3 },
  { name: "Submarine", size: 3 },
  { name: "Destroyer", size: 2 },
  { name: "Patrol Boat", size: 1 },
  { name: "Gunboat", size: 1 },
  { name: "Scout", size: 1 },
] as const;

export type Ship = { name: string; size: number; cells: number[] };

export const rowOf = (index: number) => Math.floor(index / SIZE);
export const colOf = (index: number) => index % SIZE;
export const coordLabel = (index: number) =>
  `${String.fromCharCode(65 + rowOf(index))}${colOf(index) + 1}`;

/** Cells a ship would occupy, or null when it would fall off the grid. */
export function shipCells(start: number, size: number, horizontal: boolean): number[] | null {
  const row = rowOf(start);
  const col = colOf(start);
  if (horizontal && (col < 0 || col + size > SIZE)) return null;
  if (!horizontal && (row < 0 || row + size > SIZE)) return null;
  return Array.from({ length: size }, (_, i) => (horizontal ? start + i : start + i * SIZE));
}

/** Ships may not touch: every placed hull claims a one-square margin around it. */
export function fits(cells: number[], placed: Ship[]): boolean {
  const blocked = new Set<number>();
  for (const ship of placed) {
    for (const cell of ship.cells) {
      const row = rowOf(cell);
      const col = colOf(cell);
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          const r = row + dr;
          const c = col + dc;
          if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) continue;
          blocked.add(r * SIZE + c);
        }
      }
    }
  }
  return cells.every((cell) => !blocked.has(cell));
}

/** Same as fits, ignoring one ship (used while dragging/rotating that ship). */
export const fitsIgnoring = (cells: number[], placed: Ship[], ignoreName: string) =>
  fits(
    cells,
    placed.filter((ship) => ship.name !== ignoreName),
  );

export const isHorizontal = (ship: Ship) =>
  ship.cells.length > 1 && rowOf(ship.cells[0]!) === rowOf(ship.cells[1]!);

/** All squares touching a ship (including diagonals) that are not part of it. */
export function haloCells(ship: Ship): number[] {
  const own = new Set(ship.cells);
  const out = new Set<number>();
  for (const cell of ship.cells) {
    const row = rowOf(cell);
    const col = colOf(cell);
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        const r = row + dr;
        const c = col + dc;
        if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) continue;
        const index = r * SIZE + c;
        if (!own.has(index)) out.add(index);
      }
    }
  }
  return [...out];
}

/** Drag a ship so the grabbed square lands on `target`. Returns null if illegal. */
export function moveShip(
  ships: Ship[],
  name: string,
  grabCell: number,
  target: number,
): Ship[] | null {
  const ship = ships.find((s) => s.name === name);
  if (!ship) return null;
  const offset = ship.cells.indexOf(grabCell);
  if (offset < 0) return null;
  const horizontal = isHorizontal(ship);
  const start = horizontal ? target - offset : target - offset * SIZE;
  if (start < 0) return null;
  if (horizontal && rowOf(start) !== rowOf(target)) return null;
  if (!horizontal && colOf(start) !== colOf(target)) return null;
  const cells = shipCells(start, ship.size, horizontal);
  if (!cells || !fitsIgnoring(cells, ships, name)) return null;
  return ships.map((s) => (s.name === name ? { ...s, cells } : s));
}

/** Flip a ship's orientation around its centre. Returns null if illegal. */
export function rotateShip(ships: Ship[], name: string): Ship[] | null {
  const ship = ships.find((s) => s.name === name);
  if (!ship) return null;
  const start = ship.cells[0]!;
  const horizontal = isHorizontal(ship);
  const half = (ship.size - 1) / 2;
  // Geometric centre of the hull in continuous row/col coordinates.
  const centreRow = rowOf(start) + (horizontal ? 0 : half);
  const centreCol = colOf(start) + (horizontal ? half : 0);
  // Recompute the start square so the centre stays fixed through the flip.
  // Rounding keeps even-length hulls (with no exact centre cell) symmetric.
  const newStart =
    Math.round(centreRow - (horizontal ? half : 0)) * SIZE +
    Math.round(centreCol - (horizontal ? 0 : half));
  const cells = shipCells(newStart, ship.size, !horizontal);
  if (!cells || !fitsIgnoring(cells, ships, name)) return null;
  return ships.map((s) => (s.name === name ? { ...s, cells } : s));
}



export function randomFleet(random: () => number = Math.random): Ship[] {
  const placed: Ship[] = [];
  for (const spec of FLEET) {
    for (let attempt = 0; attempt < 500; attempt += 1) {
      const horizontal = random() < 0.5;
      const start = Math.floor(random() * SIZE * SIZE);
      const cells = shipCells(start, spec.size, horizontal);
      if (cells && fits(cells, placed)) {
        placed.push({ name: spec.name, size: spec.size, cells });
        break;
      }
    }
  }
  return placed;
}

export const isSunk = (ship: Ship, shots: number[]) =>
  ship.cells.every((cell) => shots.includes(cell));

export const allSunk = (ships: Ship[], shots: number[]) =>
  ships.length > 0 && ships.every((ship) => isSunk(ship, shots));

export const isHit = (ships: Ship[], cell: number) =>
  ships.some((ship) => ship.cells.includes(cell));

export const shipAt = (ships: Ship[], cell: number) =>
  ships.find((ship) => ship.cells.includes(cell)) ?? null;

const neighbours = (cell: number) => {
  const list: number[] = [];
  if (colOf(cell) > 0) list.push(cell - 1);
  if (colOf(cell) < SIZE - 1) list.push(cell + 1);
  if (rowOf(cell) > 0) list.push(cell - SIZE);
  if (rowOf(cell) < SIZE - 1) list.push(cell + SIZE);
  return list;
};

/** Ada hunts around unresolved hits, otherwise fires on a parity pattern. */
export function chooseCpuShot(targetShips: Ship[], fired: number[]): number {
  const openHits = targetShips
    .filter((ship) => !isSunk(ship, fired))
    .flatMap((ship) => ship.cells.filter((cell) => fired.includes(cell)));

  const followUps = openHits
    .flatMap(neighbours)
    .filter((cell) => !fired.includes(cell));
  if (followUps.length) return followUps[Math.floor(Math.random() * followUps.length)]!;

  const all = Array.from({ length: SIZE * SIZE }, (_, i) => i).filter((i) => !fired.includes(i));
  const parity = all.filter((i) => (rowOf(i) + colOf(i)) % 2 === 0);
  const pool = parity.length ? parity : all;
  return pool[Math.floor(Math.random() * pool.length)]!;
}
