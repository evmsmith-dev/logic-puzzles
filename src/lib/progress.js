// Saved progress: best results per puzzle and level, the daily puzzles, and the streak.
// Pure functions over plain objects; src/storage.js reads and writes them.
import { addDays } from "./random.js";

export const DAILY_KEEP_DAYS = 60;

/** Records a finished puzzle. Returns { stats, newBest } where newBest says what improved. */
export function recordSolve(stats, puzzleId, level, { time, moves, hinted }) {
  const next = structuredCloneSafe(stats);
  const entry = next[puzzleId]?.[level] || { solved: 0, bestTime: null, bestMoves: null };
  entry.solved += 1;
  const newBest = { time: false, moves: false };
  // Puzzles finished with a hint still count as solved, but can't set a best.
  if (!hinted) {
    if (entry.bestTime === null || time < entry.bestTime) { entry.bestTime = time; newBest.time = true; }
    if (entry.bestMoves === null || moves < entry.bestMoves) { entry.bestMoves = moves; newBest.moves = true; }
  }
  next[puzzleId] = { ...next[puzzleId], [level]: entry };
  return { stats: next, newBest };
}

/** Records a finished daily puzzle (only the first finish of the day counts). */
export function recordDaily(daily, day, puzzleId, result) {
  if (daily[day]?.[puzzleId]) return daily;
  const next = { ...daily, [day]: { ...daily[day], [puzzleId]: result } };
  // Keep the last two months.
  const oldest = addDays(day, -DAILY_KEEP_DAYS);
  for (const key of Object.keys(next)) if (key < oldest) delete next[key];
  return next;
}

/**
 * True when every daily puzzle of `day` is done. `puzzleIds` is a list, or a function that gives
 * the list for a day (a puzzle added to the app later isn't needed on days before it arrived).
 */
export function dayComplete(daily, day, puzzleIds) {
  const ids = typeof puzzleIds === "function" ? puzzleIds(day) : puzzleIds;
  return ids.every((id) => daily[day]?.[id]);
}

/** Records the best score of a puzzle that ends with a score (fewer is better). */
export function recordScore(stats, puzzleId, level, score) {
  const next = structuredCloneSafe(stats);
  const entry = next[puzzleId]?.[level] || { solved: 0, bestTime: null, bestMoves: null };
  const newBest = entry.bestScore == null || score < entry.bestScore;
  if (newBest) entry.bestScore = score;
  next[puzzleId] = { ...next[puzzleId], [level]: entry };
  return { stats: next, newBest };
}

// Every 7 days in a row earns a freeze (up to 2), which saves the streak on a missed day.
export const FREEZE_EVERY = 7;
export const MAX_FREEZES = 2;

/**
 * The daily streak: { streak, freezes }. `streak` counts days with every daily puzzle done; a
 * missed day uses up a freeze instead of ending it, if there is one. Today counts once it's
 * complete; until then the streak from yesterday still stands.
 */
export function streakInfo(daily, today, puzzleIds) {
  const first = Object.keys(daily).filter((day) => day <= today).sort()[0];
  let streak = 0;
  let freezes = 0;
  const finished = () => {
    streak++;
    if (streak % FREEZE_EVERY === 0) freezes = Math.min(MAX_FREEZES, freezes + 1);
  };
  for (let day = first; day && day < today; day = addDays(day, 1)) {
    if (dayComplete(daily, day, puzzleIds)) finished();
    else if (streak > 0 && freezes > 0) freezes--;
    else {
      streak = 0;
      freezes = 0;
    }
  }
  if (first && dayComplete(daily, today, puzzleIds)) finished();
  return { streak, freezes };
}

export const dailyStreak = (daily, today, puzzleIds) => streakInfo(daily, today, puzzleIds).streak;

/** "1:05" or "12:30" or "1:02:03". */
export function formatTime(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value || {}));
}
