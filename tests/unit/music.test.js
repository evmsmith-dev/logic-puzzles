import assert from "node:assert/strict";
import { test } from "node:test";
import { PUZZLE_MUSIC, STYLES, musicFor, scheduleBar } from "../../src/ui/music.js";
import { PUZZLES } from "../../src/puzzles/index.js";

test("every puzzle has music in its own key, mixing Lo-fi and Marimba", () => {
  for (const puzzle of PUZZLES) assert.ok(PUZZLE_MUSIC[puzzle.id], puzzle.id);
  const roots = Object.values(PUZZLE_MUSIC).map((m) => m.root);
  assert.equal(new Set(roots).size, roots.length);
  assert.equal(musicFor("queens").style, "lofi");
  assert.equal(musicFor("peg-jump").style, "marimba");
});

test("the Music style setting picks one style everywhere, keeping each puzzle's key", () => {
  assert.equal(musicFor("queens", "marimba").style, "marimba");
  assert.equal(musicFor("queens", "marimba").root, PUZZLE_MUSIC.queens.root);
  assert.equal(musicFor("peg-jump", "lofi").style, "lofi");
  assert.equal(musicFor("peg-jump", "mix").style, "marimba");
});

test("a bar lasts four beats at the style's tempo and plays notes", () => {
  for (const [id, style] of Object.entries(STYLES)) {
    const notes = [];
    const kit = new Proxy({}, { get: (_, name) => (t, f) => notes.push({ name, t, f }) });
    const next = scheduleBar(kit, id, 220, 10, 0);
    assert.ok(Math.abs(next - 10 - (60 / style.bpm) * 4) < 1e-9, id);
    assert.ok(notes.length > 10, `${id} plays a full bar`);
    assert.ok(notes.every((n) => n.t >= 10 && n.t < next), `${id} stays inside its bar`);
    assert.ok(notes.some((n) => n.name === "bass") && notes.some((n) => n.name === "kick"), `${id} has a beat and bass`);
  }
});
