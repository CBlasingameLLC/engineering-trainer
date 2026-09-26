import type { ReactElement } from 'react';

/**
 * Inline SVG, drawn on a 16-unit grid at 1.4 stroke.
 *
 * Inline rather than an icon package because this app ships offline and a
 * dependency for nine glyphs is a dependency for nine glyphs. Drawn at one
 * weight and one grid so they read as a set — mismatched stroke widths are the
 * loudest tell in an icon rail.
 */

type IconProps = { className?: string };

const Svg = ({ children, className = '' }: { children: ReactElement | ReactElement[]; className?: string }): ReactElement => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.4}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`h-4 w-4 ${className}`}
    aria-hidden
  >
    {children}
  </svg>
);

export const IconGauge = ({ className }: IconProps): ReactElement => (
  <Svg className={className}>
    <path d="M2.4 12a6 6 0 1 1 11.2 0" />
    <path d="M8 11.2 11 6.6" />
  </Svg>
);

export const IconTarget = ({ className }: IconProps): ReactElement => (
  <Svg className={className}>
    <circle cx="8" cy="8" r="5.6" />
    <circle cx="8" cy="8" r="2.2" />
    <path d="M8 .9v2.2M8 12.9v2.2M.9 8h2.2M12.9 8h2.2" />
  </Svg>
);

export const IconCalendar = ({ className }: IconProps): ReactElement => (
  <Svg className={className}>
    <rect x="2.1" y="3.1" width="11.8" height="10.8" />
    <path d="M2.1 6.3h11.8M5.3 1.8v2.6M10.7 1.8v2.6" />
  </Svg>
);

export const IconTree = ({ className }: IconProps): ReactElement => (
  <Svg className={className}>
    <circle cx="8" cy="2.9" r="1.5" />
    <circle cx="3.6" cy="12.6" r="1.5" />
    <circle cx="12.4" cy="12.6" r="1.5" />
    <path d="M8 4.4v3.2M8 7.6 4.3 11.3M8 7.6l3.7 3.7" />
  </Svg>
);

export const IconCircuit = ({ className }: IconProps): ReactElement => (
  <Svg className={className}>
    <path d="M1.4 8h3.1M11.5 8h3.1" />
    <path d="M4.5 5.2h7v5.6h-7z" />
    <path d="M6.2 8h3.6" />
  </Svg>
);

export const IconAlert = ({ className }: IconProps): ReactElement => (
  <Svg className={className}>
    <path d="M8 2.2 14.6 13.4H1.4z" />
    <path d="M8 6.4v3M8 11.3v.1" />
  </Svg>
);

export const IconBadge = ({ className }: IconProps): ReactElement => (
  <Svg className={className}>
    <circle cx="8" cy="6.2" r="4.1" />
    <path d="M5.4 9.6 4.3 14.2 8 12.4l3.7 1.8-1.1-4.6" />
  </Svg>
);

export const IconClock = ({ className }: IconProps): ReactElement => (
  <Svg className={className}>
    <circle cx="8" cy="8" r="6.1" />
    <path d="M8 4.5V8l2.5 1.6" />
  </Svg>
);

export const IconChevron = ({ className }: IconProps): ReactElement => (
  <Svg className={className}>
    <path d="M6 3.5 10.5 8 6 12.5" />
  </Svg>
);
