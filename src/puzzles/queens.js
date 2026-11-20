// Queens: the board is split into colored regions. Place one queen in every row, every column
// and every region, with no two queens touching, not even at a corner.
// Pure functions. A board is a list of region numbers, row by row; marks are 0 empty, 1 ✕,
// 2 queen, 3 an automatic ✕ (placed by the auto-✕ setting, and cleared again with its queen).
import { randomInt, seededRandom, shuffle } from "../lib/random.js";

export const EMPTY = 0;
export const CROSS = 1;
export const QUEEN = 2;
export const AUTO_CROSS = 3;

// `rules` is the hardest kind of reasoning a puzzle may need (see "Solving like a person"), and
// `needs` the kind it must need at least once, so Medium and Hard really are harder than Easy.
export const QUEENS_LEVELS = {
  easy: { size: 6, rules: 1, needs: 1 },
  medium: { size: 7, rules: 2, needs: 2 },
  hard: { size: 8, rules: 3, needs: 3 },
};

const MAX_TRIES = 400;

/** Squares touching `index`, corners included. */
export function touching(size, index) {
  const row = Math.floor(index / size);
  const col = index % size;
  const cells = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = row + dr;
      const c = col + dc;
      if ((dr || dc) && r >= 0 && r < size && c >= 0 && c < size) cells.push(r * size + c);
    }
  }
  return cells;
}

/** True if queens on squares `a` and `b` would break a rule. */
export function clash(regions, size, a, b) {
  if (a === b) return false;
  const ra = Math.floor(a / size);
  const rb = Math.floor(b / size);
  const ca = a % size;
  const cb = b % size;
  return ra === rb || ca === cb || regions[a] === regions[b] || (Math.abs(ra - rb) <= 1 && Math.abs(ca - cb) <= 1);
}

/** Queens that break a rule with another queen, as a set of squares (shown in red). */
export function clashingQueens(regions, size, marks) {
  const queens = [];
  marks.forEach((mark, i) => { if (mark === QUEEN) queens.push(i); });
  const bad = new Set();
  for (let i = 0; i < queens.length; i++) {
    for (let j = i + 1; j < queens.length; j++) {
      if (clash(regions, size, queens[i], queens[j])) {
        bad.add(queens[i]);
        bad.add(queens[j]);
      }
    }
  }
  return bad;
}

/** Solved when there are `size` queens and none of them clash. */
export function isSolved(regions, size, marks) {
  const queens = marks.filter((mark) => mark === QUEEN).length;
  return queens === size && clashingQueens(regions, size, marks).size === 0;
}

/** Tapping a square cycles it: empty → queen → ✕ → empty. An automatic ✕ acts like empty. */
export const nextMark = (mark) => ({ [EMPTY]: QUEEN, [QUEEN]: CROSS, [CROSS]: EMPTY, [AUTO_CROSS]: QUEEN })[mark];

/** Redoes the automatic ✕s: every empty square that clashes with a queen gets one. */
export function withAutoCrosses(regions, size, marks) {
  const next = marks.map((mark) => (mark === AUTO_CROSS ? EMPTY : mark));
  const queens = [];
  next.forEach((mark, i) => { if (mark === QUEEN) queens.push(i); });
  for (let i = 0; i < next.length; i++) {
    if (next[i] === EMPTY && queens.some((q) => clash(regions, size, q, i))) next[i] = AUTO_CROSS;
  }
  return next;
}

/** How many answers the board has, stopping at `limit`. */
export const countSolutions = (regions, size, limit = 2) => findSolutions(regions, size, limit).length;

/** Up to `limit` answers, each a list of queen squares from the top row down. */
export function findSolutions(regions, size, limit = 2) {
  const found = [];
  const cols = [];
  const usedRegion = new Array(size).fill(false);
  const usedCol = new Array(size).fill(false);
  const place = (row) => {
    if (row === size) {
      found.push(cols.map((col, r) => r * size + col));
      return;
    }
    for (let col = 0; col < size && found.length < limit; col++) {
      const region = regions[row * size + col];
      if (usedCol[col] || usedRegion[region] || (row > 0 && Math.abs(col - cols[row - 1]) <= 1)) continue;
      usedCol[col] = usedRegion[region] = true;
      cols.push(col);
      place(row + 1);
      cols.pop();
      usedCol[col] = usedRegion[region] = false;
    }
  };
  place(0);
  return found;
}

// ---------- Solving like a person ----------
//
// The board is solved one step at a time, the way a player would, using rules of three levels:
//  1. A row, column or region with one square left needs its queen there; and a square that
//     clashes with every square left in some row, column or region can't hold a queen.
//  2. When N regions fit inside N rows (or columns), the rest of those rows can't hold a
//     queen, and the other way round.
//  3. "What if": if a queen on a square would leave some row, column or region with nowhere
//     to go, that square is out.

function units(regions, size) {
  const rows = [];
  const cols = [];
  const regs = Array.from({ length: size }, () => []);
  for (let r = 0; r < size; r++) {
    rows.push([]);
    cols.push([]);
  }
  for (let i = 0; i < size * size; i++) {
    rows[Math.floor(i / size)].push(i);
    cols[i % size].push(i);
    regs[regions[i]].push(i);
  }
  return { rows, cols, regs, all: [...rows, ...cols, ...regs] };
}

/** Places a queen and rules out every square it clashes with. Returns false on a contradiction. */
function placeQueen(ctx, open, queens, index, reason = null) {
  if (!open[index]) return false;
  queens[index] = true;
  ctx.order?.push(index);
  if (ctx.reasons && reason) ctx.reasons[index] = reason;
  for (let i = 0; i < open.length; i++) if (i !== index && clash(ctx.regions, ctx.size, index, i)) open[i] = false;
  return true;
}

const hasQueen = (unit, queens) => unit.some((i) => queens[i]);

/** Rule 1, repeated until nothing changes. Returns false on a contradiction. */
function basicSteps(ctx, open, queens) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const [n, unit] of ctx.all.entries()) {
      if (hasQueen(unit, queens)) continue;
      const left = unit.filter((i) => open[i]);
      if (!left.length) return false;
      if (left.length === 1) {
        const kind = ["row", "column", "region"][Math.floor(n / ctx.size)];
        placeQueen(ctx, open, queens, left[0], { kind, which: n % ctx.size });
        changed = true;
        continue;
      }
      // Squares that clash with every square left in this unit.
      for (let i = 0; i < open.length; i++) {
        if (!open[i] || left.includes(i)) continue;
        if (left.every((j) => clash(ctx.regions, ctx.size, i, j))) {
          open[i] = false;
          changed = true;
        }
      }
    }
  }
  return true;
}

/**
 * Rule 2: when the squares left in N regions all lie in N rows (or columns), those regions fill
 * those rows, so the rest of the rows is out. The same works with rows (or columns) that fit
 * inside N regions. Makes one change and returns true, or returns false.
 */
function groupStep(ctx, open, queens) {
  const { size, regions } = ctx;
  const rowOf = (i) => Math.floor(i / size);
  const colOf = (i) => i % size;
  const regionOf = (i) => regions[i];
  const pairs = [
    [ctx.regs, regionOf, ctx.rows, rowOf],
    [ctx.regs, regionOf, ctx.cols, colOf],
    [ctx.rows, rowOf, ctx.regs, regionOf],
    [ctx.cols, colOf, ctx.regs, regionOf],
  ];
  for (const [groups, groupOf, spans, spanOf] of pairs) {
    const left = groups.map((cells, n) => (hasQueen(cells, queens) ? null : n)).filter((n) => n !== null);
    for (const group of subsets(left, Math.min(3, left.length - 1))) {
      const covered = new Set();
      for (const n of group) for (const cell of groups[n]) if (open[cell]) covered.add(spanOf(cell));
      if (covered.size !== group.length) continue;
      let changed = false;
      for (const span of covered) {
        for (const cell of spans[span]) {
          if (open[cell] && !group.includes(groupOf(cell))) {
            open[cell] = false;
            changed = true;
          }
        }
      }
      if (changed) return true;
    }
  }
  return false;
}

function* subsets(items, maxSize) {
  const pick = (start, chosen) => {
    const out = [];
    if (chosen.length) out.push(chosen.slice());
    if (chosen.length === maxSize) return out;
    for (let i = start; i < items.length; i++) {
      chosen.push(items[i]);
      out.push(...pick(i + 1, chosen));
      chosen.pop();
    }
    return out;
  };
  yield* pick(0, []);
}

/** Rule 3: rules out one square whose queen would leave a row, column or region empty. */
function whatIfStep(ctx, open, queens) {
  const trial = { ...ctx, order: null, reasons: null }; // trial queens aren't part of the answer
  for (let i = 0; i < open.length; i++) {
    if (!open[i] || queens[i]) continue;
    const tryOpen = open.slice();
    const tryQueens = queens.slice();
    placeQueen(trial, tryOpen, tryQueens, i);
    if (!basicSteps(trial, tryOpen, tryQueens)) {
      open[i] = false;
      return true;
    }
  }
  return false;
}

/**
 * Solves the board step by step with rules up to `maxRule`. Returns { solved, hardest, order,
 * reasons }: `hardest` is the highest rule the solve needed, `order` lists the queens in the
 * order they were found, and `reasons[cell]` says which row, column or region had only that
 * square left ({ kind, which }). Hints use the last two.
 */
export function solveByLogic(regions, size, maxRule = 3) {
  const ctx = { regions, size, ...units(regions, size) };
  const open = new Array(size * size).fill(true);
  const queens = new Array(size * size).fill(false);
  const order = [];
  const reasons = {};
  ctx.order = order;
  ctx.reasons = reasons;
  let hardest = 1;
  for (;;) {
    if (!basicSteps(ctx, open, queens)) return { solved: false, hardest, order, reasons };
    if (order.length === size) return { solved: true, hardest, order, reasons };
    if (maxRule >= 2 && groupStep(ctx, open, queens)) {
      hardest = Math.max(hardest, 2);
      continue;
    }
    if (maxRule >= 3 && whatIfStep(ctx, open, queens)) {
      hardest = 3;
      continue;
    }
    return { solved: false, hardest, order, reasons };
  }
}

// ---------- Making puzzles ----------

/** Queens for the answer: one per row and column, none touching. */
function randomAnswer(size, random) {
  const cols = [];
  const used = new Array(size).fill(false);
  const place = (row) => {
    if (row === size) return true;
    for (const col of shuffle([...Array(size).keys()], random)) {
      if (used[col] || (row > 0 && Math.abs(col - cols[row - 1]) <= 1)) continue;
      used[col] = true;
      cols.push(col);
      if (place(row + 1)) return true;
      cols.pop();
      used[col] = false;
    }
    return false;
  };
  place(0);
  return cols.map((col, row) => row * size + col);
}

/** Grows one region around each answer queen until every square belongs to one. */
function sides(size, i) {
  const r = Math.floor(i / size);
  const c = i % size;
  return [r > 0 && i - size, r < size - 1 && i + size, c > 0 && i - 1, c < size - 1 && i + 1].filter((n) => n !== false);
}

function growRegions(size, answer, random) {
  const regions = new Array(size * size).fill(-1);
  answer.forEach((cell, region) => { regions[cell] = region; });
  let left = size * size - size;
  const side = (i) => sides(size, i);
  while (left > 0) {
    // Pick a random unclaimed square next to a region and join it to one of its neighbors.
    const edge = [];
    for (let i = 0; i < regions.length; i++) if (regions[i] === -1 && side(i).some((n) => regions[n] !== -1)) edge.push(i);
    const cell = edge[randomInt(random, edge.length)];
    const owners = side(cell).map((n) => regions[n]).filter((r) => r !== -1);
    regions[cell] = owners[randomInt(random, owners.length)];
    left--;
  }
  return regions;
}

/** True if the region still joins up without square `skip`. */
function staysJoined(regions, size, skip) {
  const region = regions[skip];
  const cells = [];
  for (let i = 0; i < regions.length; i++) if (i !== skip && regions[i] === region) cells.push(i);
  if (!cells.length) return false;
  const seen = new Set([cells[0]]);
  const queue = [cells[0]];
  while (queue.length) {
    for (const n of sides(size, queue.pop())) {
      if (n !== skip && regions[n] === region && !seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return seen.size === cells.length;
}

/**
 * Random regions usually allow more than one answer. This moves squares between regions to
 * rule out the other answers one by one, keeping the planned answer. Returns null if it gets stuck.
 */
function makeUnique(regions, size, answer, random, steps = 80) {
  const next = regions.slice();
  const keep = new Set(answer);
  for (let step = 0; step < steps; step++) {
    const other = findSolutions(next, size, 2).find((s) => s.some((cell) => !keep.has(cell)));
    if (!other) return next;
    // Move one of the other answer's queens into a neighboring region, which breaks that answer.
    const moves = [];
    for (const cell of other) {
      if (keep.has(cell) || !staysJoined(next, size, cell)) continue;
      for (const n of sides(size, cell)) if (next[n] !== next[cell]) moves.push([cell, next[n]]);
    }
    if (!moves.length) return null;
    const [cell, region] = moves[randomInt(random, moves.length)];
    next[cell] = region;
  }
  return null;
}

/**
 * A new puzzle for `level`, the same every time for the same seed. Every puzzle has exactly
 * one answer and can be solved by reasoning alone, with no guessing.
 */
export function createQueens(level, seed) {
  const { size, rules, needs } = QUEENS_LEVELS[level];
  const random = seededRandom(`queens-${level}-${seed}`);
  let fallback = null;
  for (let tries = 0; tries < MAX_TRIES || !fallback; tries++) {
    const answer = randomAnswer(size, random);
    const regions = makeUnique(growRegions(size, answer, random), size, answer, random);
    if (!regions) continue;
    const { solved, hardest } = solveByLogic(regions, size, rules);
    if (!solved) continue;
    if (hardest >= needs) return { size, regions, answer };
    fallback ??= { size, regions, answer };
  }
  // Very unlikely: no puzzle needing this level's harder reasoning turned up, so use an easier one.
  return fallback;
}
