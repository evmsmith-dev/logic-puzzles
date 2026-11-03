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

export const dayComplete = (daily, day, puzzleIds) => puzzleIds.every((id) => daily[day]?.[id]);

/**
 * Days in a row with every daily puzzle done. Today counts once it's complete; until then the
 * streak from yesterday still stands.
 */
export function dailyStreak(daily, today, puzzleIds) {
  let day = dayComplete(daily, today, puzzleIds) ? today : addDays(today, -1);
  let streak = 0;
  while (dayComplete(daily, day, puzzleIds)) {
    streak++;
    day = addDays(day, -1);
  }
  return streak;
}

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
