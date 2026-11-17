// Draws a puzzle's board as a grid of buttons. The whole board is redrawn after each move;
// boards are small (at most 140 squares), so this stays quick and keeps the code simple.
import { puzzleById } from "../puzzles/index.js";

const NUMBER_CLASS = ["", "n1", "n2", "n3", "n4", "n5", "n6", "n7", "n8"];

/** Columns and rows of the board. */
export const gridSize = (puzzleId, state) => puzzleById(puzzleId).grid(state);

function lightsCell(state, i) {
  const on = state.board[i] === 1;
  return { className: `cell light${on ? " is-on" : ""}`, label: `Light ${i + 1}, ${on ? "on" : "off"}`, text: "" };
}

function tileCell(state, i) {
  const tile = state.board[i];
  if (tile === 0) return { className: "cell tile is-gap", label: "Empty space", text: "" };
  const inPlace = tile === i + 1;
  return { className: `cell tile${inPlace ? " is-home" : ""}`, label: `Tile ${tile}`, text: String(tile) };
}

function mineCell(state, i, { finished }) {
  const { revealed, flags, mines, counts, exploded } = state;
  if (exploded !== null && mines[i]) {
    return { className: `cell mine is-open is-mine${i === exploded ? " is-exploded" : ""}`, label: "Mine", text: "💣" };
  }
  if (revealed[i]) {
    const count = counts[i];
    return { className: `cell mine is-open ${NUMBER_CLASS[count]}`, label: count ? `${count}` : "Empty", text: count ? String(count) : "" };
  }
  if (flags[i]) {
    const wrong = exploded !== null && !mines[i];
    return { className: `cell mine is-flag${wrong ? " is-wrong" : ""}`, label: "Flagged", text: wrong ? "❌" : "🚩" };
  }
  if (finished && mines[i]) return { className: "cell mine is-flag", label: "Mine", text: "🚩" };
  return { className: "cell mine", label: "Hidden", text: "" };
}

const QUEEN_TEXT = ["", "✕", "👑"];
const QUEEN_LABEL = ["Empty", "Marked ✕", "Queen"];

function queenCell(state, i, { clashes }) {
  const { size, regions, marks } = state;
  const region = regions[i];
  const row = Math.floor(i / size);
  const col = i % size;
  // Thick lines where the region ends.
  const edges = [
    row === 0 || regions[i - size] !== region ? " et" : "",
    col === size - 1 || regions[i + 1] !== region ? " er" : "",
    row === size - 1 || regions[i + size] !== region ? " eb" : "",
    col === 0 || regions[i - 1] !== region ? " el" : "",
  ].join("");
  const mark = marks[i];
  const clash = mark === 2 && clashes.has(i) ? " is-clash" : "";
  return {
    className: `cell queen q${region}${edges}${mark === 1 ? " is-cross" : ""}${mark === 2 ? " is-queen" : ""}${clash}`,
    label: `${QUEEN_LABEL[mark]}${clash ? ", breaks a rule" : ""}, region ${region + 1}`,
    text: QUEEN_TEXT[mark],
  };
}

const DRAW = { "lights-out": lightsCell, "sliding-tiles": tileCell, minesweeper: mineCell, queens: queenCell };

/** Redraws the board. `hint` is a square to highlight; `finished` locks the board. */
export function renderBoard(boardEl, puzzleId, state, { hint = null, finished = false } = {}) {
  const puzzle = puzzleById(puzzleId);
  const [cols, rows] = puzzle.grid(state);
  const count = cols * rows;
  const draw = DRAW[puzzleId];
  const clashes = puzzle.clashes?.(state) ?? new Set();
  boardEl.className = `board board-${puzzleId}${finished ? " is-finished" : ""}`;
  boardEl.style.setProperty("--cols", cols);
  const html = [];
  for (let i = 0; i < count; i++) {
    const { className, label, text } = draw(state, i, { finished, clashes });
    const row = Math.floor(i / cols) + 1;
    const col = (i % cols) + 1;
    html.push(`<button type="button" class="${className}${i === hint ? " is-hint" : ""}" data-index="${i}" `
      + `aria-label="${label}, row ${row}, column ${col}"${finished ? " disabled" : ""}>${text}</button>`);
  }
  boardEl.innerHTML = html.join("");
}

/** Sizes squares to fill the space available, so the board is as big as the screen allows. */
export function fitBoard(areaEl, boardEl, puzzleId, state) {
  const puzzle = puzzleById(puzzleId);
  const [cols, rows] = puzzle.grid(state);
  const { gap, cap } = puzzle.look;
  const width = areaEl.clientWidth;
  const height = areaEl.clientHeight;
  const cell = Math.max(24, Math.min(cap, Math.floor(Math.min((width - gap * (cols - 1)) / cols, (height - gap * (rows - 1)) / rows))));
  boardEl.style.setProperty("--cell", `${cell}px`);
  boardEl.style.setProperty("--gap", `${gap}px`);
}
