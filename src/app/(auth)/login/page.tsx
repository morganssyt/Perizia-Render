'use client';

import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError('Inserisci email e password.'); return; }
    setLoading(true);
    setError('');

    const res = await signIn('credentials', {
      email: email.trim().toLowerCase(),
      password,
      redirect: false,
    });

    setLoading(false);

    if (res?.error) {
      setError('Credenziali non valide. Riprova.');
      return;
    }

    router.push('/app');
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <nav className="border-b border-slate-100 h-14 flex items-center px-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 bg-blue-700 rounded-lg flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586l5.414 5.414V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <span className="font-semibold text-slate-900 text-sm">Perizia Analyzer</span>
        </Link>
      </nav>

      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900 mb-1.5">Bentornato</h1>
            <p className="text-slate-500 text-sm">Accedi al tuo account per continuare.</p>
          </div>

          {error && (
            <div className="mb-5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@email.com" autoComplete="email"
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700 transition-all" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" autoComplete="current-password"
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700 transition-all" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-2.5 bg-blue-700 text-white font-semibold rounded-xl hover:bg-blue-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed text-sm mt-2">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Accesso in corso…
                </span>
              ) : 'Accedi'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Non hai un account?{' '}
            <Link href="/signup" className="text-blue-700 font-medium hover:underline">Registrati gratis</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
