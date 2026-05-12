/**
 * Arrowhead 7 — Custom SVG Icons
 * No emoji. All icons inherit currentColor or use the dual gradient.
 */

type IconProps = {
  size?: number;
  className?: string;
  gradient?: 'teal' | 'copper' | 'dual';
};

function gradStops(g: 'teal' | 'copper' | 'dual') {
  if (g === 'teal') return ['#1a9e8f', '#5BE8D5'] as const;
  if (g === 'copper') return ['#8B5A2B', '#D4944A'] as const;
  return ['#2DD4BF', '#B87333'] as const;
}

function GradientDef({ id, gradient }: { id: string; gradient: 'teal' | 'copper' | 'dual' }) {
  const [a, b] = gradStops(gradient);
  return (
    <defs>
      <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor={a} />
        <stop offset="100%" stopColor={b} />
      </linearGradient>
    </defs>
  );
}

let counter = 0;
function uid(name: string) {
  counter += 1;
  return `a7-${name}-${counter}`;
}

export function UploadIcon({ size = 24, className = '', gradient = 'teal' }: IconProps) {
  const id = uid('upload');
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
      <GradientDef id={id} gradient={gradient} />
      <path d="M12 16V4M12 4l-5 5M12 4l5 5" fill="none" stroke={`url(#${id})`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" fill="none" stroke={`url(#${id})`} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function DnaIcon({ size = 24, className = '', gradient = 'copper' }: IconProps) {
  const id = uid('dna');
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
      <GradientDef id={id} gradient={gradient} />
      <polygon points="12,2 22,12 12,22 2,12" fill="none" stroke={`url(#${id})`} strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" fill={`url(#${id})`} />
    </svg>
  );
}

export function PlayIcon({ size = 24, className = '', gradient = 'teal' }: IconProps) {
  const id = uid('play');
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
      <GradientDef id={id} gradient={gradient} />
      <polygon points="7,5 19,12 7,19" fill={`url(#${id})`} />
    </svg>
  );
}

export function SparkleIcon({ size = 24, className = '', gradient = 'dual' }: IconProps) {
  const id = uid('sparkle');
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
      <GradientDef id={id} gradient={gradient} />
      <path d="M12 2l1.7 5.3L19 9l-5.3 1.7L12 16l-1.7-5.3L5 9l5.3-1.7L12 2z" fill={`url(#${id})`} />
      <circle cx="19" cy="19" r="1.5" fill={`url(#${id})`} />
      <circle cx="5" cy="18" r="1" fill={`url(#${id})`} />
    </svg>
  );
}

export function ShareIcon({ size = 24, className = '', gradient = 'teal' }: IconProps) {
  const id = uid('share');
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
      <GradientDef id={id} gradient={gradient} />
      <circle cx="6" cy="12" r="2.5" fill="none" stroke={`url(#${id})`} strokeWidth="1.8" />
      <circle cx="18" cy="6" r="2.5" fill="none" stroke={`url(#${id})`} strokeWidth="1.8" />
      <circle cx="18" cy="18" r="2.5" fill="none" stroke={`url(#${id})`} strokeWidth="1.8" />
      <line x1="8.2" y1="10.8" x2="15.8" y2="7.2" stroke={`url(#${id})`} strokeWidth="1.6" strokeLinecap="round" />
      <line x1="8.2" y1="13.2" x2="15.8" y2="16.8" stroke={`url(#${id})`} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function VaultIcon({ size = 24, className = '', gradient = 'copper' }: IconProps) {
  const id = uid('vault');
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
      <GradientDef id={id} gradient={gradient} />
      <rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke={`url(#${id})`} strokeWidth="1.8" />
      <circle cx="14" cy="12" r="3" fill="none" stroke={`url(#${id})`} strokeWidth="1.6" />
      <line x1="14" y1="9" x2="14" y2="6" stroke={`url(#${id})`} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="14" y1="18" x2="14" y2="15" stroke={`url(#${id})`} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="6" y1="9" x2="9" y2="9" stroke={`url(#${id})`} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="6" y1="13" x2="9" y2="13" stroke={`url(#${id})`} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function CutIcon({ size = 24, className = '', gradient = 'teal' }: IconProps) {
  const id = uid('cut');
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
      <GradientDef id={id} gradient={gradient} />
      <circle cx="6" cy="6" r="3" fill="none" stroke={`url(#${id})`} strokeWidth="1.8" />
      <circle cx="6" cy="18" r="3" fill="none" stroke={`url(#${id})`} strokeWidth="1.8" />
      <line x1="20" y1="4" x2="8.5" y2="15.5" stroke={`url(#${id})`} strokeWidth="1.8" strokeLinecap="round" />
      <line x1="20" y1="20" x2="8.5" y2="8.5" stroke={`url(#${id})`} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function ColorIcon({ size = 24, className = '', gradient = 'copper' }: IconProps) {
  const id = uid('color');
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
      <GradientDef id={id} gradient={gradient} />
      <circle cx="12" cy="12" r="9" fill="none" stroke={`url(#${id})`} strokeWidth="1.8" />
      <circle cx="8" cy="9" r="1.5" fill={`url(#${id})`} />
      <circle cx="16" cy="9" r="1.5" fill={`url(#${id})`} />
      <circle cx="9" cy="15" r="1.5" fill={`url(#${id})`} />
      <circle cx="15" cy="15" r="1.5" fill={`url(#${id})`} />
    </svg>
  );
}

export function PaceIcon({ size = 24, className = '', gradient = 'dual' }: IconProps) {
  const id = uid('pace');
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
      <GradientDef id={id} gradient={gradient} />
      <path d="M3 18 L7 14 L11 17 L15 9 L21 13" fill="none" stroke={`url(#${id})`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="21" cy="13" r="1.5" fill={`url(#${id})`} />
    </svg>
  );
}

export function CheckIcon({ size = 16, className = '', gradient = 'teal' }: IconProps) {
  const id = uid('check');
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
      <GradientDef id={id} gradient={gradient} />
      <path d="M5 12l4 4L19 6" fill="none" stroke={`url(#${id})`} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ArrowRightIcon({ size = 16, className = '', gradient = 'teal' }: IconProps) {
  const id = uid('arrow');
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
      <GradientDef id={id} gradient={gradient} />
      <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke={`url(#${id})`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function GridIcon({ size = 24, className = '', gradient = 'teal' }: IconProps) {
  const id = uid('grid');
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
      <GradientDef id={id} gradient={gradient} />
      <rect x="3" y="3" width="7" height="7" rx="1" fill="none" stroke={`url(#${id})`} strokeWidth="1.8" />
      <rect x="14" y="3" width="7" height="7" rx="1" fill="none" stroke={`url(#${id})`} strokeWidth="1.8" />
      <rect x="3" y="14" width="7" height="7" rx="1" fill="none" stroke={`url(#${id})`} strokeWidth="1.8" />
      <rect x="14" y="14" width="7" height="7" rx="1" fill="none" stroke={`url(#${id})`} strokeWidth="1.8" />
    </svg>
  );
}

export function BoltIcon({ size = 24, className = '', gradient = 'teal' }: IconProps) {
  const id = uid('bolt');
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
      <GradientDef id={id} gradient={gradient} />
      <polygon points="13,2 4,14 11,14 9,22 20,9 13,9" fill={`url(#${id})`} />
    </svg>
  );
}
