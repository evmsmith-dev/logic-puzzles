// Draws a puzzle's board as a grid of buttons. The buttons are made once per board and then
// updated in place after each move, so CSS transitions play, moves can be animated, and
// keyboard and screen-reader focus stays where it was.
import { allJumps, has, legalJumps, rowCol } from "../puzzles/peg-jump.js";
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

const QUEEN_TEXT = ["", "✕", "👑", "✕"];
const QUEEN_LABEL = ["Empty", "Marked ✕", "Queen", "Marked ✕"];
const REGION_WORDS = ["red", "orange", "yellow", "green", "blue", "purple", "pink", "gray"];

function queenCell(state, i, { clashes, regionLetters }) {
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
  const letter = String.fromCharCode(65 + region);
  return {
    className: `cell queen q${region}${edges}${mark === 1 || mark === 3 ? " is-cross" : ""}${mark === 3 ? " is-auto" : ""}${mark === 2 ? " is-queen" : ""}${clash}`,
    label: `${QUEEN_LABEL[mark]}${clash ? ", breaks a rule" : ""}, ${regionLetters ? `region ${letter}` : `${REGION_WORDS[region]} region`}`,
    text: QUEEN_TEXT[mark],
    // With region letters on, the first square of each region shows its letter in the corner.
    letter: regionLetters && regions.indexOf(region) === i ? letter : null,
  };
}

function pegCell(state, i) {
  const { rows, pegs, selected } = state;
  const [row, col] = rowCol(i);
  const where = `row ${row + 1}, hole ${col + 1}`;
  if (has(pegs, i)) {
    const picked = i === selected;
    return { className: `cell peg has-peg${picked ? " is-selected" : ""}`, label: `${picked ? "Picked-up peg" : "Peg"}, ${where}`, text: "" };
  }
  const target = selected !== null && legalJumps(rows, pegs).some(([from, , to]) => from === selected && to === i);
  return { className: `cell peg${target ? " is-target" : ""}`, label: `Empty hole${target ? ", can land here" : ""}, ${where}`, text: "" };
}

const DRAW = { "lights-out": lightsCell, "sliding-tiles": tileCell, minesweeper: mineCell, queens: queenCell, "peg-jump": pegCell };

const cellsOf = (boardEl) => boardEl.querySelectorAll(":scope > [data-index]");

/**
 * Draws the board. `hint` is a square (or list of squares) to highlight; `finished` locks the
 * board. New buttons are made only when the board's shape changes.
 */
export function renderBoard(boardEl, puzzleId, state, { hint = null, finished = false, regionLetters = false } = {}) {
  const puzzle = puzzleById(puzzleId);
  const [cols, rows] = puzzle.grid(state);
  const count = puzzle.cellCount?.(state) ?? cols * rows;
  const draw = DRAW[puzzleId];
  const hinted = new Set(hint === null ? [] : [hint].flat());
  const clashes = puzzle.clashes?.(state) ?? new Set();
  boardEl.className = `board board-${puzzleId}${finished ? " is-finished" : ""}`;
  boardEl.style.setProperty("--cols", puzzle.place ? cols * 2 : cols); // place() uses half-width columns

  const shape = `${puzzleId}:${cols}x${rows}:${count}`;
  if (boardEl.dataset.shape !== shape) {
    boardEl.dataset.shape = shape;
    const buttons = [];
    for (let i = 0; i < count; i++) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.index = i;
      if (puzzle.place) {
        const spot = puzzle.place(state, i);
        button.style.gridRow = spot.row;
        button.style.gridColumn = `${spot.col} / span 2`;
      }
      buttons.push(button);
    }
    boardEl.replaceChildren(...buttons);
  }

  const buttons = cellsOf(boardEl);
  for (let i = 0; i < count; i++) {
    const { className, label, text, letter = null } = draw(state, i, { finished, clashes, regionLetters });
    const button = buttons[i];
    const fullClass = className + (hinted.has(i) ? " is-hint" : "");
    // A placed square says where it is; others get their row and column.
    const fullLabel = puzzle.place ? label : `${label}, row ${Math.floor(i / cols) + 1}, column ${(i % cols) + 1}`;
    if (button.className !== fullClass) button.className = fullClass;
    if (button.getAttribute("aria-label") !== fullLabel) button.setAttribute("aria-label", fullLabel);
    if (button.textContent !== text) button.textContent = text;
    if (letter) button.dataset.letter = letter;
    else delete button.dataset.letter;
    button.disabled = finished;
  }
}

// ---------- Move animations ----------

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** How far square `from` sits from square `to`, in pixels. */
function offset(cells, from, to) {
  const a = cells[from].getBoundingClientRect();
  const b = cells[to].getBoundingClientRect();
  return [a.left - b.left, a.top - b.top];
}

const ANIMATE = {
  // Tiles slide from where they were.
  "sliding-tiles"(boardEl, cells, before, after) {
    after.board.forEach((tile, i) => {
      const was = before.board.indexOf(tile);
      if (!tile || was === i) return;
      const [dx, dy] = offset(cells, was, i);
      cells[i].animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 140, easing: "ease-out" });
    });
  },
  // The peg hops over in an arc, and the jumped peg pops off.
  "peg-jump"(boardEl, cells, before, after) {
    if (before.pegs === after.pegs) return;
    const jump = allJumps(after.rows).find(([from, over, to]) =>
      has(before.pegs, from) && has(before.pegs, over) && !has(before.pegs, to)
      && !has(after.pegs, from) && !has(after.pegs, over) && has(after.pegs, to));
    if (!jump) return; // an undo or restart
    const [from, over, to] = jump;
    const [dx, dy] = offset(cells, from, to);
    cells[to].animate([
      { transform: `translate(${dx}px, ${dy}px) scale(0.82)` },
      { transform: `translate(${dx / 2}px, ${dy / 2 - cells[to].offsetHeight * 0.6}px) scale(1.08)`, offset: 0.5 },
      { transform: "scale(0.82)" },
    ], { duration: 280, easing: "ease-in-out" });
    const ghost = document.createElement("div");
    ghost.className = "peg-ghost";
    ghost.style.cssText = `left:${cells[over].offsetLeft}px;top:${cells[over].offsetTop}px;width:${cells[over].offsetWidth}px;height:${cells[over].offsetHeight}px`;
    boardEl.append(ghost);
    ghost.animate([
      { transform: "scale(0.82)", opacity: 1 },
      { transform: "scale(1)", opacity: 1, offset: 0.35 },
      { transform: "scale(0.2)", opacity: 0 },
    ], { duration: 300, delay: 120, easing: "ease-in", fill: "backwards" }).finished.finally(() => ghost.remove());
  },
  // A new queen pops in.
  queens(boardEl, cells, before, after) {
    after.marks.forEach((mark, i) => {
      if (mark === 2 && before.marks[i] !== 2) {
        cells[i].animate([{ transform: "scale(0.6)" }, { transform: "scale(1.1)", offset: 0.6 }, { transform: "none" }], { duration: 220, easing: "ease-out" });
      }
    });
  },
};

/** Animates the change from `before` to `after`, unless the player prefers less motion. */
export function animateMove(boardEl, puzzleId, before, after) {
  if (!ANIMATE[puzzleId] || reduceMotion() || typeof Element.prototype.animate !== "function") return;
  try {
    ANIMATE[puzzleId](boardEl, cellsOf(boardEl), before, after);
  } catch {
    // An animation is never worth an error.
  }
}

/** Sizes squares to fill the space available, so the board is as big as the screen allows. */
export function fitBoard(areaEl, boardEl, puzzleId, state) {
  const puzzle = puzzleById(puzzleId);
  const [cols, rows] = puzzle.grid(state);
  const { gap, cap, pad = 0, min = 24 } = puzzle.look;
  const width = areaEl.clientWidth - 2 * pad;
  const height = areaEl.clientHeight - 2 * pad;
  // Below `min` the squares get too small to tap; the board then scrolls instead.
  const cell = Math.max(min, Math.min(cap, Math.floor(Math.min((width - gap * (cols - 1)) / cols, (height - gap * (rows - 1)) / rows))));
  areaEl.classList.toggle("is-scrolling", cell * cols + gap * (cols - 1) > width || cell * rows + gap * (rows - 1) > height);
  boardEl.style.setProperty("--cell", `${cell}px`);
  boardEl.style.setProperty("--gap", `${gap}px`);
  boardEl.style.setProperty("--pad", `${pad}px`);
}
