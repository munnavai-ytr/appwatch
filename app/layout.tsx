import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'AppWatch — 24/7 AI App Monitoring',
  description: 'AI-powered 24/7 app monitoring dashboard for developers.',
  openGraph: {
    title: 'AppWatch — 24/7 AI App Monitoring',
    description: 'AI-powered 24/7 app monitoring dashboard for developers.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AppWatch — 24/7 AI App Monitoring',
    description: 'AI-powered 24/7 app monitoring dashboard for developers.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} dark`}>
      <body
        suppressHydrationWarning
        className="min-h-screen bg-[#05070f] text-slate-100 font-sans antialiased selection:bg-[#00d4ff]/25 selection:text-[#00d4ff]"
      >
        {children}
      </body>
    </html>
  );
}
