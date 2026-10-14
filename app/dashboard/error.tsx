'use client';
export default function ErrorPage({ reset }: { reset: () => void }) { return <section className="card"><h1>Unable to load this screen</h1><p className="muted">Check your connection and database setup, then try again.</p><button className="button primary" onClick={reset}>Try again</button></section>; }
