/* ============================================================
   Persistent save/load via localStorage.
   Survives across sessions and works offline. All access is
   wrapped so private-mode / disabled-storage never crashes the game.
   ============================================================ */

const KEY = 'bounce.save.v1';

const DEFAULT_SAVE = {
  unlockedLevel: 0,        // highest level index the player may enter
  bestTimes: {},           // { [levelIndex]: ms }
  totalRings: 0,           // lifetime rings collected
  settings: {
    muted: false,
  },
};

let cache = null;

function read() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? { ...DEFAULT_SAVE, ...JSON.parse(raw) } : { ...DEFAULT_SAVE };
  } catch {
    cache = { ...DEFAULT_SAVE };
  }
  // Defensive: ensure nested objects exist after a partial/old save.
  cache.bestTimes = cache.bestTimes || {};
  cache.settings = { ...DEFAULT_SAVE.settings, ...(cache.settings || {}) };
  return cache;
}

function write() {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* storage unavailable (private mode / quota) — game still runs in-memory */
  }
}

export const Storage = {
  get() { return read(); },

  getUnlockedLevel() { return read().unlockedLevel; },

  unlockLevel(index) {
    const s = read();
    if (index > s.unlockedLevel) { s.unlockedLevel = index; write(); }
  },

  getBestTime(levelIndex) { return read().bestTimes[levelIndex] ?? null; },

  recordTime(levelIndex, ms) {
    const s = read();
    const prev = s.bestTimes[levelIndex];
    if (prev == null || ms < prev) { s.bestTimes[levelIndex] = ms; write(); return true; }
    return false;
  },

  addRings(n) {
    const s = read();
    s.totalRings += n;
    write();
  },

  isMuted() { return read().settings.muted; },

  setMuted(muted) {
    const s = read();
    s.settings.muted = !!muted;
    write();
  },

  reset() {
    cache = { ...DEFAULT_SAVE, bestTimes: {}, settings: { ...DEFAULT_SAVE.settings } };
    write();
  },
};
