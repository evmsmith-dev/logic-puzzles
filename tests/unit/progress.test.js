import assert from "node:assert/strict";
import { test } from "node:test";
import { dailyStreak, formatTime, recordDaily, recordSolve } from "../../src/lib/progress.js";
import { addDays, dateKey, seededRandom } from "../../src/lib/random.js";

const IDS = ["a", "b", "c"];
const allDone = (days) => Object.fromEntries(days.map((day) => [day, { a: { time: 1 }, b: { time: 1 }, c: { time: 1 } }]));

test("best time and moves only improve, and hinted solves don't set a best", () => {
  let { stats, newBest } = recordSolve({}, "a", "easy", { time: 5000, moves: 10, hinted: false });
  assert.deepEqual(newBest, { time: true, moves: true });
  ({ stats, newBest } = recordSolve(stats, "a", "easy", { time: 6000, moves: 8, hinted: false }));
  assert.deepEqual(newBest, { time: false, moves: true });
  assert.deepEqual(stats.a.easy, { solved: 2, bestTime: 5000, bestMoves: 8 });
  ({ stats, newBest } = recordSolve(stats, "a", "easy", { time: 1000, moves: 1, hinted: true }));
  assert.deepEqual(newBest, { time: false, moves: false });
  assert.deepEqual(stats.a.easy, { solved: 3, bestTime: 5000, bestMoves: 8 });
});

test("only the first finish of a daily puzzle counts, and old days are dropped", () => {
  let daily = recordDaily({}, "2026-11-03", "a", { time: 100 });
  daily = recordDaily(daily, "2026-11-03", "a", { time: 50 });
  assert.equal(daily["2026-11-03"].a.time, 100);
  daily = recordDaily({ "2026-08-01": { a: { time: 1 } } }, "2026-11-03", "b", { time: 1 });
  assert.equal(daily["2026-08-01"], undefined);
});

test("the streak counts days with all three done, and today's unfinished set doesn't break it", () => {
  const today = "2026-11-03";
  const days = [addDays(today, -1), addDays(today, -2), addDays(today, -3)];
  assert.equal(dailyStreak(allDone(days), today, IDS), 3);
  assert.equal(dailyStreak(allDone([today, ...days]), today, IDS), 4);
  // A partly done today keeps yesterday's streak.
  assert.equal(dailyStreak({ ...allDone(days), [today]: { a: { time: 1 } } }, today, IDS), 3);
  // A gap ends it.
  assert.equal(dailyStreak(allDone([addDays(today, -2)]), today, IDS), 0);
});

test("dates step across months and years", () => {
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(dateKey(new Date(2026, 10, 3)), "2026-11-03");
});

test("times read naturally", () => {
  assert.equal(formatTime(0), "0:00");
  assert.equal(formatTime(65_400), "1:05");
  assert.equal(formatTime(3_723_000), "1:02:03");
});

test("seeded randomness repeats exactly", () => {
  const a = seededRandom("x");
  const b = seededRandom("x");
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
});
