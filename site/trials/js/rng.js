// 決定性亂數：FNV-1a 雜湊 + mulberry32。不使用 Math.random。
export function hashSeed(...parts) {
  let h = 0x811c9dc5;
  for (let i = 0; i < parts.length; i++) {
    const s = String(parts[i]) + '\u0001';
    for (let j = 0; j < s.length; j++) {
      h ^= s.charCodeAt(j);
      h = Math.imul(h, 0x01000193);
    }
  }
  return h >>> 0;
}

function build(state) {
  let a = state >>> 0;
  const rng = {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(n) { return Math.floor(rng.next() * n); },
    pick(arr) { return arr[Math.floor(rng.next() * arr.length)]; },
    shuffle(arr) {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rng.next() * (i + 1));
        const t = out[i]; out[i] = out[j]; out[j] = t;
      }
      return out;
    },
    chance(p) { return rng.next() < p; },
    state() { return a >>> 0; },
  };
  return rng;
}

export function makeRng(seed) { return build(seed >>> 0); }
makeRng.fromState = function (s) { return build(s >>> 0); };
