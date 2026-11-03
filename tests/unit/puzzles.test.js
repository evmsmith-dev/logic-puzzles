import assert from "node:assert/strict";
import { test } from "node:test";
import { LIGHTS_OUT_LEVELS, createLightsOut, isSolved as lightsOff, press, solve } from "../../src/puzzles/lights-out.js";
import { MINESWEEPER_LEVELS, countMines, createMinesweeper, isCleared, open, solvableWithoutGuessing } from "../../src/puzzles/minesweeper.js";
import { createSlidingTiles, isSolvable, isSolved as tilesInOrder, slide, solveSmall, solvedBoard } from "../../src/puzzles/sliding-tiles.js";
import { PUZZLES } from "../../src/puzzles/index.js";

const LEVELS = ["easy", "medium", "hard"];

// ---------- Lights Out ----------

test("Lights Out: a tap flips the light and its four neighbors", () => {
  const board = press(new Array(9).fill(0), 3, 4);
  assert.deepEqual(board, [0, 1, 0, 1, 1, 1, 0, 1, 0]);
  assert.deepEqual(press(new Array(9).fill(0), 3, 0), [1, 1, 0, 1, 0, 0, 0, 0, 0]); // corner
});

for (const level of LEVELS) {
  test(`Lights Out ${level}: every puzzle can be solved, in exactly the "fewest" taps shown`, () => {
    for (let i = 0; i < 40; i++) {
      const { size, board, par } = createLightsOut(level, `seed-${i}`);
      assert.equal(size, LIGHTS_OUT_LEVELS[level].size);
      assert.ok(!lightsOff(board), "starts with some lights on");
      const taps = solve(board, size);
      assert.equal(taps.length, par);
      let after = board;
      for (const cell of taps) after = press(after, size, cell);
      assert.ok(lightsOff(after));
    }
  });
}

test("Lights Out: the solver finds the shortest answer and spots impossible boards", () => {
  // One tap in the middle of a 5×5 board is undone by one tap.
  const board = press(new Array(25).fill(0), 5, 12);
  assert.deepEqual(solve(board, 5), [12]);
  // A single lit corner can't be solved on 5×5 (that size has unreachable patterns).
  const corner = new Array(25).fill(0);
  corner[0] = 1;
  assert.equal(solve(corner, 5), null);
});

test("Lights Out: the same seed always makes the same puzzle", () => {
  assert.deepEqual(createLightsOut("medium", "2026-11-03"), createLightsOut("medium", "2026-11-03"));
  assert.notDeepEqual(createLightsOut("medium", "2026-11-03").board, createLightsOut("medium", "2026-11-04").board);
});

// ---------- Sliding Tiles ----------

test("Sliding Tiles: a tap slides a whole row or column toward the gap", () => {
  const board = [1, 2, 3, 4, 5, 6, 7, 8, 0];
  assert.deepEqual(slide(board, 3, 6), { board: [1, 2, 3, 4, 5, 6, 0, 7, 8], moved: 2 });
  assert.deepEqual(slide(board, 3, 2), { board: [1, 2, 0, 4, 5, 3, 7, 8, 6], moved: 2 });
  assert.deepEqual(slide(board, 3, 0), { board, moved: 0 }); // not in line with the gap
});

test("Sliding Tiles: solvability follows the inversion rule", () => {
  assert.ok(isSolvable(solvedBoard(3), 3));
  assert.ok(!isSolvable([2, 1, 3, 4, 5, 6, 7, 8, 0], 3)); // one swap can't be undone
  assert.ok(isSolvable(solvedBoard(4), 4));
  assert.ok(!isSolvable([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 14, 0], 4)); // the famous 14–15 puzzle
});

for (const level of LEVELS) {
  test(`Sliding Tiles ${level}: boards are solvable and well mixed`, () => {
    for (let i = 0; i < 40; i++) {
      const { size, board } = createSlidingTiles(level, `seed-${i}`);
      assert.ok(isSolvable(board, size));
      assert.ok(!tilesInOrder(board));
      assert.deepEqual([...board].sort((a, b) => a - b), [...solvedBoard(size)].sort((a, b) => a - b));
    }
  });
}

test("Sliding Tiles Easy: the solver's answer works and matches the fewest moves shown", () => {
  for (let i = 0; i < 25; i++) {
    const { board, par } = createSlidingTiles("easy", `seed-${i}`);
    const taps = solveSmall(board);
    assert.equal(taps.length, par);
    let after = board;
    for (const tap of taps) after = slide(after, 3, tap).board;
    assert.ok(tilesInOrder(after));
  }
});

// ---------- Minesweeper ----------

for (const level of LEVELS) {
  test(`Minesweeper ${level}: right size, right mine count, an open start, and no guessing needed`, () => {
    const { cols, rows, mines: mineCount } = MINESWEEPER_LEVELS[level];
    for (let i = 0; i < 25; i++) {
      const game = createMinesweeper(level, `seed-${i}`);
      assert.equal(game.mines.length, cols * rows);
      assert.equal(game.mines.filter(Boolean).length, mineCount);
      assert.ok(game.revealed.filter(Boolean).length >= 9, "the start opens an area");
      assert.ok(game.revealed.every((open, cell) => !open || !game.mines[cell]), "nothing open is a mine");
      assert.ok(solvableWithoutGuessing(game));
    }
  });
}

test("Minesweeper: numbers count the mines around each square", () => {
  //  * . .
  //  . . .
  //  . . *
  const mines = [true, false, false, false, false, false, false, false, true];
  assert.deepEqual(countMines(mines, 3, 3), [0, 1, 0, 1, 2, 1, 0, 1, 0]);
});

test("Minesweeper: opening an empty square spreads to its neighbors", () => {
  const mines = new Array(9).fill(false);
  mines[8] = true;
  const counts = countMines(mines, 3, 3);
  const revealed = open(new Array(9).fill(false), counts, mines, 3, 3, 0);
  assert.deepEqual(revealed, [true, true, true, true, true, true, true, true, false]);
  assert.ok(isCleared(revealed, mines));
});

test("Minesweeper: a 50/50 is recognized as needing a guess", () => {
  // Two hidden squares, one mine, and nothing to tell them apart.
  //  1 1        (top row open)
  //  ? ?
  const mines = [false, false, true, false];
  const counts = countMines(mines, 2, 2);
  const revealed = [true, true, false, false];
  assert.equal(solvableWithoutGuessing({ cols: 2, rows: 2, mines, counts, revealed }), false);
});

// ---------- Moves through the shared puzzle interface ----------

test("every puzzle: restart returns to the starting board, and a tap never changes the start", () => {
  for (const puzzle of PUZZLES) {
    const state = puzzle.create("easy", "restart-check");
    const startCopy = JSON.stringify(state.start);
    let current = state;
    for (let i = 0; i < 5; i++) current = puzzle.tap(current, i * 3, {}).state;
    assert.equal(JSON.stringify(current.start), startCopy, puzzle.id);
    const restarted = puzzle.restart(current);
    assert.equal(JSON.stringify(restarted.board ?? restarted.revealed), startCopy, puzzle.id);
  }
});

test("Minesweeper: flags protect squares; tapping a number with its mines flagged digs around it", () => {
  const minesweeper = PUZZLES.find((puzzle) => puzzle.id === "minesweeper");
  // 3×3 with one mine in the corner; the center (a 1) is open.
  const mines = [true, false, false, false, false, false, false, false, false];
  const counts = countMines(mines, 3, 3);
  const revealed = [false, false, false, false, true, false, false, false, false];
  let state = { cols: 3, rows: 3, mines, counts, start: revealed, revealed, flags: new Array(9).fill(false), exploded: null };
  state = minesweeper.flag(state, 0);
  assert.equal(minesweeper.tap(state, 0, {}).state, state, "a flagged square can't be dug");
  state = minesweeper.tap(state, 4, {}).state; // chord on the 1
  assert.ok(minesweeper.isWon(state));
  assert.equal(minesweeper.minesLeft(state), 0);
});

test("Minesweeper: digging a mine loses", () => {
  const minesweeper = PUZZLES.find((puzzle) => puzzle.id === "minesweeper");
  const game = minesweeper.create("easy", "lose-check");
  const mine = game.mines.indexOf(true);
  const after = minesweeper.tap(game, mine, {}).state;
  assert.ok(minesweeper.isLost(after));
  assert.ok(!minesweeper.isWon(after));
});

test("hints point at a useful square", () => {
  for (const puzzle of PUZZLES) {
    const state = puzzle.create("easy", "hint-check");
    const hint = puzzle.hint(state);
    assert.notEqual(hint, null, puzzle.id);
    if (puzzle.id === "minesweeper") assert.equal(state.mines[hint], false, "a Minesweeper hint is always safe");
  }
});
