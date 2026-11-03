// The puzzles in the app. Each one describes itself for Home and How to Play, makes new
// puzzles from a seed, and applies taps. Everything here is plain data in, plain data out,
// so a game in progress can be saved as JSON and restored after the app closes.
import { LIGHTS_OUT_LEVELS, createLightsOut, isSolved as lightsOff, press, solve } from "./lights-out.js";
import { MINESWEEPER_LEVELS, around, createMinesweeper, isCleared, open } from "./minesweeper.js";
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
  minesLeft: (state) => state.mines.filter(Boolean).length - state.flags.filter(Boolean).length,
};

export const PUZZLES = [lightsOut, slidingTiles, minesweeper];
export const puzzleById = (id) => PUZZLES.find((puzzle) => puzzle.id === id);
