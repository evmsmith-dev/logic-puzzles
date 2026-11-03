// Draws a puzzle's board as a grid of buttons. The whole board is redrawn after each move;
// boards are small (at most 140 squares), so this stays quick and keeps the code simple.

const NUMBER_CLASS = ["", "n1", "n2", "n3", "n4", "n5", "n6", "n7", "n8"];

/** Columns and rows of the board. */
export function gridSize(puzzleId, state) {
  return puzzleId === "minesweeper" ? [state.cols, state.rows] : [state.size, state.size];
}

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

/** Redraws the board. `hint` is a square to highlight; `finished` locks the board. */
export function renderBoard(boardEl, puzzleId, state, { hint = null, finished = false } = {}) {
  const [cols] = gridSize(puzzleId, state);
  const count = puzzleId === "minesweeper" ? state.mines.length : state.board.length;
  const draw = puzzleId === "lights-out" ? lightsCell : puzzleId === "sliding-tiles" ? tileCell : mineCell;
  boardEl.className = `board board-${puzzleId}${finished ? " is-finished" : ""}`;
  boardEl.style.setProperty("--cols", cols);
  const html = [];
  for (let i = 0; i < count; i++) {
    const { className, label, text } = draw(state, i, { finished });
    const row = Math.floor(i / cols) + 1;
    const col = (i % cols) + 1;
    html.push(`<button type="button" class="${className}${i === hint ? " is-hint" : ""}" data-index="${i}" `
      + `aria-label="${label}, row ${row}, column ${col}"${finished ? " disabled" : ""}>${text}</button>`);
  }
  boardEl.innerHTML = html.join("");
}

/** Sizes squares to fill the space available, so the board is as big as the screen allows. */
export function fitBoard(areaEl, boardEl, puzzleId, state) {
  const [cols, rows] = gridSize(puzzleId, state);
  const gap = puzzleId === "minesweeper" ? 3 : 8;
  const width = areaEl.clientWidth;
  const height = areaEl.clientHeight;
  const cap = puzzleId === "minesweeper" ? 56 : 110;
  const cell = Math.max(24, Math.min(cap, Math.floor(Math.min((width - gap * (cols - 1)) / cols, (height - gap * (rows - 1)) / rows))));
  boardEl.style.setProperty("--cell", `${cell}px`);
  boardEl.style.setProperty("--gap", `${gap}px`);
}
