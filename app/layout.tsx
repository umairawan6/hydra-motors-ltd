import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: { default: 'Hydra Motors | Staff portal', template: '%s | Hydra Motors' }, description: 'Hydra Motors dealership workspace', robots: { index: false, follow: false } };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
