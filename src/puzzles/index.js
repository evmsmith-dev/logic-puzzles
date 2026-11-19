// The puzzles in the app. Each one describes itself for Home and How to Play, makes new
// puzzles from a seed, and applies taps. `grid` gives the board's columns and rows, and
// `look` how tightly its squares sit (the gap between them and the biggest a square may get). Everything here is plain data in, plain data out,
// so a game in progress can be saved as JSON and restored after the app closes.
import { LIGHTS_OUT_LEVELS, createLightsOut, isSolved as lightsOff, press, solve } from "./lights-out.js";
import { MINESWEEPER_LEVELS, around, createMinesweeper, isCleared, open } from "./minesweeper.js";
import { PEG_LEVELS, applyJump, createPegJump, fullBoard, goodJump, has, holeCount, legalJumps, pegsLeft, rating, rowCol } from "./peg-jump.js";
import { QUEEN, QUEENS_LEVELS, CROSS, clashingQueens, createQueens, isSolved as queensPlaced, nextMark, solveByLogic } from "./queens.js";
import { SLIDING_LEVELS, createSlidingTiles, isSolved as tilesInOrder, slide, solveSmall } from "./sliding-tiles.js";

export const LEVELS = ["easy", "medium", "hard"];
export const LEVEL_NAMES = { easy: "Easy", medium: "Medium", hard: "Hard" };
export const DAILY_LEVEL = "medium";

const lightsOut = {
  id: "lights-out",
  name: "Lights Out",
  emoji: "💡",
  tagline: "Turn every light off",
  sizes: Object.fromEntries(Object.entries(LIGHTS_OUT_LEVELS).map(([level, { size }]) => [level, `${size}×${size}`])),
  rules: [
    "Tap a light to flip it and the lights above, below, left and right of it.",
    "Lit squares turn off, and dark squares turn on.",
    "Turn every light off to win. Try to do it in the fewest taps!",
  ],
  create(level, seed) {
    const { size, board, par } = createLightsOut(level, seed);
    return { size, start: board, board, par };
  },
  restart: (state) => ({ ...state, board: state.start }),
  tap(state, index) {
    return { state: { ...state, board: press(state.board, state.size, index) }, moved: 1 };
  },
  isWon: (state) => lightsOff(state.board),
  hint: (state) => solve(state.board, state.size)?.[0] ?? null,
  grid: (state) => [state.size, state.size],
  look: { gap: 8, cap: 110 },
};

const slidingTiles = {
  id: "sliding-tiles",
  name: "Sliding Tiles",
  emoji: "🔢",
  tagline: "Put the numbers in order",
  sizes: Object.fromEntries(Object.entries(SLIDING_LEVELS).map(([level, { size }]) => [level, `${size}×${size}`])),
  rules: [
    "Tap a tile next to the empty space to slide it in.",
    "Tap a tile further along the same row or column to slide the whole line at once.",
    "Put the tiles in order — 1, 2, 3… — with the space in the bottom-right corner.",
  ],
  create(level, seed) {
    const { size, board, par } = createSlidingTiles(level, seed);
    return { size, start: board, board, par };
  },
  restart: (state) => ({ ...state, board: state.start }),
  tap(state, index) {
    const { board, moved } = slide(state.board, state.size, index);
    return { state: { ...state, board }, moved };
  },
  isWon: (state) => tilesInOrder(state.board),
  // Hints need the exact solver, which is only quick enough for the 3×3 board.
  hint: (state) => (state.size === 3 ? solveSmall(state.board)?.[0] ?? null : null),
  hasHint: (state) => state.size === 3,
  grid: (state) => [state.size, state.size],
  look: { gap: 8, cap: 110 },
};

const minesweeper = {
  id: "minesweeper",
  name: "Minesweeper",
  emoji: "💣",
  tagline: "Clear the field — no guessing needed",
  sizes: Object.fromEntries(Object.entries(MINESWEEPER_LEVELS).map(([level, { cols, rows, mines }]) => [level, `${cols}×${rows} · ${mines} mines`])),
  rules: [
    "Each number tells you how many mines touch that square (including corners).",
    "Tap a square to dig it. Switch to 🚩 Flag (or press and hold) to mark a mine.",
    "Tap a number whose mines are all flagged to dig the squares around it.",
    "Every board can be solved by logic alone — you never need to guess.",
  ],
  create(level, seed) {
    const { cols, rows, mines, counts, revealed } = createMinesweeper(level, seed);
    return { cols, rows, mines, counts, start: revealed, revealed, flags: mines.map(() => false), exploded: null, par: null };
  },
  restart: (state) => ({ ...state, revealed: state.start, flags: state.mines.map(() => false), exploded: null }),
  tap(state, index, { flagMode = false } = {}) {
    const { cols, rows, mines, counts } = state;
    if (state.revealed[index]) {
      // Tapping an open number whose mines are all flagged digs everything else around it.
      const neighbors = around(cols, rows, index);
      const flagged = neighbors.filter((cell) => state.flags[cell]).length;
      const toDig = neighbors.filter((cell) => !state.flags[cell] && !state.revealed[cell]);
      if (counts[index] === 0 || flagged !== counts[index] || !toDig.length) return { state, moved: 0 };
      const hit = toDig.find((cell) => mines[cell]);
      if (hit !== undefined) return { state: { ...state, exploded: hit }, moved: 1 };
      let revealed = state.revealed;
      for (const cell of toDig) revealed = open(revealed, counts, mines, cols, rows, cell);
      return { state: { ...state, revealed }, moved: 1 };
    }
    if (flagMode) {
      const flags = state.flags.slice();
      flags[index] = !flags[index];
      return { state: { ...state, flags }, moved: 0 };
    }
    if (state.flags[index]) return { state, moved: 0 }; // flagged squares are protected
    if (mines[index]) return { state: { ...state, exploded: index }, moved: 1 };
    return { state: { ...state, revealed: open(state.revealed, counts, mines, cols, rows, index) }, moved: 1 };
  },
  flag(state, index) {
    if (state.revealed[index]) return state;
    const flags = state.flags.slice();
    flags[index] = !flags[index];
    return { ...state, flags };
  },
  isWon: (state) => state.exploded === null && isCleared(state.revealed, state.mines),
  isLost: (state) => state.exploded !== null,
  // A hidden square next to the open area that is safe to dig.
  hint(state) {
    const { cols, rows, mines, revealed, flags } = state;
    for (let i = 0; i < mines.length; i++) {
      if (revealed[i] || mines[i] || flags[i]) continue;
      if (around(cols, rows, i).some((cell) => revealed[cell])) return i;
    }
    return null;
  },
  hintText: () => "That square is safe to dig.",
  lostResult: () => ({
    emoji: "💥",
    title: "Boom!",
    text: "That square had a mine. Every board can be solved without guessing — try this one again?",
  }),
  showMoves: false,
  minesLeft: (state) => state.mines.filter(Boolean).length - state.flags.filter(Boolean).length,
  counter: (state) => ["Mines left", minesweeper.minesLeft(state)],
  grid: (state) => [state.cols, state.rows],
  look: { gap: 3, cap: 56 },
};

const queens = {
  id: "queens",
  name: "Queens",
  // New since the first version: older daily streaks don't need it (see dailyIds in main.js).
  addedLater: true,
  emoji: "👑",
  tagline: "One queen in every row, column and color",
  sizes: Object.fromEntries(Object.entries(QUEENS_LEVELS).map(([level, { size }]) => [level, `${size}×${size}`])),
  rules: [
    "Place one 👑 in every row, every column and every colored region.",
    "Queens can't touch each other — not even at a corner.",
    "Tap a square once to mark it ✕ (no queen here), twice for a 👑, and again to clear it.",
    "Queens that break a rule turn red. Every puzzle can be solved by logic alone.",
  ],
  create(level, seed) {
    const { size, regions, answer } = createQueens(level, seed);
    const start = new Array(size * size).fill(0);
    return { size, regions, answer, start, marks: start, par: null };
  },
  restart: (state) => ({ ...state, marks: state.start }),
  tap(state, index) {
    const marks = state.marks.slice();
    marks[index] = nextMark(marks[index]);
    return { state: { ...state, marks }, moved: 1 };
  },
  isWon: (state) => queensPlaced(state.regions, state.size, state.marks),
  // First a queen in the wrong place, then a ✕ over a queen's square, then the next queen
  // a player could work out.
  hint(state) {
    const { size, regions, answer, marks } = state;
    const wrong = marks.findIndex((mark, i) => mark === QUEEN && !answer.includes(i));
    if (wrong !== -1) return wrong;
    const covered = answer.find((cell) => marks[cell] === CROSS);
    if (covered !== undefined) return covered;
    const { order } = solveByLogic(regions, size);
    return order.find((cell) => marks[cell] !== QUEEN) ?? null;
  },
  hintText(state, index) {
    if (!state.answer.includes(index)) return "That queen doesn't belong there.";
    return state.marks[index] === CROSS ? "A queen goes under that ✕." : "A queen goes in the glowing square.";
  },
  counter: (state) => ["Queens", `${state.marks.filter((mark) => mark === QUEEN).length}/${state.size}`],
  clashes: (state) => clashingQueens(state.regions, state.size, state.marks),
  grid: (state) => [state.size, state.size],
  look: { gap: 0, cap: 72 },
};

const pegJump = {
  id: "peg-jump",
  name: "Peg Jump",
  emoji: "🔺",
  tagline: "Jump pegs until only one is left",
  daily: false, // not part of the daily set
  sizes: Object.fromEntries(Object.entries(PEG_LEVELS).map(([level, { rows }]) => [level, `${holeCount(rows)} holes`])),
  rules: [
    "Tap a peg, then the empty hole it should land in. A peg jumps over one neighbor in a straight line, and the jumped peg comes off.",
    "Keep jumping until no jumps are left. Finish with just one peg to win.",
    "The fewer pegs left the better: 1 is Genius, 2 is Pretty smart, 3 is Not bad.",
    "↶ Undo takes back a jump. 💡 Hint shows a jump that can still finish with one peg.",
  ],
  create(level, seed) {
    const { rows, start, pegs } = createPegJump(level, seed);
    return { rows, start, pegs, selected: null, history: [], par: null };
  },
  restart: (state) => ({ ...state, pegs: fullBoard(state.rows) & ~(1 << state.start), selected: null, history: [] }),
  // Tap a peg to pick it up, then an empty hole to jump there. Tapping an empty hole that only
  // one peg can reach makes that jump straight away.
  tap(state, index) {
    const { rows, pegs, selected } = state;
    const select = (peg) => ({ state: { ...state, selected: peg }, moved: 0 });
    const jump = (move) => ({
      state: { ...state, pegs: applyJump(pegs, move), selected: null, history: [...state.history, pegs] },
      moved: 1,
    });
    if (has(pegs, index)) return select(selected === index ? null : index);
    const jumps = legalJumps(rows, pegs);
    if (selected !== null) {
      const move = jumps.find(([from, , to]) => from === selected && to === index);
      return move ? jump(move) : select(null);
    }
    const into = jumps.filter(([, , to]) => to === index);
    return into.length === 1 ? jump(into[0]) : { state, moved: 0 };
  },
  undo: (state) => (state.history.length
    ? { ...state, pegs: state.history.at(-1), history: state.history.slice(0, -1), selected: null }
    : state),
  canUndo: (state) => state.history.length > 0,
  isWon: (state) => pegsLeft(state.pegs) === 1,
  isLost: (state) => pegsLeft(state.pegs) > 1 && legalJumps(state.rows, state.pegs).length === 0,
  winText: () => "Genius! Just one peg left.",
  lostResult(state) {
    const left = pegsLeft(state.pegs);
    const { emoji, words } = rating(left);
    return {
      emoji,
      title: `${left} pegs left — ${words}`,
      text: "No more jumps. Undo a few jumps or start over to get down to one peg.",
      undo: true,
    };
  },
  /** The peg to move and the hole it lands in. */
  hint(state) {
    const move = goodJump(state.rows, state.pegs);
    return move ? [move[0], move[2]] : null;
  },
  hintText: () => "Jump the glowing peg into the glowing hole.",
  noHintText: () => "One peg isn't possible from here any more. Undo a few jumps and try another way.",
  counter: (state) => ["Pegs left", pegsLeft(state.pegs)],
  showMoves: false,
  // The triangle sits on a grid of half-width columns, so each row is shifted by half a hole.
  grid: (state) => [state.rows, state.rows],
  cellCount: (state) => holeCount(state.rows),
  place(state, index) {
    const [row, col] = rowCol(index);
    return { row: row + 1, col: state.rows - row + 2 * col };
  },
  look: { gap: 6, cap: 84, pad: 24 },
};

export const PUZZLES = [lightsOut, slidingTiles, minesweeper, queens, pegJump];

/** The puzzles in the daily set. */
export const DAILY_PUZZLES = PUZZLES.filter((puzzle) => puzzle.daily !== false);
export const puzzleById = (id) => PUZZLES.find((puzzle) => puzzle.id === id);
