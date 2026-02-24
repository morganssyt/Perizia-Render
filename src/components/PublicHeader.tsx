'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const LogoIcon = () => (
  <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586l5.414 5.414V19a2 2 0 01-2 2z" />
  </svg>
);

export default function PublicHeader() {
  const [isAuth, setIsAuth] = useState(false);

  useEffect(() => {
    try {
      setIsAuth(!!localStorage.getItem('pa_user'));
    } catch { /* ok */ }
  }, []);

  const logoHref = isAuth ? '/app' : '/';

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-sm border-b border-slate-100">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">

        {/* Logo */}
        <Link href={logoHref} className="flex items-center gap-2 flex-shrink-0 hover:opacity-80 transition-opacity">
          <div className="w-7 h-7 bg-blue-700 rounded-lg flex items-center justify-center">
            <LogoIcon />
          </div>
          <span className="font-semibold text-slate-900 text-sm tracking-tight">Perizia Analyzer</span>
        </Link>

        {/* Center nav */}
        <div className="hidden md:flex items-center gap-7">
          <Link href="/#come-funziona" className="text-sm text-slate-500 hover:text-slate-900 transition-colors">
            Come funziona
          </Link>
          <Link href="/pricing" className="text-sm text-slate-500 hover:text-slate-900 transition-colors">
            Pricing
          </Link>
          <Link href="/about" className="text-sm text-slate-500 hover:text-slate-900 transition-colors">
            About
          </Link>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-3">
          {isAuth ? (
            <Link
              href="/app"
              className="px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded-lg hover:bg-blue-800 transition-colors"
            >
              Dashboard →
            </Link>
          ) : (
            <>
              <Link href="/login" className="text-sm text-slate-500 hover:text-slate-900 transition-colors">
                Accedi
              </Link>
              <Link
                href="/signup"
                className="px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded-lg hover:bg-blue-800 transition-colors"
              >
                Prova gratis
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
