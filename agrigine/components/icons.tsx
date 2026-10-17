import type { ReactNode } from 'react';
import type { CategoryId } from '@/lib/metrics';

const Stroke = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

export function CategoryIcon({ id }: { id: CategoryId | 'overview' }) {
  switch (id) {
    case 'crops':
      return (
        <Stroke>
          <path d="M8 15V6" />
          <path d="M8 9.5C5.2 9.5 3.5 7.6 3.5 5 6.2 5 8 6.8 8 9.5z" />
          <path d="M8 12c2.8 0 4.5-1.9 4.5-4.5C9.8 7.5 8 9.3 8 12z" />
          <path d="M8 6c-.9-1-1.3-2.1-1-3.5C8.2 3 8.8 4.3 8 6z" />
        </Stroke>
      );
    case 'drought':
      return (
        <Stroke>
          <circle cx="8" cy="7" r="2.6" />
          <path d="M8 1.5v1.3M8 11.2v1.3M2.5 7h1.3M12.2 7h1.3M4.1 3.1l.9.9M11 10l.9.9M4.1 10.9l.9-.9M11 4l.9-.9" />
          <path d="M2 14.5h4l1-1 1.5 1H14" />
        </Stroke>
      );
    case 'weather':
      return (
        <Stroke>
          <path d="M4.5 10h7.2a2.4 2.4 0 0 0 .2-4.8A3.6 3.6 0 0 0 5 5.4 2.3 2.3 0 0 0 4.5 10z" />
          <path d="M6 12.3l-.7 1.7M9 12.3l-.7 1.7M12 12.3l-.7 1.7" />
        </Stroke>
      );
    case 'land':
      return (
        <Stroke>
          <path d="M8 1.8C6.2 4.2 5.2 5.8 5.2 7a2.8 2.8 0 0 0 5.6 0c0-1.2-1-2.8-2.8-5.2z" />
          <path d="M1.8 12.2h12.4M3.5 14.6h9" />
        </Stroke>
      );
    case 'sat':
      return (
        <Stroke>
          <rect x="6.2" y="6.2" width="3.6" height="3.6" transform="rotate(45 8 8)" />
          <path d="M5.2 5.2L2 2M10.8 10.8L14 14" />
          <path d="M1.5 5.5l4-4M10.5 14.5l4-4" />
          <path d="M11.5 3.5a3 3 0 0 1 1 1" />
        </Stroke>
      );
    default:
      return (
        <Stroke>
          <circle cx="8" cy="8" r="6" />
          <path d="M8 7.2v4M8 4.8v.1" />
        </Stroke>
      );
  }
}

/** A center-pivot field seen from above: the irrigated circle, and its pivot arm. */
export function Logo() {
  return (
    <svg viewBox="0 0 40 40" role="img" aria-label="Agrigine logo: a center-pivot field seen from above">
      <rect x="1" y="1" width="38" height="38" rx="9" fill="var(--stubble)" />
      <circle cx="20" cy="20" r="16" fill="var(--pivot)" />
      <path d="M20 20 L20 4 A16 16 0 0 1 35.2 15.1 Z" fill="var(--pivot-2)" />
      <line x1="20" y1="20" x2="32.9" y2="10.6" stroke="var(--surface)" strokeWidth={1.6} strokeLinecap="round" />
      <circle cx="20" cy="20" r="4.4" fill="var(--ink)" />
    </svg>
  );
}

export const SearchIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth={1.6} />
    <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
  </svg>
);
export const GlobeIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor">
    <circle cx="8" cy="8" r="6.2" strokeWidth={1.4} />
    <ellipse cx="8" cy="8" rx="2.8" ry="6.2" strokeWidth={1.2} />
    <path d="M2 8h12" strokeWidth={1.2} />
  </svg>
);
export const MapIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M1.5 3.5l4-1.5 5 1.8 4-1.5v10.2l-4 1.5-5-1.8-4 1.5z M5.5 2v10.2 M10.5 3.8V14" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round" />
  </svg>
);
export const LayersIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 2l6 3-6 3-6-3zM2 8l6 3 6-3M2 11l6 3 6-3" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" />
  </svg>
);
export const ChevronLeftIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
export const CloseIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
  </svg>
);
export const ResetIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M3 8a5 5 0 1 0 1.5-3.6M3 2.5V5h2.5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
export const PlayIcon = () => (
  <svg viewBox="0 0 14 14" aria-hidden="true">
    <path d="M3 1.5v11l9-5.5z" fill="currentColor" />
  </svg>
);
export const PauseIcon = () => (
  <svg viewBox="0 0 14 14" aria-hidden="true">
    <rect x="2.5" y="1.5" width="3.2" height="11" rx="1" fill="currentColor" />
    <rect x="8.3" y="1.5" width="3.2" height="11" rx="1" fill="currentColor" />
  </svg>
);
