'use client';

import { useEffect, useState } from 'react';
import { Sidebar, type SidebarGroup } from '@/components/ui/Sidebar';

export interface DashNavItem {
  href: string;
  label: string;
  icon?: React.ReactNode;
  /** Котва в таблото (id на секцията) — следи се скролът (scrollspy) */
  sectionId?: string;
  /** Маршрут, който е текущата страница (analytics, withdraw) */
  page?: boolean;
}

export interface DashNavGroup {
  label?: string;
  items: readonly DashNavItem[];
}

/**
 * Страничното меню на таблото. На самото табло маркира текущия раздел при
 * скрол (aria-current="location"); на другите страници — самата страница
 * (aria-current="page"). Котвите остават обикновени връзки (работят и без JS).
 */
export function DashSidebar({
  ariaLabel,
  brand,
  footer,
  groups,
  scrollspy,
}: {
  ariaLabel: string;
  brand?: React.ReactNode;
  footer?: React.ReactNode;
  groups: readonly DashNavGroup[];
  scrollspy: boolean;
}) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    if (!scrollspy) return;
    const ids = groups.flatMap((g) => g.items.map((i) => i.sectionId)).filter(
      (id): id is string => !!id,
    );
    let frame = 0;
    const measure = () => {
      frame = 0;
      const header = parseFloat(getComputedStyle(document.documentElement).fontSize) * 4.1;
      const line = header + 56; // линията, под която „влиза“ разделът
      let current: string | null = null;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      const atEnd =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (!current && ids.length) current = ids[0];
      if (atEnd && ids.length) current = ids[ids.length - 1];
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    window.addEventListener('hashchange', onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('hashchange', onScroll);
    };
  }, [groups, scrollspy]);

  const mapped: SidebarGroup[] = groups.map((group) => ({
    label: group.label,
    items: group.items.map((item) => ({
      href: item.href,
      label: item.label,
      icon: item.icon,
      current: item.page
        ? ('page' as const)
        : scrollspy && item.sectionId && item.sectionId === active
          ? ('location' as const)
          : false,
    })),
  }));

  return <Sidebar ariaLabel={ariaLabel} brand={brand} footer={footer} groups={mapped} />;
}
