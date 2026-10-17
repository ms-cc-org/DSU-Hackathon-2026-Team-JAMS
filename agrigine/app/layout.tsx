import type { Metadata, Viewport } from 'next';
import { Big_Shoulders, Public_Sans } from 'next/font/google';
import './globals.css';

// Big Shoulders: the condensed lettering of grain-elevator signs, for the wordmark and place names only.
// Next.js has no fallback metrics for it, so it falls back to a plain condensed face instead.
const display = Big_Shoulders({ subsets: ['latin'], axes: ['opsz'], variable: '--font-display', adjustFontFallback: false, fallback: ['Arial Narrow', 'sans-serif'] });
// Public Sans: the U.S. government's typeface, for public USDA and NOAA data.
const body = Public_Sans({ subsets: ['latin'], variable: '--font-body' });

export const metadata: Metadata = {
  title: { default: 'Agrigine', template: '%s · Agrigine' },
  description: 'A globe of county crop, drought, weather, soil and satellite data for California, Delaware, Iowa and Nebraska, 2000–2025.',
};

export const viewport: Viewport = {
  viewportFit: 'cover',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
