import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Arrowhead 7 — Autonomous Content Editing',
  description: 'AI-powered video editing platform. Upload footage, define your style, get broadcast-ready content.',
  keywords: ['video editing', 'AI editing', 'autonomous editing', 'content creation'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-a7-void text-a7-text antialiased`}>
        {children}
      </body>
    </html>
  );
}
