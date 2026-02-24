import Link from 'next/link';

const LogoIcon = () => (
  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586l5.414 5.414V19a2 2 0 01-2 2z" />
  </svg>
);

export default function PublicFooter() {
  return (
    <footer className="border-t border-slate-100 py-10 px-6">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-5">

        {/* Brand */}
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-blue-700 rounded-md flex items-center justify-center flex-shrink-0">
            <LogoIcon />
          </div>
          <span className="text-sm font-medium text-slate-600">Perizia Analyzer</span>
        </div>

        {/* Links */}
        <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-slate-400">
          <Link href="/privacy" className="hover:text-slate-600 transition-colors">Privacy</Link>
          <Link href="/terms" className="hover:text-slate-600 transition-colors">Termini</Link>
          <Link href="/about" className="hover:text-slate-600 transition-colors">About</Link>
          <Link href="/about#contatti" className="hover:text-slate-600 transition-colors">Contatti</Link>
        </nav>

        {/* Copyright */}
        <p className="text-xs text-slate-300">© {new Date().getFullYear()} Perizia Analyzer</p>
      </div>
    </footer>
  );
}
