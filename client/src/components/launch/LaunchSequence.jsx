import React, { useCallback, useEffect, useRef, useState } from "react";
import usePrefersReducedMotion from "../../hooks/usePrefersReducedMotion";
import SplashStage from "./SplashStage";
import WordmarkStage from "./WordmarkStage";

const DEFAULT_TIMING = {
  brandHold: 2450,
  zoom: 900,
  splashHold: 2100,
  overlayExit: 620,
  watchdog: 9500
};

const REDUCED_TIMING = {
  brandHold: 0,
  zoom: 0,
  splashHold: 1500,
  overlayExit: 220,
  watchdog: 4000
};

/**
 * Four-act launch sequence:
 *   1. Icon appears, then the lowercase wordmark is written in.
 *   2. The completed mark holds for a beat.
 *   3. The camera pushes through the mark while the splash resolves underneath.
 *   4. The splash settles, then the real application is revealed.
 *
 * The app mounts underneath immediately, so auth verification and feed data
 * load in parallel. This overlay never gates access.
 */
export default function LaunchSequence({ onExitStart, onComplete }) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const timing = prefersReducedMotion ? REDUCED_TIMING : DEFAULT_TIMING;

  const initialStage = prefersReducedMotion ? "splash" : "brand";
  const [stage, setStage] = useState(initialStage);

  // Keep the visible stage on screen while the overlay fades out after a skip.
  const lastStageRef = useRef(initialStage);
  if (stage !== "exit") lastStageRef.current = stage;
  const visualStage = stage === "exit" ? lastStageRef.current : stage;

  const brandMounted = visualStage === "brand" || visualStage === "zoom";
  const splashMounted = visualStage === "zoom" || visualStage === "splash";

  const onExitStartRef = useRef(onExitStart);
  const onCompleteRef = useRef(onComplete);
  const exitNotifiedRef = useRef(false);
  const completeNotifiedRef = useRef(false);

  useEffect(() => {
    onExitStartRef.current = onExitStart;
  }, [onExitStart]);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Lock page scrolling while the branded overlay is on screen.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("unfold-launching");
    root.classList.remove("unfold-booting");
    return () => root.classList.remove("unfold-launching");
  }, []);

  // Advance forward only. Every timer is cleaned up so StrictMode cannot leave
  // duplicate timers behind or accidentally replay the splash.
  useEffect(() => {
    let timer = null;

    if (stage === "brand") {
      timer = window.setTimeout(() => setStage("zoom"), timing.brandHold);
    } else if (stage === "zoom") {
      // The splash is already mounted underneath the zoom by this point, so
      // this switch only retires the wordmark. Nothing flashes or restarts.
      timer = window.setTimeout(() => setStage("splash"), timing.zoom);
    } else if (stage === "splash") {
      timer = window.setTimeout(() => setStage("exit"), timing.splashHold);
    }

    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [stage, timing]);

  // The final fade. Notify the app as the overlay starts leaving so the
  // dashboard entrance animation plays underneath the fade.
  useEffect(() => {
    if (stage !== "exit") return undefined;

    if (!exitNotifiedRef.current) {
      exitNotifiedRef.current = true;
      onExitStartRef.current?.();
    }

    const timer = window.setTimeout(() => {
      if (completeNotifiedRef.current) return;
      completeNotifiedRef.current = true;
      onCompleteRef.current?.();
    }, timing.overlayExit);

    return () => window.clearTimeout(timer);
  }, [stage, timing]);

  // Safety net: never strand the user on the launch overlay if the tab is
  // throttled or an unexpected runtime condition occurs.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setStage((current) => (current === "exit" ? current : "exit"));
    }, timing.watchdog);
    return () => window.clearTimeout(timer);
  }, [timing.watchdog]);

  const skip = useCallback(() => {
    setStage((current) => (current === "exit" ? current : "exit"));
  }, []);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") skip();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [skip]);

  const isExiting = stage === "exit";
  const isZooming = visualStage === "zoom";

  return (
    <div
      className={`launch-overlay${isExiting ? " launch-overlay--exit" : ""}${
        isZooming ? " launch-overlay--transitioning" : ""
      }${splashMounted ? " launch-overlay--splash" : ""}`}
      aria-label="Unfold introduction"
    >
      <p className="visually-hidden" role="status" aria-live="polite">
        {splashMounted
          ? "Preparing your space. Connecting ideas. Building communities."
          : "unfold. Community, Earned."}
      </p>

      <div className="launch-stage-shell" aria-hidden="true">
        {splashMounted && <SplashStage />}
        {brandMounted && <WordmarkStage zooming={isZooming} />}
      </div>

      {!isExiting && (
        <button type="button" className="launch-skip" onClick={skip}>
          Skip intro
        </button>
      )}
    </div>
  );
}
