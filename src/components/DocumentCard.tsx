'use client';

interface DocumentCardProps {
  id: string;
  filename: string;
  uploadedAt: string;
  pages: number;
  status: string;
  progress?: number;
  errorMessage?: string;
}

export default function DocumentCard({
  id,
  filename,
  uploadedAt,
  pages,
  status,
  progress = 0,
  errorMessage,
}: DocumentCardProps) {
  const statusConfig = {
    pending: { label: 'In attesa', color: 'text-gray-500', bg: 'bg-gray-100', dot: 'bg-gray-400' },
    processing: { label: 'In elaborazione', color: 'text-blue-600', bg: 'bg-blue-50', dot: 'bg-blue-500' },
    completed: { label: 'Pronto', color: 'text-green-600', bg: 'bg-green-50', dot: 'bg-green-500' },
    error: { label: 'Errore', color: 'text-red-600', bg: 'bg-red-50', dot: 'bg-red-500' },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;

  return (
    <a
      href={status === 'completed' ? `/document/${id}` : '#'}
      className={`
        block bg-white rounded-xl border border-gray-200 p-4 shadow-sm
        transition-all duration-200
        ${status === 'completed' ? 'hover:shadow-md hover:border-blue-300 cursor-pointer' : 'cursor-default'}
      `}
      tabIndex={0}
      aria-label={`Documento ${filename} - ${config.label}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-gray-900 truncate">{filename}</h3>
            <p className="text-xs text-gray-400">
              {new Date(uploadedAt).toLocaleDateString('it-IT', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
              {pages > 0 && ` \u2022 ${pages} pagine`}
            </p>
          </div>
        </div>

        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${config.bg} ${config.color}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${config.dot} ${status === 'processing' ? 'animate-pulse' : ''}`} />
          {config.label}
        </span>
      </div>

      {/* Progress bar for processing */}
      {status === 'processing' && (
        <div className="mt-3">
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-gray-400 mt-1">{progress}% completato</p>
        </div>
      )}

      {/* Error message */}
      {status === 'error' && errorMessage && (
        <div className="mt-2 text-xs text-red-600 bg-red-50 rounded-lg p-2">
          {errorMessage}
        </div>
      )}

      {/* Click hint for completed */}
      {status === 'completed' && (
        <div className="mt-2 text-xs text-blue-500 flex items-center gap-1">
          <span>Visualizza analisi</span>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      )}
    </a>
  );
}
