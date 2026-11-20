// Sound effects and background music, all made in code with Web Audio: there are no audio files,
// so the app stays small and works offline. Browsers only allow sound after a tap, so nothing is
// set up until the first one. On iPhone the "ambient" audio session respects the silent switch
// and mixes with the player's own music instead of stopping it.
import { setting } from "../lib/settings.js";

let ctx = null;
let master = null;
let sfxBus = null;
let musicBus = null;
let noiseBuffer = null;

const now = () => ctx.currentTime;

function setUp() {
  if (ctx) return true;
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return false;
  try {
    if (navigator.audioSession) navigator.audioSession.type = "ambient";
  } catch {
    // Older Safari.
  }
  ctx = new Context();
  master = ctx.createGain();
  master.connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.6;
  sfxBus.connect(master);
  musicBus = ctx.createGain();
  musicBus.gain.value = 0;
  musicBus.connect(master);
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return true;
}

/** Call from a tap: unlocks audio (browsers need a tap first) and starts music if it's due. */
export function unlockAudio() {
  if (!setting("sound") && !setting("music")) return;
  if (!setUp()) return;
  if (ctx.state === "suspended" && document.visibilityState === "visible") ctx.resume().catch(() => {});
  syncMusic();
}

// ---------- Building blocks ----------

/** A note with a quick attack and a decay. */
function tone({ freq, type = "sine", start = 0, attack = 0.005, decay = 0.3, gain = 0.3, to = null, bus = sfxBus, filter = null }) {
  const t = now() + start;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + decay);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(gain, t + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  let out = osc;
  if (filter) {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = filter;
    osc.connect(lp);
    out = lp;
  }
  out.connect(amp).connect(bus);
  osc.start(t);
  osc.stop(t + attack + decay + 0.05);
}

/** A short burst of filtered noise: clicks, clacks and thuds. */
function noise({ start = 0, decay = 0.05, gain = 0.3, freq = 2000, q = 1, type = "bandpass" }) {
  const t = now() + start;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(gain, t);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  src.connect(filter).connect(amp).connect(sfxBus);
  src.start(t);
  src.stop(t + decay + 0.05);
}

// A pentatonic scale never sounds wrong, whatever order the notes come in.
const PENTATONIC = [0, 2, 4, 7, 9];
const noteFreq = (root, step) => root * 2 ** ((PENTATONIC[((step % 5) + 5) % 5] + 12 * Math.floor(step / 5)) / 12);

// ---------- Sound effects ----------

const SOUNDS = {
  // Lights Out: a soft pluck, higher for rows nearer the top.
  light: ({ row = 0 }) => tone({ freq: noteFreq(392, 6 - row), type: "triangle", decay: 0.35, gain: 0.22, filter: 2400 }),
  // Sliding Tiles: a wooden clack.
  slide: () => {
    noise({ decay: 0.04, gain: 0.35, freq: 1700, q: 3 });
    tone({ freq: 320, decay: 0.06, gain: 0.12 });
  },
  dig: () => noise({ decay: 0.06, gain: 0.22, freq: 900, q: 0.8 }),
  flag: () => tone({ freq: 660, to: 880, decay: 0.12, gain: 0.12, type: "triangle" }),
  // Queens: a small chime for a queen, a light tick for a ✕.
  queen: () => {
    tone({ freq: 1046, decay: 0.6, gain: 0.14 });
    tone({ freq: 2093, decay: 0.35, gain: 0.04 });
  },
  cross: () => noise({ decay: 0.025, gain: 0.15, freq: 3200, q: 2 }),
  clear: () => tone({ freq: 500, decay: 0.05, gain: 0.05 }),
  clash: () => tone({ freq: 185, type: "triangle", decay: 0.25, gain: 0.18, filter: 600 }),
  // Peg Jump: pick up, then a "plock" as it lands.
  pick: () => tone({ freq: 520, decay: 0.06, gain: 0.1, type: "triangle" }),
  land: () => tone({ freq: 620, to: 240, decay: 0.09, gain: 0.3 }),
  undo: () => tone({ freq: 440, to: 330, decay: 0.08, gain: 0.08, type: "triangle" }),
  hint: () => tone({ freq: 1318, decay: 0.4, gain: 0.07 }),
  win: () => [0, 2, 4, 7].forEach((step, i) => {
    tone({ freq: noteFreq(523, step), start: i * 0.11, decay: 0.9, gain: 0.16 });
    tone({ freq: noteFreq(523, step) * 2, start: i * 0.11, decay: 0.5, gain: 0.04 });
  }),
  finish: () => [0, 2].forEach((step, i) => tone({ freq: noteFreq(392, step), start: i * 0.14, decay: 0.6, gain: 0.14 })),
  mine: () => {
    tone({ freq: 90, to: 45, decay: 0.4, gain: 0.5 });
    noise({ decay: 0.3, gain: 0.25, freq: 300, type: "lowpass" });
  },
};

/** Plays a sound effect by name, if sound effects are on. */
export function play(name, detail = {}) {
  if (!setting("sound") || !SOUNDS[name]) return;
  if (!setUp() || ctx.state !== "running") return;
  SOUNDS[name](detail);
  if (name === "win" || name === "finish") duckMusic();
}

// ---------- Music ----------
//
// Slow, quiet chords on a pentatonic scale through a soft filter, with an occasional bell note.
// Each puzzle has its own key and sound, so each game has its own mood without any files.

const MOODS = {
  "lights-out": { root: 196, wave: "sine", filter: 1100, bell: 0.35 },
  "sliding-tiles": { root: 174.6, wave: "triangle", filter: 800, bell: 0.2 },
  minesweeper: { root: 146.8, wave: "sine", filter: 700, bell: 0.15 },
  queens: { root: 220, wave: "triangle", filter: 1000, bell: 0.3 },
  "peg-jump": { root: 164.8, wave: "sine", filter: 900, bell: 0.25 },
};
const CHORD_SECONDS = 6;

let mood = null; // puzzle id while a game is open
let musicTimer = null;
let nextChordAt = 0;
let step = 0;

function scheduleChords() {
  const { root, wave, filter, bell } = MOODS[mood] ?? MOODS["lights-out"];
  while (nextChordAt < now() + 1) {
    const start = nextChordAt - now();
    // Wander around the scale a step or two at a time.
    step += [-2, -1, 1, 2][Math.floor(Math.random() * 4)];
    step = Math.max(-3, Math.min(4, step));
    for (const offset of [0, 2, 4]) {
      tone({ freq: noteFreq(root, step + offset), type: wave, start, attack: 2, decay: CHORD_SECONDS + 1, gain: 0.05, filter, bus: musicBus });
    }
    if (Math.random() < bell) {
      tone({ freq: noteFreq(root * 4, step + Math.floor(Math.random() * 5)), start: start + 1 + Math.random() * 3, attack: 0.01, decay: 2.5, gain: 0.025, bus: musicBus });
    }
    nextChordAt += CHORD_SECONDS;
  }
}

function syncMusic() {
  if (!ctx) return;
  const wanted = setting("music") && mood !== null && document.visibilityState === "visible";
  const volume = wanted ? setting("musicVolume") * 0.9 : 0;
  musicBus.gain.cancelScheduledValues(now());
  musicBus.gain.setValueAtTime(musicBus.gain.value, now());
  musicBus.gain.linearRampToValueAtTime(volume, now() + (wanted ? 2 : 0.6));
  if (wanted && !musicTimer) {
    nextChordAt = now() + 0.1;
    scheduleChords();
    musicTimer = setInterval(scheduleChords, 500);
  } else if (!wanted && musicTimer) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}

/** Sets which puzzle's music plays; null (Home) fades it out. */
export function setMood(puzzleId) {
  mood = puzzleId;
  syncMusic();
}

/** Turns music down for a moment so a win chime stands out. */
function duckMusic() {
  if (!musicTimer) return;
  const volume = setting("musicVolume") * 0.9;
  musicBus.gain.cancelScheduledValues(now());
  musicBus.gain.setValueAtTime(musicBus.gain.value, now());
  musicBus.gain.linearRampToValueAtTime(volume * 0.3, now() + 0.2);
  musicBus.gain.linearRampToValueAtTime(volume * 0.3, now() + 2.2);
  musicBus.gain.linearRampToValueAtTime(volume, now() + 4);
}

/** Call when a sound setting changes. */
export function audioSettingsChanged() {
  if (setting("sound") || setting("music")) unlockAudio();
  else syncMusic();
}

// Stop all sound while the app is in the background; fade back in on return.
document.addEventListener("visibilitychange", () => {
  if (!ctx) return;
  if (document.visibilityState === "hidden") {
    syncMusic();
    ctx.suspend().catch(() => {});
  } else {
    ctx.resume().catch(() => {});
    syncMusic();
  }
});
