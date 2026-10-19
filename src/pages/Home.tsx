import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DemoChat, type ChatMessage } from '@/components/DemoChat';
import { TrayRow } from '@/components/TrayRow';
import { useBoard } from '@/lib/useBoard';
import {
  callCheckCapacity,
  callCreateOrder,
  findDay,
  findItem,
  labelForDate,
  money,
  parseUnits,
  type CapacityResult,
  type DbItem,
  type DayLoad,
} from '@/lib/api';

type Stage =
  | { kind: 'idle' }
  | { kind: 'await_item' }
  | { kind: 'await_units'; item: DbItem }
  | { kind: 'await_day'; item: DbItem; units: number }
  | { kind: 'await_confirm'; item: DbItem; units: number; day: DayLoad; capacity: CapacityResult }
  | { kind: 'await_name'; item: DbItem; units: number; day: DayLoad; capacity: CapacityResult };

const GREETING_TEXT = "Hi, Odile's Kitchen here. This is demo data. What can I get baking for you?";

export function Home() {
  const { week, items, ready, loadError, reload } = useBoard(7);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 1, role: 'agent', text: GREETING_TEXT },
  ]);
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [typing, setTyping] = useState(false);
  const [sending, setSending] = useState(false);
  const [lastOrder, setLastOrder] = useState<{
    itemName: string;
    units: number;
    dateLabel: string;
    total: number;
  } | null>(null);
  const nextId = useRef(2);
  const lastCustomerText = useRef('');

  const weekTotal = useMemo(() => (week ? week.reduce((a, d) => a + d.trays_used, 0) : 0), [week]);
  const weekCapacity = useMemo(() => (week ? week.reduce((a, d) => a + d.trays, 0) : 0), [week]);

  const pushAgent = (text: string, delay = 650) => {
    setTyping(true);
    window.setTimeout(() => {
      setTyping(false);
      setMessages((prev) => [...prev, { id: nextId.current++, role: 'agent', text }]);
    }, delay);
  };

  const describeAlternatives = (result: CapacityResult): string => {
    if (!result.alternatives || result.alternatives.length === 0) {
      return 'Nothing else this week works. Try a smaller batch or ask about next week.';
    }
    return result.alternatives.map((a) => a.reason).join('. ') + '.';
  };

  const quoteForDay = (item: DbItem, units: number, day: DayLoad) => {
    callCheckCapacity(day.date, [{ item_id: item.id, units }])
      .then((result) => {
        if (result.fits) {
          const total = units * item.price_per_unit;
          setStage({ kind: 'await_confirm', item, units, day, capacity: result });
          pushAgent(
            `${labelForDate(day.date)} has ${result.trays_left} ${result.trays_left === 1 ? 'tray' : 'trays'} left. That is ${result.trays_used} ${result.trays_used === 1 ? 'tray' : 'trays'}, ${money(total)}. Confirm?`,
            900
          );
        } else {
          setStage({ kind: 'await_day', item, units });
          pushAgent(
            `That needs ${result.trays_used} ${result.trays_used === 1 ? 'tray' : 'trays'} and ${labelForDate(day.date).toLowerCase()} has ${result.trays_left} ${result.trays_left === 1 ? 'tray' : 'trays'} left. ${describeAlternatives(result)}`,
            1000
          );
        }
      })
      .catch(() => {
        pushAgent('The oven computer hiccuped. Ask me again in a moment?', 400);
      });
  };

  const startQuote = (item: DbItem, units: number, currentWeek: DayLoad[]) => {
    const mentioned = findDay(currentWeek, lastCustomerText.current);
    if (!mentioned) {
      setStage({ kind: 'await_day', item, units });
      return pushAgent(`Got it, ${units} ${item.name.toLowerCase()}. Which day?`);
    }
    return quoteForDay(item, units, mentioned);
  };

  const route = (text: string) => {
    const t = text.toLowerCase();
    const currentWeek = week ?? [];
    const currentItems = items ?? [];

    switch (stage.kind) {
      case 'idle':
      case 'await_item': {
        const item = findItem(t, currentItems);
        const units = parseUnits(t);
        if (item && units) {
          setSending(false);
          return startQuote(item, units, currentWeek);
        }
        if (item) {
          setStage({ kind: 'await_units', item });
          setSending(false);
          return pushAgent(`Sure, ${item.name.toLowerCase()}. How many?`);
        }
        if (units) {
          setStage({ kind: 'await_item' });
          setSending(false);
          const names = currentItems.slice(0, 4).map((i) => i.name.toLowerCase());
          return pushAgent(`${units} of something. What are we baking? ${names.join(', ')}?`);
        }
        setStage({ kind: 'await_item' });
        setSending(false);
        return pushAgent('What would you like? Name anything on the menu and a number.');
      }

      case 'await_units': {
        const units = parseUnits(t);
        if (!units) {
          setSending(false);
          return pushAgent('Just a number works. How many?');
        }
        setSending(false);
        return startQuote(stage.item, units, currentWeek);
      }

      case 'await_day': {
        const day = findDay(currentWeek, t);
        if (!day) {
          const open = currentWeek.find((d) => d.trays_used < d.trays);
          setSending(false);
          if (!open) return pushAgent('Nothing is open this week. Check back Monday.');
          return pushAgent('Which day works for you? Any day on the strip below.');
        }
        setSending(false);
        return quoteForDay(stage.item, stage.units, day);
      }

      case 'await_confirm': {
        const yes = t.includes('yes') || t.includes('confirm');
        setSending(false);
        if (yes) {
          const { kind, ...rest } = stage;
          setStage({ kind: 'await_name', ...rest });
          return pushAgent('Name and a way to reach you? I only ask now.');
        }
        setStage({ kind: 'idle' });
        return pushAgent('No problem. Ask me again when you are ready.');
      }

      case 'await_name': {
        callCreateOrder(
          stage.day.date,
          [{ item_id: stage.item.id, units: stage.units }],
          text.slice(0, 80),
          ''
        )
          .then((order) => {
            setSending(false);
            setStage({ kind: 'idle' });
            setLastOrder({
              itemName: stage.item.name,
              units: stage.units,
              dateLabel: labelForDate(stage.day.date),
              total: order.total,
            });
            pushAgent(
              `Payment here is a labelled mock, nothing is charged. Your order is in for ${labelForDate(stage.day.date).toLowerCase()}. Watch the trays fill.`,
              900
            );
            reload();
          })
          .catch((err) => {
            setSending(false);
            setStage({ kind: 'idle' });
            const cap = err?.capacity as CapacityResult | undefined;
            if (cap) {
              pushAgent(`Someone just took the last trays. ${describeAlternatives(cap)}`, 700);
            } else {
              pushAgent('That did not go through. Say it once more?', 500);
            }
          });
        return;
      }
    }
  };

  const handleSend = (text: string) => {
    if (sending || !ready) return;
    setMessages((prev) => [...prev, { id: nextId.current++, role: 'customer', text }]);
    setSending(true);
    lastCustomerText.current = text;
    route(text);
  };

  const quickReplies =
    stage.kind === 'await_confirm'
      ? ['Yes, confirm', 'Not now']
      : stage.kind === 'idle' || stage.kind === 'await_item'
        ? ['40 cupcakes for Saturday', '2 sheet cakes for Friday']
        : undefined;

  return (
    <main className="mx-auto w-full max-w-6xl px-5 pb-16">
      <section className="grid items-start gap-8 py-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)] lg:gap-12">
        <div className="lg:pt-6">
          <h1 className="font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.4rem]">
            Never promise more than the oven can bake.
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed opacity-80">
            Batchwise is the order desk for home bakers — the kitchen's real tray limits answer
            before Saturday gets oversold.
          </p>
        </div>

        <DemoChat
          messages={messages}
          typing={typing || sending}
          onSend={handleSend}
          quickReplies={quickReplies}
          disabled={!ready}
          className="min-h-[420px] lg:min-h-[480px]"
        />
      </section>

      <section className="py-2" aria-label="The next five days, updating live">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-2xl tracking-tight">The next five days</h2>
          <span className="font-slip text-xs opacity-60">
            {ready ? `${weekTotal}/${weekCapacity} trays taken this week` : 'loading'}
          </span>
        </div>
        <div className="rounded-xl border border-[color:var(--ink)]/20 bg-[color:var(--slip)] p-4 sm:p-5">
          {loadError ? (
            <p role="alert" className="font-slip text-sm text-[color:var(--tomato)]">
              {loadError}{' '}
              <button type="button" onClick={reload} className="underline underline-offset-2">
                Try again
              </button>
            </p>
          ) : !week ? (
            <p className="py-6 text-center font-slip text-sm opacity-60">loading…</p>
          ) : (
            <div className="space-y-2" role="list">
              {week.slice(0, 5).map((day, idx) => (
                <TrayRow
                  key={day.date}
                  label={labelForDate(day.date)}
                  sublabel={idx === 5 || idx === 6 ? 'weekend' : undefined}
                  total={day.trays}
                  filled={day.trays_used}
                  size="sm"
                />
              ))}
            </div>
          )}
          <div className="mt-4 flex items-center justify-between gap-2">
            <p className="font-slip text-xs opacity-60">
              Cavities fill the moment an order is confirmed.
            </p>
            <Link
              to="/calendar"
              className="min-h-[48px] rounded-lg px-3 py-3 font-slip text-sm font-medium text-[color:var(--teal)] underline underline-offset-4 hover:opacity-80"
            >
              See full calendar
            </Link>
          </div>
        </div>
      </section>

      {lastOrder && (
        <section className="py-4" aria-label="Your confirmed order">
          <h2 className="font-display text-2xl tracking-tight">Your order slip</h2>
          <p className="sr-only" role="status">
            Order confirmed for {lastOrder.units} {lastOrder.itemName}, pickup {lastOrder.dateLabel}.
          </p>
          <div className="mt-4 max-w-sm">
            <div className="rounded-xl border border-[color:var(--ink)]/20 bg-[color:var(--slip)] p-4 font-slip text-sm">
              <div className="flex justify-between font-medium">
                <span>Odile's Kitchen</span>
                <span className="opacity-60">demo</span>
              </div>
              <div className="my-2 border-t border-dashed border-[color:var(--ink)]/35" />
              <div className="flex justify-between">
                <span>{lastOrder.units} x {lastOrder.itemName}</span>
                <span>{money(lastOrder.total)}</span>
              </div>
              <div className="mt-1 flex justify-between text-xs opacity-70">
                <span>Pickup</span>
                <span>{lastOrder.dateLabel}</span>
              </div>
              <div className="mt-2 flex justify-end">
                <span className="anim-stamp inline-block -rotate-3 select-none rounded border-4 border-double border-[color:var(--teal)] px-2 py-0.5 font-slip text-xs font-semibold uppercase tracking-widest text-[color:var(--teal)]">
                  CONFIRMED
                </span>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="py-8" aria-label="How a tray is counted">
        <h2 className="font-display text-2xl tracking-tight">How a tray is counted</h2>
        <div className="mt-4 flex flex-col gap-4 rounded-xl border border-[color:var(--ink)]/20 bg-[color:var(--flour)] p-4 font-slip text-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="font-medium">40 cupcakes</span>
            <span className="opacity-70"> · 12 fit on a tray · </span>
            <TrayRow total={4} filled={4} label="" size="sm" className="inline-flex align-middle" />
          </div>
          <div className="flex flex-wrap gap-6">
            <Link
              to="/studio"
              className="min-h-[48px] rounded-lg px-1 py-3 font-slip text-sm font-medium text-[color:var(--teal)] underline underline-offset-4 hover:opacity-80"
            >
              Design a cake
            </Link>
            <Link
              to="/how"
              className="min-h-[48px] rounded-lg px-1 py-3 font-slip text-sm font-medium text-[color:var(--teal)] underline underline-offset-4 hover:opacity-80"
            >
              How capacity works
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
