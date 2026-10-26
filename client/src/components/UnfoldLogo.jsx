import React from "react";

export default function UnfoldLogo({ size = "md", withText = false }) {
  const isSm = size === "sm";
  const iconSize = isSm ? 18 : 23;

  return (
    <div className={`unfold-logo-container ${isSm ? "sm" : ""}`}>
      <span className={`brand-mark ${isSm ? "small-mark" : ""}`} title="Unfold">
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Stylized 'u' shape with geometric unfolding accent */}
          <path d="M6 4v8a6 6 0 0 0 12 0V4" />
          <path d="M12 12l5-5" strokeWidth="2.5" />
          <circle cx="19.5" cy="19.5" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      </span>
      {withText && <span className="brand-text">unfold</span>}
    </div>
  );
}
