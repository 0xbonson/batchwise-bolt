import { useEffect, useMemo, useState } from 'react';
import { BoardList } from '@/components/BoardList';
import { useBoard } from '@/lib/useBoard';
import { fetchSessionOrders, money, type SessionOrder } from '@/lib/api';

export function Owner() {
  const { week, ready, loadError, reload } = useBoard(14);
  const [orders, setOrders] = useState<SessionOrder[] | null>(null);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  const weekTotal = useMemo(() => (week ? week.reduce((a, d) => a + d.trays_used, 0) : 0), [week]);
  const prepTotal = useMemo(() => (week ? week.reduce((a, d) => a + d.prep_used, 0) : 0), [week]);

  useEffect(() => {
    fetchSessionOrders()
      .then(setOrders)
      .catch((e) => setOrdersError(e instanceof Error ? e.message : 'Could not load orders.'));
  }, [ready]);

  return (
    <main className="mx-auto w-full max-w-4xl px-5 pb-16">
      <section className="py-8">
        <h1 className="font-display text-4xl tracking-tight sm:text-[2.75rem]">For bakers</h1>
        <p className="mt-2 max-w-xl text-base leading-relaxed opacity-80">
          The owner's read-only view of the same board customers see: trays, prep time and this
          session's orders as slips.
        </p>
      </section>

      <section aria-label="Fourteen days of trays and prep time">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-2xl tracking-tight">Load by day</h2>
          <span className="font-slip text-xs opacity-60">
            {ready
              ? `${weekTotal} trays · ${Math.round(prepTotal / 6) / 10}h prep taken`
              : 'loading'}
          </span>
        </div>
        <div className="rounded-xl border border-[color:var(--ink)]/20 bg-[color:var(--slip)] p-4 sm:p-5">
          <BoardList week={week} error={loadError} onRetry={reload} size="md" />
          <p className="mt-4 font-slip text-xs opacity-60">
            Prep time is the baking and decorating work behind each tray, in hours. * weekend, 10
            trays.
          </p>
        </div>
      </section>

      <section className="mt-10" aria-label="This session's orders">
        <h2 className="font-display text-2xl tracking-tight">This session's orders</h2>
        {ordersError ? (
          <p role="alert" className="mt-2 font-slip text-sm text-[color:var(--tomato)]">{ordersError}</p>
        ) : !orders ? (
          <p className="mt-2 font-slip text-sm opacity-60">loading…</p>
        ) : orders.length === 0 ? (
          <p className="mt-2 font-slip text-sm opacity-60">
            No orders in this browser session yet.
          </p>
        ) : (
          <ul className="mt-4 max-w-sm space-y-4">
            {orders.map((o) => (
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
        <p className="mt-4 font-slip text-xs opacity-60">
          Editing capacity, items and orders is for signed-in owners — that part is not part of this
          demo.
        </p>
      </section>
    </main>
  );
}
