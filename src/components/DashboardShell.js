'use client';

import TopNav from './TopNav';

/**
 * Layout principal del dashboard. Solo top nav, sin sidebar.
 */
export default function DashboardShell({ profile, rate, children }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
      <TopNav profile={profile} rate={rate} />
      <main className="flex-1 p-4 sm:p-6">{children}</main>
    </div>
  );
}
