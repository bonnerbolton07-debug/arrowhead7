import { Logo } from '@/components/ui/Logo';
import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-a7-base to-a7-void flex flex-col">
      <div className="fixed inset-0 pointer-events-none" style={{
        background:
          'radial-gradient(ellipse at 30% 20%, rgba(45,212,191,0.05) 0%, transparent 55%), radial-gradient(ellipse at 70% 80%, rgba(184,115,51,0.04) 0%, transparent 55%)',
      }} />
      <header className="relative px-8 py-5 border-b border-a7-text/[0.04]">
        <div className="absolute bottom-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-a7-teal/15 to-transparent" />
        <Link href="/" className="inline-flex items-center gap-1">
          <Logo variant="dual" size="sm" wordmark />
        </Link>
      </header>
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-12">
        {children}
      </main>
    </div>
  );
}
