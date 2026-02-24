'use client';

import { useState, useCallback, useRef } from 'react';

interface FileUploadProps {
  onUploadComplete: () => void;
}

export default function FileUpload({ onUploadComplete }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const pdfFiles = fileArray.filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );

    if (pdfFiles.length === 0) {
      setError('Seleziona almeno un file PDF.');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      pdfFiles.forEach((file) => formData.append('files', file));

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Errore durante il caricamento.');
      }

      onUploadComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore sconosciuto.');
    } finally {
      setIsUploading(false);
    }
  }, [onUploadComplete]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  return (
    <div className="w-full">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
          transition-all duration-200
          ${isDragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-gray-50'
          }
          ${isUploading ? 'pointer-events-none opacity-60' : ''}
        `}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
        aria-label="Carica file PDF"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />

        {isUploading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-600">Caricamento in corso...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">
                Trascina qui i PDF o <span className="text-blue-600">sfoglia</span>
              </p>
              <p className="text-xs text-gray-400 mt-1">
                PDF perizie immobiliari (max 50MB per file)
              </p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
