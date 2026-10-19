import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BoardList } from '@/components/BoardList';
import { useBoard } from '@/lib/useBoard';
import { fetchSessionOrders, money, type SessionOrder } from '@/lib/api';

export function Calendar() {
  const { week, ready, loadError, reload } = useBoard(14);
  const [orders, setOrders] = useState<SessionOrder[] | null>(null);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);

  const weekTotal = useMemo(() => (week ? week.reduce((a, d) => a + d.trays_used, 0) : 0), [week]);
  const weekCapacity = useMemo(() => (week ? week.reduce((a, d) => a + d.trays, 0) : 0), [week]);
  const closestLimit = useMemo(() => {
    if (!week) return null;
    for (const d of week) {
      if (d.trays_used < d.trays) return d;
    }
    return null;
  }, [week]);

  const dayOrders = useMemo(() => {
    if (!orders || !openDay) return [];
    return orders.filter((o) => o.date === openDay);
  }, [orders, openDay]);

  const toggleDay = async (date: string) => {
    if (openDay === date) {
      setOpenDay(null);
      return;
    }
    setOpenDay(date);
    if (orders) return;
    try {
      setOrders(await fetchSessionOrders());
    } catch (e) {
      setOrdersError(e instanceof Error ? e.message : 'Could not load your orders.');
    }
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-5 pb-16">
      <section className="py-8">
        <h1 className="font-display text-4xl tracking-tight sm:text-[2.75rem]">Calendar</h1>
        <p className="mt-2 max-w-xl text-base leading-relaxed opacity-80">
          The next two weeks of the oven, updating live as orders are confirmed. Tap a day to see
          your orders for it.
        </p>
      </section>

      <section aria-label="Fourteen days of tray capacity">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-2xl tracking-tight">Trays by day</h2>
          <span className="font-slip text-xs opacity-60">
            {ready ? `${weekTotal}/${weekCapacity} trays taken` : 'loading'}
          </span>
        </div>
        <div className="rounded-xl border border-[color:var(--ink)]/20 bg-[color:var(--slip)] p-4 sm:p-5">
          <BoardList week={week} error={loadError} onRetry={reload} size="md" />
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 font-slip text-xs opacity-70">
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-block h-3 w-3 rounded-full border border-dashed border-[color:var(--ink)]/50" />
              open tray
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-block h-3 w-3 rounded-full bg-[color:var(--crust)]" />
              taken tray
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-block h-3 w-3 rounded-full bg-[color:var(--tomato)]/60" />
              full day
            </span>
            <span>* weekend, 10 trays</span>
          </div>
          {closestLimit && (
            <p className="mt-2 font-slip text-xs opacity-70">
              Closest open limit: {money(closestLimit.trays - closestLimit.trays_used)} tray
              {closestLimit.trays - closestLimit.trays_used === 1 ? '' : 's'} left on{' '}
              {weekdayLabel(closestLimit.date)}.
            </p>
          )}
        </div>
      </section>

      {openDay && (
        <section className="mt-6" aria-label={`Your orders for ${openDay}`}>
          <h2 className="font-display text-2xl tracking-tight">Your orders · {weekdayLabel(openDay)}</h2>
          {ordersError ? (
            <p role="alert" className="mt-2 font-slip text-sm text-[color:var(--tomato)]">{ordersError}</p>
          ) : dayOrders.length === 0 ? (
            <p className="mt-2 font-slip text-sm opacity-60">
              You have no orders this session for this day yet. Confirm one on the order desk or in
              the cake studio.
            </p>
          ) : (
            <ul className="mt-4 max-w-sm space-y-4">
              {dayOrders.map((o) => (
                <li key={o.id}>
                  <div className="rounded-xl border border-[color:var(--ink)]/20 bg-[color:var(--slip)] p-4 font-slip text-sm">
                    <div className="flex justify-between font-medium">
                      <span>{o.customer_name || 'Your order'}</span>
                      <span>{money(o.total)}</span>
                    </div>
                    <div className="my-2 border-t border-dashed border-[color:var(--ink)]/35" />
                    {o.lines.map((l, i) => (
                      <div key={i} className="flex justify-between text-xs opacity-80">
                        <span>{l.units} x {l.item_id}</span>
                        <span>{money(l.units * l.unit_price)}</span>
                      </div>
                    ))}
                    <div className="mt-2 flex justify-end">
                      <span className="inline-block -rotate-3 select-none rounded border-4 border-double px-2 py-0.5 text-xs font-semibold uppercase tracking-widest">
                        {o.status.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <p className="mt-8 font-slip text-xs opacity-60">
        Want something baked? Back to the{' '}
        <Link to="/" className="underline underline-offset-2">
          order desk
        </Link>{' '}
        or the{' '}
        <Link to="/studio" className="underline underline-offset-2">
          cake studio
        </Link>
        .
      </p>
    </main>
  );
}

function weekdayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${names[new Date(y, m - 1, d).getDay()]} ${d}`;
}
