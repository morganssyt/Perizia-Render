'use client';

import { useEffect, useState, useCallback } from 'react';

interface PersistenceData {
  notes: Record<string, string>;
  verified: Record<string, boolean>;
}

const EMPTY: PersistenceData = { notes: {}, verified: {} };

function makeKey(fileName: string, fileSize: number): string {
  // sanitize filename for use as a storage key
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  return `pa_doc_${safe}_${fileSize}`;
}

export function usePersistence(fileName?: string, fileSize?: number) {
  const [data, setData] = useState<PersistenceData>(EMPTY);

  const storageKey = fileName && fileSize ? makeKey(fileName, fileSize) : null;

  // Load from localStorage when file changes
  useEffect(() => {
    if (!storageKey) {
      setData(EMPTY);
      return;
    }
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        setData(JSON.parse(raw));
      } else {
        setData(EMPTY);
      }
    } catch {
      setData(EMPTY);
    }
  }, [storageKey]);

  const save = useCallback(
    (next: PersistenceData) => {
      if (!storageKey) return;
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // localStorage quota exceeded or unavailable — silent fail
      }
    },
    [storageKey],
  );

  const setNote = useCallback(
    (field: string, value: string) => {
      setData((prev) => {
        const next: PersistenceData = {
          ...prev,
          notes: { ...prev.notes, [field]: value },
        };
        save(next);
        return next;
      });
    },
    [save],
  );

  const setVerified = useCallback(
    (field: string, value: boolean) => {
      setData((prev) => {
        const next: PersistenceData = {
          ...prev,
          verified: { ...prev.verified, [field]: value },
        };
        save(next);
        return next;
      });
    },
    [save],
  );

  return {
    notes: data.notes,
    verified: data.verified,
    setNote,
    setVerified,
  };
}
