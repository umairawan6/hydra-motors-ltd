'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
export function Navigation({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname();
  return <nav aria-label="Main navigation" className="nav-links">{links.map(link => <Link key={link.href} href={link.href} className={`nav-link${path === link.href ? ' active' : ''}`} aria-current={path === link.href ? 'page' : undefined}>{link.label}</Link>)}</nav>;
}
