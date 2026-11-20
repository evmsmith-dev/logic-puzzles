// Sound effects and background music, all made in code with Web Audio: there are no audio files,
// so the app stays small and works offline. Browsers only allow sound after a tap, so nothing is
// set up until the first one. On iPhone the "ambient" audio session respects the silent switch
// and mixes with the player's own music instead of stopping it.
import { setting } from "../lib/settings.js";
import { makeKit, musicFor, scheduleBar } from "./music.js";

// The music has a beat and a bass line, so it sits a little lower than the volume slider says,
// keeping sound effects clearly on top.
const MUSIC_LEVEL = 0.7;

let ctx = null;
let master = null;
let sfxBus = null;
let musicBus = null;
let noiseBuffer = null;
let unavailable = false; // Web Audio missing or failed: stop trying

const now = () => ctx.currentTime;

function setUp() {
  if (ctx) return true;
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context || unavailable) return false;
  try {
    if (navigator.audioSession) navigator.audioSession.type = "ambient";
  } catch {
    // Older Safari.
  }
  try {
    ctx = new Context();
  } catch {
    unavailable = true;
    return false;
  }
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
  if (!setting("sound") || !SOUNDS[name] || !setUp()) return;
  const sound = () => {
    SOUNDS[name](detail);
    if (name === "win" || name === "finish") duckMusic();
  };
  // The first sound can arrive while audio is still waking up: play it once it's ready.
  if (ctx.state === "running") sound();
  else if (document.visibilityState === "visible") ctx.resume().then(sound, () => {});
}

// ---------- Music ----------
//
// The music itself is in music.js. Here it's started, stopped and faded. Bars are scheduled
// a little ahead (checked twice a second) so timing stays steady.

let mood = null; // puzzle id while a game is open
let musicTimer = null;
let musicKit = null;
let nextBarAt = 0;
let barNumber = 0;

function scheduleMusic() {
  const { style, root } = musicFor(mood, setting("musicStyle"));
  while (nextBarAt < now() + 1.2) {
    nextBarAt = scheduleBar(musicKit, style, root, nextBarAt, barNumber++);
  }
}

function syncMusic() {
  if (!ctx) return;
  const wanted = setting("music") && mood !== null && document.visibilityState === "visible";
  const volume = wanted ? setting("musicVolume") * MUSIC_LEVEL : 0;
  musicBus.gain.cancelScheduledValues(now());
  musicBus.gain.setValueAtTime(musicBus.gain.value, now());
  musicBus.gain.linearRampToValueAtTime(volume, now() + (wanted ? 1.5 : 0.6));
  if (wanted && !musicTimer) {
    musicKit ??= makeKit(ctx, musicBus);
    nextBarAt = now() + 0.1;
    barNumber = 0;
    scheduleMusic();
    musicTimer = setInterval(scheduleMusic, 500);
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
  const volume = setting("musicVolume") * MUSIC_LEVEL;
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
