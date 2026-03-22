import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { LoggerProvider } from '@/components/LoggerProvider';
import './globals.css';

const inter = localFont({
  src: [
    { path: './fonts/inter.woff2', weight: '100 900', style: 'normal' },
  ],
  variable: '--font-inter',
  fallback: ['system-ui', 'Arial', 'sans-serif'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ArtMood Factory OS',
  description: 'Internal Operating System for ArtMood Kitchen Manufacturing',
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'ArtMood',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning translate="no">
      <head>
        <meta name="google" content="notranslate" />
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            var t = localStorage.getItem('theme');
            if (t === 'dark') document.documentElement.classList.add('dark');
            else document.documentElement.classList.remove('dark');
          } catch(e) {}
        ` }} />
      </head>
      <body className={`${inter.className} antialiased`}>
        <LoggerProvider>{children}</LoggerProvider>
      </body>
    </html>
  );
}
