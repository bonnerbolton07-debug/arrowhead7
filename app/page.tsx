import { Logo } from '@/components/ui/Logo';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-a7-base to-a7-void flex flex-col">
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse at 30% 30%, rgba(45,212,191,0.04) 0%, transparent 50%), radial-gradient(ellipse at 70% 70%, rgba(184,115,51,0.03) 0%, transparent 50%)'
      }} />

      {/* Nav */}
      <nav className="relative flex items-center justify-between px-8 py-5 border-b border-a7-text/[0.04]">
        <div className="absolute bottom-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-a7-teal/15 to-transparent" />
        <a href="/" className="flex items-center gap-1">
          <Logo variant="dual" size="sm" wordmark />
        </a>
        <div className="flex items-center gap-6">
          <a href="/dashboard" className="text-sm text-a7-text/40 hover:text-a7-text transition-colors">
            Dashboard
          </a>
          <a href="/auth/login"
            className="text-sm px-4 py-2 rounded-md font-medium transition-all text-a7-void"
            style={{ background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)', boxShadow: '0 0 20px rgba(45,212,191,0.25)' }}>
            Get Started
          </a>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-8 text-center relative z-10">
        <div className="max-w-3xl mx-auto">
          {/* Hero logo mark */}
          <div className="mb-8">
            <Logo variant="dual" size="xl" animate />
          </div>

          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-8"
            style={{
              background: 'linear-gradient(135deg, rgba(45,212,191,0.08), rgba(45,212,191,0.02))',
              border: '1px solid rgba(45,212,191,0.15)',
              boxShadow: '0 0 15px rgba(45,212,191,0.08)'
            }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: 'linear-gradient(135deg, #2DD4BF, #5BE8D5)', boxShadow: '0 0 8px rgba(45,212,191,0.5)' }} />
            <span className="text-grad-teal">Autonomous Editing Platform</span>
          </div>

          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
            <span className="text-a7-text">Your footage.</span>
            <br />
            <span className="text-grad-teal glow-teal-text">Your style.</span>
            <br />
            <span className="text-grad-copper glow-copper-text">Zero editing.</span>
          </h1>

          {/* Sub */}
          <p className="text-lg text-a7-text/40 max-w-xl mx-auto mb-12 leading-relaxed">
            Upload a reference video. Arrowhead 7 extracts its editing DNA — the cuts,
            transitions, pacing, and color grading — then applies it to your footage autonomously.
          </p>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="/auth/signup"
              className="px-8 py-3 rounded-md font-semibold text-base text-a7-void transition-all"
              style={{ background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)', boxShadow: '0 0 25px rgba(45,212,191,0.3), 0 0 50px rgba(45,212,191,0.1)' }}>
              Start Editing Free
            </a>
            <a href="#how-it-works"
              className="px-8 py-3 rounded-md font-medium text-base transition-all"
              style={{
                background: 'linear-gradient(135deg, rgba(184,115,51,0.1), rgba(184,115,51,0.03))',
                border: '1px solid rgba(184,115,51,0.2)',
                color: '#D4944A',
                boxShadow: '0 0 15px rgba(184,115,51,0.08)'
              }}>
              See How It Works
            </a>
          </div>

          {/* Divider */}
          <div className="mt-12 mx-auto divider-dual" />
        </div>

        {/* How It Works */}
        <section id="how-it-works" className="mt-32 mb-20 w-full max-w-5xl">
          <h2 className="text-2xl font-bold mb-16 text-center text-a7-text">Three steps. No timeline.</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                title: 'Upload Reference',
                desc: 'Drop in a video whose style you love. Arrowhead 7 analyzes every cut, transition, and color choice.',
                accent: 'teal',
              },
              {
                step: '02',
                title: 'Add Your Footage',
                desc: 'Upload raw footage. The platform identifies the best moments and matches them to the reference style.',
                accent: 'copper',
              },
              {
                step: '03',
                title: 'Render & Ship',
                desc: 'Cloud rendering produces your edit in minutes. Publish directly to YouTube, TikTok, Instagram, and more.',
                accent: 'teal',
              },
            ].map((item) => (
              <div key={item.step}
                className="relative overflow-hidden rounded-lg p-6 transition-all hover:scale-[1.01]"
                style={{
                  background: item.accent === 'teal'
                    ? 'linear-gradient(135deg, rgba(45,212,191,0.04), rgba(45,212,191,0.01))'
                    : 'linear-gradient(135deg, rgba(184,115,51,0.04), rgba(184,115,51,0.01))',
                  border: item.accent === 'teal'
                    ? '1px solid rgba(45,212,191,0.08)'
                    : '1px solid rgba(184,115,51,0.08)',
                  boxShadow: item.accent === 'teal'
                    ? '0 0 20px rgba(45,212,191,0.06)'
                    : '0 0 20px rgba(184,115,51,0.06)',
                }}>
                {/* Top edge light */}
                <div className="absolute top-0 left-0 right-0 h-px"
                  style={{
                    background: item.accent === 'teal'
                      ? 'linear-gradient(90deg, rgba(45,212,191,0.25), transparent)'
                      : 'linear-gradient(90deg, rgba(184,115,51,0.25), transparent)',
                  }} />
                <div className={`font-mono text-sm mb-4 ${item.accent === 'teal' ? 'text-grad-teal' : 'text-grad-copper'}`}>
                  {item.step}
                </div>
                <h3 className="font-semibold text-lg mb-2 text-a7-text">{item.title}</h3>
                <p className="text-a7-text/40 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative border-t border-a7-text/[0.04] px-8 py-6 text-center text-xs text-a7-text/20">
        <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-a7-copper/10 to-transparent" />
        <div className="flex items-center justify-center gap-3">
          <Logo variant="dual" size="xs" />
          <span className="text-a7-text/20">&mdash; Autonomous Content Editing Platform</span>
        </div>
      </footer>
    </div>
  );
}
