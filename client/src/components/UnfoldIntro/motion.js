/* ==========================================================================
   unfold intro — motion maths
   Pure helpers: seeded RNG, easings, analytic spring, bezier, choreography plan.
   ========================================================================== */

export const WORD = "unfold";

/* Act boundaries (ms) */
export const ACT = { explode: 700, jumble: 1400, assemble: 2100 };
export const ZOOM_MIN_START = 2380; // earliest the zoom may begin
export const ZOOM_DURATION = 820;   // zoom + reveal ends at ZOOM_MIN_START + 820 ≈ 3200
export const READY_WAIT_CAP = 2600; // never hold the wordmark longer than this

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
export const easeInCubic = (t) => t * t * t;
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
export const smoothstep = (t) => t * t * (3 - 2 * t);
export const easeOutBack = (t, s = 1.7) => {
  const c3 = s + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
};

/** CSS-style cubic-bezier(x1,y1,x2,y2) solver (y may leave 0..1 for anticipation). */
export function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - x;
      if (Math.abs(e) < 1e-5) return sy(t);
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    let lo = 0, hi = 1;
    t = x;
    while (lo < hi) {
      const e = sx(t);
      if (Math.abs(e - x) < 1e-5) break;
      if (x > e) lo = t; else hi = t;
      t = (hi - lo) / 2 + lo;
      if (hi - lo < 1e-6) break;
    }
    return sy(t);
  };
}

/** Analytic under-damped spring, 0 → 1 with overshoot. t in seconds. */
export function spring(t, zeta, omega) {
  if (t <= 0) return 0;
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * omega * t) * (Math.cos(wd * t) + ((zeta * omega) / wd) * Math.sin(wd * t));
}
/** Pick ω so the spring envelope falls below 0.8% in `settle` seconds. */
export const omegaFor = (zeta, settle) => 4.8 / (zeta * settle);

/* ---------- Choreography plan ------------------------------------------------
   Positions are fractions of the viewport (so travel scales with any screen).
   `k` values are multiples of F, the final wordmark font-size.
   ------------------------------------------------------------------------- */

const EDGE_STARTS = [
  [-0.28, 0.5], [1.28, 0.5], [0.5, -0.3], [0.5, 1.3],
  [-0.25, -0.25], [1.25, -0.25], [-0.25, 1.25], [1.25, 1.25]
];

export function buildPlan(small) {
  const rnd = mulberry32(0x0f01d);
  const R = (a, b) => a + (b - a) * rnd();
  const S = small ? 0.78 : 1; // scale damping on small screens

  // Six primaries: hand-choreographed so paths cross and some pass behind others.
  const primaries = [
    { start: [-0.30, 0.30], p1: [0.20, 0.64], p2: [0.80, 0.30], r0: -150, r1: -24, r2: 14,  k0: 0.5, k1: 1.7, k2: 1.0, delay: 0,   overshoot: 1.9 },
    { start: [-0.22, -0.32], p1: [0.72, 0.24], p2: [0.24, 0.30], r0: 200,  r1: 18,  r2: -30, k0: 0.4, k1: 2.3, k2: 1.8, delay: 70,  overshoot: 0 },
    { start: [0.50, -0.35],  p1: [0.40, 0.80], p2: [0.62, 0.74], r0: 110,  r1: -36, r2: 24,  k0: 0.6, k1: 1.2, k2: 2.1, delay: 130, overshoot: 2.2 },
    { start: [1.30, 0.55],   p1: [0.86, 0.58], p2: [0.30, 0.70], r0: -220, r1: 28,  r2: -16, k0: 0.5, k1: 2.0, k2: 1.3, delay: 30,  overshoot: 0 },
    { start: [0.38, 1.35],   p1: [0.30, 0.22], p2: [0.52, 0.28], r0: 130,  r1: 14,  r2: 40,  k0: 0.5, k1: 1.5, k2: 2.2, delay: 160, overshoot: 1.6 },
    { start: [1.30, 1.28],   p1: [0.60, 0.48], p2: [0.14, 0.46], r0: -100, r1: -22, r2: -26, k0: 0.4, k1: 2.4, k2: 1.1, delay: 95,  overshoot: 0 }
  ].map((p, i) => ({
    ...p,
    i,
    k1: p.k1 * S,
    k2: p.k2 * S,
    dur1: 500 + (i % 3) * 30,
    driftA: R(0.025, 0.05),
    driftF: R(1.1, 1.9),
    driftP: R(0, Math.PI * 2),
    springDelay: [0, 60, 110, 30, 130, 85][i]
  }));

  // Surrounding typography (copies of the same six lowercase glyphs).
  const count = small ? 20 : 38;
  const decoys = [];
  for (let n = 0; n < count; n++) {
    const front = rnd() > 0.58;
    const sgn = () => (rnd() > 0.5 ? 1 : -1);
    const colorPick = rnd();
    const color = colorPick < 0.34 ? "primary" : colorPick < 0.62 ? "secondary" : colorPick < 0.84 ? "lavender" : "mint";
    const st = EDGE_STARTS[Math.floor(rnd() * EDGE_STARTS.length)];
    decoys.push({
      n,
      ch: WORD[Math.floor(rnd() * 6)],
      front,
      color,
      weight: [400, 600, 800, 800][Math.floor(rnd() * 4)],
      op: front ? R(0.5, 0.92) : R(0.14, 0.36),
      k1: (front ? R(0.3, 1.0) : R(0.9, 2.5)) * S,
      kScale: R(0.8, 1.35),
      start: [st[0] + R(-0.08, 0.08), st[1] + R(-0.12, 0.12)],
      p1: [R(0.0, 1.0), R(0.02, 1.0)],
      p2: [R(-0.04, 1.04), R(0.0, 1.04)],
      r0: sgn() * R(180, 540),
      r1: sgn() * R(0, 70),
      r2: sgn() * R(0, 90),
      delay: R(0, 260),
      dur1: R(420, 600),
      overshoot: rnd() > 0.7 ? R(1.3, 2.2) : 0,
      driftA: R(0.02, 0.06),
      driftF: R(0.8, 2.0),
      driftP: R(0, Math.PI * 2),
      gatherDelay: front ? R(0, 90) : R(40, 260),
      gatherDur: R(440, 560),
      gatherJit: [R(-0.03, 0.03), R(-0.04, 0.04)]
    });
  }
  return { primaries, decoys };
}
