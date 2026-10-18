import type { Metadata } from 'next';
import TopBar from '@/components/TopBar';
import ReportsLoader from '@/components/report/ReportsLoader';

export const metadata: Metadata = { title: 'Reports' };

export default function ReportsPage() {
  return (
    <div className="rb-page">
      <TopBar active="reports" />
      <ReportsLoader />
    </div>
  );
}
