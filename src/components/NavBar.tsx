import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { cn } from '@/lib/cn';

const LINKS = [
  { to: '/', label: 'Studio' },
  { to: '/how', label: 'How it works' },
  { to: '/about', label: 'About' },
];

export function NavBar() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-[color:var(--ink)]/15 bg-[color:var(--slip)]/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
        <Link
          to="/"
          className="flex items-center rounded-md"
          aria-label="Batchwise home"
          onClick={() => setOpen(false)}
        >
          <Logo withWordmark size={32} />
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              className={({ isActive }) =>
                cn(
                  'min-h-[44px] rounded-lg px-3 py-2.5 font-ui text-sm transition-colors',
                  isActive
                    ? 'bg-[color:var(--flour)] font-semibold text-[color:var(--ink)]'
                    : 'text-[color:var(--ink)]/70 hover:bg-[color:var(--flour)] hover:text-[color:var(--ink)]'
                )
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? 'Close menu' : 'Open menu'}
          className="flex h-12 w-12 items-center justify-center rounded-lg border border-[color:var(--ink)]/25 md:hidden"
        >
          {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
        </button>
      </div>

      {open && (
        <nav
          id="mobile-nav"
          aria-label="Main"
          className="border-t border-dashed border-[color:var(--ink)]/25 bg-[color:var(--slip)] md:hidden"
        >
          <div className="mx-auto w-full max-w-6xl px-5 py-2">
            {LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-[48px] items-center border-b border-dashed border-[color:var(--ink)]/10 px-2 font-ui text-base last:border-0',
                    isActive
                      ? 'font-semibold text-[color:var(--ink)]'
                      : 'text-[color:var(--ink)]/70'
                  )
                }
              >
                {l.label}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
