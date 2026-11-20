import assert from "node:assert/strict";
import { test } from "node:test";
import { dailyStreak, formatTime, recordDaily, recordScore, recordSolve, streakInfo } from "../../src/lib/progress.js";
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
  daily = recordDaily({ "2024-08-01": { a: { time: 1 } }, "2025-08-01": { a: { time: 1 } } }, "2026-11-03", "b", { time: 1 });
  assert.equal(daily["2024-08-01"], undefined, "more than two years old");
  assert.ok(daily["2025-08-01"]);
});

test("the streak counts days with every puzzle done, and today's unfinished set doesn't break it", () => {
  const today = "2026-11-03";
  const days = [addDays(today, -1), addDays(today, -2), addDays(today, -3)];
  assert.equal(dailyStreak(allDone(days), today, IDS), 3);
  assert.equal(dailyStreak(allDone([today, ...days]), today, IDS), 4);
  // A partly done today keeps yesterday's streak.
  assert.equal(dailyStreak({ ...allDone(days), [today]: { a: { time: 1 } } }, today, IDS), 3);
  // A gap ends it.
  assert.equal(dailyStreak(allDone([addDays(today, -2)]), today, IDS), 0);
});

test("a puzzle added later doesn't break a streak from before it arrived", () => {
  const today = "2026-11-03";
  const yesterday = addDays(today, -1);
  // "d" arrived yesterday: days before it only need a, b and c.
  const idsFor = (day) => (day >= yesterday ? ["a", "b", "c", "d"] : IDS);
  const old = allDone([addDays(today, -2), addDays(today, -3)]);
  assert.equal(dailyStreak(old, today, idsFor), 0, "yesterday wasn't finished");
  const withYesterday = { ...old, [yesterday]: { a: { time: 1 }, b: { time: 1 }, c: { time: 1 }, d: { time: 1 } } };
  assert.equal(dailyStreak(withYesterday, today, idsFor), 3);
  // Three done yesterday isn't enough once "d" is part of the set.
  const missingD = { ...old, ...allDone([yesterday]) };
  assert.equal(dailyStreak(missingD, today, idsFor), 0);
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

/** The days from `start` for `count` days. */
const run = (start, count) => Array.from({ length: count }, (_, i) => addDays(start, i));

test("a missed day ends a short streak", () => {
  const today = "2026-11-20";
  const daily = allDone([...run("2026-11-14", 4), "2026-11-19"]); // 14–17, missed 18, 19
  assert.deepEqual(streakInfo(daily, today, IDS), { streak: 1, freezes: 0 });
});

test("every 7 days in a row earns a freeze that saves the streak on a missed day", () => {
  const today = "2026-11-20";
  // 7 days (Nov 10–16) earn a freeze; Nov 17 is missed; Nov 18–19 done.
  const daily = allDone([...run("2026-11-10", 7), "2026-11-18", "2026-11-19"]);
  assert.deepEqual(streakInfo(daily, today, IDS), { streak: 9, freezes: 0 });
  // Two missed days in a row with one freeze: the second ends it.
  const twoMissed = allDone([...run("2026-11-08", 7), "2026-11-17", "2026-11-18", "2026-11-19"]);
  assert.equal(dailyStreak(twoMissed, today, IDS), 3);
});

test("freezes add up to two, and today's unfinished set never uses one", () => {
  const today = "2026-11-30";
  const daily = allDone(run("2026-11-01", 29)); // Nov 1–29: 29 days, freezes at 7, 14, 21, 28
  assert.deepEqual(streakInfo(daily, today, IDS), { streak: 29, freezes: 2 });
  const withToday = { ...daily, ...allDone([today]) };
  assert.equal(streakInfo(withToday, today, IDS).streak, 30);
});

test("best scores keep the lowest", () => {
  let stats = {};
  let newBest;
  ({ stats, newBest } = recordScore(stats, "peg-jump", "easy", 3));
  assert.ok(newBest);
  ({ stats, newBest } = recordScore(stats, "peg-jump", "easy", 4));
  assert.ok(!newBest);
  ({ stats, newBest } = recordScore(stats, "peg-jump", "easy", 2));
  assert.ok(newBest);
  assert.equal(stats["peg-jump"].easy.bestScore, 2);
  assert.equal(stats["peg-jump"].easy.solved, 0, "a ranked finish isn't a solve");
});

test("a long streak with a freeze survives two months of history", () => {
  // Every day from Jan 1 to Mar 31 done except Jan 9 (covered by the freeze from Jan 1–7).
  let daily = {};
  for (const day of run("2026-01-01", 90)) {
    if (day !== "2026-01-09") daily = recordDaily(daily, day, "a", { time: 1 });
  }
  const ids = ["a"];
  assert.equal(streakInfo(daily, "2026-03-31", ids).streak, 89);
  assert.ok("2026-01-01" in daily, "history isn't cut at two months");
});
