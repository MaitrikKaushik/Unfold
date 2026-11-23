import React from "react";
import UnfoldLogo from "../UnfoldLogo";

/**
 * The product splash. It is deliberately editorial rather than a centered
 * loading card: a small brand anchor, a large two-line statement, and one
 * restrained progress rail at the bottom.
 */
export default function SplashStage() {
  return (
    <div className="launch-stage launch-splash-stage">
      <div className="splash-frame">
        <div className="splash-brand-row">
          <UnfoldLogo size="sm" withText />
        </div>

        <div className="splash-copy">
          <h2 className="splash-headline">
            <span>Community,</span>
            <span className="splash-headline-accent">Earned.</span>
          </h2>
          <p className="splash-support">Connecting ideas. Building communities.</p>
        </div>

        <div className="splash-progress">
          <div className="splash-progress-meta">
            <span className="splash-progress-label">Preparing your space</span>
          </div>
          <div className="splash-progress-track" aria-hidden="true">
            <span className="splash-progress-bar" />
          </div>
        </div>
      </div>
    </div>
  );
}
