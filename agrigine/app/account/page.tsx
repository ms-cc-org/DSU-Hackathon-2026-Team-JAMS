import type { Metadata } from 'next';
import TopBar from '@/components/TopBar';
import AccountView from '@/components/account/AccountView';

export const metadata: Metadata = { title: 'Profile' };

export default function AccountPage() {
  return (
    <div className="page">
      <TopBar active="account" />
      <main className="acct">
        <AccountView />
      </main>
    </div>
  );
}
