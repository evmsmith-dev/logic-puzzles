// Peg Jump: the triangle peg game. Every hole but one holds a peg. A peg jumps over a neighbor
// into an empty hole, and the jumped peg comes off. The goal is to leave just one peg.
// Pure functions. Holes are numbered row by row from the top; row r has r + 1 holes. The pegs
// are a bit mask: bit i is set when hole i holds a peg.
import { randomInt, seededRandom } from "../lib/random.js";

// Easy and Medium use the classic 15-hole board and differ by the empty starting hole: Easy
// starts come from the holes where random play most often still wins (worked out below).
export const PEG_LEVELS = {
  easy: { rows: 5 },
  medium: { rows: 5 },
  hard: { rows: 6 },
};

export const holeCount = (rows) => (rows * (rows + 1)) / 2;
export const holeAt = (row, col) => (row * (row + 1)) / 2 + col;

/** Row and position in the row of hole `index`. */
export function rowCol(index) {
  let row = 0;
  while (holeAt(row + 1, 0) <= index) row++;
  return [row, index - holeAt(row, 0)];
}

// The six directions on a triangle: along the row, and down or up each diagonal.
const DIRECTIONS = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1]];

const jumpCache = new Map();

/** Every possible jump on the board as [from, over, to]. */
export function allJumps(rows) {
  if (!jumpCache.has(rows)) {
    const jumps = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col <= row; col++) {
        for (const [dr, dc] of DIRECTIONS) {
          const r = row + 2 * dr;
          const c = col + 2 * dc;
          if (r >= 0 && r < rows && c >= 0 && c <= r) jumps.push([holeAt(row, col), holeAt(row + dr, col + dc), holeAt(r, c)]);
        }
      }
    }
    jumpCache.set(rows, jumps);
  }
  return jumpCache.get(rows);
}

/** 1 if hole `i` holds a peg. */
export const has = (pegs, i) => (pegs >>> i) & 1;

/** Jumps that can be made now. */
export const legalJumps = (rows, pegs) =>
  allJumps(rows).filter(([from, over, to]) => has(pegs, from) && has(pegs, over) && !has(pegs, to));

export const applyJump = (pegs, [from, over, to]) => (pegs & ~(1 << from) & ~(1 << over)) | (1 << to);

export function pegsLeft(pegs) {
  let count = 0;
  for (let p = pegs; p; p &= p - 1) count++;
  return count;
}

export const fullBoard = (rows) => 2 ** holeCount(rows) - 1;

// ---------- Solving ----------

const winCache = new Map(); // rows → Int8Array: 0 not yet known, 1 one peg reachable, 2 not

/** True if one peg can still be reached from `pegs`. */
export function canFinish(rows, pegs) {
  if (!winCache.has(rows)) winCache.set(rows, new Int8Array(2 ** holeCount(rows)));
  const memo = winCache.get(rows);
  const jumps = allJumps(rows);
  const solve = (p) => {
    if (memo[p]) return memo[p] === 1;
    let win = pegsLeft(p) === 1;
    for (let i = 0; !win && i < jumps.length; i++) {
      const [from, over, to] = jumps[i];
      if (has(p, from) && has(p, over) && !has(p, to)) win = solve(applyJump(p, jumps[i]));
    }
    memo[p] = win ? 1 : 2;
    return win;
  };
  return solve(pegs);
}

/** A jump that keeps a one-peg finish possible, or null when there isn't one. */
export function goodJump(rows, pegs) {
  return legalJumps(rows, pegs).find((jump) => canFinish(rows, applyJump(pegs, jump))) ?? null;
}

/** The chance that someone jumping at random from `pegs` ends with one peg. */
export function randomWinChance(rows, pegs, memo = new Map()) {
  if (memo.has(pegs)) return memo.get(pegs);
  const jumps = legalJumps(rows, pegs);
  const chance = jumps.length
    ? jumps.reduce((sum, jump) => sum + randomWinChance(rows, applyJump(pegs, jump), memo), 0) / jumps.length
    : Number(pegsLeft(pegs) === 1);
  memo.set(pegs, chance);
  return chance;
}

const startCache = new Map();

/**
 * Starting holes for a level. Only holes that can lead to one peg count. On the 15-hole board,
 * Easy gets the holes where random play wins most often and Medium the rest.
 */
export function startHoles(level) {
  if (!startCache.has(level)) {
    const { rows } = PEG_LEVELS[level];
    const full = fullBoard(rows);
    const holes = [...Array(holeCount(rows)).keys()].filter((hole) => canFinish(rows, full & ~(1 << hole)));
    let starts = holes;
    if (level !== "hard") {
      // Rounded so holes that mirror each other land in the same group.
      const memo = new Map();
      const chance = new Map(holes.map((hole) => [hole, randomWinChance(rows, full & ~(1 << hole), memo).toFixed(4)]));
      const ranked = [...new Set(chance.values())].sort((a, b) => b - a);
      const easy = new Set(ranked.slice(0, Math.ceil(ranked.length / 2)));
      starts = holes.filter((hole) => easy.has(chance.get(hole)) === (level === "easy"));
    }
    startCache.set(level, starts);
  }
  return startCache.get(level);
}

/** A new board for `level`: the empty starting hole is picked from the seed. */
export function createPegJump(level, seed) {
  const { rows } = PEG_LEVELS[level];
  const starts = startHoles(level);
  const start = starts[randomInt(seededRandom(`peg-jump-${level}-${seed}`), starts.length)];
  return { rows, start, pegs: fullBoard(rows) & ~(1 << start) };
}

/** How a finish with `left` pegs is rated, like the board on the restaurant table. */
export function rating(left) {
  if (left <= 1) return { emoji: "🏆", words: "Genius!" };
  if (left === 2) return { emoji: "😎", words: "Pretty smart" };
  if (left === 3) return { emoji: "🙂", words: "Not bad" };
  return { emoji: "💪", words: "Keep practicing" };
}
