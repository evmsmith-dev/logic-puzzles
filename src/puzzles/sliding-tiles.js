// Sliding Tiles: slide the numbered tiles into order, with the gap in the bottom-right corner.
// Tapping a tile in the same row or column as the gap slides it (and any tiles between) over.
// Pure functions; the board is an array of numbers, row by row, with 0 for the gap.
import { seededRandom, shuffle } from "../lib/random.js";

export const SLIDING_LEVELS = {
  easy: { size: 3 },
  medium: { size: 4 },
  hard: { size: 5 },
};

export const solvedBoard = (size) => [...Array.from({ length: size * size - 1 }, (_, i) => i + 1), 0];

export const isSolved = (board) => board.every((tile, i) => tile === (i === board.length - 1 ? 0 : i + 1));

/** Whether a shuffled board can be put back in order (half of all shuffles can't). */
export function isSolvable(board, size) {
  const tiles = board.filter((tile) => tile !== 0);
  let inversions = 0;
  for (let i = 0; i < tiles.length; i++) {
    for (let j = i + 1; j < tiles.length; j++) if (tiles[i] > tiles[j]) inversions++;
  }
  if (size % 2 === 1) return inversions % 2 === 0;
  const gapRowFromBottom = size - Math.floor(board.indexOf(0) / size);
  return (inversions + gapRowFromBottom) % 2 === 1;
}

/** Slides toward the gap. Returns { board, moved } (moved = tiles moved, 0 if not allowed). */
export function slide(board, size, index) {
  const gap = board.indexOf(0);
  const [row, col] = [Math.floor(index / size), index % size];
  const [gapRow, gapCol] = [Math.floor(gap / size), gap % size];
  if (index === gap || (row !== gapRow && col !== gapCol)) return { board, moved: 0 };
  const step = row === gapRow ? (col < gapCol ? -1 : 1) : (row < gapRow ? -size : size);
  const next = board.slice();
  let at = gap;
  let moved = 0;
  while (at !== index) {
    next[at] = next[at + step];
    at += step;
    moved++;
  }
  next[index] = 0;
  return { board: next, moved };
}

/** A random board that can be solved and isn't already close to solved. */
export function createSlidingTiles(level, seed) {
  const { size } = SLIDING_LEVELS[level];
  const random = seededRandom(`sliding|${level}|${seed}`);
  for (;;) {
    const board = shuffle(solvedBoard(size), random);
    if (!isSolvable(board, size)) continue;
    const inPlace = board.filter((tile, i) => tile !== 0 && tile === i + 1).length;
    if (inPlace <= Math.floor((size * size) / 4)) {
      return { size, board, par: size === 3 ? solveSmall(board).length : null };
    }
  }
}

/**
 * The shortest list of taps that solves a 3×3 board (each tap moves one tile). Uses IDA*:
 * a depth-first search that gives up on any path that, counting how far every tile still is
 * from its place, can't finish within the current limit, raising the limit until it does.
 * Used for the hint and for "fewest moves" on Easy.
 */
export function solveSmall(board) {
  const size = 3;
  const state = board.slice();
  const distance = () => state.reduce((sum, tile, i) => {
    if (tile === 0) return sum;
    const goal = tile - 1;
    return sum + Math.abs(Math.floor(goal / size) - Math.floor(i / size)) + Math.abs((goal % size) - (i % size));
  }, 0);
  const path = [];
  let gap = state.indexOf(0);
  const search = (moves, limit, cameFrom) => {
    const estimate = distance();
    if (estimate === 0) return true;
    if (moves + estimate > limit) return moves + estimate;
    let nextLimit = Infinity;
    const [row, col] = [Math.floor(gap / size), gap % size];
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const r = row + dr;
      const c = col + dc;
      if (r < 0 || r >= size || c < 0 || c >= size) continue;
      const tile = r * size + c;
      if (tile === cameFrom) continue;
      const oldGap = gap;
      [state[gap], state[tile]] = [state[tile], state[gap]];
      gap = tile;
      path.push(tile);
      const result = search(moves + 1, limit, oldGap);
      if (result === true) return true;
      path.pop();
      gap = oldGap;
      [state[gap], state[tile]] = [state[tile], state[gap]];
      nextLimit = Math.min(nextLimit, result);
    }
    return nextLimit;
  };
  if (!isSolvable(board, size)) return null;
  for (let limit = distance(); ; ) {
    const result = search(0, limit, -1);
    if (result === true) return path.slice();
    limit = result;
  }
}
