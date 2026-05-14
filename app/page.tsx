import { Logo } from '@/components/ui/Logo';
import {
  ArrowRightIcon,
  BoltIcon,
  CheckIcon,
  ColorIcon,
  CutIcon,
  DnaIcon,
  GridIcon,
  PaceIcon,
  ShareIcon,
  SparkleIcon,
  UploadIcon,
  VaultIcon,
} from '@/components/ui/icons';
import {
  DistributionMockup,
  DnaMockup,
  EditorMockup,
  VaultMockup,
} from '@/components/ui/PreviewMockups';
import { PricingCards } from '@/components/pricing/PricingCards';
import { LandingNav } from '@/components/landing/LandingNav';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-a7-void text-a7-text overflow-x-hidden">
      {/* Ambient glow */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 20% 10%, rgba(45,212,191,0.06) 0%, transparent 55%), radial-gradient(ellipse at 80% 70%, rgba(184,115,51,0.05) 0%, transparent 55%)',
        }}
      />

      <LandingNav />

      <main className="relative z-10">
        <Hero />
        <FeaturedRow />
        <CapabilitiesGrid />
        <EditorShowcase />
        <DnaShowcase />
        <VaultShowcase />
        <DistributionShowcase />
        <HowItWorks />
        <UseCases />
        <SocialProof />
        <Pricing />
        <FinalCta />
      </main>

      <Footer />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  HERO                                                                       */
/* ─────────────────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="relative pt-16 pb-20 sm:pt-24 sm:pb-28 px-6 sm:px-8">
      <div className="max-w-7xl mx-auto text-center">
        <div className="mb-8 flex justify-center">
          <Logo variant="dual" size="xl" animate />
        </div>

        <div
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-7"
          style={{
            background: 'linear-gradient(135deg, rgba(45,212,191,0.08), rgba(45,212,191,0.02))',
            border: '1px solid rgba(45,212,191,0.15)',
            boxShadow: '0 0 15px rgba(45,212,191,0.08)',
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{
              background: 'linear-gradient(135deg, #2DD4BF, #5BE8D5)',
              boxShadow: '0 0 8px rgba(45,212,191,0.5)',
            }}
          />
          <span className="text-grad-teal">Autonomous Editing Platform</span>
        </div>

        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.05] mb-6">
          <span className="text-a7-text">Your footage.</span>{' '}
          <span className="text-grad-teal glow-teal-text">Your style.</span>
          <br className="hidden sm:block" />{' '}
          <span className="text-grad-copper glow-copper-text">Zero editing.</span>
        </h1>

        <p className="text-base sm:text-lg text-a7-text/50 max-w-2xl mx-auto mb-10 leading-relaxed">
          Arrowhead 7 watches a reference video, learns its editing DNA — cuts, color, pacing,
          transitions — then applies that style to your raw footage. Render in minutes. Distribute
          everywhere.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mb-14">
          <a
            href="/auth/signup"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-md font-semibold text-base text-a7-void transition-all"
            style={{
              background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
              boxShadow: '0 0 25px rgba(45,212,191,0.3), 0 0 50px rgba(45,212,191,0.1)',
            }}
          >
            Start Editing Free
            <ArrowRightIcon size={16} gradient="copper" />
          </a>
          <a
            href="#how-it-works"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-md font-medium text-base transition-all"
            style={{
              background: 'linear-gradient(135deg, rgba(184,115,51,0.1), rgba(184,115,51,0.03))',
              border: '1px solid rgba(184,115,51,0.2)',
              color: '#D4944A',
            }}
          >
            See How It Works
          </a>
        </div>

        <div className="flex items-center justify-center gap-6 sm:gap-10 text-xs text-a7-text/40">
          <span className="inline-flex items-center gap-1.5">
            <CheckIcon size={14} gradient="teal" /> 3 free edits
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CheckIcon size={14} gradient="teal" /> No credit card
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CheckIcon size={14} gradient="teal" /> Cancel anytime
          </span>
        </div>

        {/* Hero preview */}
        <div className="mt-16 sm:mt-20 max-w-5xl mx-auto">
          <EditorMockup />
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  FEATURED ROW (Higgsfield-style top apps)                                   */
/* ─────────────────────────────────────────────────────────────────────────── */

function FeaturedRow() {
  const items = [
    {
      title: 'Style DNA',
      sub: 'Drop a video. We extract its editing soul.',
      Icon: DnaIcon,
      gradient: 'copper' as const,
    },
    {
      title: 'Autonomous Editor',
      sub: 'Cuts, color, pacing — applied automatically.',
      Icon: SparkleIcon,
      gradient: 'dual' as const,
    },
    {
      title: 'Smart Vault',
      sub: 'Every clip, AI-tagged and instantly searchable.',
      Icon: VaultIcon,
      gradient: 'copper' as const,
    },
    {
      title: 'Multi-Platform',
      sub: 'One render → YouTube, TikTok, Reels, Shorts.',
      Icon: ShareIcon,
      gradient: 'teal' as const,
    },
    {
      title: 'Cloud Render',
      sub: 'Broadcast quality. Done in minutes, not hours.',
      Icon: BoltIcon,
      gradient: 'teal' as const,
    },
  ];

  return (
    <section id="features" className="px-6 sm:px-8 py-16 sm:py-20">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-10 gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-a7-text/40 mb-2 font-mono">
              Top Capabilities
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-a7-text">
              Everything you need to ship.
            </h2>
          </div>
          <a
            href="#capabilities"
            className="inline-flex items-center gap-1 text-sm text-grad-teal hover:underline"
          >
            See all features <ArrowRightIcon size={14} gradient="teal" />
          </a>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          {items.map(({ title, sub, Icon, gradient }) => (
            <div
              key={title}
              className="relative overflow-hidden rounded-xl p-5 transition-all hover:scale-[1.02] cursor-default"
              style={{
                background:
                  gradient === 'teal'
                    ? 'linear-gradient(135deg, rgba(45,212,191,0.05), rgba(45,212,191,0.01))'
                    : gradient === 'copper'
                    ? 'linear-gradient(135deg, rgba(184,115,51,0.05), rgba(184,115,51,0.01))'
                    : 'linear-gradient(135deg, rgba(45,212,191,0.04), rgba(184,115,51,0.04))',
                border: '1px solid rgba(245,240,232,0.06)',
                minHeight: 180,
              }}
            >
              <div
                className="absolute top-0 left-0 right-0 h-px"
                style={{
                  background:
                    gradient === 'teal'
                      ? 'linear-gradient(90deg, rgba(45,212,191,0.4), transparent)'
                      : gradient === 'copper'
                      ? 'linear-gradient(90deg, rgba(184,115,51,0.4), transparent)'
                      : 'linear-gradient(90deg, rgba(45,212,191,0.3), rgba(184,115,51,0.3), transparent)',
                }}
              />
              <Icon size={22} gradient={gradient} className="mb-3" />
              <div className="font-semibold text-a7-text text-sm mb-1">{title}</div>
              <div className="text-xs text-a7-text/40 leading-relaxed">{sub}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  CAPABILITIES GRID                                                          */
/* ─────────────────────────────────────────────────────────────────────────── */

function CapabilitiesGrid() {
  const capabilities = [
    { title: 'Auto cut detection', desc: 'Frame-accurate cuts learned from your reference.', Icon: CutIcon, gradient: 'teal' as const },
    { title: 'Color match', desc: 'LUT and grade transfer to every shot.', Icon: ColorIcon, gradient: 'copper' as const },
    { title: 'Pacing engine', desc: 'Music-synced rhythm and tempo curves.', Icon: PaceIcon, gradient: 'dual' as const },
    { title: 'Transition library', desc: 'Match the exact transitions of your reference.', Icon: SparkleIcon, gradient: 'teal' as const },
    { title: 'Smart Vault search', desc: 'Find any clip by what’s in it, instantly.', Icon: VaultIcon, gradient: 'copper' as const },
    { title: 'Cloud rendering', desc: 'Burst to GPU. 4K renders in minutes.', Icon: BoltIcon, gradient: 'teal' as const },
    { title: 'Channel publish', desc: 'Push to YouTube, TikTok, Reels with one click.', Icon: ShareIcon, gradient: 'copper' as const },
    { title: 'Style library', desc: 'Save unlimited Style DNA profiles.', Icon: GridIcon, gradient: 'teal' as const },
  ];

  return (
    <section id="capabilities" className="px-6 sm:px-8 py-16 sm:py-20">
      <div className="max-w-7xl mx-auto">
        <div className="mb-10">
          <div className="text-xs uppercase tracking-wider text-a7-text/40 mb-2 font-mono">
            All Capabilities
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-a7-text max-w-2xl">
            A full editing pipeline, autonomous from upload to publish.
          </h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {capabilities.map(({ title, desc, Icon, gradient }) => (
            <div
              key={title}
              className="relative overflow-hidden rounded-lg p-4 sm:p-5"
              style={{
                background: 'linear-gradient(180deg, rgba(16,16,14,0.6), rgba(10,10,10,0.6))',
                border: '1px solid rgba(245,240,232,0.05)',
              }}
            >
              <div
                className="absolute top-0 left-0 right-0 h-px"
                style={{
                  background:
                    gradient === 'teal'
                      ? 'linear-gradient(90deg, rgba(45,212,191,0.3), transparent)'
                      : gradient === 'copper'
                      ? 'linear-gradient(90deg, rgba(184,115,51,0.3), transparent)'
                      : 'linear-gradient(90deg, rgba(45,212,191,0.25), rgba(184,115,51,0.25), transparent)',
                }}
              />
              <Icon size={20} gradient={gradient} className="mb-3" />
              <div className="font-semibold text-a7-text text-sm mb-1">{title}</div>
              <div className="text-xs text-a7-text/40 leading-relaxed">{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  EDITOR SHOWCASE                                                            */
/* ─────────────────────────────────────────────────────────────────────────── */

function EditorShowcase() {
  return (
    <section className="px-6 sm:px-8 py-16 sm:py-24">
      <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <div className="order-2 lg:order-1">
          <EditorMockup />
        </div>
        <div className="order-1 lg:order-2">
          <div className="inline-flex items-center gap-1.5 text-xs font-mono text-grad-teal mb-3">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: '#2DD4BF',
                boxShadow: '0 0 6px rgba(45,212,191,0.6)',
              }}
            />
            EDITOR
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-a7-text mb-5">
            The timeline edits itself.
          </h2>
          <p className="text-a7-text/50 leading-relaxed mb-6">
            Drop your footage. Pick a Style DNA. The editor sequences cuts, balances pacing, and
            grades color in real time. Tweak any parameter and watch the timeline rebuild.
          </p>
          <ul className="space-y-3">
            {[
              'Frame-accurate auto-sequencing',
              'Live preview at every parameter change',
              'Manual override on any cut',
              'Reusable Style DNA profiles',
            ].map((p) => (
              <li key={p} className="flex items-start gap-2.5 text-sm text-a7-text/70">
                <span className="mt-0.5">
                  <CheckIcon size={14} gradient="teal" />
                </span>
                {p}
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <a
              href="/auth/signup"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md font-medium text-sm text-a7-void"
              style={{
                background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
                boxShadow: '0 0 18px rgba(45,212,191,0.25)',
              }}
            >
              Try the editor
              <ArrowRightIcon size={14} gradient="copper" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  STYLE DNA SHOWCASE                                                         */
/* ─────────────────────────────────────────────────────────────────────────── */

function DnaShowcase() {
  return (
    <section className="px-6 sm:px-8 py-16 sm:py-24">
      <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-mono text-grad-copper mb-3">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: '#B87333',
                boxShadow: '0 0 6px rgba(184,115,51,0.6)',
              }}
            />
            STYLE DNA
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-a7-text mb-5">
            Steal style. Ethically.
          </h2>
          <p className="text-a7-text/50 leading-relaxed mb-6">
            Upload any reference video — your favorite creator, a classic film scene, your last hit
            — and we extract its full editorial fingerprint: cut frequency, pacing curve, color
            palette, transition vocabulary.
          </p>
          <ul className="space-y-3">
            {[
              'Cut histogram + tempo signature',
              'Color profile + LUT extraction',
              'Pacing curve over the whole video',
              'Save as a profile, reuse forever',
            ].map((p) => (
              <li key={p} className="flex items-start gap-2.5 text-sm text-a7-text/70">
                <span className="mt-0.5">
                  <CheckIcon size={14} gradient="copper" />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <DnaMockup />
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  VAULT SHOWCASE                                                             */
/* ─────────────────────────────────────────────────────────────────────────── */

function VaultShowcase() {
  return (
    <section className="px-6 sm:px-8 py-16 sm:py-24">
      <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <div className="order-2 lg:order-1">
          <VaultMockup />
        </div>
        <div className="order-1 lg:order-2">
          <div className="inline-flex items-center gap-1.5 text-xs font-mono text-grad-teal mb-3">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: '#2DD4BF',
                boxShadow: '0 0 6px rgba(45,212,191,0.6)',
              }}
            />
            SMART VAULT
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-a7-text mb-5">
            Your footage, finally findable.
          </h2>
          <p className="text-a7-text/50 leading-relaxed mb-6">
            Every clip is auto-tagged on upload — scenes, subjects, energy, color, motion. Search
            &ldquo;sunset wide shots with people walking&rdquo; and get the eight clips you forgot
            you had.
          </p>
          <ul className="space-y-3">
            {[
              'Visual + semantic search',
              'Auto-tags for scene, mood, motion',
              'Group by Style DNA compatibility',
              'Drag clips straight into the editor',
            ].map((p) => (
              <li key={p} className="flex items-start gap-2.5 text-sm text-a7-text/70">
                <span className="mt-0.5">
                  <CheckIcon size={14} gradient="teal" />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  DISTRIBUTION                                                                */
/* ─────────────────────────────────────────────────────────────────────────── */

function DistributionShowcase() {
  return (
    <section className="px-6 sm:px-8 py-16 sm:py-24">
      <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-mono text-grad-copper mb-3">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: '#B87333',
                boxShadow: '0 0 6px rgba(184,115,51,0.6)',
              }}
            />
            DISTRIBUTION
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-a7-text mb-5">
            Render once. Publish everywhere.
          </h2>
          <p className="text-a7-text/50 leading-relaxed mb-6">
            One render produces every aspect ratio and length your channels need. Long-form for
            YouTube, vertical for Shorts and Reels, square for the feed. We handle the reformat.
          </p>
          <ul className="space-y-3">
            {[
              'Auto-reframe for 16:9, 9:16, 1:1',
              'Per-platform length presets',
              'Direct publish to YouTube, TikTok, Meta, X',
              'Schedule or post immediately',
            ].map((p) => (
              <li key={p} className="flex items-start gap-2.5 text-sm text-a7-text/70">
                <span className="mt-0.5">
                  <CheckIcon size={14} gradient="copper" />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <DistributionMockup />
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  HOW IT WORKS                                                               */
/* ─────────────────────────────────────────────────────────────────────────── */

function HowItWorks() {
  const steps = [
    {
      step: '01',
      title: 'Upload Reference',
      desc: 'Drop in a video whose style you love. Arrowhead 7 analyzes every cut, transition, and color choice.',
      Icon: UploadIcon,
      accent: 'teal' as const,
    },
    {
      step: '02',
      title: 'Extract Style DNA',
      desc: 'In under a minute we surface the cut tempo, color profile, pacing curve, and transition vocabulary.',
      Icon: DnaIcon,
      accent: 'copper' as const,
    },
    {
      step: '03',
      title: 'Add Your Footage',
      desc: 'Upload raw clips. The platform identifies the best moments and matches them to the reference style.',
      Icon: SparkleIcon,
      accent: 'teal' as const,
    },
    {
      step: '04',
      title: 'Render & Ship',
      desc: 'Cloud rendering produces broadcast-ready exports. Publish to every channel from one screen.',
      Icon: ShareIcon,
      accent: 'copper' as const,
    },
  ];

  return (
    <section id="how-it-works" className="px-6 sm:px-8 py-16 sm:py-24">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-14">
          <div className="text-xs uppercase tracking-wider text-a7-text/40 mb-2 font-mono">
            How it works
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-a7-text mb-4">
            Four steps. No timeline.
          </h2>
          <p className="text-a7-text/50 max-w-xl mx-auto">
            From idea to multi-platform ship in under an hour. No editor required.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {steps.map(({ step, title, desc, Icon, accent }) => (
            <div
              key={step}
              className="relative overflow-hidden rounded-xl p-6 transition-all hover:scale-[1.01]"
              style={{
                background:
                  accent === 'teal'
                    ? 'linear-gradient(135deg, rgba(45,212,191,0.04), rgba(45,212,191,0.01))'
                    : 'linear-gradient(135deg, rgba(184,115,51,0.04), rgba(184,115,51,0.01))',
                border:
                  accent === 'teal'
                    ? '1px solid rgba(45,212,191,0.08)'
                    : '1px solid rgba(184,115,51,0.08)',
                boxShadow:
                  accent === 'teal'
                    ? '0 0 20px rgba(45,212,191,0.06)'
                    : '0 0 20px rgba(184,115,51,0.06)',
              }}
            >
              <div
                className="absolute top-0 left-0 right-0 h-px"
                style={{
                  background:
                    accent === 'teal'
                      ? 'linear-gradient(90deg, rgba(45,212,191,0.3), transparent)'
                      : 'linear-gradient(90deg, rgba(184,115,51,0.3), transparent)',
                }}
              />
              <div className="flex items-start justify-between mb-4">
                <Icon size={26} gradient={accent} />
                <div
                  className={`font-mono text-xs ${accent === 'teal' ? 'text-grad-teal' : 'text-grad-copper'}`}
                >
                  {step}
                </div>
              </div>
              <h3 className="font-semibold text-base mb-2 text-a7-text">{title}</h3>
              <p className="text-a7-text/40 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  USE CASES                                                                  */
/* ─────────────────────────────────────────────────────────────────────────── */

function UseCases() {
  const cases = [
    {
      tag: 'CREATORS',
      title: 'Ship five videos a week without burnout.',
      desc: 'Long-form on YouTube, vertical on TikTok, Shorts, and Reels — from a single shoot. The cut, the grade, the posting cadence — automated.',
      accent: 'teal' as const,
    },
    {
      tag: 'BRANDS',
      title: 'On-brand cuts at agency speed.',
      desc: 'Lock your house style as a Style DNA. Every video the team produces inherits the same pace, color, and rhythm — no review cycles.',
      accent: 'copper' as const,
    },
    {
      tag: 'AGENCIES',
      title: 'Repurpose campaigns ten ways.',
      desc: 'One client shoot becomes a launch hero, three TikToks, six Shorts, and a CTV cut. All in the same brand DNA, all from the same footage.',
      accent: 'teal' as const,
    },
  ];

  return (
    <section id="use-cases" className="px-6 sm:px-8 py-16 sm:py-24">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <div className="text-xs uppercase tracking-wider text-a7-text/40 mb-2 font-mono">
            Use cases
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-a7-text">Built for output.</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
          {cases.map((c) => (
            <div
              key={c.tag}
              className="relative overflow-hidden rounded-xl p-6 sm:p-7"
              style={{
                background:
                  c.accent === 'teal'
                    ? 'linear-gradient(135deg, rgba(13,92,90,0.18), rgba(45,212,191,0.04))'
                    : 'linear-gradient(135deg, rgba(74,37,16,0.18), rgba(184,115,51,0.04))',
                border:
                  c.accent === 'teal'
                    ? '1px solid rgba(45,212,191,0.12)'
                    : '1px solid rgba(184,115,51,0.12)',
              }}
            >
              <div
                className="absolute top-0 left-0 right-0 h-px"
                style={{
                  background:
                    c.accent === 'teal'
                      ? 'linear-gradient(90deg, rgba(45,212,191,0.4), transparent)'
                      : 'linear-gradient(90deg, rgba(184,115,51,0.4), transparent)',
                }}
              />
              <div
                className={`text-xs font-mono mb-3 ${c.accent === 'teal' ? 'text-grad-teal' : 'text-grad-copper'}`}
              >
                {c.tag}
              </div>
              <h3 className="text-xl font-bold text-a7-text mb-3 leading-tight">{c.title}</h3>
              <p className="text-sm text-a7-text/50 leading-relaxed">{c.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  SOCIAL PROOF                                                               */
/* ─────────────────────────────────────────────────────────────────────────── */

function SocialProof() {
  const quotes = [
    {
      q: 'Cut my edit time from 6 hours to 12 minutes. The Style DNA on my last viral video is now a one-click preset.',
      who: 'Creator, 480K subscribers',
    },
    {
      q: 'We replaced our junior editor stack with Arrowhead. The grade and pace match our brand standard better than humans did.',
      who: 'Head of Content, DTC brand',
    },
    {
      q: 'I shoot once and publish ten times. Long, vertical, square — the platform handles the reframe and the pacing.',
      who: 'Filmmaker / agency owner',
    },
  ];

  const logos = ['NORTHWIND', 'HELIOS', 'AURORA', 'METEOR', 'COVALENT', 'RIDGELINE'];

  return (
    <section className="px-6 sm:px-8 py-16 sm:py-24">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <div className="text-xs uppercase tracking-wider text-a7-text/40 mb-2 font-mono">
            Trusted by creators &amp; teams
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-a7-text">
            What people ship with A7.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5 mb-12">
          {quotes.map((q, i) => (
            <div
              key={i}
              className="relative overflow-hidden rounded-xl p-6"
              style={{
                background: 'linear-gradient(180deg, rgba(16,16,14,0.8), rgba(10,10,10,0.8))',
                border: '1px solid rgba(245,240,232,0.06)',
              }}
            >
              <div
                className="absolute top-0 left-0 right-0 h-px"
                style={{
                  background: 'linear-gradient(90deg, rgba(45,212,191,0.25), rgba(184,115,51,0.2), transparent)',
                }}
              />
              <svg viewBox="0 0 24 24" width="20" height="20" className="mb-4">
                <defs>
                  <linearGradient id={`q-${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#2DD4BF" />
                    <stop offset="100%" stopColor="#B87333" />
                  </linearGradient>
                </defs>
                <path
                  d="M7 7h4v4H8c0 2 1 3 3 3v3c-4 0-6-2-6-6V7zm9 0h4v4h-3c0 2 1 3 3 3v3c-4 0-6-2-6-6V7z"
                  fill={`url(#q-${i})`}
                />
              </svg>
              <p className="text-a7-text/80 text-sm leading-relaxed mb-4">{q.q}</p>
              <div className="text-xs text-a7-text/40 font-mono">— {q.who}</div>
            </div>
          ))}
        </div>

        <div
          className="rounded-xl p-6 sm:p-8 relative overflow-hidden"
          style={{
            background: 'linear-gradient(180deg, rgba(16,16,14,0.4), transparent)',
            border: '1px solid rgba(245,240,232,0.04)',
          }}
        >
          <div className="text-center text-[10px] uppercase tracking-wider text-a7-text/30 font-mono mb-5">
            Teams using Arrowhead 7
          </div>
          <div className="flex flex-wrap justify-center items-center gap-x-10 gap-y-4">
            {logos.map((l) => (
              <span
                key={l}
                className="text-sm font-bold tracking-widest text-a7-text/30 hover:text-a7-text/60 transition-colors"
              >
                {l}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  PRICING                                                                    */
/* ─────────────────────────────────────────────────────────────────────────── */

function Pricing() {
  return (
    <section id="pricing" className="px-6 sm:px-8 py-16 sm:py-24">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <div className="text-xs uppercase tracking-wider text-a7-text/40 mb-2 font-mono">
            Pricing
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-a7-text mb-3">
            Pick a tier. Cancel any time.
          </h2>
          <p className="text-a7-text/50 max-w-xl mx-auto">
            Every tier includes Style DNA, autonomous editing, and cloud rendering. You only pay
            for output.
          </p>
        </div>

        <PricingCards />

        <p className="text-center text-xs text-a7-text/30 mt-8">
          Need an Enterprise / on-prem plan?{' '}
          <a href="mailto:hello@bonner.ai" className="text-grad-teal hover:underline">
            Talk to us
          </a>
          .
        </p>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  FINAL CTA                                                                  */
/* ─────────────────────────────────────────────────────────────────────────── */

function FinalCta() {
  return (
    <section className="px-6 sm:px-8 py-20 sm:py-28">
      <div className="max-w-4xl mx-auto text-center">
        <div className="mx-auto divider-dual mb-8" />
        <h2 className="text-4xl sm:text-5xl font-bold mb-5">
          <span className="text-a7-text">Stop editing.</span>{' '}
          <span className="text-grad-dual">Start shipping.</span>
        </h2>
        <p className="text-a7-text/50 max-w-xl mx-auto mb-10">
          Your first three edits are free. Bring a reference video and the footage you&rsquo;ve been
          sitting on.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
          <a
            href="/auth/signup"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-md font-semibold text-base text-a7-void"
            style={{
              background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
              boxShadow: '0 0 30px rgba(45,212,191,0.35), 0 0 60px rgba(45,212,191,0.12)',
            }}
          >
            Start Editing Free
            <ArrowRightIcon size={16} gradient="copper" />
          </a>
          <a
            href="/auth/login"
            className="w-full sm:w-auto inline-flex items-center justify-center px-7 py-3.5 rounded-md font-medium text-base"
            style={{
              background: 'transparent',
              border: '1px solid rgba(245,240,232,0.08)',
              color: 'rgba(245,240,232,0.7)',
            }}
          >
            I already have an account
          </a>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  FOOTER                                                                     */
/* ─────────────────────────────────────────────────────────────────────────── */

function Footer() {
  const cols: { title: string; links: { label: string; href: string }[] }[] = [
    {
      title: 'Product',
      links: [
        { label: 'Editor', href: '/editor' },
        { label: 'Style DNA', href: '#features' },
        { label: 'Smart Vault', href: '#features' },
        { label: 'Distribution', href: '#features' },
        { label: 'Pricing', href: '#pricing' },
      ],
    },
    {
      title: 'Company',
      links: [
        { label: 'Contact', href: 'mailto:hello@bonner.ai' },
      ],
    },
    {
      title: 'Legal',
      links: [
        { label: 'Terms', href: '/terms' },
        { label: 'Privacy', href: '/privacy' },
      ],
    },
  ];

  return (
    <footer
      className="relative px-6 sm:px-8 pt-14 pb-10"
      style={{
        background: 'linear-gradient(180deg, transparent, rgba(10,10,10,0.6))',
        borderTop: '1px solid rgba(245,240,232,0.04)',
      }}
    >
      <div
        className="absolute top-0 left-8 right-8 h-px"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(184,115,51,0.15), rgba(45,212,191,0.15), transparent)',
        }}
      />
      <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-5 gap-8">
        <div className="col-span-2 md:col-span-2">
          <Logo variant="dual" size="sm" wordmark />
          <p className="text-sm text-a7-text/40 mt-4 max-w-xs leading-relaxed">
            Autonomous video editing platform. Upload, extract, render, distribute — without a
            timeline.
          </p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <div className="text-xs font-mono uppercase tracking-wider text-a7-text/40 mb-3">
              {c.title}
            </div>
            <ul className="space-y-2">
              {c.links.map((l) => (
                <li key={l.label}>
                  <a
                    href={l.href}
                    className="text-sm text-a7-text/60 hover:text-a7-text transition-colors"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="max-w-7xl mx-auto mt-10 pt-6 border-t border-a7-text/[0.04] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-a7-text/30">
        <span>© {new Date().getFullYear()} Arrowhead 7 — a Bonner.AI service.</span>
        <span>arrowhead7.ai</span>
      </div>
    </footer>
  );
}
