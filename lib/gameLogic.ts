import { Cell, SHAPE_POOL, pickWeighted, randomColor } from "./shapes";

export const BOARD_SIZE = 10;

export type Board = (string | null)[][];

export interface Piece {
  id: string;
  cells: Cell[];
  color: string;
  rows: number;
  cols: number;
}

export function createEmptyBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, () => Array<string | null>(BOARD_SIZE).fill(null));
}

let pieceCounter = 0;

export function createPiece(): Piece {
  const template = pickWeighted(SHAPE_POOL);
  const rows = Math.max(...template.cells.map((c) => c[0])) + 1;
  const cols = Math.max(...template.cells.map((c) => c[1])) + 1;
  pieceCounter += 1;
  return {
    id: `piece_${Date.now()}_${pieceCounter}`,
    cells: template.cells,
    color: randomColor(),
    rows,
    cols,
  };
}

export function canPlacePiece(board: Board, piece: Piece, row: number, col: number): boolean {
  for (const [dr, dc] of piece.cells) {
    const r = row + dr;
    const c = col + dc;
    if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) return false;
    if (board[r][c] !== null) return false;
  }
  return true;
}

export function canPlaceAnywhere(board: Board, piece: Piece): boolean {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (canPlacePiece(board, piece, r, c)) return true;
    }
  }
  return false;
}

export function placePiece(board: Board, piece: Piece, row: number, col: number): Board {
  const next = board.map((r) => r.slice());
  for (const [dr, dc] of piece.cells) {
    next[row + dr][col + dc] = piece.color;
  }
  return next;
}

export function findFullLines(board: Board): { rows: number[]; cols: number[] } {
  const rows: number[] = [];
  const cols: number[] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    if (board[r].every((cell) => cell !== null)) rows.push(r);
  }
  for (let c = 0; c < BOARD_SIZE; c++) {
    if (board.every((row) => row[c] !== null)) cols.push(c);
  }
  return { rows, cols };
}

export function clearLines(board: Board, rows: number[], cols: number[]): Board {
  const next = board.map((r) => r.slice());
  for (const r of rows) {
    for (let c = 0; c < BOARD_SIZE; c++) next[r][c] = null;
  }
  for (const c of cols) {
    for (let r = 0; r < BOARD_SIZE; r++) next[r][c] = null;
  }
  return next;
}

export function nextPiece(board: Board): Piece {
  let candidate = createPiece();
  for (let attempt = 0; attempt < 25; attempt++) {
    if (canPlaceAnywhere(board, candidate)) break;
    candidate = createPiece();
  }
  return candidate;
}

export const TRAY_SIZE = 3;

export function createTray(board: Board): Piece[] {
  return Array.from({ length: TRAY_SIZE }, () => nextPiece(board));
}

export function isGameOver(board: Board, piece: Piece): boolean {
  return !canPlaceAnywhere(board, piece);
}

export function isTrayGameOver(board: Board, tray: (Piece | null)[]): boolean {
  return tray.every((p) => p === null || !canPlaceAnywhere(board, p));
}

export function isBoardEmpty(board: Board): boolean {
  return board.every((row) => row.every((cell) => cell === null));
}

// Base points for clearing N lines in one move. Triangular growth (10 * n(n+1)/2)
// mirrors the real Block Blast reward curve: multi-line clears pay off far more
// than clearing the same lines one at a time.
const LINE_CLEAR_TABLE = [0, 10, 30, 60, 100, 150, 210, 280];

export function lineClearBaseScore(linesCleared: number): number {
  if (linesCleared <= 0) return 0;
  if (linesCleared < LINE_CLEAR_TABLE.length) return LINE_CLEAR_TABLE[linesCleared];
  return (10 * (linesCleared * (linesCleared + 1))) / 2;
}

// Consecutive clears (no whiff in between) build a combo streak. Bonus grows
// per streak length, with extra kickers at higher streaks so long combos pay
// off disproportionately more than isolated clears.
export function comboBonusScore(combo: number): number {
  if (combo <= 1) return 0;
  let bonus = (combo - 1) * 15;
  if (combo >= 5) bonus = Math.round(bonus * 1.5);
  if (combo >= 8) bonus = Math.round(bonus * 1.3);
  return bonus;
}

export const PERFECT_CLEAR_BONUS = 300;

export const COLOR_MATCH_BONUS_PER_LINE = 25;

export interface MonochromeLines {
  count: number;
  colors: string[];
}

// A line clears the instant every cell in it is filled, regardless of color, but a
// line that happens to be a single solid color is a rarer, harder-to-set-up event
// worth calling out with its own bonus. Must be checked on the board BEFORE the
// matched rows/cols are cleared to null.
export function findMonochromeLines(board: Board, rows: number[], cols: number[]): MonochromeLines {
  const colors: string[] = [];
  for (const r of rows) {
    const first = board[r][0];
    if (first !== null && board[r].every((cell) => cell === first)) colors.push(first);
  }
  for (const c of cols) {
    const first = board[0][c];
    if (first !== null && board.every((row) => row[c] === first)) colors.push(first);
  }
  return { count: colors.length, colors };
}

export interface ClearScoreResult {
  placementPoints: number;
  linePoints: number;
  comboPoints: number;
  colorMatchBonus: number;
  perfectClearBonus: number;
  total: number;
}

export function computeClearScore(
  placedCellCount: number,
  linesCleared: number,
  combo: number,
  perfectClear: boolean,
  monochromeLines: number = 0
): ClearScoreResult {
  const placementPoints = placedCellCount;
  const linePoints = lineClearBaseScore(linesCleared);
  const comboPoints = comboBonusScore(combo);
  const colorMatchBonus = monochromeLines * COLOR_MATCH_BONUS_PER_LINE;
  const perfectClearBonus = perfectClear ? PERFECT_CLEAR_BONUS : 0;
  return {
    placementPoints,
    linePoints,
    comboPoints,
    colorMatchBonus,
    perfectClearBonus,
    total: placementPoints + linePoints + comboPoints + colorMatchBonus + perfectClearBonus,
  };
}
