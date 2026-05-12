/**
 * Visual mockups of the editor, dashboard, vault, and DNA panels.
 * All SVG so they render crisp on every screen — no screenshots, no images.
 */

import { CutIcon, ColorIcon, PaceIcon, BoltIcon } from './icons';

function ChromeBar({ label }: { label: string }) {
  return (
    <div
      className="flex items-center gap-2 px-4 py-2.5 border-b"
      style={{
        background: 'linear-gradient(180deg, #1A1918, #10100E)',
        borderColor: 'rgba(245,240,232,0.05)',
      }}
    >
      <span className="w-2 h-2 rounded-full" style={{ background: '#3A3A38' }} />
      <span className="w-2 h-2 rounded-full" style={{ background: '#3A3A38' }} />
      <span className="w-2 h-2 rounded-full" style={{ background: '#3A3A38' }} />
      <span className="ml-3 text-[10px] text-a7-text/40 font-mono">{label}</span>
    </div>
  );
}

export function EditorMockup() {
  return (
    <div
      className="relative overflow-hidden rounded-xl"
      style={{
        background: 'linear-gradient(180deg, #10100E, #0A0A0A)',
        border: '1px solid rgba(245,240,232,0.08)',
        boxShadow: '0 0 40px rgba(45,212,191,0.08), 0 30px 60px -20px rgba(0,0,0,0.6)',
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(45,212,191,0.4), rgba(184,115,51,0.3), transparent)',
        }}
      />
      <ChromeBar label="arrowhead7.ai/editor" />

      {/* Editor body */}
      <div className="grid grid-cols-12 gap-3 p-4">
        {/* Left rail — clips */}
        <div className="col-span-3 space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-a7-text/30 mb-2">Source clips</div>
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="aspect-video rounded-md flex items-center justify-center"
              style={{
                background: `linear-gradient(135deg, rgba(45,212,191,${0.04 + i * 0.02}), rgba(184,115,51,${0.02 + i * 0.01}))`,
                border: '1px solid rgba(245,240,232,0.04)',
              }}
            >
              <div className="text-[9px] text-a7-text/30 font-mono">CLIP_{String(i).padStart(2, '0')}</div>
            </div>
          ))}
        </div>

        {/* Preview */}
        <div className="col-span-6">
          <div
            className="aspect-video rounded-md relative overflow-hidden flex items-center justify-center"
            style={{
              background:
                'linear-gradient(135deg, rgba(13,92,90,0.4), rgba(74,37,16,0.3)), radial-gradient(ellipse at center, rgba(45,212,191,0.15), transparent 60%)',
              border: '1px solid rgba(245,240,232,0.06)',
            }}
          >
            <div
              className="absolute inset-x-6 inset-y-8 rounded"
              style={{
                background:
                  'linear-gradient(135deg, rgba(45,212,191,0.1), rgba(184,115,51,0.08))',
                border: '1px dashed rgba(245,240,232,0.1)',
              }}
            />
            <div
              className="relative w-12 h-12 rounded-full flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
                boxShadow: '0 0 20px rgba(45,212,191,0.4)',
              }}
            >
              <svg viewBox="0 0 24 24" width="20" height="20">
                <polygon points="8,5 20,12 8,19" fill="#0A0A0A" />
              </svg>
            </div>
          </div>
          {/* Timeline */}
          <div
            className="mt-3 p-2 rounded-md"
            style={{
              background: 'linear-gradient(180deg, #14140F, #0E0E0C)',
              border: '1px solid rgba(245,240,232,0.04)',
            }}
          >
            <div className="flex gap-1 h-8 items-stretch">
              {[40, 25, 50, 30, 45, 60, 35, 55, 28, 42, 38, 50].map((w, i) => (
                <div
                  key={i}
                  style={{
                    flex: w,
                    background:
                      i % 3 === 0
                        ? 'linear-gradient(180deg, #1a9e8f, #2DD4BF)'
                        : i % 3 === 1
                        ? 'linear-gradient(180deg, #8B5A2B, #B87333)'
                        : 'linear-gradient(180deg, #1A1918, #30302E)',
                    borderRadius: 2,
                  }}
                />
              ))}
            </div>
            <div className="flex justify-between mt-1.5 text-[9px] text-a7-text/30 font-mono">
              <span>0:00</span>
              <span>0:15</span>
              <span>0:30</span>
              <span>0:45</span>
              <span>1:00</span>
            </div>
          </div>
        </div>

        {/* Right rail — DNA params */}
        <div className="col-span-3 space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-a7-text/30 mb-2">Style DNA</div>
          {[
            { label: 'Cut tempo', val: 'fast', icon: CutIcon },
            { label: 'Color grade', val: 'warm', icon: ColorIcon },
            { label: 'Pacing', val: 'kinetic', icon: PaceIcon },
            { label: 'Energy', val: '8.4', icon: BoltIcon },
          ].map(({ label, val, icon: Icon }) => (
            <div
              key={label}
              className="flex items-center gap-2 px-2.5 py-2 rounded-md"
              style={{
                background: 'linear-gradient(135deg, rgba(245,240,232,0.02), transparent)',
                border: '1px solid rgba(245,240,232,0.04)',
              }}
            >
              <Icon size={14} />
              <div className="flex-1 min-w-0">
                <div className="text-[9px] text-a7-text/40 leading-none">{label}</div>
                <div className="text-[10px] text-a7-text/80 font-mono mt-0.5">{val}</div>
              </div>
            </div>
          ))}
          <div
            className="px-2.5 py-2 rounded-md mt-3 text-center text-[10px] font-semibold text-a7-void"
            style={{
              background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
              boxShadow: '0 0 12px rgba(45,212,191,0.3)',
            }}
          >
            Render
          </div>
        </div>
      </div>
    </div>
  );
}

export function DnaMockup() {
  return (
    <div
      className="relative overflow-hidden rounded-xl p-5"
      style={{
        background: 'linear-gradient(180deg, #10100E, #0A0A0A)',
        border: '1px solid rgba(245,240,232,0.08)',
        boxShadow: '0 0 40px rgba(184,115,51,0.08), 0 30px 60px -20px rgba(0,0,0,0.6)',
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background: 'linear-gradient(90deg, rgba(184,115,51,0.4), rgba(45,212,191,0.3), transparent)',
        }}
      />
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-a7-text/30">Style DNA</div>
          <div className="text-sm font-semibold text-a7-text mt-0.5">Cinematic Vlog</div>
        </div>
        <div
          className="px-2 py-1 rounded-full text-[9px] font-mono text-grad-copper"
          style={{
            background: 'linear-gradient(135deg, rgba(184,115,51,0.1), rgba(184,115,51,0.02))',
            border: '1px solid rgba(184,115,51,0.2)',
          }}
        >
          v1.4
        </div>
      </div>

      {/* Color palette */}
      <div className="mb-4">
        <div className="text-[9px] text-a7-text/40 mb-1.5">COLOR PROFILE</div>
        <div className="flex gap-1">
          {['#1A1918', '#4A2510', '#8B5A2B', '#D4944A', '#F5F0E8', '#5BE8D5', '#1a9e8f'].map((c) => (
            <div
              key={c}
              className="flex-1 h-8 rounded-sm"
              style={{ background: c, border: '1px solid rgba(245,240,232,0.04)' }}
            />
          ))}
        </div>
      </div>

      {/* Cut histogram */}
      <div className="mb-4">
        <div className="text-[9px] text-a7-text/40 mb-1.5">CUT FREQUENCY</div>
        <div className="flex gap-0.5 h-12 items-end">
          {[20, 35, 60, 75, 50, 40, 65, 85, 70, 45, 55, 30, 25, 40, 60, 80, 70].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm"
              style={{
                height: `${h}%`,
                background: `linear-gradient(180deg, rgba(45,212,191,${0.3 + h / 200}), rgba(45,212,191,0.1))`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Pacing */}
      <div>
        <div className="text-[9px] text-a7-text/40 mb-1.5">PACING SIGNATURE</div>
        <svg viewBox="0 0 200 40" className="w-full h-10">
          <defs>
            <linearGradient id="pace-line" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#1a9e8f" />
              <stop offset="100%" stopColor="#D4944A" />
            </linearGradient>
          </defs>
          <path
            d="M 0,30 Q 25,10 50,20 T 100,15 T 150,25 T 200,12"
            fill="none"
            stroke="url(#pace-line)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}

export function VaultMockup() {
  const items = [
    { label: 'Sunset_B-roll', tag: 'WARM', accent: 'copper' },
    { label: 'Studio_Talk', tag: 'TALK', accent: 'teal' },
    { label: 'Drone_Cliff', tag: 'WIDE', accent: 'teal' },
    { label: 'Macro_Hands', tag: 'CLOSE', accent: 'copper' },
    { label: 'Street_Walk', tag: 'WALK', accent: 'teal' },
    { label: 'Studio_Cuts', tag: 'CUT', accent: 'copper' },
  ];
  return (
    <div
      className="relative overflow-hidden rounded-xl"
      style={{
        background: 'linear-gradient(180deg, #10100E, #0A0A0A)',
        border: '1px solid rgba(245,240,232,0.08)',
        boxShadow: '0 0 40px rgba(45,212,191,0.06), 0 30px 60px -20px rgba(0,0,0,0.6)',
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background: 'linear-gradient(90deg, rgba(45,212,191,0.4), rgba(184,115,51,0.3), transparent)',
        }}
      />
      <ChromeBar label="arrowhead7.ai/vault" />
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs text-a7-text/60 font-medium">Smart Vault — 1,247 clips</div>
          <div
            className="px-2 py-0.5 rounded text-[9px] font-mono text-grad-teal"
            style={{
              background: 'linear-gradient(135deg, rgba(45,212,191,0.08), transparent)',
              border: '1px solid rgba(45,212,191,0.15)',
            }}
          >
            AI-tagged
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {items.map((it) => (
            <div
              key={it.label}
              className="rounded-md overflow-hidden relative"
              style={{
                background:
                  it.accent === 'teal'
                    ? 'linear-gradient(135deg, rgba(13,92,90,0.4), rgba(45,212,191,0.08))'
                    : 'linear-gradient(135deg, rgba(74,37,16,0.4), rgba(184,115,51,0.08))',
                border: '1px solid rgba(245,240,232,0.05)',
              }}
            >
              <div className="aspect-video relative">
                <div
                  className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[8px] font-mono"
                  style={{
                    background: 'rgba(10,10,10,0.7)',
                    color: it.accent === 'teal' ? '#5BE8D5' : '#D4944A',
                  }}
                >
                  {it.tag}
                </div>
              </div>
              <div className="px-2 py-1.5 text-[9px] text-a7-text/60 font-mono truncate">{it.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DistributionMockup() {
  const platforms = ['YouTube', 'TikTok', 'Instagram', 'X', 'LinkedIn', 'Threads'];
  return (
    <div
      className="relative overflow-hidden rounded-xl p-5"
      style={{
        background: 'linear-gradient(180deg, #10100E, #0A0A0A)',
        border: '1px solid rgba(245,240,232,0.08)',
        boxShadow: '0 0 40px rgba(45,212,191,0.06), 0 30px 60px -20px rgba(0,0,0,0.6)',
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background: 'linear-gradient(90deg, rgba(45,212,191,0.4), rgba(184,115,51,0.3), transparent)',
        }}
      />
      <div className="text-[10px] uppercase tracking-wider text-a7-text/30 mb-3">One render. Six destinations.</div>

      {/* Render bar */}
      <div
        className="rounded-md p-3 mb-4 relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(45,212,191,0.06), rgba(184,115,51,0.03))',
          border: '1px solid rgba(245,240,232,0.05)',
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs text-a7-text/80 font-medium">Cinematic_Vlog_v3.mp4</div>
          <div className="text-[10px] font-mono text-grad-teal">100%</div>
        </div>
        <div
          className="h-1 rounded-full overflow-hidden"
          style={{ background: 'rgba(245,240,232,0.05)' }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: '100%',
              background: 'linear-gradient(90deg, #1a9e8f, #2DD4BF, #5BE8D5)',
              boxShadow: '0 0 10px rgba(45,212,191,0.5)',
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {platforms.map((p, i) => (
          <div
            key={p}
            className="rounded-md p-2.5 text-center relative overflow-hidden"
            style={{
              background:
                i % 2 === 0
                  ? 'linear-gradient(135deg, rgba(45,212,191,0.04), rgba(45,212,191,0.01))'
                  : 'linear-gradient(135deg, rgba(184,115,51,0.04), rgba(184,115,51,0.01))',
              border:
                i % 2 === 0 ? '1px solid rgba(45,212,191,0.1)' : '1px solid rgba(184,115,51,0.1)',
            }}
          >
            <div
              className="text-[9px] font-mono uppercase tracking-wider"
              style={{ color: i % 2 === 0 ? '#5BE8D5' : '#D4944A' }}
            >
              {p}
            </div>
            <div className="text-[8px] text-a7-text/40 mt-0.5">queued</div>
          </div>
        ))}
      </div>
    </div>
  );
}
