import Link from 'next/link';

export default function GlobalFooter() {
  return (
    <footer className="border-t border-slate-100 bg-white py-6 px-6 no-print">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">

        {/* Brand */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-5 h-5 bg-blue-700 rounded-md flex items-center justify-center">
            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586l5.414 5.414V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <span className="text-xs font-medium text-slate-500">Perizia Analyzer</span>
        </div>

        {/* Links */}
        <nav className="flex flex-wrap justify-center gap-x-5 gap-y-1.5 text-xs text-slate-400">
          <Link href="/privacy" className="hover:text-blue-700 transition-colors">Privacy</Link>
          <Link href="/terms" className="hover:text-blue-700 transition-colors">Termini</Link>
          <Link href="/about" className="hover:text-blue-700 transition-colors">About</Link>
          <Link href="/contact" className="hover:text-blue-700 transition-colors">Contatti</Link>
          <Link href="/pricing" className="hover:text-blue-700 transition-colors">Pricing</Link>
        </nav>

        {/* Copyright */}
        <p className="text-xs text-slate-300 flex-shrink-0">
          © {new Date().getFullYear()} Perizia Analyzer
        </p>
      </div>
    </footer>
  );
}
