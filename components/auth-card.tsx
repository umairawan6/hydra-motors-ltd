import Link from 'next/link';
export function AuthCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <main className="auth-page"><section className="auth-card"><Link href="/" className="brand"><span className="brand-mark">H</span><span>HYDRA <small>MOTORS LTD</small></span></Link><p className="eyebrow">STAFF PORTAL</p><h1>{title}</h1><p className="muted">{description}</p>{children}<p className="auth-footer">Driven by Trust. Defined by Quality.</p></section></main>;
}
