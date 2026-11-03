// Seeded randomness, so a puzzle can be rebuilt exactly from its seed: the daily puzzles are
// the same on every device, and an unfinished puzzle can be restored after the app closes.

/** A 32-bit hash of a string (FNV-1a). */
export function hashString(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** A random number function (0 ≤ n < 1) that always gives the same sequence for a seed. */
export function seededRandom(seed) {
  let state = typeof seed === "number" ? seed >>> 0 : hashString(String(seed));
  return () => {
    // mulberry32
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randomInt = (random, max) => Math.floor(random() * max);

export function shuffle(array, random) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = randomInt(random, i + 1);
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/** A new random seed for a non-daily puzzle. */
export const newSeed = () => `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;

/** "2026-11-03" in the device's own time zone, so the daily puzzle changes at local midnight. */
export function dateKey(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The date key `days` days from `key`. */
export function addDays(key, days) {
  const [y, m, d] = key.split("-").map(Number);
  return dateKey(new Date(y, m - 1, d + days));
}
