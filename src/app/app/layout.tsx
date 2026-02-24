'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import AppNav from '@/components/ui/AppNav';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const router     = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-blue-700 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      <AppNav />
      <main className="pt-14 min-h-screen bg-slate-50">{children}</main>
    </>
  );
}
