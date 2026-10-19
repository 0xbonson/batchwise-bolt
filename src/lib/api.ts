import { DEMO_BUSINESS_ID, getSessionId, supabase } from '@/lib/supabase';

export type DbItem = {
  id: string;
  name: string;
  keywords: string[];
  price_per_unit: number;
  units_per_tray: number;
  prep_minutes_per_batch: number;
  lead_time_hours: number;
};

export type DayLoad = {
  date: string;
  trays: number;
  trays_used: number;
  prep_minutes: number;
  prep_used: number;
};
export type CapacityResult = {
  fits: boolean;
  trays_used: number;
  trays_left: number;
  prep_used: number;
  prep_left: number;
  alternatives: { date: string; reason: string }[];
};

export type OrderResult = {
  order_id: string;
  total: number;
  paid: boolean;
};

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function labelForDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (date === todayIso) return 'Today';
  const isWeekend = dt.getDay() === 0 || dt.getDay() === 6;
  return `${WEEKDAY_NAMES[dt.getDay()].slice(0, 3)} ${d}${isWeekend ? ' *' : ''}`;
}

export function isWeekendDate(date: string): boolean {
  const [y, m, d] = date.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return dow === 0 || dow === 6;
}

export function weekdayName(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return WEEKDAY_NAMES[new Date(y, m - 1, d).getDay()];
}

function dateFromLocalInput(text: string): string | null {
  // accept "2026-10-18" or "Oct 18" style
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  return null;
}

/** Fetch the next 7 days of capacity + THIS SESSION's load, in date order.
 *  Load = baseline/global orders plus the current visitor's own orders; no
 *  other visitor's orders are ever included. */
export async function fetchWeek(): Promise<DayLoad[]> {
  const today = new Date();
  const from = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 6);
  const to = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;

  const [capRes, loadRes] = await Promise.all([
    supabase
      .from('day_capacity')
      .select('date, trays, prep_minutes')
      .eq('business_id', DEMO_BUSINESS_ID)
      .gte('date', from)
      .lte('date', to)
      .order('date'),
    supabase.rpc('week_load_for', {
      p_business_id: DEMO_BUSINESS_ID,
      p_session_id: getSessionId(),
    }),
  ]);

  if (capRes.error) throw new Error(capRes.error.message);
  if (loadRes.error) throw new Error(loadRes.error.message);

  const loads = new Map<
    string,
    { trays_used: number; prep_used: number }
  >();
  for (const row of (loadRes.data ?? []) as {
    date: string;
    trays_used: number;
    prep_used: number;
  }[]) {
    loads.set(row.date, {
      trays_used: Number(row.trays_used),
      prep_used: Number(row.prep_used),
    });
  }

  return ((capRes.data ?? []) as {
    date: string;
    trays: number;
    prep_minutes: number;
  }[]).map((row) => ({
    date: row.date,
    trays: row.trays,
    trays_used: loads.get(row.date)?.trays_used ?? 0,
    prep_minutes: row.prep_minutes,
    prep_used: loads.get(row.date)?.prep_used ?? 0,
  }));
}

export async function fetchItems(): Promise<DbItem[]> {
  const { data, error } = await supabase
    .from('items')
    .select('id, name, keywords, price_per_unit, units_per_tray, prep_minutes_per_batch, lead_time_hours')
    .eq('business_id', DEMO_BUSINESS_ID)
    .eq('active', true)
    .order('name');

  if (error) throw new Error(error.message);
  return (data ?? []) as DbItem[];
}

export async function callCheckCapacity(
  date: string,
  lines: { item_id: string; units: number }[]
): Promise<CapacityResult> {
  const { data, error } = await supabase.rpc('check_capacity', {
    p_business_id: DEMO_BUSINESS_ID,
    p_session_id: getSessionId(),
    p_date: date,
    p_lines: lines,
  });

  if (error) throw new Error(error.message);
  if (!data || typeof data !== 'object') throw new Error('capacity check returned nothing');
  if (data.error) throw new Error(data.error);

  return data as CapacityResult;
}

export async function callCreateOrder(
  date: string,
  lines: { item_id: string; units: number }[],
  customerName: string,
  contact: string
): Promise<OrderResult> {
  const { data, error } = await supabase.rpc('create_order', {
    p_business_id: DEMO_BUSINESS_ID,
    p_session_id: getSessionId(),
    p_date: date,
    p_lines: lines,
    p_customer_name: customerName,
    p_contact: contact,
    p_pay_mock: true,
    p_global: false,
  });

  if (error) throw new Error(error.message);
  if (!data || typeof data !== 'object') throw new Error('order call returned nothing');
  if (data.error) {
    const err = new Error(data.error) as Error & { capacity?: CapacityResult };
    if (data.capacity) err.capacity = data.capacity;
    throw err;
  }

  return { order_id: data.order_id, total: Number(data.total), paid: Boolean(data.paid) };
}

export function findItem(text: string, items: DbItem[]): DbItem | null {
  const t = text.toLowerCase();
  for (const item of items) {
    if (item.keywords.some((k) => t.includes(k))) return item;
  }
  return null;
}

export function parseUnits(text: string): number | null {
  const t = text.toLowerCase().replace(/,/g, '');
  const num = t.match(/(\d+)/);
  if (!num) return null;
  const n = parseInt(num[1], 10);
  if (!Number.isFinite(n) || n <= 0 || n > 10000) return null;
  return n;
}

const DAY_WORDS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/** Match a weekday word or ISO date against the fetched week. */
export function findDay(week: DayLoad[], text: string): DayLoad | null {
  const t = text.toLowerCase();
  if (t.includes('today')) return week[0] ?? null;
  const iso = dateFromLocalInput(text);
  if (iso) return week.find((d) => d.date === iso) ?? null;
  for (const [word, dow] of Object.entries(DAY_WORDS)) {
    if (t.includes(word)) {
      return (
        week.find((d) => {
          const [y, m, dd] = d.date.split('-').map(Number);
          return new Date(y, m - 1, dd).getDay() === dow;
        }) ?? null
      );
    }
  }
  return null;
}

export function money(amount: number): string {
  return `${amount.toFixed(2)}`;
}

export type SessionOrderLine = { item_id: string; units: number; unit_price: number };
export type SessionOrder = {
  id: string;
  date: string;
  status: string;
  customer_name: string | null;
  total: number;
  paid: boolean;
  created_at: string;
  lines: SessionOrderLine[];
};

/** This browser session's own orders, newest first. RLS limits the read to
 *  rows whose session_id matches this visitor. */
export async function fetchSessionOrders(): Promise<SessionOrder[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('id, date, status, customer_name, total, paid, created_at, order_lines(item_id, units, unit_price)')
    .eq('session_id', getSessionId())
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((o) => ({
    id: String(o.id),
    date: String(o.date),
    status: String(o.status),
    customer_name: (o.customer_name as string | null) ?? null,
    total: Number(o.total),
    paid: Boolean(o.paid),
    created_at: String(o.created_at),
    lines: ((o.order_lines as Record<string, unknown>[]) ?? []).map((l) => ({
      item_id: String(l.item_id),
      units: Number(l.units),
      unit_price: Number(l.unit_price),
    })),
  }));
}
