'use client';
import dynamic from 'next/dynamic';
import LoadingShell from './LoadingShell';

// The globe needs WebGL and the browser window, so the explorer renders on the client only.
const Explorer = dynamic(() => import('./Explorer'), { ssr: false, loading: () => <LoadingShell /> });

export default function ExplorerLoader() {
  return <Explorer />;
}
