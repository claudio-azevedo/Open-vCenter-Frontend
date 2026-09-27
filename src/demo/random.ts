/**
 * Small random helpers for the demo simulator. `Rng` is seeded (the initial
 * inventory is reproducible from `DemoState.seed`); `noise()` is a pure
 * function of (key, index), so time series such as metrics come out the same
 * on every poll without being stored.
 *
 * Ids use `crypto.getRandomValues`, not `crypto.randomUUID()`: the latter only
 * exists in secure contexts, and a demo container is often reached over plain
 * http on a LAN address.
 */

/** FNV-1a 32-bit hash. */
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic value in [0, 1) for a (key, index) pair. */
export function noise(key: string, index: number): number {
  return mulberry32(hash32(key) ^ Math.imul(index, 0x9e3779b1))();
}

export class Rng {
  private next: () => number;

  constructor(seed: number) {
    this.next = mulberry32(seed);
  }

  float(min = 0, max = 1): number {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max], both inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.float(min, max + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  /** Weighted pick: `[[value, weight], …]`. */
  weighted<T>(items: ReadonlyArray<readonly [T, number]>): T {
    const total = items.reduce((n, [, w]) => n + w, 0);
    let r = this.next() * total;
    for (const [value, w] of items) {
      r -= w;
      if (r < 0) return value;
    }
    return items[items.length - 1][0];
  }

  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  hex(length: number): string {
    let s = "";
    while (s.length < length) s += Math.floor(this.next() * 16).toString(16);
    return s;
  }
}

export function randomSeed(): number {
  return randomBytes(4).reduce((n, b) => (n << 8) | b, 0) >>> 0;
}

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(out);
  } else {
    for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  }
  return out;
}

/** RFC 4122 v4 UUID. */
export function uuid(): string {
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function randomHex(length: number): string {
  return [...randomBytes(Math.ceil(length / 2))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, length);
}

/** Hyper-V style MAC (00:15:5D prefix). */
export function randomMac(): string {
  const b = randomBytes(3);
  return ["00", "15", "5D", ...[...b].map((x) => x.toString(16).padStart(2, "0"))]
    .join(":")
    .toUpperCase();
}
