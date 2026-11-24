import React from "react";

export function SkeletonBox({ width = "100%", height = "16px", borderRadius = "var(--radius-control)", className = "" }) {
  return (
    <div
      className={`skeleton-element skeleton-box ${className}`}
      style={{ width, height, borderRadius }}
      aria-hidden="true"
    />
  );
}

export function SkeletonCircle({ size = 40, className = "" }) {
  return (
    <div
      className={`skeleton-element skeleton-circle ${className}`}
      style={{ width: size, height: size, minWidth: size, minHeight: size, borderRadius: "50%" }}
      aria-hidden="true"
    />
  );
}

export function SkeletonLine({ width = "100%", height = "12px", className = "" }) {
  return (
    <div
      className={`skeleton-element skeleton-line ${className}`}
      style={{ width, height, borderRadius: "6px" }}
      aria-hidden="true"
    />
  );
}

export function ProfilePageSkeleton() {
  return (
    <div className="skeleton-container profile-skeleton-layout" aria-label="Loading profile...">
      <div className="skeleton-header mb-4">
        <SkeletonBox width="140px" height="28px" className="mb-2" />
        <SkeletonBox width="300px" height="16px" />
      </div>

      <div className="profile-layout-grid">
        <div className="profile-edit-col">
          <div className="settings-card mb-4">
            <div className="d-flex align-items-center gap-3 mb-4">
              <SkeletonCircle size={56} />
              <div className="flex-grow-1">
                <SkeletonLine width="160px" height="18px" className="mb-2" />
                <SkeletonLine width="220px" height="12px" />
              </div>
            </div>

            <div className="mb-3">
              <SkeletonLine width="100px" height="12px" className="mb-2" />
              <SkeletonBox width="100%" height="42px" />
            </div>

            <div className="mb-3">
              <SkeletonLine width="90px" height="12px" className="mb-2" />
              <SkeletonBox width="100%" height="42px" />
            </div>

            <div className="mb-3">
              <SkeletonLine width="60px" height="12px" className="mb-2" />
              <SkeletonBox width="100%" height="80px" />
            </div>

            <SkeletonBox width="130px" height="38px" borderRadius="var(--radius-control)" />
          </div>
        </div>

        <div className="profile-preview-col">
          <div className="settings-card">
            <SkeletonLine width="140px" height="14px" className="mb-3" />
            <div className="d-flex flex-column align-items-center text-center p-3">
              <SkeletonCircle size={72} className="mb-3" />
              <SkeletonLine width="150px" height="18px" className="mb-2" />
              <SkeletonLine width="100px" height="13px" className="mb-3" />
              <SkeletonLine width="90%" height="12px" className="mb-1" />
              <SkeletonLine width="75%" height="12px" className="mb-3" />
              <SkeletonBox width="100%" height="36px" borderRadius="var(--radius-control)" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AccountSettingsSkeleton() {
  return (
    <div className="skeleton-container settings-skeleton-layout" aria-label="Loading account settings...">
      <div className="skeleton-header mb-4">
        <SkeletonBox width="180px" height="28px" className="mb-2" />
        <SkeletonBox width="340px" height="16px" />
      </div>

      <div className="settings-tabs-skeleton mb-4 d-flex gap-2">
        <SkeletonBox width="120px" height="36px" borderRadius="var(--radius-pill)" />
        <SkeletonBox width="100px" height="36px" borderRadius="var(--radius-pill)" />
        <SkeletonBox width="110px" height="36px" borderRadius="var(--radius-pill)" />
        <SkeletonBox width="120px" height="36px" borderRadius="var(--radius-pill)" />
      </div>

      <div className="settings-card mb-4">
        <div className="d-flex align-items-center gap-3 mb-3">
          <SkeletonCircle size={36} />
          <div>
            <SkeletonLine width="140px" height="16px" className="mb-1" />
            <SkeletonLine width="200px" height="12px" />
          </div>
        </div>
        <div className="mb-3">
          <SkeletonLine width="110px" height="12px" className="mb-2" />
          <SkeletonBox width="100%" height="42px" />
        </div>
        <div className="mb-3">
          <SkeletonLine width="130px" height="12px" className="mb-2" />
          <SkeletonBox width="100%" height="42px" />
        </div>
      </div>
    </div>
  );
}

export function MessageInboxSkeleton() {
  return (
    <div className="skeleton-container messages-inbox-skeleton" aria-label="Loading conversations...">
      <div className="p-3 border-bottom border-subtle">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <SkeletonBox width="110px" height="24px" />
          <SkeletonBox width="32px" height="32px" borderRadius="8px" />
        </div>
        <SkeletonBox width="100%" height="36px" borderRadius="8px" />
      </div>

      <div className="p-2 d-flex flex-column gap-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="d-flex align-items-center gap-3 p-2 rounded">
            <SkeletonCircle size={40} />
            <div className="flex-grow-1">
              <div className="d-flex justify-content-between mb-1">
                <SkeletonLine width="45%" height="13px" />
                <SkeletonLine width="20%" height="10px" />
              </div>
              <SkeletonLine width="75%" height="11px" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ConversationSkeleton() {
  return (
    <div className="skeleton-container conversation-skeleton d-flex flex-column h-100" aria-label="Loading conversation...">
      {/* Header */}
      <div className="p-3 border-bottom border-subtle d-flex align-items-center gap-3">
        <SkeletonCircle size={38} />
        <div>
          <SkeletonLine width="120px" height="14px" className="mb-1" />
          <SkeletonLine width="80px" height="11px" />
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-grow-1 p-3 d-flex flex-column gap-3 justify-content-end">
        <div className="d-flex align-items-end gap-2">
          <SkeletonCircle size={28} />
          <SkeletonBox width="55%" height="48px" borderRadius="16px 16px 16px 4px" />
        </div>
        <div className="d-flex align-items-end justify-content-end gap-2">
          <SkeletonBox width="45%" height="40px" borderRadius="16px 16px 4px 16px" />
        </div>
        <div className="d-flex align-items-end gap-2">
          <SkeletonCircle size={28} />
          <SkeletonBox width="65%" height="60px" borderRadius="16px 16px 16px 4px" />
        </div>
        <div className="d-flex align-items-end justify-content-end gap-2">
          <SkeletonBox width="35%" height="36px" borderRadius="16px 16px 4px 16px" />
        </div>
      </div>

      {/* Composer */}
      <div className="p-3 border-top border-subtle">
        <SkeletonBox width="100%" height="44px" borderRadius="var(--radius-control)" />
      </div>
    </div>
  );
}
