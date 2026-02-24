'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface UserData {
  email: string;
  name: string;
}

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserData | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('pa_user');
      setUser(raw ? JSON.parse(raw) : { email: 'utente@esempio.com', name: 'Utente' });
    } catch {
      setUser({ email: 'utente@esempio.com', name: 'Utente' });
    }
    setLoaded(true);
  }, []);

  const handleLogout = () => {
    try {
      localStorage.removeItem('pa_user');
    } catch { /* ok */ }
    router.push('/');
  };

  if (!loaded) {
    return (
      <div className="max-w-xl mx-auto px-6 py-20 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-blue-700 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U';

  return (
    <div className="max-w-xl mx-auto px-6 py-10">
      <div className="mb-10">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Account</h1>
        <p className="text-sm text-slate-400">Gestisci il tuo profilo e piano.</p>
      </div>

      {/* Profile */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden mb-5">
        <div className="px-6 py-5 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">Profilo</h2>
        </div>
        <div className="px-6 py-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-700 flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-sm">{initials}</span>
          </div>
          <div>
            <p className="font-semibold text-slate-900">{user?.name}</p>
            <p className="text-sm text-slate-400 mt-0.5">{user?.email}</p>
          </div>
        </div>
      </div>

      {/* Plan */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden mb-5">
        <div className="px-6 py-5 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">Piano attivo</h2>
        </div>
        <div className="px-6 py-5 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-slate-900">Piano Free</span>
              <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full font-medium">
                Gratuito
              </span>
            </div>
            <p className="text-sm text-slate-400">1 analisi inclusa · watermark sui report</p>
          </div>
          <Link
            href="/pricing"
            className="flex-shrink-0 px-4 py-2 bg-blue-700 text-white text-sm font-medium rounded-xl hover:bg-blue-800 transition-colors"
          >
            Passa a Pro
          </Link>
        </div>
      </div>

      {/* Data */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden mb-10">
        <div className="px-6 py-5 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">I tuoi dati</h2>
        </div>
        <div className="px-6 py-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">Storico analisi</p>
              <p className="text-xs text-slate-400 mt-0.5">Salvato localmente nel browser</p>
            </div>
            <Link href="/app/reports" className="text-sm text-blue-700 font-medium hover:underline">
              Vedi →
            </Link>
          </div>
          <div className="border-t border-slate-100 pt-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">Elimina dati locali</p>
              <p className="text-xs text-slate-400 mt-0.5">Cancella tutto lo storico dal browser</p>
            </div>
            <button
              onClick={() => {
                try { localStorage.removeItem('pa_history'); } catch { /* ok */ }
                alert('Storico eliminato.');
              }}
              className="text-sm text-red-500 hover:text-red-700 font-medium transition-colors"
            >
              Elimina
            </button>
          </div>
        </div>
      </div>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="w-full py-3 border border-slate-200 text-sm font-medium text-slate-600 rounded-xl hover:bg-slate-50 hover:text-slate-900 transition-colors"
      >
        Esci dall&apos;account
      </button>
    </div>
  );
}
