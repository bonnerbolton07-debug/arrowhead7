// =============================================================================
// Arrowhead 7 — Strategy Brain UI: Health Meter
// =============================================================================
// Circular score showing the user's overall strategy health (0-100).

interface HealthMeterProps {
  score: number;                  // 0-100
  size?: number;
  label?: string;
  sublabel?: string;
}

export function HealthMeter({
  score,
  size = 140,
  label = 'Strategy Health',
  sublabel,
}: HealthMeterProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  const grade =
    clamped >= 75 ? 'Strong' : clamped >= 50 ? 'Steady' : clamped >= 25 ? 'Warming' : 'Cold';

  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="hm-track" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#1A1918" />
            <stop offset="100%" stopColor="#10100E" />
          </linearGradient>
          <linearGradient id="hm-arc" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#2DD4BF" />
            <stop offset="100%" stopColor="#B87333" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#hm-track)"
          strokeWidth={10}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#hm-arc)"
          strokeWidth={10}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            filter: 'drop-shadow(0 0 6px rgba(45,212,191,0.35))',
            transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      </svg>
      <div>
        <div className="text-xs uppercase tracking-wider text-a7-text/40 mb-1">
          {label}
        </div>
        <div className="text-3xl font-bold text-a7-text leading-none">
          {clamped}
          <span className="text-base text-a7-text/30 font-normal ml-1">/100</span>
        </div>
        <div className="mt-2 text-sm">
          <span className="text-grad-teal font-medium">{grade}</span>
          {sublabel ? (
            <span className="text-a7-text/40"> &middot; {sublabel}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
