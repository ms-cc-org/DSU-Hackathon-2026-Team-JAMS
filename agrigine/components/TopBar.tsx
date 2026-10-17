import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from './icons';

/** The bar shared by the explorer and the plan page. The explorer passes its search box and map controls in. */
export default function TopBar({ active, search, controls }: { active: 'explore' | 'plan'; search?: ReactNode; controls?: ReactNode }) {
  return (
    <header className="top">
      <div className="top-in">
        <Link href="/" className="brand" aria-label="Agrigine home">
          <Logo />
          <span className="wordmark">Agrigine</span>
        </Link>
        {search}
        <div className="top-right">
          {controls}
          <nav className="seg" aria-label="Page">
            <Link href="/" aria-current={active === 'explore' ? 'page' : undefined}>Explore</Link>
            <Link href="/plan" aria-current={active === 'plan' ? 'page' : undefined}>Plan</Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
