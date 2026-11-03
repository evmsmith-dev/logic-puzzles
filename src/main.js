// Logic Puzzles: Home, the game screen, pop-ups and saving. The puzzles themselves are in
// src/puzzles (pure logic); this file wires them to the page.
import { DAILY_LEVEL, LEVELS, LEVEL_NAMES, PUZZLES, puzzleById } from "./puzzles/index.js";
import { dailyStreak, dayComplete, formatTime, recordDaily, recordSolve } from "./lib/progress.js";
import { dateKey, newSeed } from "./lib/random.js";
import { KEYS, readJson, writeJson } from "./storage.js";
import { fitBoard, renderBoard } from "./ui/board.js";
import { backToHome, closeTop, enterGame, initOverlays, isOpen, openOverlay } from "./ui/overlays.js";
import { registerServiceWorker } from "./ui/update.js";

const byId = (id) => document.getElementById(id);
const PUZZLE_IDS = PUZZLES.map((puzzle) => puzzle.id);
const LONG_PRESS_MS = 450;

const app = {
  stats: readJson(KEYS.stats, {}),
  daily: readJson(KEYS.daily, {}),
  levels: readJson("levels", {}), // last level chosen per puzzle
  game: null, // { puzzleId, level, seed, daily, state, moves, elapsed, hinted, finished }
  flagMode: false,
  hint: null,
};

// ---------- Home ----------

const shortDate = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
};

function renderHome() {
  const today = dateKey();
  const done = app.daily[today] || {};
  const finished = PUZZLE_IDS.filter((id) => done[id]).length;
  byId("daily-date").textContent = shortDate(today);
  byId("daily-status").textContent = finished === PUZZLES.length
    ? "All done for today — come back tomorrow for new ones!"
    : `The same three ${LEVEL_NAMES[DAILY_LEVEL]} puzzles for everyone today. ${finished} of ${PUZZLES.length} done.`;
  byId("daily-list").innerHTML = PUZZLES.map((puzzle) => {
    const result = done[puzzle.id];
    return `<button type="button" class="daily-item${result ? " is-done" : ""}" data-daily="${puzzle.id}">
      <span class="daily-emoji" aria-hidden="true">${puzzle.emoji}</span>
      <span class="daily-name">${puzzle.name}</span>
      <span class="daily-result">${result ? `✓ ${formatTime(result.time)}` : "Play"}</span>
    </button>`;
  }).join("");
  const streak = dailyStreak(app.daily, today, PUZZLE_IDS);
  byId("daily-streak").textContent = streak ? `🔥 ${streak}-day streak` : "Finish all three to start a streak";
  byId("daily-share-btn").hidden = !dayComplete(app.daily, today, PUZZLE_IDS);

  byId("puzzle-list").innerHTML = PUZZLES.map((puzzle) => {
    const level = app.levels[puzzle.id] || "easy";
    const best = app.stats[puzzle.id]?.[level];
    const bestText = best?.bestTime != null
      ? `Best ${formatTime(best.bestTime)} · ${best.solved} solved`
      : best?.solved ? `${best.solved} solved` : "Not solved yet";
    return `<article class="puzzle-card" data-puzzle="${puzzle.id}">
      <div class="puzzle-card-head">
        <span class="puzzle-emoji" aria-hidden="true">${puzzle.emoji}</span>
        <div><h3>${puzzle.name}</h3><p class="puzzle-tagline">${puzzle.tagline}</p></div>
      </div>
      <div class="segmented level-picker" role="group" aria-label="${puzzle.name} level">
        ${LEVELS.map((value) => `<button type="button" class="level-btn" data-level="${value}" aria-pressed="${value === level}">
          ${LEVEL_NAMES[value]}<small>${puzzle.sizes[value]}</small></button>`).join("")}
      </div>
      <div class="puzzle-card-foot">
        <span class="puzzle-best">${bestText}</span>
        <button type="button" class="play-btn" data-play="${puzzle.id}">Play</button>
      </div>
    </article>`;
  }).join("");

  const saved = readJson(KEYS.current, null);
  const continueBtn = byId("continue-btn");
  const puzzle = saved && puzzleById(saved.puzzleId);
  continueBtn.hidden = !puzzle;
  if (puzzle) {
    const label = saved.daily ? `Today's ${puzzle.name}` : `${puzzle.name} · ${LEVEL_NAMES[saved.level]}`;
    continueBtn.innerHTML = `<span class="continue-emoji" aria-hidden="true">${puzzle.emoji}</span>
      <span class="continue-text"><strong>Continue</strong> ${label}</span>
      <span class="continue-time">${formatTime(saved.elapsed)} ›</span>`;
  }
}

// ---------- The game ----------

let timerHandle = null;
let runningSince = null; // performance.now() when the clock last started, or null if stopped

const elapsed = () => app.game.elapsed + (runningSince === null ? 0 : performance.now() - runningSince);

function startClock() {
  if (runningSince !== null || !app.game || app.game.finished) return;
  runningSince = performance.now();
  clearInterval(timerHandle);
  timerHandle = setInterval(updateStatus, 250);
}

function stopClock() {
  if (runningSince === null) return;
  app.game.elapsed = elapsed();
  runningSince = null;
  clearInterval(timerHandle);
  timerHandle = null;
}

function saveGame() {
  if (!app.game) return;
  if (app.game.finished) {
    writeJson(KEYS.current, null);
    return;
  }
  const { puzzleId, level, seed, daily, state, moves, hinted } = app.game;
  writeJson(KEYS.current, { puzzleId, level, seed, daily, state, moves, hinted, elapsed: elapsed() });
}

function updateStatus() {
  const { game } = app;
  if (!game) return;
  byId("game-time").textContent = formatTime(elapsed());
  const puzzle = puzzleById(game.puzzleId);
  if (game.puzzleId === "minesweeper") {
    byId("game-moves-label").textContent = "Mines left";
    byId("game-moves").textContent = puzzle.minesLeft(game.state);
  } else {
    byId("game-moves-label").textContent = "Moves";
    byId("game-moves").textContent = game.moves;
  }
  const par = game.state.par;
  byId("game-par-item").hidden = !par;
  if (par) byId("game-par").textContent = par;
}

function drawBoard() {
  const { game } = app;
  renderBoard(byId("board"), game.puzzleId, game.state, { hint: app.hint, finished: game.finished });
  fitBoard(byId("board-area"), byId("board"), game.puzzleId, game.state);
  updateStatus();
}

function showGame() {
  const { game } = app;
  const puzzle = puzzleById(game.puzzleId);
  byId("home").hidden = true;
  byId("game").hidden = false;
  byId("game-name").textContent = `${puzzle.emoji} ${puzzle.name}`;
  byId("game-level").textContent = game.daily ? `Daily · ${shortDate(game.daily)}` : `${LEVEL_NAMES[game.level]} · ${puzzle.sizes[game.level]}`;
  byId("game-level").classList.toggle("is-daily", Boolean(game.daily));
  byId("flag-btn").hidden = game.puzzleId !== "minesweeper";
  setFlagMode(false);
  byId("hint-btn").hidden = puzzle.hasHint ? !puzzle.hasHint(game.state) : false;
  byId("new-btn").hidden = Boolean(game.daily); // the daily puzzle is fixed for the day
  app.hint = null;
  window.scrollTo(0, 0);
  drawBoard();
  startClock();
}

/** Starts a puzzle. `daily` is today's date key for the daily puzzle. */
function startGame(puzzleId, level, { daily = null, resume = null } = {}) {
  const puzzle = puzzleById(puzzleId);
  if (resume) {
    app.game = { ...resume, finished: false };
  } else {
    const seed = daily || newSeed();
    app.game = { puzzleId, level, seed, daily, state: puzzle.create(level, seed), moves: 0, elapsed: 0, hinted: false, finished: false };
  }
  const wasOnGame = !byId("game").hidden;
  showGame();
  if (!wasOnGame) enterGame(leaveGame);
  saveGame();
}

function leaveGame() {
  stopClock();
  saveGame();
  app.game = null;
  byId("game").hidden = true;
  byId("home").hidden = false;
  renderHome();
}

function setFlagMode(on) {
  app.flagMode = on;
  const button = byId("flag-btn");
  button.textContent = on ? "🚩 Flag" : "⛏️ Dig";
  button.setAttribute("aria-pressed", String(on));
  button.classList.toggle("is-flagging", on);
}

function afterMove(moved) {
  const { game } = app;
  const puzzle = puzzleById(game.puzzleId);
  game.moves += moved;
  app.hint = null;
  if (puzzle.isWon(game.state)) finishGame(true);
  else if (puzzle.isLost?.(game.state)) finishGame(false);
  else {
    drawBoard();
    saveGame();
  }
}

function tap(index) {
  const { game } = app;
  if (!game || game.finished) return;
  const puzzle = puzzleById(game.puzzleId);
  const before = game.state;
  const { state, moved } = puzzle.tap(game.state, index, { flagMode: app.flagMode });
  if (state === before) return;
  game.state = state;
  vibrate(10);
  afterMove(moved);
}

function flagSquare(index) {
  const { game } = app;
  if (!game || game.finished || game.puzzleId !== "minesweeper") return;
  const next = puzzleById("minesweeper").flag(game.state, index);
  if (next === game.state) return;
  game.state = next;
  vibrate(25);
  afterMove(0);
}

function showHint() {
  const { game } = app;
  if (!game || game.finished) return;
  const index = puzzleById(game.puzzleId).hint(game.state);
  if (index === null) {
    toast("No hint right now.");
    return;
  }
  game.hinted = true;
  app.hint = index;
  drawBoard();
  saveGame();
  toast(game.puzzleId === "minesweeper" ? "That square is safe to dig." : "Try tapping the glowing square.");
}

function finishGame(won) {
  const { game } = app;
  stopClock();
  game.finished = true;
  const time = game.elapsed;
  drawBoard();
  writeJson(KEYS.current, null);
  if (!won) {
    vibrate([60, 40, 60]);
    showResult({
      emoji: "💥",
      title: "Boom!",
      text: "That square had a mine. Every board can be solved without guessing — try this one again?",
      stats: [],
      primary: ["Try again", () => restartGame()],
      secondary: game.daily ? ["Home", () => backToHome()] : ["New puzzle", () => startGame(game.puzzleId, game.level)],
    });
    return;
  }
  const puzzle = puzzleById(game.puzzleId);
  const result = { time, moves: game.moves, hinted: game.hinted };
  let newBest = { time: false, moves: false };
  if (game.daily) {
    app.daily = recordDaily(app.daily, game.daily, game.puzzleId, result);
    writeJson(KEYS.daily, app.daily);
  }
  ({ stats: app.stats, newBest } = recordSolve(app.stats, game.puzzleId, game.level, result));
  writeJson(KEYS.stats, app.stats);
  celebrate();
  vibrate([30, 30, 60]);
  const stats = [
    ["Time", formatTime(time) + (newBest.time ? " 🏅" : "")],
    game.puzzleId === "minesweeper" ? null : ["Moves", String(game.moves) + (newBest.moves ? " 🏅" : "")],
    game.state.par ? ["Fewest possible", String(game.state.par)] : null,
  ].filter(Boolean);
  const bestNote = newBest.time ? "A new best time!" : game.hinted ? "Solved with a hint — hints don't count toward your best time." : "";
  const today = dateKey();
  const remaining = PUZZLES.filter((p) => !app.daily[today]?.[p.id]);
  let text = bestNote;
  if (game.daily) {
    text = remaining.length
      ? `${bestNote ? `${bestNote} ` : ""}${remaining.length} more daily puzzle${remaining.length > 1 ? "s" : ""} to go.`
      : `That's all three for today! 🔥 ${dailyStreak(app.daily, today, PUZZLE_IDS)}-day streak.`;
  }
  showResult({
    emoji: "🎉",
    title: `${puzzle.name} solved!`,
    text,
    stats,
    primary: game.daily
      ? (remaining.length ? ["Next puzzle", () => startGame(remaining[0].id, DAILY_LEVEL, { daily: today })] : ["Share", () => shareDaily()])
      : ["New puzzle", () => startGame(game.puzzleId, game.level)],
    secondary: ["Home", () => backToHome()],
  });
}

function restartGame() {
  const { game } = app;
  if (!game) return;
  const puzzle = puzzleById(game.puzzleId);
  // The clock keeps going on a restart, so restarting can't be used to get a better time.
  const keep = game.finished ? 0 : elapsed();
  stopClock();
  Object.assign(game, { state: puzzle.restart(game.state), moves: 0, finished: false, elapsed: keep });
  app.hint = null;
  drawBoard();
  startClock();
  saveGame();
}

// ---------- Pop-ups ----------

let resultActions = null;

function showResult({ emoji, title, text, stats, primary, secondary }) {
  byId("result-emoji").textContent = emoji;
  byId("result-title").textContent = title;
  byId("result-text").textContent = text;
  byId("result-text").hidden = !text;
  byId("result-stats").innerHTML = stats.map(([label, value]) => `<div class="result-stat"><span>${label}</span><strong>${value}</strong></div>`).join("");
  byId("result-primary").textContent = primary[0];
  byId("result-secondary").textContent = secondary[0];
  resultActions = { primary: primary[1], secondary: secondary[1] };
  setTimeout(() => openOverlay("result-overlay", { focus: "#result-primary" }), 500);
}

function runResultAction(which) {
  const action = resultActions?.[which];
  resultActions = null;
  if (!action) return;
  if (action === backToHome) {
    backToHome();
    return;
  }
  // Close the pop-up first; start the next thing once it has closed.
  const onClosed = () => {
    removeEventListener("popstate", onClosed);
    setTimeout(action, 0);
  };
  addEventListener("popstate", onClosed);
  closeTop();
}

/** Asks before doing something that loses progress. Resolves true for the red button. */
function askConfirm({ title, text, ok }) {
  byId("confirm-title").textContent = title;
  byId("confirm-text").textContent = text;
  byId("confirm-ok").textContent = ok;
  return new Promise((resolve) => {
    let answer = false;
    byId("confirm-ok").onclick = () => {
      answer = true;
      closeTop();
    };
    openOverlay("confirm-overlay", { focus: "#confirm-cancel", onClose: () => resolve(answer) });
  });
}

function showHelp(puzzleId = null) {
  const list = puzzleId ? [puzzleById(puzzleId)] : PUZZLES;
  byId("help-title").textContent = puzzleId ? `How to play ${list[0].name}` : "How to play";
  byId("help-body").innerHTML = list.map((puzzle) => `
    <section class="help-section">
      ${puzzleId ? "" : `<h3>${puzzle.emoji} ${puzzle.name}</h3>`}
      <ul>${puzzle.rules.map((rule) => `<li>${rule}</li>`).join("")}</ul>
    </section>`).join("") + (puzzleId ? "" : `
    <section class="help-section">
      <h3>📅 Daily puzzles</h3>
      <ul>
        <li>Every day there's one of each puzzle at ${LEVEL_NAMES[DAILY_LEVEL]} level — the same for everyone.</li>
        <li>Finish all three to keep your streak going. New puzzles arrive at midnight.</li>
        <li>💡 Hints are there if you're stuck, but a puzzle solved with a hint doesn't set a best time.</li>
      </ul>
    </section>`);
  openOverlay("help-overlay");
}

function showSettings() {
  const current = readJson(KEYS.theme, "auto");
  document.querySelectorAll(".theme-btn").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.themeValue === current)));
  openOverlay("settings-overlay");
}

function applyTheme(preference) {
  const dark = preference === "dark" || (preference === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

// ---------- Small helpers ----------

let toastHandle = null;
function toast(message) {
  const el = byId("toast");
  el.textContent = message;
  el.classList.add("is-visible");
  clearTimeout(toastHandle);
  toastHandle = setTimeout(() => el.classList.remove("is-visible"), 2200);
}

function vibrate(pattern) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not supported.
  }
}

function celebrate() {
  if (typeof window.confetti !== "function" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  window.confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
}

async function shareDaily() {
  const today = dateKey();
  const lines = PUZZLES.map((puzzle) => {
    const result = app.daily[today]?.[puzzle.id];
    return `${puzzle.emoji} ${result ? formatTime(result.time) : "—"}${result?.hinted ? " (hint)" : ""}`;
  });
  const streak = dailyStreak(app.daily, today, PUZZLE_IDS);
  const text = [`Logic Puzzles daily 🧩 ${shortDate(today)}`, ...lines, streak > 1 ? `🔥 ${streak}-day streak` : ""].filter(Boolean).join("\n");
  try {
    if (navigator.share) await navigator.share({ text });
    else {
      await navigator.clipboard.writeText(text);
      toast("Copied — paste it to share.");
    }
  } catch {
    // Sharing was cancelled.
  }
}

// ---------- Wiring ----------

function wireBoard() {
  const board = byId("board");
  let pressTimer = null;
  let longPressed = false;
  board.addEventListener("pointerdown", (event) => {
    const cell = event.target.closest("[data-index]");
    longPressed = false;
    if (!cell || app.game?.puzzleId !== "minesweeper") return;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      longPressed = true;
      flagSquare(Number(cell.dataset.index));
    }, LONG_PRESS_MS);
  });
  const cancel = () => clearTimeout(pressTimer);
  board.addEventListener("pointerup", cancel);
  board.addEventListener("pointerleave", cancel);
  board.addEventListener("pointercancel", cancel);
  board.addEventListener("contextmenu", (event) => {
    // Right-click flags on a computer; on phones, stop the long-press menu.
    event.preventDefault();
    const cell = event.target.closest("[data-index]");
    if (cell && !longPressed && event.pointerType !== "touch") flagSquare(Number(cell.dataset.index));
  });
  board.addEventListener("click", (event) => {
    const cell = event.target.closest("[data-index]");
    if (!cell) return;
    if (longPressed) {
      longPressed = false;
      return;
    }
    tap(Number(cell.dataset.index));
  });
}

function init() {
  initOverlays();
  wireBoard();

  byId("puzzle-list").addEventListener("click", (event) => {
    const levelBtn = event.target.closest("[data-level]");
    if (levelBtn) {
      const id = levelBtn.closest("[data-puzzle]").dataset.puzzle;
      app.levels = { ...app.levels, [id]: levelBtn.dataset.level };
      writeJson("levels", app.levels);
      renderHome();
      document.querySelector(`[data-puzzle="${id}"] [data-level="${levelBtn.dataset.level}"]`)?.focus();
      return;
    }
    const play = event.target.closest("[data-play]");
    if (play) startNewFromHome(play.dataset.play, app.levels[play.dataset.play] || "easy");
  });
  byId("daily-list").addEventListener("click", (event) => {
    const item = event.target.closest("[data-daily]");
    if (!item) return;
    const today = dateKey();
    if (app.daily[today]?.[item.dataset.daily]) {
      toast("Already solved today — new puzzles tomorrow!");
      return;
    }
    startNewFromHome(item.dataset.daily, DAILY_LEVEL, today);
  });
  byId("continue-btn").addEventListener("click", () => {
    const saved = readJson(KEYS.current, null);
    if (saved && puzzleById(saved.puzzleId)) startGame(saved.puzzleId, saved.level, { daily: saved.daily, resume: saved });
  });
  byId("daily-share-btn").addEventListener("click", shareDaily);
  byId("help-btn").addEventListener("click", () => showHelp());
  byId("settings-btn").addEventListener("click", showSettings);
  document.querySelectorAll(".theme-btn").forEach((button) => button.addEventListener("click", () => {
    writeJson(KEYS.theme, button.dataset.themeValue);
    applyTheme(button.dataset.themeValue);
    document.querySelectorAll(".theme-btn").forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
  }));
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => applyTheme(readJson(KEYS.theme, "auto")));

  byId("game-back-btn").addEventListener("click", () => backToHome());
  byId("game-help-btn").addEventListener("click", () => showHelp(app.game?.puzzleId));
  byId("hint-btn").addEventListener("click", showHint);
  byId("flag-btn").addEventListener("click", () => setFlagMode(!app.flagMode));
  byId("restart-btn").addEventListener("click", async () => {
    if (!app.game) return;
    if (app.game.moves > 0 && !app.game.finished) {
      const ok = await askConfirm({ title: "Start this puzzle over?", text: "Your moves will be undone. The clock keeps running.", ok: "Restart" });
      if (!ok) return;
    }
    restartGame();
  });
  byId("new-btn").addEventListener("click", async () => {
    if (!app.game) return;
    if (app.game.moves > 0 && !app.game.finished) {
      const ok = await askConfirm({ title: "Start a new puzzle?", text: "This one will be lost.", ok: "New puzzle" });
      if (!ok) return;
    }
    startGame(app.game.puzzleId, app.game.level);
  });
  byId("result-primary").addEventListener("click", () => runResultAction("primary"));
  byId("result-secondary").addEventListener("click", () => runResultAction("secondary"));

  // Pause the clock while the app is in the background, and save in case it's closed.
  document.addEventListener("visibilitychange", () => {
    if (!app.game) return;
    if (document.visibilityState === "hidden") {
      stopClock();
      saveGame();
    } else if (!isOpen("result-overlay")) startClock();
  });
  addEventListener("pagehide", () => saveGame());
  addEventListener("resize", () => {
    if (app.game) fitBoard(byId("board-area"), byId("board"), app.game.puzzleId, app.game.state);
  });

  renderHome();
  document.body.classList.add("is-ready");
  if (!readJson(KEYS.helpSeen, false)) {
    writeJson(KEYS.helpSeen, true);
    showHelp();
  }
  registerServiceWorker();
}

/** From Home: an unfinished puzzle is replaced only after asking. */
async function startNewFromHome(puzzleId, level, daily = null) {
  const saved = readJson(KEYS.current, null);
  const same = saved && saved.puzzleId === puzzleId && saved.level === level && saved.daily === daily;
  if (same) {
    startGame(puzzleId, level, { daily, resume: saved });
    return;
  }
  if (saved && saved.moves > 0) {
    const name = puzzleById(saved.puzzleId)?.name || "puzzle";
    const ok = await askConfirm({ title: `Leave your ${name}?`, text: "You have an unfinished puzzle. Starting a new one will replace it.", ok: "Start new" });
    if (!ok) return;
  }
  startGame(puzzleId, level, { daily });
}

init();
