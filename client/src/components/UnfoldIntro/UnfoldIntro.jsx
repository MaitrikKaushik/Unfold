import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./intro.css";
import {
  ACT, WORD, ZOOM_MIN_START, ZOOM_DURATION, READY_WAIT_CAP,
  buildPlan, bezier, clamp, lerp, spring, omegaFor,
  easeOutCubic, easeInCubic, easeInOutCubic, easeInOutSine, easeOutBack, smoothstep
} from "./motion";

/* ==========================================================================
   unfold — cinematic first-load intro
   Chaos → Movement → Jumble → Assembly → Zoom → Platform reveal

   • One SVG, one requestAnimationFrame timeline, zero React re-renders while playing.
   • Only transform / opacity are animated.
   • The overlay is a cream plate with the wordmark punched out as a mask, so the
     live app is revealed *through* the zoomed letters.
   • The app underneath is untouched; it boots normally and is made inert until reveal.
   ========================================================================== */

const COLOR_VAR = {
  primary: "var(--color-primary)",
  secondary: "var(--color-secondary)",
  lavender: "var(--color-lavender)",
  mint: "var(--color-mint)"
};

const SPRING_Z = 0.56;
const SPRING_SETTLE = 0.6; // seconds
const SPRING_W = omegaFor(SPRING_Z, SPRING_SETTLE);
const ZOOM_EASE = bezier(0.66, -0.08, 0.16, 1);
const HOLE_START = 0.2;   // zoom depth (0..1 of the log-scale) where letters start becoming windows
const HOLE_SPAN = 0.26;

function shouldPlay() {
  try {
    const q = new URLSearchParams(window.location.search).get("intro");
    if (q === "0" || q === "off") return false;
  } catch { /* ignore */ }
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function storedTheme() {
  try { return localStorage.getItem("unfold_theme") || "light"; } catch { return "light"; }
}

function appIsReady() {
  const root = document.getElementById("root");
  if (!root) return true;
  if (!root.querySelector(".app-shell, .auth-page-wrapper")) return false;
  return !root.querySelector(".loading-spinner, .loading-state, [class*='skeleton']");
}

/* ----- free motion (acts 1 + 2) ------------------------------------------ */

function baseAt(p, t, W, H, F, isPrimary) {
  const u1 = clamp((t - p.delay) / p.dur1);
  const e1 = p.overshoot ? easeOutBack(u1, p.overshoot) : easeOutCubic(u1);
  const e2 = easeInOutSine(clamp((t - ACT.explode) / (ACT.jumble - ACT.explode)));
  const x = lerp(p.start[0], p.p1[0], e1) + (p.p2[0] - p.p1[0]) * e2;
  const y = lerp(p.start[1], p.p1[1], e1) + (p.p2[1] - p.p1[1]) * e2;
  const r = lerp(p.r0, p.r1, e1) + (p.r2 - p.r1) * e2;
  let k;
  if (isPrimary) k = lerp(p.k0, p.k1, e1) + (p.k2 - p.k1) * e2;
  else k = p.k1 * lerp(0.4, 1, e1) * lerp(1, p.kScale, e2);
  return { x: x * W, y: y * H, r, k };
}

function driftAt(p, t, W, H) {
  const env = smoothstep(clamp((t - 350) / 400));
  const s = t / 1000;
  return {
    dx: p.driftA * W * Math.sin(Math.PI * 2 * p.driftF * s + p.driftP) * env,
    dy: p.driftA * H * Math.cos(Math.PI * 2 * p.driftF * 0.8 * s + p.driftP * 1.3) * env,
    dr: 5 * Math.sin(Math.PI * 2 * p.driftF * 0.6 * s + p.driftP) * env,
    dk: 1 + 0.05 * Math.sin(Math.PI * 2 * p.driftF * 0.5 * s + p.driftP) * env
  };
}

const tf = (x, y, r, s) =>
  `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${r.toFixed(2)}) scale(${s.toFixed(4)})`;

/* ========================================================================== */

function IntroStage({ onDone }) {
  const plan = useMemo(() => buildPlan(window.innerWidth < 640), []);
  const theme = useMemo(storedTheme, []);

  const hostRef = useRef(null);
  const svgRef = useRef(null);
  const bgRef = useRef(null);
  const maskRef = useRef(null);
  const maskRectRef = useRef(null);
  const gradRef = useRef(null);
  const prim = useRef([]);
  const hi = useRef([]);
  const hole = useRef([]);
  const decoy = useRef([]);
  const primGroup = useRef(null);
  const hiGroup = useRef(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    const rootEl = document.getElementById("root");
    const html = document.documentElement;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    html.classList.add("uf-intro-lock");
    if (rootEl) { rootEl.inert = true; }

    let L = null;              // layout
    let raf = 0;
    let finished = false;
    let cancelled = false;
    let t0 = null;
    let zoomT = null;          // time the zoom was triggered
    let readyCount = 0;
    let passthrough = false;
    let leaving = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      clearInterval(poll);
      clearTimeout(watchdog);
      window.removeEventListener("keydown", onKey);
      host.removeEventListener("pointerdown", onSkip);
      window.removeEventListener("resize", onResize);
      if (rootEl) rootEl.inert = false;
      html.classList.remove("uf-intro-lock");
      window.dispatchEvent(new CustomEvent("unfold:intro-complete"));
      onDone();
    };

    const release = () => {
      if (passthrough) return;
      passthrough = true;
      host.classList.add("uf-passthrough");
      if (rootEl) rootEl.inert = false;
    };

    const leave = (ms = 320) => {
      if (leaving) return;
      leaving = true;
      release();
      host.classList.add("uf-leaving");
      setTimeout(finish, ms + 20);
    };

    /* ----- layout ------------------------------------------------------- */
    function layout() {
      const W = host.clientWidth || window.innerWidth;
      const H = host.clientHeight || window.innerHeight;
      const small = W < 640;
      const family = getComputedStyle(document.body).fontFamily || "sans-serif";
      const ctx = document.createElement("canvas").getContext("2d");
      ctx.font = `800 100px ${family}`;
      const advs100 = [...WORD].map((c) => ctx.measureText(c).width);
      const ls100 = -2.4; // tracking, in px at 100px
      const total100 = advs100.reduce((a, b) => a + b, 0) + ls100 * 5;
      const targetW = small ? W * 0.76 : Math.min(W * 0.5, 840);
      const F = Math.min((targetW / total100) * 100, H * 0.32);
      const adv = advs100.map((a) => (a * F) / 100);
      const ls = (ls100 * F) / 100;
      const total = adv.reduce((a, b) => a + b, 0) + ls * 5;
      const x0 = W / 2 - total / 2;
      const baseline = H / 2 + 0.37 * F;
      const fx = [];
      let cur = x0;
      adv.forEach((a) => { fx.push(cur + a / 2); cur += a + ls; });

      ctx.font = `800 ${F}px ${family}`;
      const m = ctx.measureText("l");
      let stemW = (m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || 0);
      if (!(stemW > 1)) stemW = 0.17 * F;
      const stemH = 0.7 * F;
      const sEnd = 1.4 * Math.max(W / stemW, H / stemH);
      const li = WORD.indexOf("l");
      const P = { x: fx[li], y: baseline - 0.33 * F };

      L = { W, H, F, fx, baseline, sEnd, P, x0, total, small };

      svgRef.current.setAttribute("viewBox", `0 0 ${W} ${H}`);
      for (const r of [bgRef.current, maskRectRef.current]) {
        r.setAttribute("width", W); r.setAttribute("height", H);
      }
      maskRef.current.setAttribute("width", W);
      maskRef.current.setAttribute("height", H);
      [...prim.current, ...hi.current, ...hole.current, ...decoy.current].forEach((el) => {
        el && el.setAttribute("font-size", F);
      });
      hi.current.forEach((el, i) => el.setAttribute("transform", tf(fx[i], baseline, 0, 1)));
      gradRef.current.setAttribute("gradientTransform", `rotate(16 ${W / 2} ${H / 2})`);
    }

    const onResize = () => { try { layout(); } catch { leave(0); } };

    /* ----- per-frame render -------------------------------------------- */
    const ZOOM_PARAMS = { from: 0 };
    void ZOOM_PARAMS;

    function renderStatic() {
      prim.current.forEach((el, i) => {
        el.setAttribute("transform", tf(L.fx[i], L.baseline, 0, 1));
        el.style.opacity = 1;
      });
    }

    function renderIntro(t) {
      const { W, H, F, fx, baseline } = L;
      const cx = W / 2, cy = H / 2;

      /* primaries */
      plan.primaries.forEach((p, i) => {
        const el = prim.current[i];
        const ts = ACT.jumble + p.springDelay;
        let x, y, r, k;
        if (t <= ts) {
          const b = baseAt(p, t, W, H, F, true);
          const d = driftAt(p, t, W, H);
          x = b.x + d.dx; y = b.y + d.dy; r = b.r + d.dr; k = b.k * d.dk;
        } else {
          const b = baseAt(p, ts, W, H, F, true);
          const tau = (t - ts) / 1000;
          if (tau >= SPRING_SETTLE) {
            x = fx[i]; y = baseline; r = 0; k = 1;
          } else {
            const q = spring(tau, SPRING_Z, SPRING_W);
            const dec = Math.exp(-(t - ts) / 110);
            const d = driftAt(p, t, W, H);
            x = lerp(b.x, fx[i], q) + d.dx * dec;
            y = lerp(b.y, baseline, q) + d.dy * dec;
            r = lerp(b.r, 0, q) + d.dr * dec;
            k = lerp(b.k, 1, q);
          }
        }
        el.setAttribute("transform", tf(x, y, r, k));
        el.style.opacity = t < p.delay ? 0 : clamp((t - p.delay) / 90);
      });

      /* surrounding typography */
      plan.decoys.forEach((p, i) => {
        const el = decoy.current[i];
        const tg = ACT.jumble + p.gatherDelay;
        const fade = clamp((t - p.delay) / 140);
        if (t <= tg) {
          const b = baseAt(p, t, W, H, F, false);
          const d = driftAt(p, t, W, H);
          el.setAttribute("transform", tf(b.x + d.dx, b.y + d.dy, b.r + d.dr, b.k * d.dk));
          el.style.opacity = p.op * fade;
        } else {
          const u = clamp((t - tg) / p.gatherDur);
          if (u >= 1) { el.style.opacity = 0; return; }
          const b = baseAt(p, tg, W, H, F, false);
          const e = easeInOutCubic(u);
          const dec = Math.exp(-(t - tg) / 110);
          const d = driftAt(p, t, W, H);
          const tx = cx + p.gatherJit[0] * W, ty = cy - 0.1 * F + p.gatherJit[1] * H;
          el.setAttribute(
            "transform",
            tf(lerp(b.x, tx, e) + d.dx * dec, lerp(b.y, ty, e) + d.dy * dec, lerp(b.r, 0, e), lerp(b.k, b.k * 0.18, e))
          );
          el.style.opacity = p.op * (1 - smoothstep(clamp((u - 0.25) / 0.75)));
        }
      });
    }

    function setSweep(t) {
      /* light sweep: re-fires every 1.5s while the wordmark waits for the app */
      const { W, fx, total } = L;
      const start = ACT.assemble + 20;
      const period = 1500;
      const local = (t - start) % period;
      const first = t - start < period;
      const u = clamp(local / 560);
      const left = L.x0 - 0.35 * total;
      const right = L.x0 + 1.35 * total;
      const gx = lerp(left, right, easeInOutCubic(u));
      const bw = 0.3 * total;
      const g = gradRef.current;
      g.setAttribute("x1", gx - bw); g.setAttribute("x2", gx + bw);
      g.setAttribute("y1", L.baseline); g.setAttribute("y2", L.baseline);
      hiGroup.current.style.opacity = t < start ? 0 : (first ? 1 : 0.7);
      void W; void fx;
    }

    function renderZoom(t) {
      const { W, H, fx, baseline, sEnd, P } = L;
      const u = clamp((t - zoomT) / ZOOM_DURATION);
      const e = ZOOM_EASE(u);
      const s = Math.exp(Math.log(sEnd) * e);
      const w = clamp(e, 0, 1);
      const ax = lerp(P.x, W / 2, w), ay = lerp(P.y, H / 2, w);
      const spread = 1 + 0.28 * w * w;

      const h = easeInOutCubic(clamp((e - HOLE_START) / HOLE_SPAN));
      if (h > 0) release();

      for (let i = 0; i < 6; i++) {
        const x = ax + s * spread * (fx[i] - P.x);
        const y = ay + s * (baseline - P.y);
        const str = tf(x, y, 0, s);
        prim.current[i].setAttribute("transform", str);
        hole.current[i].setAttribute("transform", str);
        hole.current[i].style.fillOpacity = h;
      }
      primGroup.current.style.opacity = 1 - h;
      hiGroup.current.style.opacity = 0;
      return u;
    }

    /* ----- main loop --------------------------------------------------- */
    function frame(now) {
      if (finished || cancelled) return;
      if (t0 === null) t0 = now;
      const t = now - t0;
      try {
        if (t > ACT.assemble) {
          // lock the wordmark exactly in place once assembled
          if (zoomT === null) {
            renderStatic();
            plan.decoys.forEach((_, i) => { decoy.current[i].style.opacity = 0; });
            setSweep(t);
            const ready = readyCount >= 2;
            if ((t >= ZOOM_MIN_START && ready) || t >= ZOOM_MIN_START + READY_WAIT_CAP) {
              zoomT = Math.max(t, ZOOM_MIN_START);
              hiGroup.current.style.opacity = 0;
            }
          }
          if (zoomT !== null && t >= zoomT) {
            const u = renderZoom(t);
            if (u >= 1) { finish(); return; }
          }
        } else {
          renderIntro(t);
        }
      } catch (err) {
        console.warn("[unfold intro] animation failed, skipping", err);
        finish();
        return;
      }
      raf = requestAnimationFrame(frame);
    }

    function frameReduced(now) {
      if (finished || cancelled) return;
      if (t0 === null) t0 = now;
      const t = now - t0;
      renderStatic();
      if (t > 500 && readyCount >= 2) { leave(380); return; }
      if (t > 500 + READY_WAIT_CAP) { leave(380); return; }
      raf = requestAnimationFrame(frameReduced);
    }

    /* ----- readiness, skip, failsafes ---------------------------------- */
    const poll = setInterval(() => {
      readyCount = appIsReady() ? readyCount + 1 : 0;
    }, 120);

    const watchdog = setTimeout(finish, 9000);

    const onSkip = () => { if (!passthrough) leave(260); };
    const onKey = (e) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") onSkip();
    };
    window.addEventListener("keydown", onKey);
    host.addEventListener("pointerdown", onSkip);
    window.addEventListener("resize", onResize);

    /* ----- boot: wait for the brand font (bounded) then play ---------- */
    (async () => {
      try {
        await Promise.race([
          document.fonts?.load('800 100px "Plus Jakarta Sans"') ?? Promise.resolve(),
          new Promise((r) => setTimeout(r, 900))
        ]);
      } catch { /* font failure → fall back to system font */ }
      if (cancelled || finished) return;
      try {
        layout();
      } catch (err) {
        console.warn("[unfold intro] layout failed, skipping", err);
        finish();
        return;
      }
      raf = requestAnimationFrame(reduced ? frameReduced : frame);
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      clearInterval(poll);
      clearTimeout(watchdog);
      window.removeEventListener("keydown", onKey);
      host.removeEventListener("pointerdown", onSkip);
      window.removeEventListener("resize", onResize);
      if (!finished) {
        if (rootEl) rootEl.inert = false;
        html.classList.remove("uf-intro-lock");
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const letters = [...WORD];
  const glyphStyle = { fontWeight: 800 };

  return (
    <div className="uf-intro" data-theme={theme} ref={hostRef} aria-hidden="true">
      <svg className="uf-svg" ref={svgRef} preserveAspectRatio="none" focusable="false">
        <defs>
          <mask id="uf-hole" ref={maskRef} maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
            <rect ref={maskRectRef} x="0" y="0" width="100%" height="100%" fill="#fff" />
            {letters.map((c, i) => (
              <text key={i} className="uf-glyph" ref={(el) => (hole.current[i] = el)}
                style={{ ...glyphStyle, fillOpacity: 0 }} fill="#000">{c}</text>
            ))}
          </mask>
          <linearGradient id="uf-sweep" ref={gradRef} gradientUnits="userSpaceOnUse">
            <stop offset="0" style={{ stopColor: "var(--color-secondary)", stopOpacity: 0 }} />
            <stop offset="0.5" style={{ stopColor: "var(--color-secondary)", stopOpacity: 1 }} />
            <stop offset="1" style={{ stopColor: "var(--color-secondary)", stopOpacity: 0 }} />
          </linearGradient>
        </defs>

        <rect className="uf-bg" ref={bgRef} x="0" y="0" width="100%" height="100%" mask="url(#uf-hole)" />

        {/* back layer: large, quiet letters */}
        <g>
          {plan.decoys.map((d, i) => !d.front && (
            <text key={d.n} className="uf-glyph" ref={(el) => (decoy.current[i] = el)}
              style={{ fontWeight: d.weight, fill: COLOR_VAR[d.color], opacity: 0 }}>{WORD[WORD.indexOf(d.ch)]}</text>
          ))}
        </g>

        {/* the six real letters */}
        <g ref={primGroup}>
          {letters.map((c, i) => (
            <text key={i} className="uf-glyph" ref={(el) => (prim.current[i] = el)}
              style={{ ...glyphStyle, fill: "var(--color-primary)", opacity: 0 }}>{c}</text>
          ))}
        </g>

        {/* light sweep, clipped to the glyphs themselves */}
        <g ref={hiGroup} style={{ opacity: 0 }}>
          {letters.map((c, i) => (
            <text key={i} className="uf-glyph" ref={(el) => (hi.current[i] = el)}
              style={glyphStyle} fill="url(#uf-sweep)">{c}</text>
          ))}
        </g>

        {/* front layer: smaller, brighter letters that cross over the wordmark */}
        <g>
          {plan.decoys.map((d, i) => d.front && (
            <text key={d.n} className="uf-glyph" ref={(el) => (decoy.current[i] = el)}
              style={{ fontWeight: d.weight, fill: COLOR_VAR[d.color], opacity: 0 }}>{d.ch}</text>
          ))}
        </g>
      </svg>
    </div>
  );
}

export default function UnfoldIntro() {
  const [alive, setAlive] = useState(shouldPlay);
  useEffect(() => { /* keeps hook order stable in StrictMode */ }, []);
  if (!alive) return null;
  return createPortal(<IntroStage onDone={() => setAlive(false)} />, document.body);
}
