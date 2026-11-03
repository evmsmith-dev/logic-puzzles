// Minesweeper, made for logic: every board starts with an open area and can be solved by
// reasoning alone, so no guessing is ever needed. Numbers show how many of the (up to 8)
// surrounding squares hide a mine. Pure functions; boards are arrays, row by row.
import { randomInt, seededRandom } from "../lib/random.js";

export const MINESWEEPER_LEVELS = {
  easy: { cols: 8, rows: 8, mines: 10 },
  medium: { cols: 9, rows: 12, mines: 20 },
  hard: { cols: 10, rows: 14, mines: 30 },
};

export function around(cols, rows, index) {
  const row = Math.floor(index / cols);
  const col = index % cols;
  const cells = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = row + dr;
      const c = col + dc;
      if ((dr || dc) && r >= 0 && r < rows && c >= 0 && c < cols) cells.push(r * cols + c);
    }
  }
  return cells;
}

/** How many mines touch each square. */
export function countMines(mines, cols, rows) {
  return mines.map((_, i) => around(cols, rows, i).filter((cell) => mines[cell]).length);
}

/** Opens `index`, spreading through squares with no mines around them. Returns the new revealed array. */
export function open(revealed, counts, mines, cols, rows, index) {
  const next = revealed.slice();
  const stack = [index];
  while (stack.length) {
    const cell = stack.pop();
    if (next[cell] || mines[cell]) continue;
    next[cell] = true;
    if (counts[cell] === 0) stack.push(...around(cols, rows, cell));
  }
  return next;
}

/**
 * Plays the board using only safe reasoning. Returns true if it can be finished without
 * guessing. Rules used: a number whose mines are all found makes the rest of its squares safe;
 * a number with as many hidden squares as missing mines makes them all mines; and comparing two
 * numbers whose hidden squares overlap (one set inside the other).
 */
export function solvableWithoutGuessing({ cols, rows, mines, counts, revealed: start }) {
  const total = mines.filter(Boolean).length;
  let revealed = start.slice();
  const known = new Array(mines.length).fill(false); // squares known to be mines
  const safeCount = mines.length - total;
  for (;;) {
    if (revealed.filter(Boolean).length === safeCount) return true;
    const safe = new Set();
    const mine = new Set();
    const constraints = [];
    for (let i = 0; i < mines.length; i++) {
      if (!revealed[i] || counts[i] === 0) continue;
      const hidden = around(cols, rows, i).filter((cell) => !revealed[cell] && !known[cell]);
      if (!hidden.length) continue;
      const left = counts[i] - around(cols, rows, i).filter((cell) => known[cell]).length;
      if (left === 0) hidden.forEach((cell) => safe.add(cell));
      else if (left === hidden.length) hidden.forEach((cell) => mine.add(cell));
      else constraints.push({ cells: hidden, left });
    }
    if (!safe.size && !mine.size) {
      for (const a of constraints) {
        for (const b of constraints) {
          if (a === b || a.cells.length >= b.cells.length || !a.cells.every((cell) => b.cells.includes(cell))) continue;
          const rest = b.cells.filter((cell) => !a.cells.includes(cell));
          const restMines = b.left - a.left;
          if (restMines === 0) rest.forEach((cell) => safe.add(cell));
          else if (restMines === rest.length) rest.forEach((cell) => mine.add(cell));
        }
      }
    }
    if (!safe.size && !mine.size) {
      // Last resort: the total mine count.
      const unknown = mines.map((_, i) => i).filter((i) => !revealed[i] && !known[i]);
      const minesLeft = total - known.filter(Boolean).length;
      if (minesLeft === 0) unknown.forEach((cell) => safe.add(cell));
      else if (minesLeft === unknown.length) unknown.forEach((cell) => mine.add(cell));
      else return false;
    }
    for (const cell of mine) known[cell] = true;
    for (const cell of safe) revealed = open(revealed, counts, mines, cols, rows, cell);
  }
}

/**
 * A new board: a random start square (and its neighbors) is kept clear and opened, and the
 * board is redrawn until it can be solved without guessing.
 */
export function createMinesweeper(level, seed) {
  const { cols, rows, mines: mineCount } = MINESWEEPER_LEVELS[level];
  const random = seededRandom(`minesweeper|${level}|${seed}`);
  const size = cols * rows;
  for (;;) {
    // Start somewhere in the middle half of the board, so the opening has room to spread.
    const startRow = Math.floor(rows / 4) + randomInt(random, Math.ceil(rows / 2));
    const startCol = Math.floor(cols / 4) + randomInt(random, Math.ceil(cols / 2));
    const start = startRow * cols + startCol;
    const clear = new Set([start, ...around(cols, rows, start)]);
    const mines = new Array(size).fill(false);
    let placed = 0;
    while (placed < mineCount) {
      const cell = randomInt(random, size);
      if (mines[cell] || clear.has(cell)) continue;
      mines[cell] = true;
      placed++;
    }
    const counts = countMines(mines, cols, rows);
    const revealed = open(new Array(size).fill(false), counts, mines, cols, rows, start);
    if (solvableWithoutGuessing({ cols, rows, mines, counts, revealed })) {
      return { cols, rows, mines, counts, revealed, start };
    }
  }
}

/** Whether every square without a mine is open. */
export const isCleared = (revealed, mines) => revealed.every((open, i) => open || mines[i]);
