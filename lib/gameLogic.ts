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

export function isGameOver(board: Board, piece: Piece): boolean {
  return !canPlaceAnywhere(board, piece);
}
