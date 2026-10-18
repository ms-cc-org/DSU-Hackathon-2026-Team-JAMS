import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from './icons';
import NavSwitch from './NavSwitch';

/** The bar shared by the explorer, the report builder and the plan page. The explorer passes its search box and map controls in. */
export default function TopBar({ active, search, controls }: { active: 'explore' | 'reports' | 'plan'; search?: ReactNode; controls?: ReactNode }) {
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
          <NavSwitch active={active} />
        </div>
      </div>
    </header>
  );
}
