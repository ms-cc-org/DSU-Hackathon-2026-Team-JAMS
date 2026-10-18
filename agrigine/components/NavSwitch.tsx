'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export type PageId = 'explore' | 'reports' | 'predict' | 'account' | 'data';

/** Where Explore was last left, so coming back from another page returns to the same view. */
export const LAST_VIEW_KEY = 'agrigine.lastView';

export default function NavSwitch({ active }: { active: PageId }) {
  const router = useRouter();
  const toExplore = (e: React.MouseEvent) => {
    let last: string | null = null;
    try { last = sessionStorage.getItem(LAST_VIEW_KEY); } catch {}
    if (!last || active === 'explore') return;
    e.preventDefault();
    router.push(`/${last}`);
  };
  return (
    <nav className="seg" aria-label="Page">
      <Link href="/" onClick={toExplore} aria-current={active === 'explore' ? 'page' : undefined}>Explore</Link>
      <Link href="/reports" aria-current={active === 'reports' ? 'page' : undefined}>Report</Link>
      <Link href="/predict" aria-current={active === 'predict' ? 'page' : undefined}>Predict</Link>
    </nav>
  );
}
