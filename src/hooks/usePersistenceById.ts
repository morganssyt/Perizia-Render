'use client';

import { useEffect, useState, useCallback } from 'react';

interface PersistenceData {
  notes: Record<string, string>;
  verified: Record<string, boolean>;
}

const EMPTY: PersistenceData = { notes: {}, verified: {} };

/**
 * Like usePersistence but keyed by a string ID (e.g. history entry id).
 * Used on report pages to restore and save per-field notes + verified state.
 */
export function usePersistenceById(id: string | null) {
  const storageKey = id ? `pa_review_${id}` : null;
  const [data, setData] = useState<PersistenceData>(EMPTY);

  useEffect(() => {
    if (!storageKey) {
      setData(EMPTY);
      return;
    }
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setData(JSON.parse(raw) as PersistenceData);
      else setData(EMPTY);
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
        /* localStorage quota exceeded or unavailable */
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

  return { notes: data.notes, verified: data.verified, setNote, setVerified };
}
