'use client';
import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import RequireSignIn from '@/components/account/RequireSignIn';

// The builder reads saved reports and the signed-in account, so it renders on the client only.
const ReportBuilder = dynamic(() => import('./ReportBuilder'), { ssr: false, loading: () => <Loading /> });
const Loading = () => <p className="rb-loading">Loading the report builder…</p>;

export default function ReportsLoader() {
  return (
    <RequireSignIn page="/reports" title="Report" why="Build reports from blocks, save them to your account, share them with other accounts for a set number of days, and print them to PDF or download the data. Reports live in your account, so sign in first.">
      <Suspense fallback={<Loading />}><ReportBuilder /></Suspense>
    </RequireSignIn>
  );
}
