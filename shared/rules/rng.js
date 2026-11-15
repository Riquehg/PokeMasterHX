// RNG determinístico (mulberry32). O estado do gerador fica DENTRO do estado da partida,
// então o servidor é a única fonte dos dados rolados no online e as partidas podem ser reproduzidas em testes.

export function createRng(seed) {
  let s = (Number(seed) >>> 0) || 0x9e3779b9;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(min, max) { return min + Math.floor(next() * (max - min + 1)); },
    d6() { return 1 + Math.floor(next() * 6); },
    chance(p) { return next() < p; },
    pick(arr) { return arr[Math.floor(next() * arr.length)]; },
    weighted(entries) { // [[valor, peso], ...]
      const total = entries.reduce((a, [, w]) => a + w, 0);
      let r = next() * total;
      for (const [v, w] of entries) { r -= w; if (r < 0) return v; }
      return entries[entries.length - 1][0];
    },
    get state() { return s; }
  };
}

export function randomSeed() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return Math.floor(Math.random() * 2 ** 32);
}
