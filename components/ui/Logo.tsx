/**
 * Arrowhead 7 Logo — Triangle A + 7
 * Official mark: solid triangle (the A/arrowhead) + 7
 * Uses teal-to-copper dual gradient with glow
 * Locked 2026-05-12
 */

type LogoVariant = 'dual' | 'teal' | 'copper' | 'light';
type LogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'splash';

interface LogoProps {
  /** Color variant */
  variant?: LogoVariant;
  /** Size preset */
  size?: LogoSize;
  /** Show wordmark beside the mark */
  wordmark?: boolean;
  /** Additional className */
  className?: string;
  /** Enable glow animation */
  animate?: boolean;
}

const sizeMap: Record<LogoSize, { width: number; height: number; wordmarkSize: number; wordmarkSpacing: number }> = {
  xs:     { width: 60,  height: 28,  wordmarkSize: 9,   wordmarkSpacing: 2 },
  sm:     { width: 90,  height: 40,  wordmarkSize: 11,  wordmarkSpacing: 3 },
  md:     { width: 120, height: 52,  wordmarkSize: 14,  wordmarkSpacing: 4 },
  lg:     { width: 160, height: 70,  wordmarkSize: 18,  wordmarkSpacing: 5 },
  xl:     { width: 220, height: 100, wordmarkSize: 22,  wordmarkSpacing: 6 },
  splash: { width: 280, height: 120, wordmarkSize: 0,   wordmarkSpacing: 0 },
};

const gradients: Record<LogoVariant, { id: string; stops: [string, string] }> = {
  dual:   { id: 'a7-dual',   stops: ['#2DD4BF', '#B87333'] },
  teal:   { id: 'a7-teal',   stops: ['#1a9e8f', '#5BE8D5'] },
  copper: { id: 'a7-copper', stops: ['#8B5A2B', '#D4944A'] },
  light:  { id: 'a7-light',  stops: ['#0D5C5A', '#6B3A1A'] },
};

export function Logo({
  variant = 'dual',
  size = 'md',
  wordmark = false,
  className = '',
  animate = false,
}: LogoProps) {
  const { width, height, wordmarkSize, wordmarkSpacing } = sizeMap[size];
  const grad = gradients[variant];

  // ViewBox for mark-only vs mark+wordmark
  const vbWidth = wordmark ? 420 : 220;
  const vbHeight = 100;
  const svgWidth = wordmark ? width * 1.9 : width;
  const svgHeight = height;

  const glowFilter = animate ? 'url(#a7-glow)' : undefined;

  return (
    <svg
      viewBox={`0 0 ${vbWidth} ${vbHeight}`}
      width={svgWidth}
      height={svgHeight}
      className={className}
      role="img"
      aria-label="Arrowhead 7"
      style={animate ? {
        filter: 'drop-shadow(0 0 12px rgba(45,212,191,0.3)) drop-shadow(0 0 24px rgba(184,115,51,0.15))',
      } : undefined}
    >
      <defs>
        <linearGradient id={grad.id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={grad.stops[0]} />
          <stop offset="100%" stopColor={grad.stops[1]} />
        </linearGradient>
        {animate && (
          <filter id="a7-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>

      {/* Solid triangle — the A / arrowhead */}
      <polygon
        points="50,8 90,88 10,88"
        fill={`url(#${grad.id})`}
        filter={glowFilter}
      />

      {/* The 7 */}
      <text
        x="112"
        y="82"
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        fontSize="80"
        fontWeight="800"
        fill={`url(#${grad.id})`}
        filter={glowFilter}
      >
        7
      </text>

      {/* Wordmark (optional) */}
      {wordmark && (
        <text
          x="195"
          y="62"
          fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
          fontSize={wordmarkSize}
          fontWeight="700"
          letterSpacing={wordmarkSpacing}
          fill={variant === 'light' ? '#0A0A0A' : '#F5F0E8'}
        >
          ARROWHEAD
        </text>
      )}
    </svg>
  );
}

/**
 * Compact favicon/icon version — just triangle + 7, no wordmark
 * For use in small UI contexts like browser tabs, sidebar icons
 */
export function LogoIcon({
  size = 32,
  variant = 'dual',
  className = '',
}: {
  size?: number;
  variant?: LogoVariant;
  className?: string;
}) {
  const grad = gradients[variant];

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="A7"
    >
      <defs>
        <linearGradient id={`${grad.id}-icon`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={grad.stops[0]} />
          <stop offset="100%" stopColor={grad.stops[1]} />
        </linearGradient>
      </defs>
      <polygon points="30,8 62,78 -2,78" fill={`url(#${grad.id}-icon)`} />
      <text
        x="62"
        y="78"
        fontFamily="-apple-system, BlinkMacSystemFont, sans-serif"
        fontSize="58"
        fontWeight="900"
        fill={`url(#${grad.id}-icon)`}
      >
        7
      </text>
    </svg>
  );
}

export default Logo;
