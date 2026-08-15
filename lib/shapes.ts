export type Cell = [number, number];

interface ShapeSeed {
  cells: Cell[];
  weight: number;
}

export interface ShapeTemplate {
  cells: Cell[];
  weight: number;
}

function normalize(cells: Cell[]): Cell[] {
  const minR = Math.min(...cells.map((c) => c[0]));
  const minC = Math.min(...cells.map((c) => c[1]));
  return cells
    .map(([r, c]) => [r - minR, c - minC] as Cell)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

function rotate90(cells: Cell[]): Cell[] {
  return normalize(cells.map(([r, c]) => [c, -r] as Cell));
}

function rotations(cells: Cell[]): Cell[][] {
  const seen = new Map<string, Cell[]>();
  let current = normalize(cells);
  for (let i = 0; i < 4; i++) {
    const key = current.map((c) => c.join(",")).join(";");
    if (!seen.has(key)) seen.set(key, current);
    current = rotate90(current);
  }
  return Array.from(seen.values());
}

// Seed polyominoes. Rotations are generated automatically and deduplicated,
// so every asymmetric shape ends up appearing in multiple orientations.
const SEEDS: ShapeSeed[] = [
  { cells: [[0, 0]], weight: 2.5 }, // single
  { cells: [[0, 0], [0, 1]], weight: 2.5 }, // domino
  { cells: [[0, 0], [0, 1], [0, 2]], weight: 2.5 }, // I-tromino
  { cells: [[0, 0], [0, 1], [0, 2], [0, 3]], weight: 1.8 }, // I-tetromino
  { cells: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]], weight: 0.8 }, // I-pentomino
  { cells: [[0, 0], [0, 1], [1, 0], [1, 1]], weight: 2 }, // 2x2 square
  { cells: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]], weight: 0.6 }, // 2x3 rectangle
  { cells: [[0, 0], [1, 0], [1, 1]], weight: 2.5 }, // L-tromino
  { cells: [[0, 0], [1, 0], [2, 0], [2, 1]], weight: 1.8 }, // L-tetromino
  { cells: [[0, 1], [1, 1], [2, 1], [2, 0]], weight: 1.8 }, // J-tetromino
  { cells: [[0, 1], [0, 2], [1, 0], [1, 1]], weight: 1.8 }, // S-tetromino
  { cells: [[0, 0], [0, 1], [1, 1], [1, 2]], weight: 1.8 }, // Z-tetromino
  { cells: [[0, 0], [0, 1], [0, 2], [1, 1]], weight: 1.8 }, // T-tetromino
  { cells: [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]], weight: 1 }, // plus pentomino
  { cells: [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]], weight: 0.7 }, // big L pentomino
  { cells: [[0, 0], [0, 1], [0, 2], [1, 1], [2, 1]], weight: 0.8 }, // T-pentomino
  { cells: [[0, 0], [0, 2], [1, 0], [1, 1], [1, 2]], weight: 0.8 }, // U-pentomino
  { cells: [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]], weight: 0.8 }, // W-pentomino (staircase)
  { cells: [[0, 0], [0, 1], [1, 1], [2, 1], [2, 2]], weight: 0.8 }, // Z-pentomino
  { cells: [[0, 1], [0, 2], [1, 1], [2, 0], [2, 1]], weight: 0.8 }, // S-pentomino (mirrored Z)
  { cells: [[0, 1], [1, 0], [1, 1], [2, 1], [3, 1]], weight: 0.5 }, // Y-pentomino
  { cells: [[0, 1], [1, 1], [2, 0], [2, 1], [3, 0]], weight: 0.5 }, // N-pentomino
  {
    cells: [
      [0, 0], [0, 1], [0, 2],
      [1, 0], [1, 1], [1, 2],
      [2, 0], [2, 1], [2, 2],
    ],
    weight: 0.3,
  }, // 3x3 square, rare
];

const dedupeGlobal = new Map<string, ShapeTemplate>();
for (const seed of SEEDS) {
  for (const cells of rotations(seed.cells)) {
    const key = cells.map((c) => c.join(",")).join(";");
    if (!dedupeGlobal.has(key)) {
      dedupeGlobal.set(key, { cells, weight: seed.weight });
    }
  }
}

export const SHAPE_POOL: ShapeTemplate[] = Array.from(dedupeGlobal.values());

export const COLORS = [
  "#f43f5e", // rose
  "#fb923c", // orange
  "#fbbf24", // amber
  "#22c55e", // green
  "#22d3ee", // cyan
  "#3b82f6", // blue
  "#a78bfa", // violet
  "#f472b6", // pink
];

export function pickWeighted<T extends { weight: number }>(items: T[]): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

export function randomColor(): string {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}
