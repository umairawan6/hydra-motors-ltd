import Link from 'next/link';
export default function NotFound() { return <main className="error-page"><h1>Page not found</h1><p className="muted">This page is unavailable.</p><Link href="/dashboard" className="button primary">Go to dashboard</Link></main>; }
