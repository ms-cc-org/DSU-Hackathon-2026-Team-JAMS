'use client';
import dynamic from 'next/dynamic';
import { Suspense } from 'react';

// The builder reads saved reports from this browser, so it renders on the client only.
const ReportBuilder = dynamic(() => import('./ReportBuilder'), { ssr: false, loading: () => <Loading /> });
const Loading = () => <p className="rb-loading">Loading the report builder…</p>;

export default function ReportsLoader() {
  return <Suspense fallback={<Loading />}><ReportBuilder /></Suspense>;
}
