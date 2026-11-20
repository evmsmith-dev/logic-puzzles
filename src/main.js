// Logic Puzzles: Home, the game screen, pop-ups and saving. The puzzles themselves are in
// src/puzzles (pure logic); this file wires them to the page.
import { DAILY_LEVEL, DAILY_PUZZLES, LEVELS, LEVEL_NAMES, PUZZLES, puzzleById } from "./puzzles/index.js";
import { FREEZE_EVERY, MAX_FREEZES, dailyStreak, dayComplete, formatTime, recordDaily, recordScore, recordSolve, streakInfo } from "./lib/progress.js";
import { dateKey, newSeed } from "./lib/random.js";
import { KEYS, readJson, writeJson } from "./storage.js";
import { getSettings, onSettingsChange, setting, updateSettings } from "./lib/settings.js";
import { audioSettingsChanged, play, setMood, unlockAudio } from "./ui/audio.js";
import { animateMove, fitBoard, renderBoard } from "./ui/board.js";
import { buzz, hapticsAvailable } from "./ui/haptics.js";
import { anyOpen, backToHome, closeTop, enterGame, initOverlays, openOverlay } from "./ui/overlays.js";
import { initInstall } from "./ui/install.js";
import { registerServiceWorker } from "./ui/update.js";

const byId = (id) => document.getElementById(id);
const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const inWords = (n) => NUMBER_WORDS[n] ?? String(n);
const LONG_PRESS_MS = 450;

const app = {
  stats: readJson(KEYS.stats, {}),
  daily: readJson(KEYS.daily, {}),
  levels: readJson("levels", {}), // last level chosen per puzzle
  firstSeen: readJson("firstSeen", {}), // the day a puzzle added in an update first appeared here
  introSeen: readJson("introSeen", null), // puzzles whose rules have been shown once
  game: null, // { puzzleId, level, seed, daily, state, moves, elapsed, hinted, finished }
  flagMode: false,
  hint: null,
};

// ---------- Daily set ----------

/**
 * Notes the day each newly added puzzle first appears on this device, so a streak built before
 * it arrived isn't broken by a puzzle the player couldn't have played.
 */
function noteNewPuzzles() {
  const today = dateKey();
  let changed = false;
  for (const puzzle of PUZZLES) {
    if (puzzle.addedLater && !app.firstSeen[puzzle.id]) {
      app.firstSeen = { ...app.firstSeen, [puzzle.id]: today };
      changed = true;
    }
  }
  if (changed) writeJson("firstSeen", app.firstSeen);
}

/** The puzzles in the daily set on `day`. */
const dailyIds = (day) => DAILY_PUZZLES
  .filter((puzzle) => !puzzle.addedLater || (app.firstSeen[puzzle.id] && app.firstSeen[puzzle.id] <= day))
  .map((puzzle) => puzzle.id);

// ---------- Home ----------

const shortDate = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
};

function renderHome() {
  const today = dateKey();
  const done = app.daily[today] || {};
  const finished = DAILY_PUZZLES.filter((puzzle) => done[puzzle.id]).length;
  byId("daily-date").textContent = shortDate(today);
  byId("daily-status").textContent = finished === DAILY_PUZZLES.length
    ? "All done for today — come back tomorrow for new ones!"
    : `The same ${inWords(DAILY_PUZZLES.length)} ${LEVEL_NAMES[DAILY_LEVEL]} puzzles for everyone today. ${finished} of ${DAILY_PUZZLES.length} done.`;
  byId("daily-list").innerHTML = DAILY_PUZZLES.map((puzzle) => {
    const result = done[puzzle.id];
    return `<button type="button" class="daily-item${result ? " is-done" : ""}" data-daily="${puzzle.id}">
      <span class="daily-emoji" aria-hidden="true">${puzzle.emoji}</span>
      <span class="daily-name">${puzzle.name}</span>
      <span class="daily-result">${result ? `✓ ${formatTime(result.time)}` : "Play"}</span>
    </button>`;
  }).join("");
  const { streak, freezes } = streakInfo(app.daily, today, dailyIds);
  byId("daily-streak").textContent = streak
    ? `🔥 ${streak}-day streak${freezes ? ` · 🧊 ${freezes} freeze${freezes > 1 ? "s" : ""}` : ""}`
    : `Finish all ${inWords(DAILY_PUZZLES.length)} to start a streak`;
  byId("daily-share-btn").hidden = !dayComplete(app.daily, today, dailyIds);

  byId("puzzle-list").innerHTML = PUZZLES.map((puzzle) => {
    const level = app.levels[puzzle.id] || "easy";
    const best = app.stats[puzzle.id]?.[level];
    let bestText = best?.bestTime != null
      ? `Best ${formatTime(best.bestTime)} · ${best.solved} solved`
      : best?.solved ? `${best.solved} solved` : "Not solved yet";
    // Peg Jump: before a one-peg finish, show the best finish so far.
    if (!best?.solved && best?.bestScore != null) bestText = `Best finish: ${best.bestScore} pegs`;
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
  const [label, value] = puzzle.counter?.(game.state) ?? ["Moves", game.moves];
  byId("game-moves-label").textContent = label;
  byId("game-moves").textContent = value;
  const par = game.state.par;
  byId("game-par-item").hidden = !par;
  if (par) byId("game-par").textContent = par;
  if (puzzle.undo) byId("undo-btn").disabled = game.finished || !puzzle.canUndo(game.state);
}

function drawBoard() {
  const { game } = app;
  renderBoard(byId("board"), game.puzzleId, game.state, { hint: app.hint, finished: game.finished, regionLetters: setting("regionLetters") });
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
  byId("undo-btn").hidden = !puzzle.undo;
  byId("new-btn").hidden = Boolean(game.daily); // the daily puzzle is fixed for the day
  app.hint = null;
  hideHintToast();
  window.scrollTo(0, 0);
  drawBoard();
  setMood(game.puzzleId);
  startClock();
}

/** The first time a puzzle is opened, shows its rules; the clock waits until they're closed. */
function showIntroOnce() {
  const { puzzleId } = app.game;
  if (app.introSeen?.[puzzleId]) return;
  app.introSeen = { ...app.introSeen, [puzzleId]: true };
  writeJson("introSeen", app.introSeen);
  stopClock();
  showHelp(puzzleId, { onClose: () => startClock() });
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
  showIntroOnce(); // after enterGame, so closing the rules returns to the game
  saveGame();
}

function leaveGame() {
  stopClock();
  saveGame();
  hideHintToast();
  setMood(null);
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
  hideHintToast();
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
  const { state, moved } = puzzle.tap(game.state, index, { flagMode: app.flagMode, autoCross: setting("autoCross") });
  if (state === before) return;
  game.state = state;
  // The move's sound first, so a win's chime and feel come after it. (feedback never throws.)
  feedback(puzzle.feel?.(before, state, index) ?? { haptic: "tap" });
  afterMove(moved);
  animateMove(byId("board"), game.puzzleId, before, state);
}

/** Plays a move's sound and vibration: { sound, haptic, detail }. */
function feedback({ sound = null, haptic = null, detail = {} }) {
  try {
    if (sound) play(sound, detail);
    if (haptic) buzz(haptic);
  } catch {
    // Sound and vibration are extras; a failure must never stop the game.
  }
}

function flagSquare(index) {
  const { game } = app;
  if (!game || game.finished || game.puzzleId !== "minesweeper") return;
  const next = puzzleById("minesweeper").flag(game.state, index);
  if (next === game.state) return;
  game.state = next;
  feedback({ sound: "flag", haptic: "flag" });
  afterMove(0);
}

/** Takes back the last move. After a round that ended with no moves left, play carries on. */
function undoMove() {
  const { game } = app;
  const puzzle = game && puzzleById(game.puzzleId);
  if (!puzzle?.undo || !puzzle.canUndo(game.state)) return;
  game.state = puzzle.undo(game.state);
  game.moves = Math.max(0, game.moves - 1);
  game.finished = false;
  app.hint = null;
  hideHintToast();
  play("undo");
  drawBoard();
  startClock();
  saveGame();
}

function showHint() {
  const { game } = app;
  if (!game || game.finished) return;
  const puzzle = puzzleById(game.puzzleId);
  const index = puzzle.hint(game.state);
  if (index === null) {
    toast(puzzle.noHintText?.(game.state) ?? "No hint right now.");
    return;
  }
  game.hinted = true;
  app.hint = index;
  drawBoard();
  saveGame();
  play("hint");
  // The hint stays up until the next move, so there's time to read it.
  toast(puzzle.hintText?.(game.state, index, { regionLetters: setting("regionLetters") }) ?? "Try tapping the glowing square.", { untilMove: true });
}

function finishGame(won) {
  const { game } = app;
  stopClock();
  game.finished = true;
  const time = game.elapsed;
  drawBoard();
  writeJson(KEYS.current, null);
  const puzzle = puzzleById(game.puzzleId);
  if (!won) {
    const { emoji, title, text, undo, score, scoreName, sound, haptic } = puzzle.lostResult(game.state);
    feedback({ sound, haptic });
    let note = text;
    if (score != null) {
      // A ranked finish (Peg Jump with pegs left): keep the best one.
      const previous = app.stats[game.puzzleId]?.[game.level]?.bestScore;
      let newBest;
      ({ stats: app.stats, newBest } = recordScore(app.stats, game.puzzleId, game.level, score));
      writeJson(KEYS.stats, app.stats);
      note = `${newBest && previous != null ? "Your best finish yet! " : ""}${text}`;
      if (!newBest) note += ` Your best: ${scoreName(previous)}.`;
    }
    showResult({
      emoji,
      title,
      text: note,
      stats: [],
      primary: undo ? ["↶ Undo", () => undoMove()] : ["Try again", () => restartGame()],
      secondary: undo
        ? ["Start over", () => restartGame()]
        : game.daily ? ["Home", () => backToHome()] : ["New puzzle", () => startGame(game.puzzleId, game.level)],
    });
    return;
  }
  const result = { time, moves: game.moves, hinted: game.hinted };
  let newBest = { time: false, moves: false };
  if (game.daily) {
    app.daily = recordDaily(app.daily, game.daily, game.puzzleId, result);
    writeJson(KEYS.daily, app.daily);
  }
  ({ stats: app.stats, newBest } = recordSolve(app.stats, game.puzzleId, game.level, result));
  writeJson(KEYS.stats, app.stats);
  if (puzzle.scored) {
    // A one-peg finish is the best possible score.
    ({ stats: app.stats } = recordScore(app.stats, game.puzzleId, game.level, 1));
    writeJson(KEYS.stats, app.stats);
  }
  celebrate();
  feedback({ sound: "win", haptic: "win" });
  const stats = [
    setting("relaxed") ? null : ["Time", formatTime(time) + (newBest.time ? " 🏅" : "")],
    puzzle.showMoves === false ? null : ["Moves", String(game.moves) + (newBest.moves ? " 🏅" : "")],
    game.state.par ? ["Fewest possible", String(game.state.par)] : null,
  ].filter(Boolean);
  const bestNote = newBest.time && !setting("relaxed") ? "A new best time!" : game.hinted ? "Solved with a hint — hints don't count toward your best time." : "";
  const today = dateKey();
  const remaining = DAILY_PUZZLES.filter((p) => !app.daily[today]?.[p.id]);
  let text = [puzzle.winText?.(game.state), bestNote].filter(Boolean).join(" ");
  if (game.daily) {
    text = remaining.length
      ? `${bestNote ? `${bestNote} ` : ""}${remaining.length} more daily puzzle${remaining.length > 1 ? "s" : ""} to go.`
      : `That's all ${inWords(DAILY_PUZZLES.length)} for today! 🔥 ${dailyStreak(app.daily, today, dailyIds)}-day streak.`;
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
  hideHintToast();
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

/** "A, B and C" */
function listNames(puzzles) {
  const names = puzzles.map((puzzle) => puzzle.name);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names.join("");
}

function showHelp(puzzleId = null, { onClose = null } = {}) {
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
        <li>Every day there's one ${LEVEL_NAMES[DAILY_LEVEL]} ${listNames(DAILY_PUZZLES)} puzzle — the same for everyone.</li>
        <li>Finish all ${inWords(DAILY_PUZZLES.length)} to keep your streak going. New puzzles arrive at midnight.</li>
        <li>🧊 Every ${FREEZE_EVERY} days in a row earns a freeze (you can hold ${MAX_FREEZES}). If you miss a day, a freeze saves your streak.</li>
        <li>💡 Hints are there if you're stuck, but a puzzle solved with a hint doesn't set a best time.</li>
      </ul>
    </section>`);
  openOverlay("help-overlay", onClose ? { onClose } : undefined);
}

// Setting switches: element id → setting name.
const SWITCHES = {
  "set-sound": "sound",
  "set-music": "music",
  "set-vibration": "vibration",
  "set-relaxed": "relaxed",
  "set-auto-cross": "autoCross",
  "set-region-letters": "regionLetters",
  "set-large-text": "largeText",
};

function showSettings() {
  const current = readJson(KEYS.theme, "auto");
  document.querySelectorAll(".theme-btn").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.themeValue === current)));
  const settings = getSettings();
  for (const [id, name] of Object.entries(SWITCHES)) byId(id).checked = settings[name];
  byId("set-music-volume").value = Math.round(settings.musicVolume * 100);
  byId("music-volume-row").hidden = !settings.music;
  byId("vibration-row").hidden = !hapticsAvailable();
  openOverlay("settings-overlay");
}

/** Settings that change the page itself. */
function applySettings(settings) {
  document.documentElement.classList.toggle("large-text", settings.largeText);
  document.documentElement.classList.toggle("relaxed", settings.relaxed);
}

function applyTheme(preference) {
  const dark = preference === "dark" || (preference === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

// ---------- Small helpers ----------

let toastHandle = null;
let toastUntilMove = false;

/** Shows a short message. With `untilMove`, it stays until the next move instead of fading. */
function toast(message, { untilMove = false } = {}) {
  const el = byId("toast");
  el.textContent = message;
  el.classList.add("is-visible");
  clearTimeout(toastHandle);
  toastUntilMove = untilMove;
  if (!untilMove) toastHandle = setTimeout(() => el.classList.remove("is-visible"), 2200);
}

function hideHintToast() {
  if (!toastUntilMove) return;
  toastUntilMove = false;
  byId("toast").classList.remove("is-visible");
}

function celebrate() {
  if (typeof window.confetti !== "function" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  window.confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
}

async function shareDaily() {
  const today = dateKey();
  const lines = DAILY_PUZZLES.map((puzzle) => {
    const result = app.daily[today]?.[puzzle.id];
    return `${puzzle.emoji} ${result ? formatTime(result.time) : "—"}${result?.hinted ? " (hint)" : ""}`;
  });
  const streak = dailyStreak(app.daily, today, dailyIds);
  const url = new URL(".", location.href).href; // the app's address, without index.html
  const text = [
    `Logic Puzzles daily 🧩 ${shortDate(today)}`,
    ...lines,
    ...(streak > 1 ? [`🔥 ${streak}-day streak`] : []),
    "",
    `Can you beat my times? Play free: ${url}`,
  ].join("\n");
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
  let drag = null; // Queens: { pointerId, start, active, saved, painted }
  let dragged = false;

  // Queens: dragging across squares marks them ✕. The whole drag is one undo step.
  const paint = (index) => {
    const queens = puzzleById("queens");
    drag.painted.add(index);
    const next = queens.paintCross(app.game.state, index, { first: !drag.saved });
    if (next === app.game.state) return;
    if (!drag.saved) app.game.moves += 1;
    drag.saved = true;
    app.game.state = next;
    feedback({ sound: "cross", haptic: "tap" });
    app.hint = null;
    hideHintToast();
    drawBoard();
    saveGame();
  };
  board.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId || !app.game || app.game.finished) return;
    if (event.pointerType === "mouse" && event.buttons === 0) {
      endDrag(); // the button was let go outside the board
      return;
    }
    const cell = document.elementFromPoint(event.clientX, event.clientY)?.closest?.("#board [data-index]");
    if (!cell) return;
    const index = Number(cell.dataset.index);
    if (!drag.active) {
      if (index === drag.start) return;
      drag.active = true;
      dragged = true;
      paint(drag.start);
    }
    if (!drag.painted.has(index)) paint(index);
  });
  const endDrag = () => { drag = null; };
  // A drag can end anywhere, even off the board.
  addEventListener("pointerup", endDrag);
  addEventListener("pointercancel", endDrag);

  board.addEventListener("pointerdown", (event) => {
    const cell = event.target.closest("[data-index]");
    longPressed = false;
    dragged = false;
    if (cell && app.game?.puzzleId === "queens" && !app.game.finished) {
      drag = { pointerId: event.pointerId, start: Number(cell.dataset.index), active: false, saved: false, painted: new Set() };
    }
    if (!cell || app.game?.puzzleId !== "minesweeper") return;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      longPressed = true;
      flagSquare(Number(cell.dataset.index));
    }, LONG_PRESS_MS);
  });
  const cancel = () => clearTimeout(pressTimer);
  board.addEventListener("pointerup", () => { cancel(); endDrag(); });
  board.addEventListener("pointerleave", cancel);
  board.addEventListener("pointercancel", () => { cancel(); endDrag(); });
  board.addEventListener("contextmenu", (event) => {
    // Right-click flags on a computer; on phones, stop the long-press menu.
    event.preventDefault();
    const cell = event.target.closest("[data-index]");
    if (cell && !longPressed && event.pointerType !== "touch") flagSquare(Number(cell.dataset.index));
  });
  board.addEventListener("click", (event) => {
    const cell = event.target.closest("[data-index]");
    if (!cell) return;
    if (longPressed || dragged) {
      // The long press already flagged, or the drag already marked.
      longPressed = false;
      dragged = false;
      return;
    }
    tap(Number(cell.dataset.index));
  });
}

/**
 * Players from before per-puzzle intros saw every puzzle's rules on their first visit, so don't
 * show intros for puzzles they've already played.
 */
function noteSeenIntros() {
  if (app.introSeen) return;
  const played = new Set(Object.keys(app.stats));
  for (const day of Object.values(app.daily)) for (const id of Object.keys(day)) played.add(id);
  const saved = readJson(KEYS.current, null);
  if (saved) played.add(saved.puzzleId);
  app.introSeen = readJson(KEYS.helpSeen, false) ? Object.fromEntries([...played].map((id) => [id, true])) : {};
  writeJson("introSeen", app.introSeen);
}

function wireSettings() {
  for (const [id, name] of Object.entries(SWITCHES)) {
    byId(id).addEventListener("change", (event) => updateSettings({ [name]: event.target.checked }));
  }
  byId("set-music-volume").addEventListener("input", (event) => updateSettings({ musicVolume: Number(event.target.value) / 100 }));
  onSettingsChange((settings, changes) => {
    applySettings(settings);
    byId("music-volume-row").hidden = !settings.music;
    if ("sound" in changes || "music" in changes || "musicVolume" in changes) audioSettingsChanged();
    if ("vibration" in changes && settings.vibration) buzz("tap");
    if (app.game && ("regionLetters" in changes || "relaxed" in changes)) drawBoard();
  });
  applySettings(getSettings());
  // Browsers only allow sound after a tap. iPhones count only the end of a tap (or a click),
  // so listen for those too; unlockAudio is cheap once audio is running.
  for (const type of ["pointerdown", "pointerup", "touchend", "click", "keydown"]) {
    document.addEventListener(type, unlockAudio, { passive: true, capture: true });
  }
}

function init() {
  noteNewPuzzles();
  noteSeenIntros();
  initOverlays();
  wireBoard();
  wireSettings();

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
  byId("undo-btn").addEventListener("click", undoMove);
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
    } else if (!anyOpen()) startClock(); // pop-ups (rules, results) restart it when they close
  });
  addEventListener("pagehide", () => saveGame());
  addEventListener("resize", () => {
    if (app.game) fitBoard(byId("board-area"), byId("board"), app.game.puzzleId, app.game.state);
  });

  renderHome();
  document.body.classList.add("is-ready");
  writeJson(KEYS.helpSeen, true); // each puzzle's rules now show the first time it's opened
  initInstall();
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
