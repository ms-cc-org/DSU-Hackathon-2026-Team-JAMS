import type { ReactNode } from 'react';
import TopBar from './TopBar';

/** The explorer's frame while its data or globe library loads, or when loading fails. */
export default function LoadingShell({ title = 'Loading Agrigine', children = '26 seasons for 253 counties' }: { title?: string; children?: ReactNode }) {
  return (
    <div className="shell">
      <TopBar active="explore" />
      <main className="views">
        <section className="explore" aria-busy="true">
          <div className="loading" role="status">
            <p><b>{title}</b>{children}</p>
          </div>
        </section>
      </main>
    </div>
  );
}
