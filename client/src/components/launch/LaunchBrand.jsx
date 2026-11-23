import React from "react";
import UnfoldLogo from "../UnfoldLogo";

const LETTERS = ["u", "n", "f", "o", "l", "d"];

/**
 * The launch wordmark. Each letter is a real text glyph so the finished mark
 * keeps the exact Unfold typography, but every glyph is revealed by its own
 * moving ink edge. That gives a written-on-screen feel without substituting a
 * different logo or drawing the brand in a fake typeface.
 */
export default function LaunchBrand({ zooming = false }) {
  return (
    <div className={`launch-brand-lockup${zooming ? " is-zooming" : ""}`}>
      <div className="launch-brand-icon">
        <UnfoldLogo size="xl" />
      </div>

      <div className="launch-wordmark" role="img" aria-label="unfold">
        {LETTERS.map((letter, index) => (
          <span
            key={letter}
            className="launch-letter"
            style={{ "--letter-index": index }}
            aria-hidden="true"
          >
            {letter}
          </span>
        ))}
      </div>
    </div>
  );
}
