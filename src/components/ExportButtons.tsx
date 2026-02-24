'use client';

import { useState } from 'react';

interface ExportButtonsProps {
  documentId: string;
}

export default function ExportButtons({ documentId }: ExportButtonsProps) {
  const [downloading, setDownloading] = useState<string | null>(null);

  const handleExport = async (format: 'json' | 'csv' | 'html') => {
    setDownloading(format);
    try {
      const response = await fetch(`/api/documents/${documentId}/export?format=${format}`);
      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disposition = response.headers.get('Content-Disposition');
      const filename = disposition?.match(/filename="(.+)"/)?.[1] || `export.${format}`;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setDownloading(null);
    }
  };

  const buttons = [
    { format: 'json' as const, label: 'JSON', icon: '{ }', desc: 'Dati strutturati' },
    { format: 'csv' as const, label: 'CSV', icon: '📊', desc: 'Foglio di calcolo' },
    { format: 'html' as const, label: 'Scheda Asta', icon: '🖨️', desc: 'HTML stampabile' },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {buttons.map(({ format, label, icon, desc }) => (
        <button
          key={format}
          onClick={() => handleExport(format)}
          disabled={downloading !== null}
          className={`
            inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium
            transition-all duration-200
            ${downloading === format
              ? 'bg-blue-50 border-blue-300 text-blue-600'
              : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300'
            }
            disabled:opacity-50
          `}
          title={desc}
        >
          <span>{icon}</span>
          <span>{label}</span>
          {downloading === format && (
            <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          )}
        </button>
      ))}
    </div>
  );
}
