"use client";

import { useEffect, useRef, useState } from "react";
import {
  BOARD_SIZE,
  Board,
  MonochromeLines,
  Piece,
  canPlacePiece,
  clearLines,
  computeClearScore,
  createEmptyBoard,
  createTray,
  findFullLines,
  findMonochromeLines,
  isBoardEmpty,
  isTrayGameOver,
  placePiece,
} from "@/lib/gameLogic";
import {
  playClearSound,
  playGameOverSound,
  playPerfectClearSound,
  playPlaceSound,
  startMusic,
  stopMusic,
} from "@/lib/audio";
import { COLORS } from "@/lib/shapes";

const BEST_SCORE_KEY = "blockBlastBest";
const SOUND_KEY = "blockBlastSound";
const SAVE_KEY = "blockBlastSave";

interface SavedGame {
  board: Board;
  pieces: (Piece | null)[];
  score: number;
  combo: number;
  comboMissStreak: number;
}

// Combo grace window: missing a clear doesn't break the combo immediately.
// The combo only breaks once this many consecutive placements in a row have
// failed to clear a line (i.e. no clear within 3 turns means it snaps on turn 4).
const COMBO_GRACE_TURNS = 3;

interface Particle {
  r: number;
  c: number;
  color: string;
}

interface Burst {
  id: number;
  particles: Particle[];
}

type FxTone = "normal" | "combo" | "hot" | "perfect";

interface ScorePopup {
  id: number;
  text: string;
  tone: FxTone;
}

interface ConfettiPiece {
  id: number;
  left: number;
  delay: number;
  color: string;
  rotate: number;
}

interface Confetti {
  id: number;
  pieces: ConfettiPiece[];
}

interface Shockwave {
  id: number;
  color: string;
}

type ShakeLevel = "normal" | "strong" | null;

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

function lineClearLabel(linesCleared: number): string {
  switch (linesCleared) {
    case 1:
      return "싱글";
    case 2:
      return "더블";
    case 3:
      return "트리플";
    case 4:
      return "쿼드";
    default:
      return "메가 클리어";
  }
}

function comboBadgeClass(combo: number): string {
  if (combo >= 7) return "bg-fuchsia-500/25 ring-1 ring-fuchsia-300/70 animate-combo-glow";
  if (combo >= 4) return "bg-pink-500/20 ring-1 ring-pink-400/60";
  if (combo >= 2) return "bg-orange-500/20 ring-1 ring-orange-400/60";
  return "bg-slate-800/70";
}

function comboTextClass(combo: number): string {
  if (combo >= 7) return "text-fuchsia-300";
  if (combo >= 4) return "text-pink-400";
  if (combo >= 2) return "text-orange-400";
  return "text-slate-500";
}

function popupToneClass(tone: FxTone): string {
  switch (tone) {
    case "perfect":
      return "text-4xl text-amber-300 drop-shadow-[0_0_14px_rgba(251,191,36,0.85)]";
    case "hot":
      return "text-3xl text-fuchsia-300 drop-shadow-[0_0_10px_rgba(232,121,249,0.7)]";
    case "combo":
      return "text-3xl text-orange-300 drop-shadow-[0_0_9px_rgba(251,146,60,0.65)]";
    default:
      return "text-2xl text-cyan-300 drop-shadow";
  }
}

export default function BlockBlastGame() {
  const [board, setBoard] = useState<Board>(() => createEmptyBoard());
  const [pieces, setPieces] = useState<(Piece | null)[]>([]);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [combo, setCombo] = useState(0);
  const [comboMissStreak, setComboMissStreak] = useState(0);
  const [comboPulse, setComboPulse] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [burst, setBurst] = useState<Burst | null>(null);
  const [flash, setFlash] = useState(false);
  const [flashTone, setFlashTone] = useState<"white" | "gold" | "color">("white");
  const [flashColorValue, setFlashColorValue] = useState("#ffffff");
  const [shakeLevel, setShakeLevel] = useState<ShakeLevel>(null);
  const [popup, setPopup] = useState<ScorePopup | null>(null);
  const [confetti, setConfetti] = useState<Confetti | null>(null);
  const [shockwave, setShockwave] = useState<Shockwave | null>(null);

  const boardRef = useRef<HTMLDivElement>(null);
  const messageTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const burstTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shakeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popupTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confettiTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shockwaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;

  // Mirrors of state read inside window-level pointer listeners and applyPlacement.
  // Those listeners are registered once per drag and can outlive the render that
  // created them (e.g. an overlapping second drag from an accidental multi-touch),
  // so reading state via closure there can be stale. Refs always give the latest value.
  const boardStateRef = useRef(board);
  boardStateRef.current = board;
  const piecesRef = useRef(pieces);
  piecesRef.current = pieces;
  const scoreRef = useRef(score);
  scoreRef.current = score;
  const comboRef = useRef(combo);
  comboRef.current = combo;
  const comboMissStreakRef = useRef(comboMissStreak);
  comboMissStreakRef.current = comboMissStreak;
  const bestRef = useRef(best);
  bestRef.current = best;

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
        setComboMissStreak(saved.comboMissStreak ?? 0);
        restored = true;
        // A save can land mid-corruption (see applyPlacement) or simply be the
        // last state before the tab closed right as the game ended. Re-validate
        // instead of trusting the save blindly.
        if (isTrayGameOver(saved.board, saved.pieces)) {
          setGameOver(true);
          localStorage.removeItem(SAVE_KEY);
        }
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
    const save: SavedGame = { board, pieces, score, combo, comboMissStreak };
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  }, [board, pieces, score, combo, comboMissStreak, gameOver]);

  function triggerClearFx(particles: Particle[], linesCleared: number, perfectClear: boolean, monochromeColor: string | null) {
    setBurst({ id: Date.now(), particles });
    if (burstTimeout.current) clearTimeout(burstTimeout.current);
    burstTimeout.current = setTimeout(() => setBurst(null), perfectClear ? 900 : 650);

    if (perfectClear) {
      setFlashTone("gold");
    } else if (monochromeColor) {
      setFlashTone("color");
      setFlashColorValue(monochromeColor);
    } else {
      setFlashTone("white");
    }
    setFlash(true);
    if (flashTimeout.current) clearTimeout(flashTimeout.current);
    flashTimeout.current = setTimeout(() => setFlash(false), perfectClear ? 700 : 450);

    if (perfectClear || linesCleared >= 3) {
      setShakeLevel("strong");
      if (shakeTimeout.current) clearTimeout(shakeTimeout.current);
      shakeTimeout.current = setTimeout(() => setShakeLevel(null), 500);
    } else if (linesCleared >= 2) {
      setShakeLevel("normal");
      if (shakeTimeout.current) clearTimeout(shakeTimeout.current);
      shakeTimeout.current = setTimeout(() => setShakeLevel(null), 350);
    }

    // A ring shockwave on every clear (not just perfect ones) makes even a plain
    // single-line clear feel punchier, colored to match what triggered it.
    const waveColor = perfectClear ? "#fbbf24" : monochromeColor ?? "#22d3ee";
    setShockwave({ id: Date.now(), color: waveColor });
    if (shockwaveTimeout.current) clearTimeout(shockwaveTimeout.current);
    shockwaveTimeout.current = setTimeout(() => setShockwave(null), 650);

    if (perfectClear) triggerConfetti();
  }

  function triggerConfetti() {
    const confettiPieces: ConfettiPiece[] = Array.from({ length: 40 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.35,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rotate: Math.random() * 360,
    }));
    setConfetti({ id: Date.now(), pieces: confettiPieces });
    if (confettiTimeout.current) clearTimeout(confettiTimeout.current);
    confettiTimeout.current = setTimeout(() => setConfetti(null), 1100);
  }

  function showScorePopup(amount: number, tone: FxTone) {
    setPopup({ id: Date.now(), text: `+${amount}`, tone });
    if (popupTimeout.current) clearTimeout(popupTimeout.current);
    popupTimeout.current = setTimeout(() => setPopup(null), 1050);
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
    // Read the latest state via refs, not the render closure: this function can be
    // invoked from a window pointerup listener that was registered on an earlier
    // render (e.g. an overlapping second drag), so the closed-over board/pieces/
    // score/combo/best could otherwise be stale and clobber a newer placement.
    const board = boardStateRef.current;
    const pieces = piecesRef.current;
    const score = scoreRef.current;
    const combo = comboRef.current;
    const missStreak = comboMissStreakRef.current;
    const best = bestRef.current;
    let nextBoard = placePiece(board, placed, row, col);
    const { rows, cols } = findFullLines(nextBoard);
    const linesCleared = rows.length + cols.length;

    const particles: Particle[] = [];
    let monochrome: MonochromeLines = { count: 0, colors: [] };
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
      // Must run before clearLines wipes the matched rows/cols to null.
      monochrome = findMonochromeLines(nextBoard, rows, cols);
      nextBoard = clearLines(nextBoard, rows, cols);
    }

    const perfectClear = linesCleared > 0 && isBoardEmpty(nextBoard);

    let nextCombo = combo;
    let nextMissStreak = missStreak;
    let gained = placed.cells.length;

    if (linesCleared > 0) {
      nextCombo = combo + 1;
      nextMissStreak = 0;
      const scoreResult = computeClearScore(placed.cells.length, linesCleared, nextCombo, perfectClear, monochrome.count);
      gained = scoreResult.total;

      const label = lineClearLabel(linesCleared);
      const comboSuffix = nextCombo > 1 ? ` ${nextCombo}연속 콤보` : "";
      const colorSuffix =
        monochrome.count > 0 ? ` 🎨 색상매치${monochrome.count > 1 ? ` x${monochrome.count}` : ""}` : "";
      const message = perfectClear
        ? `퍼펙트 클리어!${colorSuffix} +${gained}`
        : `${label}!${comboSuffix}${colorSuffix} +${gained}`;
      const tone: FxTone = perfectClear ? "perfect" : nextCombo >= 4 ? "hot" : nextCombo >= 2 ? "combo" : "normal";

      flashMessage(message);
      triggerClearFx(particles, linesCleared, perfectClear, monochrome.colors[0] ?? null);
      showScorePopup(gained, tone);
      setComboPulse((n) => n + 1);
      if (soundOnRef.current) {
        playClearSound(linesCleared, nextCombo);
        if (perfectClear) playPerfectClearSound();
      }
    } else {
      // Grace window: missing a clear doesn't break the combo right away. The
      // streak only snaps once COMBO_GRACE_TURNS misses have piled up in a row.
      if (combo > 0) {
        nextMissStreak = missStreak + 1;
        if (nextMissStreak > COMBO_GRACE_TURNS) {
          flashMessage(`콤보 종료! ${combo}연속까지 이어갔어요`);
          nextCombo = 0;
          nextMissStreak = 0;
        }
      }
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
    setComboMissStreak(nextMissStreak);

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
    if (gameOver || !activePiece || drag) return;
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
      if (target && canPlacePiece(boardStateRef.current, activePiece, target.row, target.col)) {
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
    setComboMissStreak(0);
    setGameOver(false);
    setMessage(null);
    setBurst(null);
    setFlash(false);
    setShakeLevel(null);
    setPopup(null);
    setConfetti(null);
    setShockwave(null);
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

  const shakeClass =
    shakeLevel === "strong" ? "animate-boardshake-strong" : shakeLevel === "normal" ? "animate-boardshake" : "";

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
              combo >= 2 ? `animate-pop ${comboBadgeClass(combo)}` : "bg-slate-800/70"
            }`}
          >
            <div className="text-xs font-medium uppercase tracking-wider text-slate-400">콤보</div>
            <div className={`text-2xl font-bold tabular-nums ${comboTextClass(combo)}`}>{combo}</div>
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
          className={`relative grid aspect-square w-full touch-none overflow-hidden rounded-2xl bg-slate-900 p-1.5 shadow-2xl ring-1 ring-slate-700 ${shakeClass}`}
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
            <div
              className={`pointer-events-none absolute inset-0 rounded-2xl ${
                flashTone === "gold" ? "animate-flash-gold" : "animate-flash"
              }`}
              style={{ background: flashTone === "gold" ? "#fbbf24" : flashTone === "color" ? flashColorValue : "#ffffff" }}
            />
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
              {burst.particles.map((p, idx) => (
                <div
                  key={`sparkle-${burst.id}-${idx}`}
                  className="animate-sparkle absolute rounded-full bg-white"
                  style={{
                    left: p.c * cellSize + cellSize / 2 - 3,
                    top: p.r * cellSize + cellSize / 2 - 3,
                    width: 6,
                    height: 6,
                    animationDelay: `${(idx % 6) * 0.03}s`,
                    boxShadow: "0 0 6px 2px rgba(255,255,255,0.9)",
                  }}
                />
              ))}
            </div>
          )}

          {shockwave && (
            <div
              key={`shockwave-${shockwave.id}`}
              className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 rounded-full animate-shockwave"
              style={{ border: `6px solid ${shockwave.color}`, boxShadow: `0 0 24px 4px ${shockwave.color}` }}
            />
          )}

          {confetti && (
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              {confetti.pieces.map((p) => (
                <div
                  key={`${confetti.id}-${p.id}`}
                  className="animate-confetti absolute top-0 h-3 w-3 rounded-sm"
                  style={{
                    left: `${p.left}%`,
                    background: p.color,
                    animationDelay: `${p.delay}s`,
                    transform: `rotate(${p.rotate}deg)`,
                  }}
                />
              ))}
            </div>
          )}

          {popup && (
            <div
              key={`popup-${popup.id}`}
              className={`animate-score-popup pointer-events-none absolute left-1/2 top-1/3 font-extrabold ${popupToneClass(
                popup.tone
              )}`}
            >
              {popup.text}
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
