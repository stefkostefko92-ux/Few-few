'use client';

// The sidebar as a drawer below 1024 px (shell.css): the top bar's button opens it over a backdrop; Esc, the backdrop,
// the close button or a link followed close it, and the focus goes back to the button. While it is open the Tab key
// stays inside it (first and last stops wrap), the page under it does not scroll and is inert (a modal dialog for screen
// readers too). From 1024 px the sidebar stands beside the page and none of this applies (the button is hidden, the
// drawer never opens; one open when the window grows past 1024 px closes).
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
/** The page beside the drawer (AppShell): inert while the drawer is open. */
const MAIN = '.ws-main';
/** From here the sidebar stands beside the page (shell.css). */
const WIDE = '(min-width: 1024px)';

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
    if (!focusButton) return;
    // the button is in the page: it takes the focus once the page is no longer inert
    document.querySelector(MAIN)?.removeAttribute('inert');
    document.getElementById(BUTTON_ID)?.focus();
  }, []);
  useEffect(() => {
    if (!open) return;
    const main = document.querySelector(MAIN), wide = window.matchMedia(WIDE);
    const onKey = (e: globalThis.KeyboardEvent): void => { if (e.key === 'Escape') close(true); };
    const onWide = (): void => { if (wide.matches) close(false); };
    document.addEventListener('keydown', onKey);
    wide.addEventListener('change', onWide);
    document.documentElement.classList.add('ws-drawer-open');
    main?.setAttribute('inert', '');
    return () => {
      document.removeEventListener('keydown', onKey);
      wide.removeEventListener('change', onWide);
      document.documentElement.classList.remove('ws-drawer-open');
      main?.removeAttribute('inert');
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
      <aside id="ws-sidebar" ref={panel} className={d.open ? 'ws-sidebar open' : 'ws-sidebar'} aria-label={label} onKeyDown={onKeyDown} onClick={onClick}
        role={d.open ? 'dialog' : undefined} aria-modal={d.open || undefined}>
        <button type="button" className="ws-close" aria-label={closeLabel} onClick={() => d.close(true)}>
          <Icon name="x" size={18} />
        </button>
        {children}
      </aside>
      <button type="button" className={d.open ? 'ws-backdrop open' : 'ws-backdrop'} tabIndex={-1} aria-hidden="true" onClick={() => d.close(true)} />
    </>
  );
}
