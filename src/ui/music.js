// Background music made in code: a beat, a bass line, chords and a little tune, in two styles.
// Lo-fi groove is warm and laid-back (88 beats a minute, swung); Marimba is bouncier (120). The
// chords go round I – vi – IV – V and the tune changes as it goes, so it never loops exactly.
// Everything is scheduled one bar at a time, a moment ahead of when it plays.

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const PROGRESSION = [0, 5, 3, 4]; // chord roots as scale degrees: I – vi – IV – V

/** Frequency of scale degree `d` (can be negative or past 7) above `root`. */
const degree = (root, d) => root * 2 ** ((MAJOR[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7)) / 12);
/** The chord on degree `c`: root, third, fifth (and seventh). */
const chord = (c, seventh = false) => (seventh ? [c, c + 2, c + 4, c + 6] : [c, c + 2, c + 4]);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** Instruments that play into `out`. */
export function makeKit(ctx, out) {
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  function osc({ t, f, type = "sine", attack = 0.005, decay = 0.4, gain = 0.2, filter = null, to = null }) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + decay);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    let node = o;
    if (filter) {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = filter;
      o.connect(lp);
      node = lp;
    }
    node.connect(g).connect(out);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }

  function hiss({ t, decay = 0.05, gain = 0.05, freq = 7000, type = "highpass", q = 0.7 }) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + decay + 0.05);
  }

  return {
    bell: (t, f, gain = 0.1) => {
      osc({ t, f, decay: 1.1, gain });
      osc({ t, f: f * 3, decay: 0.4, gain: gain * 0.18 });
    },
    marimba: (t, f, gain = 0.16) => {
      osc({ t, f, attack: 0.002, decay: 0.28, gain });
      osc({ t, f: f * 4, attack: 0.002, decay: 0.06, gain: gain * 0.3 });
    },
    keys: (t, f, len, gain = 0.06) => {
      osc({ t, f, attack: 0.01, decay: len, gain });
      osc({ t, f: f * 2, attack: 0.01, decay: len * 0.4, gain: gain * 0.3 });
    },
    pad: (t, f, len, gain = 0.03) => osc({ t, f, type: "triangle", attack: 0.25, decay: len, gain, filter: 900 }),
    bass: (t, f, len = 0.35, gain = 0.2) => osc({ t, f, type: "triangle", attack: 0.01, decay: len, gain, filter: 500 }),
    kick: (t, gain = 0.35) => osc({ t, f: 130, to: 45, attack: 0.002, decay: 0.22, gain }),
    snare: (t, gain = 0.07) => hiss({ t, decay: 0.12, gain, freq: 2200, type: "bandpass", q: 0.8 }),
    hat: (t, gain = 0.035) => hiss({ t, decay: 0.035, gain }),
  };
}

// Each style plays one bar; `at(step)` is the time of 16th-note step 0–15.
export const STYLES = {
  lofi: {
    name: "Lo-fi groove",
    bpm: 88,
    swing: 0.33,
    bar(kit, { at, root, c }) {
      const tones = chord(c, true);
      for (const d of tones) kit.keys(at(0), degree(root, d), 1.4, 0.09);
      for (const d of tones.slice(1)) kit.keys(at(7), degree(root, d), 0.8, 0.06);
      kit.bass(at(0), degree(root / 2, c), 0.5);
      kit.bass(at(7), degree(root / 2, c + 4), 0.3, 0.14);
      kit.bass(at(10), degree(root / 2, c + 2), 0.3, 0.14);
      kit.kick(at(0), 0.2);
      kit.kick(at(10), 0.14);
      kit.snare(at(4));
      kit.snare(at(12));
      for (let s = 0; s < 16; s += 2) kit.hat(at(s), s % 4 ? 0.025 : 0.035);
      if (Math.random() < 0.6) kit.bell(at(14), degree(root * 4, pick(tones)), 0.04);
    },
  },
  marimba: {
    name: "Marimba",
    bpm: 120,
    bar(kit, { at, root, c }) {
      const tones = chord(c);
      // A syncopated pattern on the chord, plus a few answering notes.
      [0, 3, 6, 8, 11, 14].forEach((s, i) => kit.marimba(at(s), degree(root * 2, tones[i % 3] + (i > 2 ? 7 : 0))));
      for (const s of [4, 10, 15]) if (Math.random() < 0.6) kit.marimba(at(s), degree(root * 4, pick(tones)), 0.08);
      for (const d of tones) kit.pad(at(0), degree(root, d), at(16) - at(0), 0.02);
      kit.bass(at(0), degree(root / 2, c), 0.3);
      kit.bass(at(8), degree(root / 2, c), 0.3, 0.15);
      kit.bass(at(11), degree(root / 2, c + 4), 0.2, 0.1);
      kit.kick(at(0), 0.2);
      kit.kick(at(8), 0.15);
      for (const s of [2, 6, 10, 14]) kit.hat(at(s));
      kit.snare(at(12), 0.05);
    },
  },
};

// With "Mix" chosen (the default), the thinking puzzles get Lo-fi and the hands-on ones Marimba.
// Every puzzle has its own key.
export const PUZZLE_MUSIC = {
  "lights-out": { style: "lofi", root: 261.63 }, // C
  "sliding-tiles": { style: "marimba", root: 349.23 }, // F
  minesweeper: { style: "lofi", root: 293.66 }, // D
  queens: { style: "lofi", root: 196.0 }, // G
  "peg-jump": { style: "marimba", root: 220.0 }, // A
};

/** The style and key for a puzzle, given the "Music style" setting (mix, lofi or marimba). */
export function musicFor(puzzleId, choice = "mix") {
  const { style, root } = PUZZLE_MUSIC[puzzleId] ?? PUZZLE_MUSIC["lights-out"];
  return { style: STYLES[choice] ? choice : style, root };
}

/** Schedules bar number `bar` of `style` at time `start`; returns when the next bar starts. */
export function scheduleBar(kit, styleId, root, start, bar) {
  const style = STYLES[styleId];
  const sixteenth = 60 / style.bpm / 4;
  // Swing pushes every second 16th a little later.
  const at = (step) => start + step * sixteenth + (step % 2 && step < 16 ? (style.swing || 0) * sixteenth : 0);
  style.bar(kit, { at, root, c: PROGRESSION[bar % PROGRESSION.length] });
  return start + 16 * sixteenth;
}
