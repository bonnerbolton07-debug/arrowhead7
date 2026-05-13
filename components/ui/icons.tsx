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

export function ClockIcon({ size = 24, className = '', gradient = 'teal' }: IconProps) {
  const id = uid('clock');
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
      <GradientDef id={id} gradient={gradient} />
      <circle cx="12" cy="12" r="9" fill="none" stroke={`url(#${id})`} strokeWidth="1.8" />
      <polyline points="12,7 12,12 16,14" fill="none" stroke={`url(#${id})`} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SettingsIcon({ size = 24, className = '', gradient = 'teal' }: IconProps) {
  const id = uid('settings');
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
      <GradientDef id={id} gradient={gradient} />
      <circle cx="12" cy="12" r="3" fill="none" stroke={`url(#${id})`} strokeWidth="1.8" />
      <path d="M12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" stroke={`url(#${id})`} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function FilmIcon({ size = 24, className = '', gradient = 'teal' }: IconProps) {
  const id = uid('film');
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
      <GradientDef id={id} gradient={gradient} />
      <rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke={`url(#${id})`} strokeWidth="1.8" />
      <line x1="3" y1="9" x2="21" y2="9" stroke={`url(#${id})`} strokeWidth="1.5" />
      <line x1="3" y1="15" x2="21" y2="15" stroke={`url(#${id})`} strokeWidth="1.5" />
      <line x1="9" y1="4" x2="9" y2="20" stroke={`url(#${id})`} strokeWidth="1.5" />
      <line x1="15" y1="4" x2="15" y2="20" stroke={`url(#${id})`} strokeWidth="1.5" />
    </svg>
  );
}

export function CloudIcon({ size = 24, className = '', gradient = 'teal' }: IconProps) {
  const id = uid('cloud');
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
      <GradientDef id={id} gradient={gradient} />
      <path d="M7 18h11a4 4 0 0 0 .4-7.98 6 6 0 0 0-11.8 1.27A4 4 0 0 0 7 18z" fill="none" stroke={`url(#${id})`} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

export function SearchIcon({ size = 24, className = '', gradient = 'teal' }: IconProps) {
  const id = uid('search');
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
      <GradientDef id={id} gradient={gradient} />
      <circle cx="11" cy="11" r="6" fill="none" stroke={`url(#${id})`} strokeWidth="1.8" />
      <line x1="15.5" y1="15.5" x2="20" y2="20" stroke={`url(#${id})`} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function PlusIcon({ size = 24, className = '', gradient = 'teal' }: IconProps) {
  const id = uid('plus');
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
      <GradientDef id={id} gradient={gradient} />
      <line x1="12" y1="5" x2="12" y2="19" stroke={`url(#${id})`} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="5" y1="12" x2="19" y2="12" stroke={`url(#${id})`} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function TrashIcon({ size = 24, className = '', gradient = 'copper' }: IconProps) {
  const id = uid('trash');
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
      <GradientDef id={id} gradient={gradient} />
      <polyline points="3,6 5,6 21,6" fill="none" stroke={`url(#${id})`} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" fill="none" stroke={`url(#${id})`} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M10 11v6M14 11v6" stroke={`url(#${id})`} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" fill="none" stroke={`url(#${id})`} strokeWidth="1.6" />
    </svg>
  );
}

export function EditIcon({ size = 24, className = '', gradient = 'teal' }: IconProps) {
  const id = uid('edit');
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
      <GradientDef id={id} gradient={gradient} />
      <path d="M12 20h9" stroke={`url(#${id})`} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" fill="none" stroke={`url(#${id})`} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

export function UserIcon({ size = 24, className = '', gradient = 'teal' }: IconProps) {
  const id = uid('user');
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
      <GradientDef id={id} gradient={gradient} />
      <circle cx="12" cy="8" r="4" fill="none" stroke={`url(#${id})`} strokeWidth="1.8" />
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" fill="none" stroke={`url(#${id})`} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function BellIcon({ size = 24, className = '', gradient = 'teal' }: IconProps) {
  const id = uid('bell');
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
      <GradientDef id={id} gradient={gradient} />
      <path d="M18 16v-5a6 6 0 0 0-12 0v5l-2 3h16l-2-3z" fill="none" stroke={`url(#${id})`} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M10 21a2 2 0 0 0 4 0" fill="none" stroke={`url(#${id})`} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function KeyIcon({ size = 24, className = '', gradient = 'copper' }: IconProps) {
  const id = uid('key');
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
      <GradientDef id={id} gradient={gradient} />
      <circle cx="8" cy="15" r="4" fill="none" stroke={`url(#${id})`} strokeWidth="1.8" />
      <path d="M10.8 12.2L20 3l2 2-2 2 2 2-3 3-2-2-2 2-1.2-1.2" fill="none" stroke={`url(#${id})`} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function CrownIcon({ size = 24, className = '', gradient = 'copper' }: IconProps) {
  const id = uid('crown');
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
      <GradientDef id={id} gradient={gradient} />
      <path d="M3 17h18M4 7l4 4 4-6 4 6 4-4-2 10H6L4 7z" fill={`url(#${id})`} fillOpacity="0.2" stroke={`url(#${id})`} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

export function YouTubeIcon({ size = 24, className = '' }: { size?: number; className?: string }) {
  const id = uid('youtube');
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#B87333" />
          <stop offset="100%" stopColor="#D4944A" />
        </linearGradient>
      </defs>
      <rect x="2" y="5" width="20" height="14" rx="3" fill="none" stroke={`url(#${id})`} strokeWidth="1.8" />
      <polygon points="10,9 16,12 10,15" fill={`url(#${id})`} />
    </svg>
  );
}

export function TikTokIcon({ size = 24, className = '' }: { size?: number; className?: string }) {
  const id = uid('tiktok');
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2DD4BF" />
          <stop offset="100%" stopColor="#B87333" />
        </linearGradient>
      </defs>
      <path d="M14 4v9.5a3.5 3.5 0 1 1-3.5-3.5h.5V13a1.5 1.5 0 1 0 1.5 1.5V4h2c.3 1.7 1.5 3 3 3.3v2c-1.4-.1-2.6-.6-3.5-1.3z" fill={`url(#${id})`} />
    </svg>
  );
}

export function InstagramIcon({ size = 24, className = '' }: { size?: number; className?: string }) {
  const id = uid('instagram');
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#B87333" />
          <stop offset="100%" stopColor="#D4944A" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke={`url(#${id})`} strokeWidth="1.8" />
      <circle cx="12" cy="12" r="4" fill="none" stroke={`url(#${id})`} strokeWidth="1.8" />
      <circle cx="17.5" cy="6.5" r="1.2" fill={`url(#${id})`} />
    </svg>
  );
}

export function XIcon({ size = 24, className = '' }: { size?: number; className?: string }) {
  const id = uid('x');
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#5BE8D5" />
          <stop offset="100%" stopColor="#1a9e8f" />
        </linearGradient>
      </defs>
      <path d="M4 4l16 16M20 4L4 20" stroke={`url(#${id})`} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function LinkedInIcon({ size = 24, className = '' }: { size?: number; className?: string }) {
  const id = uid('linkedin');
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1a9e8f" />
          <stop offset="100%" stopColor="#5BE8D5" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke={`url(#${id})`} strokeWidth="1.8" />
      <rect x="6.5" y="10" width="2" height="7" fill={`url(#${id})`} />
      <circle cx="7.5" cy="7.5" r="1.2" fill={`url(#${id})`} />
      <path d="M11 17v-7h2v1c.5-.7 1.5-1.2 2.5-1.2 2 0 3 1.4 3 3.4V17h-2v-3.4c0-1.2-.5-1.8-1.5-1.8s-1.5.6-1.5 1.8V17h-2z" fill={`url(#${id})`} />
    </svg>
  );
}

export function GoogleDriveIcon({ size = 24, className = '' }: { size?: number; className?: string }) {
  const id = uid('gdrive');
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1a9e8f" />
          <stop offset="100%" stopColor="#5BE8D5" />
        </linearGradient>
      </defs>
      <polygon points="8,3 16,3 22,14 18,21 6,21 2,14" fill="none" stroke={`url(#${id})`} strokeWidth="1.8" strokeLinejoin="round" />
      <line x1="8" y1="3" x2="14" y2="14" stroke={`url(#${id})`} strokeWidth="1.6" />
      <line x1="16" y1="3" x2="10" y2="14" stroke={`url(#${id})`} strokeWidth="1.6" />
      <line x1="2" y1="14" x2="22" y2="14" stroke={`url(#${id})`} strokeWidth="1.6" />
    </svg>
  );
}

export function DropboxIcon({ size = 24, className = '' }: { size?: number; className?: string }) {
  const id = uid('dropbox');
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1a9e8f" />
          <stop offset="100%" stopColor="#5BE8D5" />
        </linearGradient>
      </defs>
      <polygon points="6,4 12,8 6,12 0,8" fill={`url(#${id})`} transform="translate(2 2)" />
      <polygon points="6,4 12,8 6,12 0,8" fill={`url(#${id})`} transform="translate(10 2)" />
      <polygon points="6,4 12,8 6,12 0,8" fill={`url(#${id})`} transform="translate(6 10)" />
    </svg>
  );
}

export function ICloudIcon({ size = 24, className = '' }: { size?: number; className?: string }) {
  const id = uid('icloud');
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8B5A2B" />
          <stop offset="100%" stopColor="#D4944A" />
        </linearGradient>
      </defs>
      <path d="M7 18h11a4 4 0 0 0 .4-7.98 6 6 0 0 0-11.8 1.27A4 4 0 0 0 7 18z" fill={`url(#${id})`} fillOpacity="0.2" stroke={`url(#${id})`} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
