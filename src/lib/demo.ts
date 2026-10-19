export type DemoItem = {
  id: string;
  name: string;
  /** recognized singular/plural keywords, lowercase */
  keywords: string[];
  units_per_tray: number;
  prep_minutes_per_batch: number;
  price_per_unit: number;
};

export type DemoDay = {
  date: string; // ISO
  /** e.g. "Sat 18" */
  label: string;
  capacityTrays: number;
  filledTrays: number;
  prepMinutes: number;
  capacityPrep: number;
};

export type DemoOrder = {
  id: string;
  itemId: string;
  itemName: string;
  units: number;
  date: string;
  trays: number;
  prepMinutes: number;
  total: number;
  name: string;
  contact: string;
};

/** A fictional bakery, clearly demo data. */
export const DEMO_BUSINESS = {
  name: "Odile's Kitchen",
  currency: 'USD',
  symbol: '$',
};

export const DEMO_ITEMS: DemoItem[] = [
  { id: 'cupcakes', name: 'Cupcakes', keywords: ['cupcake', 'cupcakes'], units_per_tray: 12, prep_minutes_per_batch: 90, price_per_unit: 3.5 },
  { id: 'sheet_cake', name: 'Sheet cake', keywords: ['sheet cake', 'sheetcake', 'cake'], units_per_tray: 1, prep_minutes_per_batch: 120, price_per_unit: 45 },
  { id: 'cookies', name: 'Cookies', keywords: ['cookie', 'cookies'], units_per_tray: 24, prep_minutes_per_batch: 60, price_per_unit: 1.25 },
  { id: 'brownies', name: 'Brownies', keywords: ['brownie', 'brownies'], units_per_tray: 16, prep_minutes_per_batch: 45, price_per_unit: 2.75 },
];

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function weekdayName(date: Date): string {
  return WEEKDAY_NAMES[date.getDay()];
}

function fmtLabel(date: Date): string {
  return `${WEEKDAY_NAMES[date.getDay()].slice(0, 3)} ${date.getDate()}`;
}

function isoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Seed 7 days from today: 8 trays on weekdays, 10 on weekends. Saturday is nearly full. */
export function initialWeek(): DemoDay[] {
  const days: DemoDay[] = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    const capacity = weekend ? 10 : 8;
    const isSaturday = d.getDay() === 6;
    days.push({
      date: isoDate(d),
      label: i === 0 ? 'Today' : fmtLabel(d),
      capacityTrays: capacity,
      filledTrays: isSaturday ? capacity - 2 : 0,
      prepMinutes: isSaturday ? 380 : 0,
      capacityPrep: capacity * 180,
    });
  }
  return days;
}

/** The deterministic capacity rule: trays = ceil(units / units_per_tray) per line. */
export function traysFor(item: DemoItem, units: number): number {
  return Math.ceil(units / item.units_per_tray);
}

export type CapacityResult = {
  fits: boolean;
  traysNeeded: number;
  traysLeft: number;
  prepNeeded: number;
  prepLeft: number;
};

export function checkCapacityDemo(day: DemoDay, item: DemoItem, units: number): CapacityResult {
  const traysNeeded = traysFor(item, units);
  const traysLeft = day.capacityTrays - day.filledTrays;
  const prepNeeded = item.prep_minutes_per_batch;
  const prepLeft = day.capacityPrep - day.prepMinutes;
  return {
    fits: traysNeeded <= traysLeft && prepNeeded <= prepLeft,
    traysNeeded,
    traysLeft,
    prepNeeded,
    prepLeft,
  };
}

export function findItem(text: string): DemoItem | null {
  const t = text.toLowerCase();
  for (const item of DEMO_ITEMS) {
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
  today: 0,
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/** Returns the day from the week whose weekday matches, or null. */
export function findDay(week: DemoDay[], text: string): DemoDay | null {
  const t = text.toLowerCase();
  if (t.includes('today')) return week[0];
  for (const [word, dow] of Object.entries(DAY_WORDS)) {
    if (word === 'today') continue;
    if (t.includes(word)) {
      return week.find((d) => {
        const [y, m, dd] = d.date.split('-').map(Number);
        return new Date(y, m - 1, dd).getDay() === dow;
      }) ?? null;
    }
  }
  return null;
}

export function money(amount: number): string {
  return `${DEMO_BUSINESS.symbol}${amount.toFixed(2)}`;
}
