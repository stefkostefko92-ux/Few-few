'use client';

// The sidebar as a drawer below 1024 px (shell.css): the top bar's button opens it over a backdrop; Esc, the backdrop,
// the close button or a link followed close it, and the focus goes back to the button. While it is open the Tab key
// stays inside it (first and last stops wrap) and the page under it does not scroll. From 1024 px the sidebar stands
// beside the page and none of this applies (the button is hidden, the drawer never opens).
// Motion: the drawer slides in 250 ms, off under prefers-reduced-motion (globals.css).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import Icon from '../Icon';

interface DrawerState {
  open: boolean;
  toggle: () => void;
  close: (focusButton: boolean) => void;
}

/** The top bar's menu button: the focus goes back to it when the drawer closes from inside. */
const BUTTON_ID = 'ws-menu';

const DrawerCtx = createContext<DrawerState | null>(null);

function useDrawer(): DrawerState {
  const d = useContext(DrawerCtx);
  if (!d) throw new Error('drawer outside DrawerRoot');
  return d;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([type="hidden"]), select, textarea, summary';

export function DrawerRoot({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((o) => !o), []);
  const close = useCallback((focusButton: boolean) => {
    setOpen(false);
    if (focusButton) document.getElementById(BUTTON_ID)?.focus();
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent): void => { if (e.key === 'Escape') close(true); };
    document.addEventListener('keydown', onKey);
    document.documentElement.classList.add('ws-drawer-open');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.documentElement.classList.remove('ws-drawer-open');
    };
  }, [open, close]);
  const value = useMemo(() => ({ open, toggle, close }), [open, toggle, close]);
  return <DrawerCtx.Provider value={value}>{children}</DrawerCtx.Provider>;
}

/** The top bar's menu button (phones and tablets). */
export function DrawerToggle({ openLabel, closeLabel }: { openLabel: string; closeLabel: string }) {
  const d = useDrawer();
  return (
    <button id={BUTTON_ID} type="button" className="ws-menu" aria-expanded={d.open} aria-controls="ws-sidebar"
      aria-label={d.open ? closeLabel : openLabel} onClick={d.toggle}>
      <Icon name="menu" size={20} />
    </button>
  );
}

/** The sidebar itself, with the backdrop that closes it. */
export function DrawerPanel({ label, closeLabel, children }: { label: string; closeLabel: string; children: ReactNode }) {
  const d = useDrawer();
  const panel = useRef<HTMLElement>(null);
  // opened: the focus moves into the drawer (its close button)
  useEffect(() => {
    if (d.open) panel.current?.querySelector<HTMLElement>('.ws-close')?.focus();
  }, [d.open]);
  const onKeyDown = (e: KeyboardEvent<HTMLElement>): void => {
    if (!d.open || e.key !== 'Tab' || !panel.current) return;
    const stops = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
    const first = stops[0], last = stops[stops.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  };
  // a link followed inside the drawer closes it (the layout stays mounted on client navigation)
  const onClick = (e: MouseEvent<HTMLElement>): void => {
    if (d.open && e.target instanceof Element && e.target.closest('a[href]')) d.close(false);
  };
  return (
    <>
      <aside id="ws-sidebar" ref={panel} className={d.open ? 'ws-sidebar open' : 'ws-sidebar'} aria-label={label} onKeyDown={onKeyDown} onClick={onClick}>
        <button type="button" className="ws-close" aria-label={closeLabel} onClick={() => d.close(true)}>
          <Icon name="x" size={18} />
        </button>
        {children}
      </aside>
      <button type="button" className={d.open ? 'ws-backdrop open' : 'ws-backdrop'} tabIndex={-1} aria-hidden="true" onClick={() => d.close(true)} />
    </>
  );
}
