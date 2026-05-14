import type { Metadata } from 'next';
import { Logo } from '@/components/ui/Logo';

export const metadata: Metadata = {
  title: 'Terms of Service — Arrowhead 7',
  description: 'Terms of service for the Arrowhead 7 platform.',
};

export default function TermsPage() {
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
        <h1 className="text-3xl sm:text-4xl font-bold mb-3">Terms of Service</h1>
        <p className="text-sm text-a7-text/40 mb-10">
          Last updated: January 1, 2026 — placeholder copy. Replace before launch.
        </p>

        <div className="space-y-8 text-sm text-a7-text/70 leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-a7-text mb-2">1. Acceptance of terms</h2>
            <p>
              By accessing or using Arrowhead 7 (the &ldquo;Service&rdquo;), you agree to be bound
              by these Terms of Service. If you do not agree, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-a7-text mb-2">2. Your account</h2>
            <p>
              You are responsible for maintaining the confidentiality of your account
              credentials and for all activity under your account. Notify us immediately of
              any unauthorized use.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-a7-text mb-2">3. Your content</h2>
            <p>
              You retain ownership of all video, image, audio, and text content you upload
              (&ldquo;Your Content&rdquo;). You grant us a limited license to process Your Content
              solely to provide the Service to you, including AI analysis, rendering, and
              distribution to channels you connect.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-a7-text mb-2">4. Acceptable use</h2>
            <p>
              You agree not to use the Service to upload content that infringes intellectual
              property, violates law, or contains malware. We reserve the right to suspend
              accounts that violate this policy.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-a7-text mb-2">5. Subscriptions and billing</h2>
            <p>
              Paid plans are billed on a recurring basis through our payment processor. You
              may cancel at any time; cancellation takes effect at the end of the current
              billing period. Refunds are handled on a case-by-case basis.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-a7-text mb-2">6. Disclaimers</h2>
            <p>
              The Service is provided &ldquo;as is&rdquo; without warranties of any kind. We do not
              guarantee that AI-generated outputs will meet your expectations or be free of
              errors.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-a7-text mb-2">7. Limitation of liability</h2>
            <p>
              To the maximum extent permitted by law, Arrowhead 7 shall not be liable for
              indirect, incidental, or consequential damages arising from your use of the
              Service.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-a7-text mb-2">8. Changes to these terms</h2>
            <p>
              We may update these Terms from time to time. Continued use of the Service after
              changes are posted constitutes acceptance of the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-a7-text mb-2">9. Contact</h2>
            <p>
              Questions about these Terms? Email{' '}
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
          <strong className="text-a7-text/70">Note for operators:</strong> these Terms are
          placeholder boilerplate. Have qualified counsel review and customize before going
          live, especially around AI-generated content rights, distribution to third-party
          platforms, and jurisdiction-specific consumer protections.
        </div>
      </main>
    </div>
  );
}
