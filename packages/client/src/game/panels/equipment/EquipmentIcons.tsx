import React from "react";

// ============================================================================
// SVG Icons for Equipment Slots (Solid Geometric Silhouette Design)
// ============================================================================

export function HelmetIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6 5l6-3 6 3v6l-2 8H8l-2-8V5zm6 3H9v5h2v2h2v-2h2V8h-3z"
      />
    </svg>
  );
}

export function WeaponIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M15 3h6v6l-2-2-6 6 3 3-2 2-4-4-4 4-2-2 4-4-4-4 2-2 3 3 6-6-2-2z" />
    </svg>
  );
}

export function BodyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6 3h12l4 6-3 3v9H5v-9L2 9l4-6zm3 4v3h6V7H9z"
      />
    </svg>
  );
}

export function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M3 4h18v7l-9 11L3 11V4z" />
    </svg>
  );
}

export function LegsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M5 3h14v8l-3 2v8H9v-8L6 11V3zM9 5H7v5l2 1V5zm6 0h-2v6l2-1V5z" />
    </svg>
  );
}

export function ArrowsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M15 3h6v6l-1-1-8 8-4-4 8-8-1-1zm-6 8l-5 5 2 2 5-5-2-2zm5 5l-5 5 2 2 5-5-2-2z" />
    </svg>
  );
}

export function BootsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M7 4h10v9l4 4v4H5v-5l2-3V4z" />
    </svg>
  );
}

export function GlovesIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M5 4h14v7l2 4-3 5H6l-3-5 2-4V4z" />
    </svg>
  );
}

export function CapeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6 3h12l3 18H3L6 3zm2 4v4h8V7H8z"
      />
    </svg>
  );
}

export function AmuletIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6 3h12v4l-4 5v-2L10 8v2L6 7V3zm2 3h8v1L12 9l-4-2V6zm3 7h2v5l-1 2-1-2v-5z"
      />
    </svg>
  );
}

export function RingIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6 10l3-5h6l3 5v4l-3 5H9l-3-5v-4zm3-.5L10.5 7h3l1.5 2.5V13l-1.5 2.5h-3L9 13V9.5z"
      />
    </svg>
  );
}

// ============================================================================
// Utility Button Icons
// ============================================================================

export function StatsIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
      className={className}
    >
      <path d="M18 20V10M12 20V4M6 20v-6" />
    </svg>
  );
}

export function DeathIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
      className={className}
    >
      <circle cx="12" cy="10" r="7" />
      <circle cx="9" cy="9" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="15" cy="9" r="1.5" fill="currentColor" stroke="none" />
      <path d="M8 17v4M12 17v4M16 17v4" />
      <path d="M9 14c.8.7 1.9 1 3 1s2.2-.3 3-1" />
    </svg>
  );
}
