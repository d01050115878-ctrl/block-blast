"use client";

import { useEffect, useRef, useState } from "react";
import {
  BOARD_SIZE,
  Board,
  Piece,
  canPlacePiece,
  clearLines,
  createEmptyBoard,
  createTray,
  findFullLines,
  isTrayGameOver,
  placePiece,
} from "@/lib/gameLogic";
import { playClearSound, playGameOverSound, playPlaceSound, startMusic, stopMusic } from "@/lib/audio";

const BEST_SCORE_KEY = "blockBlastBest";
const SOUND_KEY = "blockBlastSound";
const SAVE_KEY = "blockBlastSave";

interface SavedGame {
  board: Board;
  pieces: (Piece | null)[];
  score: number;
  combo: number;
}

interface Particle {
  r: number;
  c: number;
  color: string;
}

interface Burst {
  id: number;
  particles: Particle[];
}

interface DragState {
  piece: Piece;
  index: number;
  pointerType: string;
  x: number;
  y: number;
}

interface DropTarget {
  row: number;
  col: number;
}

function blockStyle(color: string): React.CSSProperties {
  return {
    background: `linear-gradient(155deg, rgba(255,255,255,0.35) 0%, ${color} 30%, ${color} 100%)`,
    boxShadow: "inset 0 2px 0 rgba(255,255,255,0.5)",
  };
}

function trayCellSize(piece: Piece): number {
  const maxDim = Math.max(piece.rows, piece.cols);
  return Math.min(28, Math.floor(84 / maxDim));
}

export default function BlockBlastGame() {
  const [board, setBoard] = useState<Board>(() => createEmptyBoard());
  const [pieces, setPieces] = useState<(Piece | null)[]>([]);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [combo, setCombo] = useState(0);
  const [comboPulse, setComboPulse] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [burst, setBurst] = useState<Burst | null>(null);
  const [flash, setFlash] = useState(false);
  const [shake, setShake] = useState(false);

  const boardRef = useRef<HTMLDivElement>(null);
  const messageTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const burstTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shakeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;

  // Piece generation uses Math.random, so the initial piece must be created
  // client-side only to avoid a server/client hydration mismatch. If a game
  // was left mid-play (tab/browser closed without reaching game over), resume it.
  useEffect(() => {
    let restored = false;
    try {
      const saved: SavedGame = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null");
      if (saved && saved.board && saved.pieces && saved.pieces.length > 0) {
        setBoard(saved.board);
        setPieces(saved.pieces);
        setScore(saved.score);
        setCombo(saved.combo);
        restored = true;
      }
    } catch {
      // ignore malformed save data
    }
    if (!restored) {
      setPieces(createTray(createEmptyBoard()));
    }
    const stored = Number(localStorage.getItem(BEST_SCORE_KEY) ?? 0);
    if (!Number.isNaN(stored)) setBest(stored);
    const storedSound = localStorage.getItem(SOUND_KEY);
    if (storedSound !== null) setSoundOn(storedSound === "1");
    return () => stopMusic();
  }, []);

  // Keep the in-progress game saved so an abrupt close (crash, accidental
  // tab close, etc.) can be resumed on the next visit.
  useEffect(() => {
    if (pieces.length === 0 || gameOver) return;
    const save: SavedGame = { board, pieces, score, combo };
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  }, [board, pieces, score, combo, gameOver]);

  function triggerClearFx(particles: Particle[], linesCleared: number) {
    setBurst({ id: Date.now(), particles });
    if (burstTimeout.current) clearTimeout(burstTimeout.current);
    burstTimeout.current = setTimeout(() => setBurst(null), 650);

    setFlash(true);
    if (flashTimeout.current) clearTimeout(flashTimeout.current);
    flashTimeout.current = setTimeout(() => setFlash(false), 450);

    if (linesCleared >= 2) {
      setShake(true);
      if (shakeTimeout.current) clearTimeout(shakeTimeout.current);
      shakeTimeout.current = setTimeout(() => setShake(false), 350);
    }
  }

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    localStorage.setItem(SOUND_KEY, next ? "1" : "0");
    if (next) startMusic();
    else stopMusic();
  }

  function flashMessage(text: string) {
    setMessage(text);
    if (messageTimeout.current) clearTimeout(messageTimeout.current);
    messageTimeout.current = setTimeout(() => setMessage(null), 1100);
  }

  function computeDropTarget(p: Piece, clientX: number, clientY: number, pointerType: string): DropTarget | null {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const cellSize = rect.width / BOARD_SIZE;
    const lift = pointerType === "touch" ? cellSize * 1.35 : 0;
    const centerX = clientX;
    const centerY = clientY - lift;
    const shapeW = p.cols * cellSize;
    const shapeH = p.rows * cellSize;
    const left = centerX - shapeW / 2;
    const top = centerY - shapeH / 2;
    const col = Math.round((left - rect.left) / cellSize);
    const row = Math.round((top - rect.top) / cellSize);
    return { row, col };
  }

  function applyPlacement(placed: Piece, row: number, col: number, index: number) {
    let nextBoard = placePiece(board, placed, row, col);
    const { rows, cols } = findFullLines(nextBoard);
    const linesCleared = rows.length + cols.length;

    let particles: Particle[] = [];
    if (linesCleared > 0) {
      const seen = new Set<string>();
      for (const r of rows) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          const key = `${r},${c}`;
          if (!seen.has(key)) {
            seen.add(key);
            particles.push({ r, c, color: nextBoard[r][c] as string });
          }
        }
      }
      for (const c of cols) {
        for (let r = 0; r < BOARD_SIZE; r++) {
          const key = `${r},${c}`;
          if (!seen.has(key)) {
            seen.add(key);
            particles.push({ r, c, color: nextBoard[r][c] as string });
          }
        }
      }
      nextBoard = clearLines(nextBoard, rows, cols);
    }

    let nextCombo = combo;
    let gained = placed.cells.length;

    if (linesCleared > 0) {
      nextCombo = combo + 1;
      let clearPts = linesCleared * 10;
      if (linesCleared >= 2) clearPts += 20;
      if (linesCleared >= 3) clearPts += 30;
      // Combo bonus grows with streak length, and big streaks get an extra kicker
      // so chaining clears meaningfully outpaces playing it safe.
      clearPts += (nextCombo - 1) * 15;
      if (nextCombo >= 5) clearPts = Math.round(clearPts * 1.5);
      gained += clearPts;
      flashMessage(
        nextCombo > 1
          ? `${linesCleared}줄 클리어! ${nextCombo}연속 콤보 +${gained}`
          : `${linesCleared}줄 클리어! +${gained}`
      );
      triggerClearFx(particles, linesCleared);
      setComboPulse((n) => n + 1);
      if (soundOnRef.current) playClearSound(linesCleared, nextCombo);
    } else {
      if (combo >= 3) flashMessage(`콤보 종료! ${combo}연속까지 이어갔어요`);
      nextCombo = 0;
      if (soundOnRef.current) playPlaceSound();
    }

    let updatedPieces = pieces.slice();
    updatedPieces[index] = null;
    if (updatedPieces.every((p) => p === null)) {
      updatedPieces = createTray(nextBoard);
    }

    const nextScore = score + gained;

    setBoard(nextBoard);
    setPieces(updatedPieces);
    setScore(nextScore);
    setCombo(nextCombo);

    if (nextScore > best) {
      setBest(nextScore);
      localStorage.setItem(BEST_SCORE_KEY, String(nextScore));
    }

    if (isTrayGameOver(nextBoard, updatedPieces)) {
      setGameOver(true);
      localStorage.removeItem(SAVE_KEY);
      if (soundOnRef.current) playGameOverSound();
    }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>, index: number) {
    const activePiece = pieces[index];
    if (gameOver || !activePiece) return;
    e.preventDefault();

    if (soundOnRef.current) startMusic();

    const pointerId = e.pointerId;
    const pointerType = e.pointerType;

    setDrag({ piece: activePiece, index, pointerType, x: e.clientX, y: e.clientY });

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      setDrag((d) => (d ? { ...d, x: ev.clientX, y: ev.clientY } : d));
    };

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      cleanup();
      const target = computeDropTarget(activePiece, ev.clientX, ev.clientY, pointerType);
      setDrag(null);
      if (target && canPlacePiece(board, activePiece, target.row, target.col)) {
        applyPlacement(activePiece, target.row, target.col, index);
      }
    };

    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      cleanup();
      setDrag(null);
    };

    function cleanup() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  }

  function restart() {
    const empty = createEmptyBoard();
    setBoard(empty);
    setPieces(createTray(empty));
    setScore(0);
    setCombo(0);
    setGameOver(false);
    setMessage(null);
    setBurst(null);
    setFlash(false);
    setShake(false);
  }

  const previewTarget = drag ? computeDropTarget(drag.piece, drag.x, drag.y, drag.pointerType) : null;
  const previewValid = !!(previewTarget && drag && canPlacePiece(board, drag.piece, previewTarget.row, previewTarget.col));
  const previewCells: Set<string> = new Set();
  const clearPreviewCells: Set<string> = new Set();

  if (drag && previewTarget) {
    for (const [dr, dc] of drag.piece.cells) {
      const r = previewTarget.row + dr;
      const c = previewTarget.col + dc;
      if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
        previewCells.add(`${r},${c}`);
      }
    }
    if (previewValid) {
      const hypothetical = placePiece(board, drag.piece, previewTarget.row, previewTarget.col);
      const { rows, cols } = findFullLines(hypothetical);
      for (const r of rows) for (let c = 0; c < BOARD_SIZE; c++) clearPreviewCells.add(`${r},${c}`);
      for (const c of cols) for (let r = 0; r < BOARD_SIZE; r++) clearPreviewCells.add(`${r},${c}`);
    }
  }

  const boardRect = boardRef.current?.getBoundingClientRect();
  const cellSize = boardRect ? boardRect.width / BOARD_SIZE : 0;

  let ghostLeft = 0;
  let ghostTop = 0;
  if (drag && boardRect) {
    const lift = drag.pointerType === "touch" ? cellSize * 1.35 : 0;
    const shapeW = drag.piece.cols * cellSize;
    const shapeH = drag.piece.rows * cellSize;
    ghostLeft = drag.x - shapeW / 2;
    ghostTop = drag.y - lift - shapeH / 2;
  }

  return (
    <div className="flex min-h-dvh flex-col items-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-6 text-slate-100 select-none">
      <div className="flex w-full max-w-md flex-col items-center gap-4">
        <header className="flex w-full items-center justify-between">
          <h1 className="text-2xl font-extrabold tracking-tight text-white">
            블록 <span className="text-cyan-400">블래스트</span>
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleSound}
              aria-label={soundOn ? "소리 끄기" : "소리 켜기"}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-600 bg-slate-800/80 text-slate-200 transition hover:bg-slate-700 active:scale-95"
            >
              {soundOn ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                  <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" stroke="none" />
                  <path d="M16.5 8.5a5 5 0 0 1 0 7" strokeLinecap="round" />
                  <path d="M19 6a9 9 0 0 1 0 12" strokeLinecap="round" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                  <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" stroke="none" />
                  <path d="M16 9l5 6M21 9l-5 6" strokeLinecap="round" />
                </svg>
              )}
            </button>
            <button
              onClick={restart}
              className="rounded-full border border-slate-600 bg-slate-800/80 px-4 py-1.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-700 active:scale-95"
            >
              새 게임
            </button>
          </div>
        </header>

        <div className="flex w-full gap-3">
          <div className="flex-1 rounded-2xl bg-slate-800/70 px-4 py-2 text-center shadow-inner">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-400">점수</div>
            <div className="text-2xl font-bold tabular-nums text-white">{score}</div>
          </div>
          <div className="flex-1 rounded-2xl bg-slate-800/70 px-4 py-2 text-center shadow-inner">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-400">최고 기록</div>
            <div className="text-2xl font-bold tabular-nums text-amber-400">{best}</div>
          </div>
          <div
            key={comboPulse}
            className={`flex-1 rounded-2xl px-4 py-2 text-center shadow-inner transition-colors ${
              combo >= 2
                ? "animate-pop bg-orange-500/20 ring-1 ring-orange-400/60"
                : "bg-slate-800/70"
            }`}
          >
            <div className="text-xs font-medium uppercase tracking-wider text-slate-400">콤보</div>
            <div
              className={`text-2xl font-bold tabular-nums ${
                combo >= 2 ? "text-orange-400" : "text-slate-500"
              }`}
            >
              {combo}
            </div>
          </div>
        </div>

        <div className="relative h-7 w-full text-center">
          {message && (
            <div className="animate-pop absolute inset-x-0 text-sm font-bold text-cyan-300 drop-shadow">
              {message}
            </div>
          )}
        </div>

        <div
          ref={boardRef}
          className={`relative grid aspect-square w-full touch-none rounded-2xl bg-slate-900 p-1.5 shadow-2xl ring-1 ring-slate-700 ${shake ? "animate-boardshake" : ""}`}
          style={{ gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)`, gridTemplateRows: `repeat(${BOARD_SIZE}, 1fr)` }}
        >
          {board.map((row, r) =>
            row.map((cell, c) => {
              const key = `${r},${c}`;
              const isPreview = previewCells.has(key);
              const isClearPreview = clearPreviewCells.has(key);
              const filled = cell !== null;
              const checker = (r + c) % 2 === 0;

              let style: React.CSSProperties = {};
              let className =
                "m-[2px] rounded-[5px] transition-colors duration-100";

              if (filled) {
                style = blockStyle(cell as string);
              } else if (isPreview) {
                style = blockStyle(previewValid ? drag!.piece.color : "#ef4444");
                className += previewValid ? " opacity-60" : " opacity-40";
              } else {
                className += checker ? " bg-slate-800/60" : " bg-slate-800/30";
              }

              if (isClearPreview) {
                className += " ring-2 ring-white/80";
              }

              return <div key={key} style={style} className={className} />;
            })
          )}

          {flash && (
            <div className="animate-flash pointer-events-none absolute inset-0 rounded-2xl bg-white" />
          )}

          {burst && cellSize > 0 && (
            <div className="pointer-events-none absolute inset-0">
              {burst.particles.map((p, idx) => (
                <div
                  key={`${burst.id}-${idx}`}
                  className="animate-particle absolute"
                  style={{
                    left: p.c * cellSize,
                    top: p.r * cellSize,
                    width: cellSize,
                    height: cellSize,
                    ...blockStyle(p.color),
                  }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex w-full min-h-32 items-center justify-around rounded-2xl bg-slate-800/40 p-3">
          {pieces.map((p, idx) => (
            <div key={idx} className="flex h-[84px] w-[84px] items-center justify-center">
              {p && !(drag && drag.index === idx) && (
                <div
                  onPointerDown={(e) => handlePointerDown(e, idx)}
                  className="grid cursor-grab touch-none active:cursor-grabbing"
                  style={{
                    gridTemplateColumns: `repeat(${p.cols}, ${trayCellSize(p)}px)`,
                    gridTemplateRows: `repeat(${p.rows}, ${trayCellSize(p)}px)`,
                  }}
                >
                  {Array.from({ length: p.rows * p.cols }).map((_, i) => {
                    const r = Math.floor(i / p.cols);
                    const c = i % p.cols;
                    const active = p.cells.some(([dr, dc]) => dr === r && dc === c);
                    return (
                      <div
                        key={i}
                        className={active ? "m-[2px] rounded-[4px]" : ""}
                        style={active ? blockStyle(p.color) : undefined}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-slate-500">
          다음 조각을 드래그해서 보드에 놓으세요. 가로나 세로 한 줄을 가득 채우면 사라져요!
        </p>
      </div>

      {drag && boardRect && (
        <div
          className="pointer-events-none fixed z-50 grid scale-105 drop-shadow-2xl"
          style={{
            left: ghostLeft,
            top: ghostTop,
            width: drag.piece.cols * cellSize,
            height: drag.piece.rows * cellSize,
            gridTemplateColumns: `repeat(${drag.piece.cols}, ${cellSize}px)`,
            gridTemplateRows: `repeat(${drag.piece.rows}, ${cellSize}px)`,
          }}
        >
          {Array.from({ length: drag.piece.rows * drag.piece.cols }).map((_, idx) => {
            const r = Math.floor(idx / drag.piece.cols);
            const c = idx % drag.piece.cols;
            const active = drag.piece.cells.some(([dr, dc]) => dr === r && dc === c);
            return (
              <div
                key={idx}
                className={active ? "m-[2px] rounded-[5px]" : ""}
                style={active ? blockStyle(drag.piece.color) : undefined}
              />
            );
          })}
        </div>
      )}

      {gameOver && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-3xl bg-slate-800 p-6 text-center shadow-2xl ring-1 ring-slate-600">
            <h2 className="text-xl font-bold text-white">게임 오버</h2>
            <p className="mt-2 text-slate-300">더 이상 조각을 놓을 자리가 없어요.</p>
            <div className="mt-4 flex justify-center gap-6">
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-400">이번 점수</div>
                <div className="text-2xl font-bold text-white">{score}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-400">최고 기록</div>
                <div className="text-2xl font-bold text-amber-400">{best}</div>
              </div>
            </div>
            <button
              onClick={restart}
              className="mt-6 w-full rounded-full bg-cyan-500 px-4 py-2.5 font-semibold text-slate-950 transition hover:bg-cyan-400 active:scale-95"
            >
              다시 시작
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
