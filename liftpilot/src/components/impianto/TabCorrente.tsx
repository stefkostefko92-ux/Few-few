'use client';

// The page's tab of the installation's bar brought into view where the bar scrolls sideways (a phone), once on arrival.
import { useEffect, useRef } from 'react';

export default function TabCorrente() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const nav = ref.current?.closest('.imp-nav'), tab = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    const list = nav?.querySelector<HTMLElement>('.imp-tabs');
    if (!tab || !list || list.scrollWidth <= list.clientWidth) return;
    list.scrollLeft = tab.offsetLeft - (list.clientWidth - tab.offsetWidth) / 2;
  }, []);
  return <span ref={ref} hidden />;
}
