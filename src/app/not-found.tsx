import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center">
      <div className="max-w-sm">
        <p className="text-8xl font-bold text-slate-100 select-none mb-2">404</p>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Pagina non trovata</h1>
        <p className="text-slate-400 text-sm mb-8">
          La pagina che cerchi non esiste o è stata spostata.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-700 text-white text-sm font-medium rounded-xl hover:bg-blue-800 transition-colors"
        >
          Torna alla home
        </Link>
      </div>
    </div>
  );
}
