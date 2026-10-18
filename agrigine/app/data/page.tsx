import type { Metadata } from 'next';
import TopBar from '@/components/TopBar';
import FarmDataLoader from '@/components/account/FarmDataLoader';

export const metadata: Metadata = { title: 'My farm data' };

export default function FarmDataPage() {
  return (
    <div className="page">
      <TopBar active="data" />
      <main className="acct wide">
        <FarmDataLoader />
      </main>
    </div>
  );
}
