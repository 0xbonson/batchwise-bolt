import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchItems, fetchWeek, type DayLoad, type DbItem } from '@/lib/api';

/** Next N days of the live board, plus the menu. Realtime: reloads whenever any
 *  visitor confirms an order (board_updates carries no personal data). */
export function useBoard(days = 7) {
  const [week, setWeek] = useState<DayLoad[] | null>(null);
  const [items, setItems] = useState<DbItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadBoard = useCallback(async () => {
    try {
      const [w, i] = await Promise.all([fetchWeek(), fetchItems()]);
      setWeek(w.slice(0, days));
      setItems(i);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Something went wrong loading the bakery.');
    }
  }, [days]);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    const channel = supabase
      .channel(`board-live-${days}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'board_updates' },
        () => {
          loadBoard();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadBoard, days]);

  return {
    week,
    items,
    ready: week !== null && items !== null && !loadError,
    loadError,
    reload: loadBoard,
  };
}
