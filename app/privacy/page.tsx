import type { Metadata } from 'next';
import { Logo } from '@/components/ui/Logo';

export const metadata: Metadata = {
  title: 'Privacy Policy — Arrowhead 7',
  description: 'How Arrowhead 7 collects, uses, and protects your data.',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-a7-void text-a7-text">
      <header
        className="px-6 sm:px-8 py-5"
        style={{ borderBottom: '1px solid rgba(245,240,232,0.04)' }}
      >
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <a href="/" className="flex items-center gap-1">
            <Logo variant="dual" size="sm" wordmark />
          </a>
          <a href="/" className="text-sm text-a7-text/50 hover:text-a7-text transition-colors">
            &larr; Back home
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 sm:px-8 py-14">
        <p className="text-xs font-mono uppercase tracking-wider text-a7-text/40 mb-2">
          Legal
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold mb-3">Privacy Policy</h1>
        <p className="text-sm text-a7-text/40 mb-10">
          Last updated: January 1, 2026 — placeholder copy. Replace before launch.
        </p>

        <div className="space-y-8 text-sm text-a7-text/70 leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-a7-text mb-2">1. What we collect</h2>
            <p>
              We collect the email address and authentication identifiers you provide when
              creating an account, the video, image, and audio files you upload, and the
              configuration choices you make in the editor. We also receive payment metadata
              (but not card numbers) from our payment processor.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-a7-text mb-2">2. How we use your data</h2>
            <p>
              We use your data to provide the Service: storing uploads, running AI analysis
              and rendering, distributing content to channels you connect, and billing your
              subscription. We do not sell your personal information.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-a7-text mb-2">3. Subprocessors</h2>
            <p>
              We rely on a limited set of third parties to operate the Service, including
              cloud storage, AI/transcription providers, our database host, and our payment
              processor. They process your data only as needed to perform their service to us.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-a7-text mb-2">4. Retention</h2>
            <p>
              We retain your account data for as long as your account is active. When you
              delete your account, we remove your edits, Style DNA, and connected channel
              tokens. Some logs and billing records are retained as required by law.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-a7-text mb-2">5. Your rights</h2>
            <p>
              Depending on where you live, you may have the right to access, correct, delete,
              or export your personal data. You can exercise the deletion right at any time
              from your account settings, or contact us for other requests.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-a7-text mb-2">6. Security</h2>
            <p>
              We use industry-standard safeguards including encryption in transit, scoped
              access controls, and isolated storage per user. No system is perfectly secure;
              we will notify you of any breach affecting your data as required by law.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-a7-text mb-2">7. Cookies</h2>
            <p>
              We use cookies and similar technologies to keep you signed in and to measure
              product usage. You can disable non-essential cookies in your browser; some
              parts of the Service will not function without authentication cookies.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-a7-text mb-2">8. Changes to this policy</h2>
            <p>
              We may update this policy from time to time. Material changes will be announced
              by email or in-product notice before they take effect.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-a7-text mb-2">9. Contact</h2>
            <p>
              Privacy questions or requests? Email{' '}
              <a
                href="mailto:hello@bonner.ai"
                className="text-grad-teal hover:underline"
              >
                hello@bonner.ai
              </a>
              .
            </p>
          </section>
        </div>

        <div
          className="mt-12 p-4 rounded-md text-xs text-a7-text/50"
          style={{
            background: 'rgba(184,115,51,0.06)',
            border: '1px solid rgba(184,115,51,0.2)',
          }}
        >
          <strong className="text-a7-text/70">Note for operators:</strong> this Privacy
          Policy is placeholder boilerplate. Have qualified counsel customize it for your
          jurisdiction (GDPR, CCPA, etc.) and the actual data flows of your stack before
          going live.
        </div>
      </main>
    </div>
  );
}
