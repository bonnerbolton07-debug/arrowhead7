export default function LandingPage() {
  return (
    <div className="min-h-screen bg-a7-black flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-a7-gray/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-a7-accent rounded-sm flex items-center justify-center font-mono font-bold text-sm">
            A7
          </div>
          <span className="font-semibold text-lg tracking-tight">Arrowhead 7</span>
        </div>
        <div className="flex items-center gap-6">
          <a href="/dashboard" className="text-sm text-a7-light/70 hover:text-a7-white transition-colors">
            Dashboard
          </a>
          <a
            href="/auth/login"
            className="text-sm bg-a7-accent hover:bg-a7-accent-hover text-white px-4 py-2 rounded-md transition-colors font-medium"
          >
            Get Started
          </a>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <div className="max-w-3xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-a7-accent/30 bg-a7-accent/5 text-a7-accent text-xs font-medium mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-a7-accent animate-pulse" />
            Autonomous Editing Platform
          </div>

          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
            Your footage.
            <br />
            <span className="text-a7-accent">Your style.</span>
            <br />
            Zero editing.
          </h1>

          {/* Sub */}
          <p className="text-lg text-a7-light/60 max-w-xl mx-auto mb-12 leading-relaxed">
            Upload a reference video. Arrowhead 7 extracts its editing DNA — the cuts,
            transitions, pacing, and color grading — then applies it to your footage autonomously.
          </p>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="/auth/signup"
              className="bg-a7-accent hover:bg-a7-accent-hover text-white px-8 py-3 rounded-md font-semibold text-base transition-colors"
            >
              Start Editing Free
            </a>
            <a
              href="#how-it-works"
              className="text-a7-light/60 hover:text-a7-white px-8 py-3 rounded-md font-medium text-base transition-colors border border-a7-gray hover:border-a7-mid"
            >
              See How It Works
            </a>
          </div>
        </div>

        {/* How It Works */}
        <section id="how-it-works" className="mt-32 mb-20 w-full max-w-5xl">
          <h2 className="text-2xl font-bold mb-16 text-center">Three steps. No timeline.</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                title: 'Upload Reference',
                desc: 'Drop in a video whose style you love. Arrowhead 7 analyzes every cut, transition, and color choice.',
              },
              {
                step: '02',
                title: 'Add Your Footage',
                desc: 'Upload raw footage. The platform identifies the best moments and matches them to the reference style.',
              },
              {
                step: '03',
                title: 'Render & Ship',
                desc: 'Cloud rendering produces your edit in minutes. Publish directly to YouTube, TikTok, Instagram, and more.',
              },
            ].map((item) => (
              <div key={item.step} className="bg-a7-dark border border-a7-gray rounded-lg p-6 hover:border-a7-accent/30 transition-colors">
                <div className="text-a7-accent font-mono text-sm mb-4">{item.step}</div>
                <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
                <p className="text-a7-light/50 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-a7-gray/50 px-8 py-6 text-center text-xs text-a7-light/30">
        Arrowhead 7 &mdash; Autonomous Content Editing Platform
      </footer>
    </div>
  );
}
