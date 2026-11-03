// Lights Out: tapping a light flips it and the lights above, below, left and right of it.
// The goal is to turn every light off. Pure functions; the board is an array of 0/1, row by row.
import { randomInt, seededRandom } from "../lib/random.js";

export const LIGHTS_OUT_LEVELS = {
  easy: { size: 4, presses: 4 },
  medium: { size: 5, presses: 7 },
  hard: { size: 6, presses: 12 },
};

const neighbors = (size, index) => {
  const row = Math.floor(index / size);
  const col = index % size;
  const cells = [index];
  if (row > 0) cells.push(index - size);
  if (row < size - 1) cells.push(index + size);
  if (col > 0) cells.push(index - 1);
  if (col < size - 1) cells.push(index + 1);
  return cells;
};

/** The board after tapping `index`. */
export function press(board, size, index) {
  const next = board.slice();
  for (const cell of neighbors(size, index)) next[cell] ^= 1;
  return next;
}

export const isSolved = (board) => board.every((light) => light === 0);

/**
 * The fewest taps that turn every light off, as a list of cells, or null if the board can't
 * be solved. Solves the flips as equations over GF(2) (each tap either happens or doesn't),
 * then tries every combination of "taps that change nothing" to find the shortest answer.
 */
export function solve(board, size) {
  const n = size * size;
  const rhsBit = 1n << BigInt(n);
  const rows = [];
  for (let i = 0; i < n; i++) {
    let row = board[i] ? rhsBit : 0n;
    for (const cell of neighbors(size, i)) row |= 1n << BigInt(cell);
    rows.push(row);
  }
  const pivotCols = [];
  let rank = 0;
  for (let col = 0; col < n && rank < n; col++) {
    const bit = 1n << BigInt(col);
    const found = rows.findIndex((row, r) => r >= rank && (row & bit));
    if (found === -1) continue;
    [rows[rank], rows[found]] = [rows[found], rows[rank]];
    for (let r = 0; r < n; r++) if (r !== rank && (rows[r] & bit)) rows[r] ^= rows[rank];
    pivotCols.push(col);
    rank++;
  }
  // No solution if a row says 0 = 1.
  for (let r = rank; r < n; r++) if (rows[r] === rhsBit) return null;

  const freeCols = [];
  for (let col = 0; col < n; col++) if (!pivotCols.includes(col)) freeCols.push(col);
  const solutionFor = (freeValues) => {
    const taps = new Array(n).fill(0);
    freeCols.forEach((col, i) => { taps[col] = freeValues[i]; });
    pivotCols.forEach((col, r) => {
      let value = rows[r] & rhsBit ? 1 : 0;
      for (const free of freeCols) if (taps[free] && (rows[r] & (1n << BigInt(free)))) value ^= 1;
      taps[col] = value;
    });
    return taps;
  };
  let best = null;
  for (let mask = 0; mask < 1 << freeCols.length; mask++) {
    const taps = solutionFor(freeCols.map((_, i) => (mask >> i) & 1));
    const count = taps.reduce((sum, tap) => sum + tap, 0);
    if (!best || count < best.count) best = { taps, count };
  }
  return best.taps.flatMap((tap, cell) => (tap ? [cell] : []));
}

/** A new puzzle: tap random lights on a dark board, so it can always be solved. */
export function createLightsOut(level, seed) {
  const { size, presses } = LIGHTS_OUT_LEVELS[level];
  const random = seededRandom(`lights-out|${level}|${seed}`);
  for (;;) {
    let board = new Array(size * size).fill(0);
    const tapped = new Set();
    while (tapped.size < presses) tapped.add(randomInt(random, size * size));
    for (const cell of tapped) board = press(board, size, cell);
    const fewest = solve(board, size);
    // Some tap patterns cancel out; keep only boards that need a real number of taps.
    if (!isSolved(board) && fewest.length >= Math.ceil(presses * 0.75)) {
      return { size, board, par: fewest.length };
    }
  }
}
