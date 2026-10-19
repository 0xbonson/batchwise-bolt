import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('Supabase env vars missing');
}

export const supabase = createClient(url, anonKey, {
  realtime: { params: { eventsPerSecond: 5 } },
  // order_lines RLS identifies the visitor by this header
  global: { headers: { 'x-bw-session': getSessionId() } },
});

export function getSessionId(): string {
  const KEY = 'bw_session_id';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

export const DEMO_BUSINESS_ID = '00000000-0000-0000-0000-000000000001';
