import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from './icons';
import AccountMenu from './account/AccountMenu';
import NavSwitch, { type PageId } from './NavSwitch';

/** The bar shared by every page. The explorer passes its search box and map controls in. */
export default function TopBar({ active, search, controls }: { active: PageId; search?: ReactNode; controls?: ReactNode }) {
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
          <AccountMenu active={active} />
        </div>
      </div>
    </header>
  );
}
